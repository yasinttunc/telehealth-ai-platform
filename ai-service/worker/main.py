import argparse
import asyncio
import logging
import signal
import uuid
from typing import Any, Callable, Dict

from livekit import rtc

from worker.deepgram_stream import create_deepgram_stream
from worker.livekit_room import LiveKitTranscriptionRoom
from worker.settings import WorkerSettings, load_settings
from worker.spring_internal_client import SpringInternalClient


LOGGER = logging.getLogger("telehealth.transcription.worker")


def _install_shutdown_signal_handlers(stop_event: asyncio.Event) -> None:
    """Route SIGINT and SIGTERM through the worker's normal flush path."""
    event_loop = asyncio.get_running_loop()
    for signal_number in (signal.SIGINT, signal.SIGTERM):
        try:
            event_loop.add_signal_handler(signal_number, stop_event.set)
        except NotImplementedError:
            # Windows event loops do not implement add_signal_handler.
            pass


async def _wait_for_room_stop(
    stop_event: asyncio.Event,
    has_observed_participant: Callable[[], bool],
    idle_timeout_seconds: float,
) -> None:
    """Fail an unused worker or wait until a joined consultation finishes."""
    try:
        await asyncio.wait_for(
            stop_event.wait(),
            timeout=idle_timeout_seconds,
        )
    except asyncio.TimeoutError:
        if not has_observed_participant():
            raise RuntimeError(
                "No expected participant joined the LiveKit room"
            )
        await stop_event.wait()


async def _receive_transcripts(
    *,
    deepgram: Any,
    coordinator: LiveKitTranscriptionRoom,
    room: rtc.Room,
    track_sid: str,
    stream_id: str,
    stream_offset_ms: int,
    participant_identity: str,
) -> None:
    """Drain Deepgram events while the matching task sends LiveKit audio."""
    async for event in deepgram.events():
        await coordinator.handle_transcript_event(
            room=room,
            event=event,
            track_sid=track_sid,
            stream_id=stream_id,
            stream_offset_ms=stream_offset_ms,
            participant_identity=participant_identity,
        )


async def _transcribe_audio_track(
    *,
    track: rtc.Track,
    track_sid: str,
    participant_identity: str,
    room: rtc.Room,
    coordinator: LiveKitTranscriptionRoom,
    settings: WorkerSettings,
) -> None:
    """Forward one subscribed LiveKit audio track to one Deepgram socket."""
    coordinator.assert_known_participant(participant_identity)

    stream_id = str(uuid.uuid4())
    stream_offset_ms = coordinator.offset_ms()
    deepgram = create_deepgram_stream(settings)
    coordinator.streams[track_sid] = deepgram
    audio_stream = rtc.AudioStream.from_track(
        track=track,
        sample_rate=settings.deepgram_sample_rate,
        num_channels=1,
    )

    await deepgram.connect()
    receiver_task = asyncio.create_task(
        _receive_transcripts(
            deepgram=deepgram,
            coordinator=coordinator,
            room=room,
            track_sid=track_sid,
            stream_id=stream_id,
            stream_offset_ms=stream_offset_ms,
            participant_identity=participant_identity,
        )
    )

    try:
        async for frame_event in audio_stream:
            # LiveKit AudioFrame data is signed 16-bit PCM; tobytes preserves it.
            await deepgram.send_audio(frame_event.frame.data.tobytes())
    finally:
        await audio_stream.aclose()
        await deepgram.finish()

        try:
            # Keep the receiver alive long enough to collect the final sentence.
            await asyncio.wait_for(receiver_task, timeout=10.0)
        except asyncio.TimeoutError:
            receiver_task.cancel()
            await asyncio.gather(receiver_task, return_exceptions=True)
        finally:
            await deepgram.disconnect()
            coordinator.streams.pop(track_sid, None)


