from typing import Protocol

from app.schemas import ExtractionRequest, ExtractionResponse


class AiProviderError(RuntimeError):
    """Raised when a provider cannot return a schema-valid extraction."""


class AiProviderConfigurationError(AiProviderError):
    """Raised when a required provider setting is absent or invalid."""


class ExtractionProvider(Protocol):
    """Keeps FastAPI independent from a particular model provider."""

    def extract(self, request: ExtractionRequest) -> ExtractionResponse:
        """Return one constrained extraction or raise AiProviderError."""
