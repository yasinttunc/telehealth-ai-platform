"""Call providers and store resumable prediction results."""
import argparse
import json
import os
import random
import time
from datetime import datetime, timezone

import httpx

from config import (
    EVALUATION_DIR,
    PREDICTIONS_DIR,
    RANDOM_SEED,
    REPEATABILITY_DIALOGUES,
    PROMPTS,
    RESULTS_DIR,
    prompt_suffix,
)

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "assertion": {
                        "type": "string",
                        "enum": ["PRESENT", "NEGATED", "UNCERTAIN"],
                    },
                    "confidence": {"type": "number"},
                    "evidence": {"type": "string"},
                },
                "required": ["name", "assertion", "confidence", "evidence"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["items"],
    "additionalProperties": False,
}


def load_env_file():
    """Load simple KEY=VALUE entries without another dependency."""
    env_path = EVALUATION_DIR / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def user_prompt(transcript):
    """Build the same user prompt used by the production service."""
    return (
        "Extract symptoms from this fictional transcript.\n\n"
        f"Transcript:\n{transcript}\n\n"
        "Do not add facts that are not present in the transcript."
    )


def validate_output(raw_text):
    """Parse JSON and apply the production field restrictions."""
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as error:
        return [], f"Invalid JSON: {error}"

    if not isinstance(payload, dict):
        return [], "The response must be an object"
    if set(payload) != {"items"}:
        return [], "The response must contain only the items field"
    if not isinstance(payload.get("items"), list):
        return [], "The response must contain an items list"

    validated_items = []
    allowed_assertions = {"PRESENT", "NEGATED", "UNCERTAIN"}

    for item in payload["items"]:
        if not isinstance(item, dict):
            return [], "Every item must be an object"

        expected_fields = {"name", "assertion", "confidence", "evidence"}
        if set(item) != expected_fields:
            return [], "Every item must contain exactly the four required fields"

        name = item.get("name")
        assertion = item.get("assertion")
        confidence = item.get("confidence")
        evidence = item.get("evidence")

        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
            return [], "Finding name must contain 1-100 characters"
        if assertion not in allowed_assertions:
            return [], f"Unsupported assertion: {assertion}"
        if isinstance(confidence, bool):
            return [], "Confidence cannot be a boolean"
        if not isinstance(confidence, (int, float)):
            return [], "Confidence must be numeric"
        if not 0.0 <= confidence <= 1.0:
            return [], "Confidence must be between 0.0 and 1.0"
        if (
            not isinstance(evidence, str)
            or not 1 <= len(evidence.strip()) <= 500
        ):
            return [], "Evidence must contain 1-500 characters"

        validated_items.append({
            "name": name.strip(),
            "assertion": assertion,
            "confidence": float(confidence),
            "evidence": evidence.strip(),
        })

    return validated_items, None


def price_variable_names(provider):
    """Return the two environment variable names used for provider prices."""
    prefix = provider.upper()
    return (
        f"{prefix}_INPUT_PRICE_PER_MILLION",
        f"{prefix}_OUTPUT_PRICE_PER_MILLION",
    )


def missing_price_variables(provider):
    """List price variables that have not been configured."""
    return [
        name
        for name in price_variable_names(provider)
        if not os.getenv(name)
    ]


def estimated_cost(provider, input_tokens, output_tokens):
    """Calculate cost from prices recorded in the environment file."""
    prefix = provider.upper()
    input_price = float(
        os.getenv(f"{prefix}_INPUT_PRICE_PER_MILLION") or "0"
    )
    output_price = float(
        os.getenv(f"{prefix}_OUTPUT_PRICE_PER_MILLION") or "0"
    )

    return (
        input_tokens * input_price / 1_000_000
        + output_tokens * output_price / 1_000_000
    )


