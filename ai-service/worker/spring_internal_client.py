from dataclasses import asdict
from types import TracebackType
from typing import Optional, Type

import httpx

from worker.segment_mapper import FinalSegment


class SpringInternalClient:
    """Reuse one HTTP connection pool for all trusted worker-to-Spring calls."""

    def __init__(self, base_url: str, service_key: str) -> None:
        """Create the client without exposing the internal key in URLs or logs."""
        self.base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            headers={"X-Internal-Service-Key": service_key},
        )

    async def __aenter__(self) -> "SpringInternalClient":
        """Return this already-configured asynchronous client."""
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_value: Optional[BaseException],
        traceback: Optional[TracebackType],
    ) -> None:
        """Close pooled sockets when the worker process finishes."""
        del exc_type, exc_value, traceback
        await self._client.aclose()

    async def bootstrap(self, consultation_id: int) -> dict:
        """Request the room URL, restricted token, session id, and role map."""
        response = await self._client.post(
            "{0}/internal/consultations/{1}/transcription-bootstrap".format(
                self.base_url,
                consultation_id,
            )
        )
        response.raise_for_status()
        return response.json()

    async def append_final_segment(
        self,
        consultation_id: int,
        segment: FinalSegment,
    ) -> dict:
        """Persist one final segment using its stable idempotency key."""
        response = await self._client.post(
            "{0}/internal/consultations/{1}/transcript-segments".format(
                self.base_url,
                consultation_id,
            ),
            json=asdict(segment),
        )
        response.raise_for_status()
        return response.json()

    async def heartbeat(
        self,
        consultation_id: int,
        room_session_id: str,
    ) -> None:
        """Refresh Spring's liveness timestamp for the active worker session."""
        response = await self._client.post(
            "{0}/internal/consultations/{1}/transcription-heartbeat".format(
                self.base_url,
                consultation_id,
            ),
            json={"roomSessionId": room_session_id},
        )
        response.raise_for_status()

    async def finalize_transcription(
        self,
        consultation_id: int,
        room_session_id: str,
    ) -> dict:
        """Finalize only after all provider-final messages have been persisted."""
        response = await self._client.post(
            "{0}/internal/consultations/{1}/finalize-transcription".format(
                self.base_url,
                consultation_id,
            ),
            json={"roomSessionId": room_session_id},
        )
        response.raise_for_status()
        return response.json()

    async def fail_transcription(
        self,
        consultation_id: int,
        room_session_id: str,
    ) -> dict:
        """Record provider failure without falsely finalizing the consultation."""
        response = await self._client.post(
            "{0}/internal/consultations/{1}/fail-transcription".format(
                self.base_url,
                consultation_id,
            ),
            json={"roomSessionId": room_session_id},
        )
        response.raise_for_status()
        return response.json()