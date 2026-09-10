from functools import lru_cache
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status

from app.provider_factory import create_extractor
from app.providers import AiProviderError, ExtractionProvider
from app.schemas import ExtractionRequest, ExtractionResponse


# Load local development secrets. ai-service/.env is ignored by Git.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Telehealth AI Extraction Service",
    version="0.1.0",
    description="Synthetic-transcript symptom extraction. Not a diagnostic service.",
)


@lru_cache
def get_extractor() -> ExtractionProvider:
    """Create the configured provider only when an extraction is requested."""
    return create_extractor()


@app.get("/health")
def health() -> dict[str, str]:
    """Report that FastAPI is alive without making a paid GPT request."""
    return {"status": "ok"}


@app.post(
    "/api/v1/extractions",
    response_model=ExtractionResponse,
    status_code=status.HTTP_200_OK,
)
def extract_symptoms(request: ExtractionRequest) -> ExtractionResponse:
    try:
        return get_extractor().extract(request)
    except AiProviderError as exception:
        root_cause = exception.__cause__ or exception
        safe_message = getattr(root_cause, "message", str(root_cause))
        logger.warning(
            "AI extraction failed with %s: %s",
            type(root_cause).__name__,
            safe_message,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI extraction is temporarily unavailable",
        ) from exception