def result(
    provider,
    model,
    started,
    raw_text="",
    input_tokens=0,
    output_tokens=0,
    api_error=None,
):
    """Create the common result object stored for every provider."""
    items = []
    validation_error = None

    if api_error is None:
        items, validation_error = validate_output(raw_text)

    error_type = None
    error_message = None

    if api_error:
        error_type = "api"
        error_message = api_error
    elif validation_error:
        error_type = "validation"
        error_message = validation_error

    return {
        "provider": provider,
        "modelId": model,
        "createdAtUtc": datetime.now(timezone.utc).isoformat(),
        "success": error_type is None,
        "items": items if error_type is None else [],
        "rawText": raw_text,
        "errorType": error_type,
        "errorMessage": error_message,
        "latencyMs": round((time.perf_counter() - started) * 1000, 1),
        "inputTokens": int(input_tokens or 0),
        "outputTokens": int(output_tokens or 0),
        "costUsd": estimated_cost(provider, input_tokens, output_tokens),
        "pricingConfigured": not missing_price_variables(provider),
    }


def call_openai(transcript, system_prompt):
    """Call OpenAI with a strict structural JSON schema."""
    # Import here so local validation does not require the OpenAI SDK.
    from openai import OpenAI

    model = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
    started = time.perf_counter()

    try:
        client = OpenAI(
            api_key=os.environ["OPENAI_API_KEY"],
            timeout=120,
        )
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt(transcript)},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "symptom_extraction",
                    "strict": True,
                    "schema": RESPONSE_SCHEMA,
                },
            },
            max_completion_tokens=4000,
        )

        usage = response.usage
        return result(
            "openai",
            model,
            started,
            response.choices[0].message.content or "",
            getattr(usage, "prompt_tokens", 0),
            getattr(usage, "completion_tokens", 0),
        )
    except Exception as error:
        return result(
            "openai", model, started,
            api_error=f"{type(error).__name__}: {error}",
        )


def call_anthropic(transcript, system_prompt):
    """Call Anthropic through the Messages API."""
    model = os.getenv(
        "ANTHROPIC_MODEL",
        "claude-haiku-4-5-20251001",
    )
    started = time.perf_counter()

    try:
        response = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": os.environ["ANTHROPIC_API_KEY"],
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 4000,
                "temperature": 0,
                "system": system_prompt,
                "messages": [
                    {"role": "user", "content": user_prompt(transcript)}
                ],
                "output_config": {
                    "format": {
                        "type": "json_schema",
                        "schema": RESPONSE_SCHEMA,
                    }
                },
            },
            timeout=120,
        )
        response.raise_for_status()
        body = response.json()

        raw_text = "".join(
            block.get("text", "")
            for block in body.get("content", [])
            if block.get("type") == "text"
        )

        usage = body.get("usage", {})
        return result(
            "anthropic",
            model,
            started,
            raw_text,
            usage.get("input_tokens", 0),
            usage.get("output_tokens", 0),
        )
    except Exception as error:
        return result(
            "anthropic", model, started,
            api_error=f"{type(error).__name__}: {error}",
        )


def call_ollama(transcript, system_prompt):
    """Call the local Ollama chat endpoint."""
    model = os.getenv("OLLAMA_MODEL", "gpt-oss:20b")
    base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    started = time.perf_counter()

    try:
        response = httpx.post(
            f"{base_url}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt(transcript)},
                ],
                "format": RESPONSE_SCHEMA,
                "stream": False,
                "think": "low",
                "options": {
                    "temperature": 0,
                    "num_ctx": 16384,
                    "num_predict": 4000,
                },
            },
            timeout=600,
        )
        response.raise_for_status()
        body = response.json()

        return result(
            "ollama",
            model,
            started,
            body.get("message", {}).get("content", ""),
            body.get("prompt_eval_count", 0),
            body.get("eval_count", 0),
        )
    except Exception as error:
        return result(
            "ollama", model, started,
            api_error=f"{type(error).__name__}: {error}",
        )


CALLERS = {
    "openai": call_openai,
    "anthropic": call_anthropic,
    "ollama": call_ollama,
}


