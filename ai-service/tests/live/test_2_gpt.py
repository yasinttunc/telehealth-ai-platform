"""TEST GROUP 2 — Does the transcript reach gpt-5-mini, and can it process it?

Three layers, tested separately so a failure points at one place:

  2.1-2.3  The OpenAI account/model itself (direct SDK call)
  2.4-2.7  Your FastAPI /api/v1/extractions boundary (schema, provenance)
  2.8-2.9  Failure behaviour (bad input, provider down)
"""

import os
import time

import httpx
import pytest

from .conftest import (
    EXPECTED_NEGATED_SYMPTOMS,
    EXPECTED_PRESENT_SYMPTOMS,
    SPOKEN_SENTENCE,
)

#: A realistic two-speaker transcript, i.e. what the approved canonical text
#: looks like after the Doctor reviews the Deepgram segments.
CANONICAL_TRANSCRIPT = f"""Doctor: Good morning, what brings you in today?
Patient: {SPOKEN_SENTENCE}
Doctor: Any cough or shortness of breath?
Patient: No cough. I might have a slight cough at night, I am not sure.
Doctor: Thank you, I will note that."""


# --------------------------------------------------------------------------
# 2.1 - 2.3  Direct provider check
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def direct_completion():
    """Call OpenAI exactly the way app/openai_client.py does."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "").strip()
    if not api_key or not model:
        pytest.skip("OPENAI_API_KEY / OPENAI_MODEL not set in ai-service/.env")

    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from openai import OpenAI

    from app.prompts import SYSTEM_PROMPT, build_user_prompt
    from app.schemas import ExtractionRequest, GeneratedExtraction

    client = OpenAI(api_key=api_key, timeout=60.0)
    request = ExtractionRequest(
        consultationId=1,
        transcript=CANONICAL_TRANSCRIPT,
        promptVersion=os.getenv("PROMPT_VERSION", "symptom-extraction-v1"),
    )

    started = time.perf_counter()
    completion = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(request)},
        ],
        response_format=GeneratedExtraction,
        reasoning_effort="minimal",
        max_completion_tokens=1000,
        store=False,
    )
    elapsed = time.perf_counter() - started
    print(f"\n[2.x] {model} responded in {elapsed:.2f}s, "
          f"finish_reason={completion.choices[0].finish_reason}")
    return completion


def test_2_1_model_id_is_real_and_reachable(direct_completion):
    """A wrong model id fails here with 404 model_not_found."""
    assert direct_completion.model, "no model echoed back"
    print(f"[2.1] server-reported model: {direct_completion.model}")


def test_2_2_structured_parsing_returns_an_object(direct_completion):
    """reasoning_effort='minimal' + structured outputs must still parse.

    If parsed is None, check finish_reason: 'length' means
    max_completion_tokens=1000 was consumed by reasoning tokens before any
    content was produced.
    """
    parsed = direct_completion.choices[0].message.parsed
    assert parsed is not None, (
        f"GPT returned no structured object. "
        f"finish_reason={direct_completion.choices[0].finish_reason}. "
        f"If it is 'length', raise max_completion_tokens."
    )
    print(f"[2.2] items: {[(i.name, i.assertion) for i in parsed.items]}")


def test_2_3_extraction_is_clinically_sensible(direct_completion):
    """The model must find the stated symptoms and negate the denied one."""
    items = direct_completion.choices[0].message.parsed.items
    names = {item.name.lower() for item in items}

    found_present = {
        expected for expected in EXPECTED_PRESENT_SYMPTOMS
        if any(expected in name for name in names)
    }
    assert found_present, (
        f"None of {EXPECTED_PRESENT_SYMPTOMS} were extracted. Got: {names}"
    )

    for item in items:
        if any(neg in item.name.lower() for neg in EXPECTED_NEGATED_SYMPTOMS):
            assert item.assertion == "NEGATED", (
                f"'{item.name}' was denied by the patient but recorded as "
                f"{item.assertion}. A false PRESENT is a clinical safety issue."
            )

    for item in items:
        assert 0.0 <= item.confidence <= 1.0
        assert item.evidence.strip(), f"'{item.name}' has no evidence span"


# --------------------------------------------------------------------------
# 2.4 - 2.7  Your FastAPI boundary
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def fastapi_response(ai_service_url):
    """Call the service Spring calls. Requires `uvicorn app.main:app` running."""
    try:
        health = httpx.get(f"{ai_service_url}/health", timeout=5.0)
    except httpx.HTTPError as error:
        pytest.skip(f"FastAPI not running at {ai_service_url}: {error}")

    assert health.status_code == 200, "/health did not return 200"

    started = time.perf_counter()
    response = httpx.post(
        f"{ai_service_url}/api/v1/extractions",
        json={
            "consultationId": 1,
            "transcript": CANONICAL_TRANSCRIPT,
            "promptVersion": os.getenv("PROMPT_VERSION", "symptom-extraction-v1"),
        },
        timeout=90.0,
    )
    print(f"\n[2.x] FastAPI HTTP {response.status_code} "
          f"in {time.perf_counter() - started:.2f}s")
    return response


def test_2_4_fastapi_returns_200(fastapi_response):
    assert fastapi_response.status_code == 200, (
        f"{fastapi_response.status_code}: {fastapi_response.text[:300]}\n"
        f"  503 -> the provider raised; check the uvicorn log for the cause"
    )


def test_2_5_response_matches_the_spring_contract(fastapi_response):
    """These exact camelCase keys are what PythonAiExtractionProvider reads."""
    body = fastapi_response.json()
    for key in ("items", "provider", "modelName", "promptVersion"):
        assert key in body, f"missing '{key}' - Spring would fail to deserialise"

    assert body["provider"] == "openai"
    print(f"[2.5] modelName={body['modelName']} promptVersion={body['promptVersion']}")


def test_2_6_provenance_is_the_real_model_not_a_hardcoded_string(fastapi_response):
    """modelName must come from the provider response, not from a constant.

    Stored provenance must report the provider's real model identifier.
    """
    body = fastapi_response.json()
    assert body["modelName"] == os.getenv("OPENAI_MODEL"), (
        f"modelName {body['modelName']!r} != configured "
        f"{os.getenv('OPENAI_MODEL')!r}"
    )
    assert "mock" not in body["modelName"].lower()


def test_2_7_every_item_is_a_label_not_a_diagnosis(fastapi_response):
    """Schema guarantees: constrained assertion values, bounded confidence."""
    for item in fastapi_response.json()["items"]:
        assert item["assertion"] in {"PRESENT", "NEGATED", "UNCERTAIN"}
        assert 0.0 <= item["confidence"] <= 1.0
        assert len(item["name"]) <= 100
        assert item["evidence"], "evidence span is required for auditability"


# --------------------------------------------------------------------------
# 2.8 - 2.9  Failure behaviour
# --------------------------------------------------------------------------

def test_2_8_blank_transcript_is_rejected_not_hallucinated(ai_service_url):
    """A whitespace-only transcript must 422, never reach the model."""
    try:
        response = httpx.post(
            f"{ai_service_url}/api/v1/extractions",
            json={"consultationId": 1, "transcript": "   "},
            timeout=15.0,
        )
    except httpx.HTTPError as error:
        pytest.skip(f"FastAPI not running: {error}")

    assert response.status_code == 422, (
        f"Expected 422 validation error, got {response.status_code}. "
        f"A blank transcript must never be billed to the provider."
    )


def test_2_9_oversized_transcript_is_rejected_not_truncated(ai_service_url):
    """Oversized input must be rejected instead of being silently truncated."""
    try:
        response = httpx.post(
            f"{ai_service_url}/api/v1/extractions",
            json={"consultationId": 1, "transcript": "word " * 5000},
            timeout=15.0,
        )
    except httpx.HTTPError as error:
        pytest.skip(f"FastAPI not running: {error}")

    assert response.status_code == 422, (
        f"Expected 422 for a transcript over 12000 chars, got "
        f"{response.status_code}"
    )