async def run_livekit_loop(
    consultation_id: int,
    worker_bootstrap: dict,
    spring: SpringInternalClient,
    settings: WorkerSettings,
) -> None:
    """Join one consultation room and transcribe all trusted audio tracks."""
    room = rtc.Room()
    coordinator = LiveKitTranscriptionRoom(
        consultation_id=consultation_id,
        bootstrap=worker_bootstrap,
        spring_client=spring,
    )
    track_tasks: Dict[str, asyncio.Task] = {}
    stop_event = asyncio.Event()
    observed_human_participant = False
    # First fatal error raised by any per-track transcription task.
    track_failure: Dict[str, BaseException] = {}

    def on_track_task_done(task: asyncio.Task) -> None:
        """Surface a per-track failure instead of letting it die in the task.

        A transcription task owns one Deepgram socket and one Spring writer.
        If either fails, the audio for that participant is no longer being
        captured. Without this callback the exception stayed inside the task
        object, the loop exited normally, and run_worker went on to finalize a
        transcript that is missing everything the failed track would have
        contributed.
        """
        if task.cancelled():
            return
        error = task.exception()
        if error is None:
            return
        LOGGER.exception(
            "Transcription task failed", exc_info=error
        )
        track_failure.setdefault("error", error)
        stop_event.set()

    def start_audio_task(
        track: rtc.Track,
        publication: Any,
        participant: Any,
    ) -> None:
        """Create at most one transcription task for a subscribed audio track."""
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return
        if participant.identity not in coordinator.participant_roles:
            LOGGER.warning(
                "Ignoring unknown room participant identity %s",
                participant.identity,
            )
            return

        track_sid = publication.sid
        existing = track_tasks.get(track_sid)
        if existing is not None and not existing.done():
            return

        task = asyncio.create_task(
            _transcribe_audio_track(
                track=track,
                track_sid=track_sid,
                participant_identity=participant.identity,
                room=room,
                coordinator=coordinator,
                settings=settings,
            )
        )
        task.add_done_callback(on_track_task_done)
        track_tasks[track_sid] = task

    @room.on("participant_connected")
    def on_participant_connected(participant: Any) -> None:
        """Remember that at least one expected human entered the room."""
        nonlocal observed_human_participant
        if participant.identity in coordinator.participant_roles:
            observed_human_participant = True

    @room.on("participant_disconnected")
    def on_participant_disconnected(participant: Any) -> None:
        """Stop after every expected human participant has left the room."""
        del participant
        remaining_humans = [
            remote.identity
            for remote in room.remote_participants.values()
            if remote.identity in coordinator.participant_roles
        ]
        if observed_human_participant and not remaining_humans:
            stop_event.set()

    @room.on("track_subscribed")
    def on_track_subscribed(
        track: rtc.Track,
        publication: Any,
        participant: Any,
    ) -> None:
        """Start transcription whenever LiveKit delivers a microphone track."""
        start_audio_task(track, publication, participant)

    @room.on("track_unsubscribed")
    def on_track_unsubscribed(
        track: rtc.Track,
        publication: Any,
        participant: Any,
    ) -> None:
        """Cancel transcription when LiveKit removes the matching audio track."""
        del track, participant
        task = track_tasks.get(publication.sid)
        if task is not None and not task.done():
            task.cancel()

    @room.on("disconnected")
    def on_disconnected(*_args: Any) -> None:
        """Wake the lifecycle loop when LiveKit disconnects the worker."""
        stop_event.set()

    await room.connect(
        worker_bootstrap["serverUrl"],
        worker_bootstrap["token"],
        rtc.RoomOptions(auto_subscribe=True, connect_timeout=20.0),
    )

    # Spring Process.destroy() sends SIGTERM on Unix.
    _install_shutdown_signal_handlers(stop_event)

    # Participants may already be present when the worker finishes connecting.
    if any(
        participant.identity in coordinator.participant_roles
        for participant in room.remote_participants.values()
    ):
        observed_human_participant = True

    try:
        await _wait_for_room_stop(
            stop_event,
            lambda: observed_human_participant,
            settings.worker_idle_timeout_seconds,
        )
    finally:
        # Disconnecting ends AudioStream iteration, which starts Deepgram flush.
        await room.disconnect()
        await coordinator.close_all_streams()
        if track_tasks:
            await asyncio.gather(
                *track_tasks.values(),
                return_exceptions=True,
            )

    # Raised outside the finally block so the flush above still runs first.
    # run_worker turns this into fail_transcription and never finalizes.
    if track_failure:
        raise RuntimeError(
            "Transcription failed for at least one audio track"
        ) from track_failure["error"]

async def _heartbeat_loop(
    spring: SpringInternalClient,
    consultation_id: int,
    room_session_id: str,
    interval_seconds: int,
) -> None:
    """Refresh Spring liveness until the owning worker exits."""
    while True:
        await spring.heartbeat(consultation_id, room_session_id)
        await asyncio.sleep(interval_seconds)


async def run_worker(consultation_id: int) -> None:
    """Finalize clean exits and mark failed exits without hiding the exception."""
    settings = load_settings()
    async with SpringInternalClient(
        settings.spring_base_url,
        settings.internal_service_key,
    ) as spring:
        worker_bootstrap = await spring.bootstrap(consultation_id)
        room_session_id = worker_bootstrap["roomSessionId"]
        heartbeat_task = asyncio.create_task(
            _heartbeat_loop(
                spring,
                consultation_id,
                room_session_id,
                settings.worker_heartbeat_seconds,
            )
        )
        room_task = asyncio.create_task(
            run_livekit_loop(
                consultation_id,
                worker_bootstrap,
                spring,
                settings,
            )
        )
        lifecycle_tasks = {room_task, heartbeat_task}

        try:
            try:
                done, _pending = await asyncio.wait(
                    lifecycle_tasks,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                # Propagate either a room failure or a heartbeat HTTP failure.
                for completed_task in done:
                    completed_task.result()
            except Exception:
                LOGGER.exception(
                    "Transcription worker failed consultationId=%s sessionId=%s",
                    consultation_id,
                    room_session_id,
                )
                try:
                    await spring.fail_transcription(
                        consultation_id,
                        room_session_id,
                    )
                except Exception:
                    LOGGER.exception(
                        "Could not report transcription failure to Spring"
                    )
                raise
        finally:
            for lifecycle_task in lifecycle_tasks:
                if not lifecycle_task.done():
                    lifecycle_task.cancel()
            await asyncio.gather(
                *lifecycle_tasks,
                return_exceptions=True,
            )

        await spring.finalize_transcription(
            consultation_id,
            room_session_id,
        )

def parse_args() -> argparse.Namespace:
    """Read the consultation id assigned to this worker process."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--consultation_id", type=int, required=True)
    return parser.parse_args()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    arguments = parse_args()
    asyncio.run(run_worker(arguments.consultation_id))