def atomic_write(path, value):
    """Protect the prediction file from interrupted writes."""
    temporary_path = path.with_suffix(".tmp")
    temporary_path.write_text(
        json.dumps(value, indent=2),
        encoding="utf-8",
    )
    temporary_path.replace(path)


def repeatability_ids(gold):
    """Select the same 30 dialogues for every provider."""
    dialogue_ids = sorted(gold, key=int)
    generator = random.Random(RANDOM_SEED)
    selected = generator.sample(dialogue_ids, REPEATABILITY_DIALOGUES)
    return sorted(selected, key=int)


def collect(
    provider,
    confirm_paid_calls=False,
    limit=None,
    prompt_version="v1",
):
    """Collect the main run and one repeatability run.

    The confirmation is checked here as well as in the command-line entry
    point. This prevents an imported function from starting paid calls.
    """
    if not confirm_paid_calls:
        raise SystemExit("collect() requires confirm_paid_calls=True.")

    missing_prices = missing_price_variables(provider)
    if missing_prices:
        print()
        print(f"WARNING: prices are not configured for {provider}.")
        print("Cost will be stored as 0.00 until these variables are set:")
        print(", ".join(missing_prices))
        print("Token counts are still stored, so cost can be added later.")
        print()

    gold = json.loads(
        (RESULTS_DIR / "gold.json").read_text(encoding="utf-8")
    )

    PREDICTIONS_DIR.mkdir(parents=True, exist_ok=True)
    # A non-default prompt writes to its own file so the primary
    # predictions can never be overwritten by an experiment.
    output_path = (
        PREDICTIONS_DIR
        / f"{provider}{prompt_suffix(prompt_version)}.json"
    )

    rows = (
        json.loads(output_path.read_text(encoding="utf-8"))
        if output_path.exists()
        else []
    )

    completed = {
        (row["dialogueId"], row["run"])
        for row in rows
    }

    repeatability_selection = set(repeatability_ids(gold))

    plan = [(dialogue_id, 1) for dialogue_id in sorted(gold, key=int)]
    plan += [
        (dialogue_id, 2)
        for dialogue_id in sorted(repeatability_selection, key=int)
    ]

    pending = [
        item for item in plan
        if item not in completed
    ]

    # A small limit is useful for checking one provider before the full run.
    if limit is not None:
        pending = pending[:limit]

    for position, (dialogue_id, run) in enumerate(pending, start=1):
        print(
            f"{provider}: {position}/{len(pending)}, "
            f"dialogue {dialogue_id}, run {run}"
        )

        provider_result = CALLERS[provider](
            gold[dialogue_id]["transcript"],
            PROMPTS[prompt_version],
        )

        rows.append({
            "dialogueId": dialogue_id,
            "run": run,
            "repeatabilityCase": dialogue_id in repeatability_selection,
            "promptVersion": prompt_version,
            **provider_result,
        })

        atomic_write(output_path, rows)


def main():
    """Read command-line arguments and start collection."""
    load_env_file()

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--provider",
        required=True,
        choices=sorted(CALLERS),
    )
    parser.add_argument(
        "--confirm-paid-calls",
        action="store_true",
    )
    parser.add_argument(
        "--prompt-version",
        default="v1",
        choices=sorted(PROMPTS),
        help="v1 is the frozen primary prompt. v2 is the post-hoc "
             "experiment and writes to a separate file.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Run only this many pending calls for a small pilot.",
    )
    arguments = parser.parse_args()

    if not arguments.confirm_paid_calls:
        raise SystemExit(
            "Add --confirm-paid-calls before contacting a provider."
        )

    if arguments.limit is not None and arguments.limit < 1:
        raise SystemExit("--limit must be at least 1.")

    collect(
        arguments.provider,
        confirm_paid_calls=True,
        limit=arguments.limit,
        prompt_version=arguments.prompt_version,
    )


if __name__ == "__main__":
    main()
