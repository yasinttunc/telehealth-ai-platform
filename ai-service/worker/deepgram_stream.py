import json
from dataclasses import dataclass
from typing import Any, AsyncIterator, Optional
from urllib.parse import urlencode

import websockets

from worker.settings import WorkerSettings


@dataclass(frozen=True)
class TranscriptEvent:
    """Represent one provider-neutral interim or final transcript event."""

    text: str
    is_final: bool
    speech_final: bool
    start_ms: int
    end_ms: int


def parse_deepgram_message(message: dict) -> Optional[TranscriptEvent]:
    """Convert one Deepgram Results message into a transcript event."""
    if message.get("type") not in (None, "Results"):
        return None

    channel = message.get("channel") or {}
    alternatives = channel.get("alternatives") or []
    if not alternatives:
        return None

    transcript = (alternatives[0].get("transcript") or "").strip()
    if not transcript:
        return None

    start_seconds = float(message.get("start", 0.0))
    duration_seconds = float(message.get("duration", 0.0))

    return TranscriptEvent(
        text=transcript,
        is_final=bool(message.get("is_final")),
        speech_final=bool(message.get("speech_final")),
        start_ms=int(start_seconds * 1000),
        end_ms=int((start_seconds + duration_seconds) * 1000),
    )


class DeepgramRealtimeStream:
    """Own one Deepgram WebSocket for one LiveKit participant audio track."""

    BASE_URL = "wss://api.deepgram.com/v1/listen"

    def __init__(self, settings: WorkerSettings) -> None:
        """Store connection settings without opening the network socket."""
        self._settings = settings
        self._websocket: Optional[Any] = None
        self._finish_requested = False

    def _build_url(self) -> str:
        """Build the realtime listen URL with the exact PCM audio contract."""
        query = urlencode(
            {
                "model": self._settings.deepgram_model,
                "language": self._settings.deepgram_language,
                "encoding": self._settings.deepgram_encoding,
                "sample_rate": self._settings.deepgram_sample_rate,
                "channels": 1,
                "interim_results": "true",
                "endpointing": 300,
                "punctuate": "true",
                "smart_format": "true",
            }
        )
        return "{0}?{1}".format(self.BASE_URL, query)

    async def connect(self) -> None:
        """Open and authenticate the Deepgram realtime WebSocket."""
        if self._websocket is not None:
            return

        self._websocket = await websockets.connect(
            self._build_url(),
            additional_headers={
                "Authorization": "Token {0}".format(
                    self._settings.deepgram_api_key
                )
            },
            open_timeout=10,
            ping_interval=20,
            ping_timeout=20,
            max_size=2 * 1024 * 1024,
        )

    async def send_audio(self, audio_bytes: bytes) -> None:
        """Send one non-empty mono linear16 PCM frame to Deepgram."""
        if self._websocket is None:
            raise RuntimeError("Deepgram stream is not connected")
        if self._finish_requested:
            raise RuntimeError("Deepgram stream is already finishing")
        if audio_bytes:
            await self._websocket.send(audio_bytes)

    async def events(self) -> AsyncIterator[TranscriptEvent]:
        """Yield parsed transcript events until Deepgram closes the stream."""
        if self._websocket is None:
            raise RuntimeError("Deepgram stream is not connected")

        async for raw_message in self._websocket:
            if isinstance(raw_message, bytes):
                continue

            payload = json.loads(raw_message)
            event = parse_deepgram_message(payload)
            if event is not None:
                yield event

    async def finish(self) -> None:
        """Request final decoding and then ask Deepgram to close cleanly."""
        if self._websocket is None or self._finish_requested:
            return

        self._finish_requested = True
        await self._websocket.send(json.dumps({"type": "Finalize"}))
        await self._websocket.send(json.dumps({"type": "CloseStream"}))

    async def disconnect(self) -> None:
        """Release the local WebSocket after the receiver has drained results."""
        if self._websocket is not None:
            await self._websocket.close()
            self._websocket = None


def create_deepgram_stream(
    settings: WorkerSettings,
) -> DeepgramRealtimeStream:
    """Create an unconnected stream for dependency injection and tests."""
    return DeepgramRealtimeStream(settings)