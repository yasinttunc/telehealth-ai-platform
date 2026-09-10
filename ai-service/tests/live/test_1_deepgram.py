"""TEST GROUP 1 — Does Deepgram actually transcribe our audio?

Two independent questions, deliberately separated:

  1.1-1.3  REST (prerecorded)  -> is the API key valid, is the model name real,
                                  does our audio format decode correctly?
  1.4-1.6  WebSocket (streaming) -> does the LIVE path work, do we get interim
                                    results before finals, and does closing the
                                    stream flush the last sentence?

If the REST test passes but the streaming test fails, the problem is in the
streaming parameters, not in the credentials.
"""

import json
import time

import httpx
import pytest

from .conftest import SPOKEN_SENTENCE

DEEPGRAM_REST = "https://api.deepgram.com/v1/listen"
DEEPGRAM_WS = "wss://api.deepgram.com/v1/listen"


def _normalise(text: str) -> str:
    return "".join(ch.lower() for ch in text if ch.isalnum() or ch.isspace())


# --------------------------------------------------------------------------
# 1.1 - 1.3  Prerecorded REST API
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def rest_result(deepgram_key, deepgram_model, deepgram_language, test_audio):
    """One paid REST call, reused by the three assertions below."""
    with open(test_audio, "rb") as handle:
        audio_bytes = handle.read()

    response = httpx.post(
        DEEPGRAM_REST,
        params={
            "model": deepgram_model,
            "language": deepgram_language,
            "smart_format": "true",
            "punctuate": "true",
        },
        headers={
            "Authorization": f"Token {deepgram_key}",
            "Content-Type": "audio/wav",
        },
        content=audio_bytes,
        timeout=60.0,
    )
    print(f"\n[1.x] Deepgram REST HTTP {response.status_code}")
    return response


def test_1_1_api_key_and_model_are_accepted(rest_result, deepgram_model):
    """A 401 means a bad key; a 400 usually means an invalid model name."""
    assert rest_result.status_code == 200, (
        f"Deepgram rejected the request: {rest_result.status_code} "
        f"{rest_result.text[:300]}\n"
        f"  401 -> DEEPGRAM_API_KEY is wrong or the project has no credit\n"
        f"  400 -> model '{deepgram_model}' may not exist for this account"
    )


def test_1_2_audio_format_decodes_to_real_words(rest_result):
    """Proves our 16-bit mono PCM is what Deepgram expects.

    A format mismatch does NOT raise an error - it returns confident nonsense.
    This is the failure mode that silently ruins a WER measurement.
    """
    body = rest_result.json()
    transcript = (
        body["results"]["channels"][0]["alternatives"][0]["transcript"]
    )
    confidence = body["results"]["channels"][0]["alternatives"][0]["confidence"]
    print(f"[1.2] transcript: {transcript!r} (confidence {confidence:.3f})")

    assert transcript.strip(), "Deepgram returned an empty transcript"
    assert confidence > 0.5, (
        f"Confidence {confidence:.3f} is suspiciously low - usually a sample "
        f"rate or encoding mismatch rather than poor speech."
    )


def test_1_3_key_clinical_words_survive_transcription(rest_result):
    """The words the extraction step depends on must actually be present."""
    transcript = _normalise(
        rest_result.json()["results"]["channels"][0]["alternatives"][0]["transcript"]
    )
    for word in ("headache", "throat", "fever"):
        assert word in transcript, (
            f"'{word}' missing from transcript {transcript!r}. "
            f"Spoken sentence was: {SPOKEN_SENTENCE!r}"
        )


# --------------------------------------------------------------------------
# 1.4 - 1.6  Streaming WebSocket  (this is what the worker will use)
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def stream_messages(deepgram_key, deepgram_model, deepgram_language,
                    sample_rate, raw_pcm):
    """Stream raw PCM exactly as the LiveKit worker would, collect every reply.

    Uses the `websockets` library directly rather than deepgram-sdk, because
    deepgram-sdk requires Python 3.10+ and the project venv is 3.9.
    """
    websockets = pytest.importorskip(
        "websockets",
        reason="pip install websockets  (needed for the streaming test)",
    )
    import asyncio

    query = (
        f"?model={deepgram_model}&language={deepgram_language}"
        f"&encoding=linear16&sample_rate={sample_rate}&channels=1"
        f"&interim_results=true&endpointing=300"
        f"&smart_format=true&punctuate=true"
    )

    async def run():
        collected = []
        async with websockets.connect(
            DEEPGRAM_WS + query,
            additional_headers={"Authorization": f"Token {deepgram_key}"},
        ) as socket:

            async def receive():
                try:
                    async for raw in socket:
                        collected.append(json.loads(raw))
                except Exception:
                    pass

            reader = asyncio.create_task(receive())

            # 20 ms of audio per frame - the same cadence LiveKit delivers.
            bytes_per_frame = int(sample_rate * 0.02) * 2
            for offset in range(0, len(raw_pcm), bytes_per_frame):
                await socket.send(raw_pcm[offset:offset + bytes_per_frame])
                await asyncio.sleep(0.02)      # real-time pacing

            # CRITICAL: without CloseStream the last sentence never arrives.
            await socket.send(json.dumps({"type": "CloseStream"}))
            await asyncio.sleep(3.0)
            reader.cancel()

        return collected

    messages = asyncio.run(run())
    print(f"\n[1.x] streaming returned {len(messages)} messages")
    return messages


def test_1_4_streaming_connection_produces_results(stream_messages):
    """If this is empty, the live captions path cannot work at all."""
    results = [m for m in stream_messages if m.get("type") == "Results"]
    assert results, (
        "Deepgram opened the socket but returned no Results messages. "
        "Check encoding/sample_rate against the frames actually sent."
    )


def test_1_5_interim_results_arrive_before_finals(stream_messages):
    """Interim results are what make live captions possible."""
    results = [m for m in stream_messages if m.get("type") == "Results"]
    interim = [m for m in results if not m.get("is_final")]
    finals = [m for m in results if m.get("is_final")]

    print(f"[1.5] interim={len(interim)} final={len(finals)}")
    assert interim, "No interim results - interim_results=true was not honoured"
    assert finals, "No final results - nothing would ever be persisted"


def test_1_6_final_text_is_complete_after_close(stream_messages):
    """Concatenated finals must contain the whole spoken sentence.

    This is the CloseStream/flush test: if the last final is missing, every
    consultation would silently lose its closing sentence.
    """
    finals = [
        m["channel"]["alternatives"][0]["transcript"]
        for m in stream_messages
        if m.get("type") == "Results" and m.get("is_final")
        and m.get("channel", {}).get("alternatives")
    ]
    joined = _normalise(" ".join(finals))
    print(f"[1.6] joined finals: {joined!r}")

    assert "headache" in joined, "opening words lost"
    assert "fever" in joined, (
        "closing words lost - the stream was not flushed before closing"
    )


def test_1_7_worker_parser_handles_the_real_messages(stream_messages):
    """Feed the REAL Deepgram payloads through the project's own parser."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from worker.deepgram_stream import parse_deepgram_message

    parsed = [
        parse_deepgram_message(m)
        for m in stream_messages if m.get("type") == "Results"
    ]
    usable = [p for p in parsed if p is not None]

    assert usable, "worker/deepgram_stream.py could not parse any real message"
    for event in usable:
        assert event.end_ms >= event.start_ms, (
            f"Spring rejects end<start; got {event.start_ms}..{event.end_ms}"
        )
    print(f"[1.7] parsed {len(usable)}/{len(parsed)} messages successfully")
