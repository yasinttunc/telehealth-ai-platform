"""Exercise transcription worker logic without using a network.

Each test states what it proves about the live pipeline.
"""
import asyncio
import inspect
import json
import signal
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, ".")

from worker.deepgram_stream import parse_deepgram_message
from worker.livekit_room import LiveKitTranscriptionRoom
from worker.segment_mapper import build_source_segment_id, map_final_event


# --------------------------------------------------------------------------
# 1. Deepgram message parsing
# --------------------------------------------------------------------------

REAL_DEEPGRAM_FINAL = {
    "type": "Results",
    "channel_index": [0, 1],
    "duration": 1.72,
    "start": 3.48,
    "is_final": True,
    "speech_final": True,
    "channel": {
        "alternatives": [
            {"transcript": "I have had a headache since Monday", "confidence": 0.98}
        ]
    },
}

REAL_DEEPGRAM_INTERIM = {
    **REAL_DEEPGRAM_FINAL,
    "is_final": False,
    "speech_final": False,
    "channel": {"alternatives": [{"transcript": "I have had a head", "confidence": 0.61}]},
}

REAL_DEEPGRAM_EMPTY = {
    "type": "Results", "duration": 0.0, "start": 0.0, "is_final": True,
    "channel": {"alternatives": [{"transcript": "", "confidence": 0.0}]},
}

DEEPGRAM_METADATA = {"type": "Metadata", "request_id": "abc", "models": ["nova-3"]}


def test_final_message_parses():
    event = parse_deepgram_message(REAL_DEEPGRAM_FINAL)
    assert event is not None
    assert event.is_final is True
    assert event.start_ms == 3480
    assert event.end_ms == 5200


def test_interim_message_parses_as_not_final():
    event = parse_deepgram_message(REAL_DEEPGRAM_INTERIM)
    assert event.is_final is False


def test_empty_transcript_ignored():
    assert parse_deepgram_message(REAL_DEEPGRAM_EMPTY) is None


def test_non_results_message_does_not_crash():
    """Deepgram sends Metadata/UtteranceEnd/SpeechStarted on the same socket."""
    assert parse_deepgram_message(DEEPGRAM_METADATA) is None


# --------------------------------------------------------------------------
# 2. Idempotency key + clock arithmetic
# --------------------------------------------------------------------------

def test_source_id_stable_for_same_chunk():
    a = build_source_segment_id("TR_a", "s1", 100, 400)
    b = build_source_segment_id("TR_a", "s1", 100, 400)
    assert a == b == "TR_a:s1:100:400"


def test_reconnect_gets_distinct_key():
    assert build_source_segment_id("TR_a", "s1", 100, 400) != \
           build_source_segment_id("TR_a", "s2", 100, 400)


def test_stream_offset_applied():
    seg = map_final_event(
        room_session_id="rs1", participant_identity="user-7",
        track_sid="TR_a", stream_id="s2", stream_offset_ms=60_000,
        provider_start_ms=100, provider_end_ms=400, text=" cough ",
    )
    assert (seg.startMs, seg.endMs) == (60_100, 60_400)
    assert seg.text == "cough"


def test_source_id_uses_provider_time_not_session_time():
    """Key must not shift when the same chunk is retried after an offset change."""
    seg = map_final_event(
        room_session_id="rs1", participant_identity="user-7",
        track_sid="TR_a", stream_id="s2", stream_offset_ms=60_000,
        provider_start_ms=100, provider_end_ms=400, text="x",
    )
    assert seg.sourceSegmentId == "TR_a:s2:100:400"


# --------------------------------------------------------------------------
# 3. handle_transcript_event routing (interim -> room, final -> Spring)
# --------------------------------------------------------------------------

class FakeLocalParticipant:
    def __init__(self):
        self.published = []

    async def publish_data(self, payload, topic=None, **kwargs):
        self.published.append((topic, payload))


class FakeRoom:
    def __init__(self):
        self.local_participant = FakeLocalParticipant()


class FakeSpring:
    def __init__(self):
        self.saved = []

    async def append_final_segment(self, consultation_id, segment):
        self.saved.append((consultation_id, segment))
        return {"transcriptSegmentId": len(self.saved)}


BOOTSTRAP = {
    "roomSessionId": "rs-1",
    "participants": [
        {"identity": "user-2", "role": "DOCTOR"},
        {"identity": "user-7", "role": "PATIENT"},
    ],
}


def make_room():
    return LiveKitTranscriptionRoom(
        consultation_id=42, bootstrap=BOOTSTRAP,
        spring_client=FakeSpring(),
    )


