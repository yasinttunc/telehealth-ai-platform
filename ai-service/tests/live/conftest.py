"""Shared fixtures for the live transcription and extraction pipeline tests.

These tests call REAL external services (Deepgram, OpenAI) and a REAL running
Spring instance. They are deliberately NOT part of the normal unit-test run:
they cost money and require the whole stack to be up.

Run them explicitly:
    cd ai-service
    python -m pytest tests/live -v -s
"""

import os
import shutil
import subprocess
import wave
from pathlib import Path

import pytest
from dotenv import load_dotenv

AI_SERVICE_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(AI_SERVICE_ROOT / ".env")

#: The sentence spoken in the generated test audio. Every downstream assertion
#: is anchored to these words, so keep it clinically plausible but synthetic.
SPOKEN_SENTENCE = (
    "I have had a bad headache since Monday and a sore throat. "
    "I do not have a fever."
)

#: What a correct extraction must find in that sentence.
EXPECTED_PRESENT_SYMPTOMS = {"headache", "sore throat"}
EXPECTED_NEGATED_SYMPTOMS = {"fever"}


def _require(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        pytest.skip(f"{name} is not set in ai-service/.env")
    return value


@pytest.fixture(scope="session")
def deepgram_key() -> str:
    return _require("DEEPGRAM_API_KEY")


@pytest.fixture(scope="session")
def deepgram_model() -> str:
    return os.getenv("DEEPGRAM_MODEL", "nova-3")


@pytest.fixture(scope="session")
def deepgram_language() -> str:
    return os.getenv("DEEPGRAM_LANGUAGE", "en-GB")


@pytest.fixture(scope="session")
def sample_rate() -> int:
    return int(os.getenv("DEEPGRAM_SAMPLE_RATE", "48000"))


@pytest.fixture(scope="session")
def ai_service_url() -> str:
    return os.getenv("AI_SERVICE_URL", "http://localhost:8000").rstrip("/")


@pytest.fixture(scope="session")
def spring_url() -> str:
    """Spring's base URL.

    NOTE: .env currently says port 8091 while application.properties defaults to
    8081. Whichever you actually run, both must agree or the worker cannot
    reach Spring at all.
    """
    return os.getenv("SPRING_INTERNAL_BASE_URL", "http://localhost:8081").rstrip("/")


@pytest.fixture(scope="session")
def internal_key() -> str:
    return _require("INTERNAL_SERVICE_KEY")


@pytest.fixture(scope="session")
def test_audio(tmp_path_factory, sample_rate) -> Path:
    """Generate a mono 16-bit PCM WAV of SPOKEN_SENTENCE using macOS `say`.

    Using synthesised speech instead of a checked-in recording keeps the repo
    free of real voice data and makes the expected transcript deterministic
    enough to assert on.
    """
    if shutil.which("say") is None or shutil.which("afconvert") is None:
        pytest.skip(
            "macOS `say`/`afconvert` not found. Provide your own 16-bit PCM "
            "mono WAV at tests/live/fixtures/sample.wav instead."
        )

    directory = tmp_path_factory.mktemp("audio")
    aiff_path = directory / "speech.aiff"
    wav_path = directory / "speech.wav"

    subprocess.run(
        ["say", "-v", "Daniel", "-o", str(aiff_path), SPOKEN_SENTENCE],
        check=True, capture_output=True,
    )
    # linear16 (signed 16-bit little-endian PCM), 1 channel, matching the rate
    # the worker declares to Deepgram.
    subprocess.run(
        ["afconvert", "-f", "WAVE", "-d", f"LEI16@{sample_rate}",
         "-c", "1", str(aiff_path), str(wav_path)],
        check=True, capture_output=True,
    )

    with wave.open(str(wav_path), "rb") as handle:
        assert handle.getnchannels() == 1, "test audio must be mono"
        assert handle.getsampwidth() == 2, "test audio must be 16-bit"
        assert handle.getframerate() == sample_rate, "sample rate mismatch"

    print(f"\n[fixture] generated {wav_path} "
          f"({wav_path.stat().st_size} bytes, {sample_rate} Hz mono 16-bit)")
    return wav_path


@pytest.fixture(scope="session")
def raw_pcm(test_audio) -> bytes:
    """Headerless PCM frames, exactly what the LiveKit worker would forward."""
    with wave.open(str(test_audio), "rb") as handle:
        return handle.readframes(handle.getnframes())
