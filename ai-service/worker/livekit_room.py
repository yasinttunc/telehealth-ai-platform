import asyncio
import json
import time
from typing import Any, Dict

from worker.segment_mapper import map_final_event


class LiveKitTranscriptionRoom:
    """Coordinate caption publishing and final-segment persistence for one room."""

    def __init__(
        self,
        *,
        consultation_id: int,
        bootstrap: dict,
        spring_client: Any,
    ) -> None:
        """Build trusted participant roles from the Spring bootstrap response."""
        self.consultation_id = consultation_id
        self.spring_client = spring_client
        self.room_session_id = bootstrap["roomSessionId"]
        self.session_started_monotonic = time.monotonic()
        self.participant_roles = {
            item["identity"]: item["role"]
            for item in bootstrap["participants"]
        }
        self.streams: Dict[str, Any] = {}

    def offset_ms(self) -> int:
        """Return elapsed milliseconds on the worker session's monotonic clock."""
        return int(
            (time.monotonic() - self.session_started_monotonic) * 1000
        )

    def assert_known_participant(self, participant_identity: str) -> None:
        """Reject audio tracks not present in Spring's trusted role map."""
        if participant_identity not in self.participant_roles:
            raise RuntimeError(
                "Refusing unknown LiveKit participant: {0}".format(
                    participant_identity
                )
            )

    async def handle_transcript_event(
        self,
        *,
        room: Any,
        event: Any,
        track_sid: str,
        stream_id: str,
        stream_offset_ms: int,
        participant_identity: str,
    ) -> None:
        """Publish interim text and persist final text before publishing it."""
        text = event.text.strip()
        if not text:
            return

        self.assert_known_participant(participant_identity)
        role = self.participant_roles[participant_identity]

        if not event.is_final:
            payload = json.dumps(
                {
                    "text": text,
                    "final": False,
                    "speakerRole": role,
                }
            ).encode("utf-8")
            await room.local_participant.publish_data(
                payload,
                topic="telehealth.caption.interim",
            )
            return

        final_segment = map_final_event(
            room_session_id=self.room_session_id,
            participant_identity=participant_identity,
            track_sid=track_sid,
            stream_id=stream_id,
            stream_offset_ms=stream_offset_ms,
            provider_start_ms=event.start_ms,
            provider_end_ms=event.end_ms,
            text=text,
        )

        # Persist first so the browser never treats an unsaved final as durable.
        await self.spring_client.append_final_segment(
            self.consultation_id,
            final_segment,
        )

        payload = json.dumps(
            {
                "text": text,
                "final": True,
                "speakerRole": role,
            }
        ).encode("utf-8")
        await room.local_participant.publish_data(
            payload,
            topic="telehealth.caption.final",
        )

    async def close_all_streams(self) -> None:
        """Ask every active provider stream to flush its final hypothesis."""
        await asyncio.gather(
            *(stream.finish() for stream in self.streams.values()),
            return_exceptions=True,
        )