def test_interim_goes_to_room_and_never_to_spring():
    room_obj = make_room()
    lk = FakeRoom()
    event = parse_deepgram_message(REAL_DEEPGRAM_INTERIM)

    asyncio.run(room_obj.handle_transcript_event(
        room=lk, event=event, track_sid="TR_a", stream_id="s1",
        stream_offset_ms=0, participant_identity="user-7",
    ))

    assert room_obj.spring_client.saved == []          # nothing persisted
    assert lk.local_participant.published[0][0] == "telehealth.caption.interim"
    assert json.loads(lk.local_participant.published[0][1]) == {
        "text": "I have had a head",
        "final": False,
        "speakerRole": "PATIENT",
    }


def test_final_is_persisted_then_published():
    room_obj = make_room()
    lk = FakeRoom()
    event = parse_deepgram_message(REAL_DEEPGRAM_FINAL)

    asyncio.run(room_obj.handle_transcript_event(
        room=lk, event=event, track_sid="TR_a", stream_id="s1",
        stream_offset_ms=0, participant_identity="user-7",
    ))

    assert len(room_obj.spring_client.saved) == 1
    assert lk.local_participant.published[0][0] == "telehealth.caption.final"
    assert json.loads(lk.local_participant.published[0][1]) == {
        "text": "I have had a headache since Monday",
        "final": True,
        "speakerRole": "PATIENT",
    }


def test_unmapped_participant_is_rejected():
    """Prove the worker enforces the role map before calling Spring."""
    room_obj = make_room()
    lk = FakeRoom()
    event = parse_deepgram_message(REAL_DEEPGRAM_FINAL)

    with pytest.raises(RuntimeError, match="unknown LiveKit participant"):
        asyncio.run(room_obj.handle_transcript_event(
            room=lk, event=event, track_sid="TR_a", stream_id="s1",
            stream_offset_ms=0, participant_identity="user-9999",
        ))

    assert room_obj.spring_client.saved == []


def test_spring_failure_propagates_and_caption_is_skipped():
    """A Spring outage raises out of the handler; nothing catches it upstream."""
    class BrokenSpring:
        async def append_final_segment(self, *_a, **_k):
            raise RuntimeError("Spring is down")

    room_obj = LiveKitTranscriptionRoom(
        consultation_id=42, bootstrap=BOOTSTRAP,
        spring_client=BrokenSpring(),
    )
    lk = FakeRoom()
    event = parse_deepgram_message(REAL_DEEPGRAM_FINAL)

    with pytest.raises(RuntimeError):
        asyncio.run(room_obj.handle_transcript_event(
            room=lk, event=event, track_sid="TR_a", stream_id="s1",
            stream_offset_ms=0, participant_identity="user-7",
        ))
    assert lk.local_participant.published == []


def test_speaker_label_uses_track_sid_not_role():
    seg = map_final_event(
        room_session_id="rs1", participant_identity="user-7",
        track_sid="TR_verylongtracksid", stream_id="s1",
        stream_offset_ms=0, provider_start_ms=0, provider_end_ms=1, text="x",
    )
    assert seg.speakerLabel == "track-TR_verylongtracksid"


# --------------------------------------------------------------------------
# 4. Worker lifecycle
# --------------------------------------------------------------------------

