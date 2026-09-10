from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class FinalSegment:
    """Match Spring's append-final-segment JSON request exactly."""

    roomSessionId: str
    sourceSegmentId: str
    participantIdentity: str
    speakerLabel: Optional[str]
    text: str
    startMs: int
    endMs: int


def build_source_segment_id(
    track_sid: str,
    stream_id: str,
    provider_start_ms: int,
    provider_end_ms: int,
) -> str:
    """Build a stable idempotency key for one provider-final segment."""
    return "{0}:{1}:{2}:{3}".format(
        track_sid,
        stream_id,
        provider_start_ms,
        provider_end_ms,
    )


def map_final_event(
    *,
    room_session_id: str,
    participant_identity: str,
    track_sid: str,
    stream_id: str,
    stream_offset_ms: int,
    provider_start_ms: int,
    provider_end_ms: int,
    text: str,
) -> FinalSegment:
    """Map track-relative Deepgram timing onto the room-session timeline."""
    return FinalSegment(
        roomSessionId=room_session_id,
        sourceSegmentId=build_source_segment_id(
            track_sid,
            stream_id,
            provider_start_ms,
            provider_end_ms,
        ),
        participantIdentity=participant_identity,
        speakerLabel="track-{0}".format(track_sid),
        text=text.strip(),
        startMs=stream_offset_ms + provider_start_ms,
        endMs=stream_offset_ms + provider_end_ms,
    )