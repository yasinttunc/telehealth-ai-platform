from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class WorkerSettings:
    """Configuration required by the realtime transcription worker."""

    spring_base_url: str
    internal_service_key: str
    deepgram_api_key: str
    deepgram_model: str
    deepgram_language: str
    deepgram_sample_rate: int
    deepgram_encoding: str
    worker_idle_timeout_seconds: int
    worker_heartbeat_seconds: int


def _require_environment_value(name: str) -> str:
    """Return one required setting or raise a clear startup error."""
    value = os.getenv(name,"").strip()

    if not value:
        raise RuntimeError(
            "Missing required worker environment variable: {0}".format(name))
    return value

def _positive_integer(name: str, default:str) -> int:
    """Parse one positive integer setting with a useful startup error"""
    raw_value = os.getenv(name,default).strip()
    try:
        value = int(raw_value)
    except ValueError as error:
        raise RuntimeError("{0} must be an integer".format(name)) from error
    if value <= 0:
        raise RuntimeError("{0} must be greater than zero".format(name))

    return value

def load_settings() -> WorkerSettings:
    """Load ai-service/.env and validate all worker-only configuration."""
    ai_service_directory = Path(__file__).resolve().parents[1]
    load_dotenv(ai_service_directory / ".env", override=False)

    internal_service_key = _require_environment_value(
        "INTERNAL_SERVICE_KEY"
    )
    if len(internal_service_key) < 32:
        raise RuntimeError(
            "INTERNAL_SERVICE_KEY must contain at least 32 characters"
        )

    return WorkerSettings(
        spring_base_url=_require_environment_value(
            "SPRING_INTERNAL_BASE_URL"
        ).rstrip("/"),
        internal_service_key=internal_service_key,
        deepgram_api_key=_require_environment_value("DEEPGRAM_API_KEY"),
        deepgram_model=os.getenv("DEEPGRAM_MODEL", "nova-3").strip(),
        deepgram_language=os.getenv(
            "DEEPGRAM_LANGUAGE", "en-GB"
        ).strip(),
        deepgram_sample_rate=_positive_integer(
            "DEEPGRAM_SAMPLE_RATE", "48000"
        ),
        deepgram_encoding=os.getenv(
            "DEEPGRAM_ENCODING", "linear16"
        ).strip(),
        worker_idle_timeout_seconds=_positive_integer(
            "WORKER_IDLE_TIMEOUT_SECONDS", "90"
        ),
        worker_heartbeat_seconds=_positive_integer(
            "WORKER_HEARTBEAT_SECONDS", "15"
        ),
    )