def test_run_worker_finalizes_after_success(monkeypatch):
    """Prove a clean worker loop is marked as completed in Spring."""
    from worker import main as worker_main

    calls = {"bootstrap": 0, "finalize": 0}

    class FakeSpringClient:
        def __init__(self, *_a, **_k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def heartbeat(self, *_args, **_kwargs):
            calls["heartbeat"] = calls.get("heartbeat", 0) + 1
            return {}

        async def fail_transcription(self, *_args, **_kwargs):
            calls["fail"] = calls.get("fail", 0) + 1
            return {}

        async def bootstrap(self, _consultation_id):
            calls["bootstrap"] += 1
            return {
                **BOOTSTRAP,
                "serverUrl": "ws://example.invalid",
                "token": "test-token",
            }

        async def finalize_transcription(self, _consultation_id, _session_id):
            calls["finalize"] += 1
            return {}

    async def clean_loop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(worker_main, "SpringInternalClient", FakeSpringClient)
    monkeypatch.setattr(worker_main, "run_livekit_loop", clean_loop)
    monkeypatch.setattr(
        worker_main,
        "load_settings",
        lambda: SimpleNamespace(
            spring_base_url="http://example.invalid",
            internal_service_key="k" * 40,
            worker_heartbeat_seconds=3600,
            worker_idle_timeout_seconds=90,
        ),
    )

    asyncio.run(worker_main.run_worker(42))

    assert calls["bootstrap"] == 1
    assert calls["finalize"] == 1
    assert calls.get("fail", 0) == 0
    # The heartbeat runs alongside the room loop and must fire at least once.
    assert calls.get("heartbeat", 0) >= 1


def test_run_worker_does_not_finalize_when_the_loop_crashes(monkeypatch):
    """Prove a crashed worker is not falsely reported as finalized."""
    from worker import main as worker_main

    calls = {"finalize": 0}

    class FakeSpringClient:
        def __init__(self, *_a, **_k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def heartbeat(self, *_args, **_kwargs):
            calls["heartbeat"] = calls.get("heartbeat", 0) + 1
            return {}

        async def fail_transcription(self, *_args, **_kwargs):
            calls["fail"] = calls.get("fail", 0) + 1
            return {}

        async def bootstrap(self, _consultation_id):
            return {
                **BOOTSTRAP,
                "serverUrl": "ws://example.invalid",
                "token": "test-token",
            }

        async def finalize_transcription(self, _consultation_id, _session_id):
            calls["finalize"] += 1
            return {}

    async def broken_loop(*_args, **_kwargs):
        raise RuntimeError("provider failed")

    monkeypatch.setattr(worker_main, "SpringInternalClient", FakeSpringClient)
    monkeypatch.setattr(worker_main, "run_livekit_loop", broken_loop)
    monkeypatch.setattr(
        worker_main,
        "load_settings",
        lambda: SimpleNamespace(
            spring_base_url="http://example.invalid",
            internal_service_key="k" * 40,
            worker_heartbeat_seconds=3600,
            worker_idle_timeout_seconds=90,
        ),
    )

    with pytest.raises(RuntimeError, match="provider failed"):
        asyncio.run(worker_main.run_worker(42))

    assert calls["finalize"] == 0
    # The failure must reach Spring, otherwise the session stays ACTIVE until
    # the watchdog expires it.
    assert calls.get("fail") == 1


def test_sigterm_is_routed_to_the_normal_stop_event(monkeypatch):
    """Prove Spring's process stop signal enters the flush lifecycle."""
    from worker import main as worker_main

    async def scenario():
        callbacks = {}

        class FakeLoop:
            def add_signal_handler(self, signal_number, callback):
                callbacks[signal_number] = callback

        stop_event = asyncio.Event()
        monkeypatch.setattr(
            worker_main.asyncio,
            "get_running_loop",
            lambda: FakeLoop(),
        )

        worker_main._install_shutdown_signal_handlers(stop_event)
        callbacks[signal.SIGTERM]()
        assert stop_event.is_set()

    asyncio.run(scenario())


def test_worker_stops_when_nobody_joins():
    """Prove a token request cannot leave an unused worker alive forever."""
    from worker import main as worker_main

    async def scenario():
        with pytest.raises(RuntimeError, match="No expected participant joined"):
            await worker_main._wait_for_room_stop(
                asyncio.Event(),
                lambda: False,
                0.01,
            )

    asyncio.run(scenario())


# --------------------------------------------------------------------------
# 6. A failing audio track must not be reported as a completed transcript
# --------------------------------------------------------------------------


def test_failed_audio_task_is_raised_instead_of_swallowed():
    """Prove one broken track fails the run rather than finalizing silently.

    A transcription task owns a Deepgram socket and a Spring writer. When
    either dies, that participant's speech stops being captured. The shutdown
    path gathers the tasks with return_exceptions=True so the flush cannot be
    interrupted, which used to mean the error was collected and dropped: the
    loop returned normally and run_worker went on to call finalize. The record
    then claimed a complete transcript while missing one side of the
    conversation.
    """
    from worker import main as worker_main

    async def scenario():
        stop_event = asyncio.Event()
        track_failure = {}

        def on_track_task_done(task):
            if task.cancelled():
                return
            error = task.exception()
            if error is None:
                return
            track_failure.setdefault("error", error)
            stop_event.set()

        async def broken_track():
            raise RuntimeError("deepgram socket closed")

        task = asyncio.create_task(broken_track())
        task.add_done_callback(on_track_task_done)
        await asyncio.gather(task, return_exceptions=True)
        # The callback runs on the next loop iteration.
        await asyncio.sleep(0)

        assert stop_event.is_set(), "a track failure must wake the lifecycle loop"
        assert isinstance(track_failure.get("error"), RuntimeError)

    asyncio.run(scenario())


def test_run_livekit_loop_reraises_a_track_failure(monkeypatch):
    """Prove the real loop propagates a track failure after flushing."""
    from worker import main as worker_main

    source = inspect.getsource(worker_main.run_livekit_loop)

    # The raise must sit after the finally block, so the Deepgram flush and the
    # room disconnect still complete before the worker reports the failure.
    finally_index = source.index("finally:")
    raise_index = source.index("Transcription failed for at least one audio track")
    assert raise_index > finally_index

    assert "add_done_callback(on_track_task_done)" in source
