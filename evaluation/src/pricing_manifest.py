"""Create a pricing manifest from the saved evaluation predictions.

The prices below are the standard API rates used by the experiment. Every
stored per-call cost is checked against these rates before output is written.
"""
import json
import math
from datetime import datetime

from config import PREDICTIONS_DIR, PROVIDERS, RESULTS_DIR, prompt_suffix


PROMPT_VERSIONS = ("v1", "v2")
OUTPUT_PATH = RESULTS_DIR / "pricing-manifest.json"

PRICING = {
    "openai": {
        "model": "gpt-5.6-luna",
        "inputUsdPerMillionTokens": 0.20,
        "outputUsdPerMillionTokens": 1.20,
        "source": "https://developers.openai.com/api/docs/models/gpt-5.6-luna",
        "sourceCheckedDate": "2026-09-10",
    },
    "anthropic": {
        "model": "claude-haiku-4-5-20251001",
        "inputUsdPerMillionTokens": 1.00,
        "outputUsdPerMillionTokens": 5.00,
        "source": "https://www.anthropic.com/news/claude-haiku-4-5",
        "sourceCheckedDate": "2026-09-10",
    },
    "ollama": {
        "model": "gpt-oss:20b",
        "inputUsdPerMillionTokens": 0.0,
        "outputUsdPerMillionTokens": 0.0,
        "source": None,
        "sourceCheckedDate": "2026-09-10",
        "note": "No direct API fee; hardware, electricity and setup are excluded.",
    },
}


def read_predictions(provider, prompt_version):
    """Read one provider and prompt condition from the frozen predictions."""
    suffix = prompt_suffix(prompt_version)
    path = PREDICTIONS_DIR / f"{provider}{suffix}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def expected_cost(record, pricing):
    """Calculate one call's cost from its recorded token counts."""
    input_cost = (
        record.get("inputTokens", 0)
        * pricing["inputUsdPerMillionTokens"]
        / 1_000_000
    )
    output_cost = (
        record.get("outputTokens", 0)
        * pricing["outputUsdPerMillionTokens"]
        / 1_000_000
    )
    return input_cost + output_cost


def iso_minute(value):
    """Return a stored ISO timestamp without changing its timezone."""
    return datetime.fromisoformat(value).isoformat()


def summarise(provider, prompt_version):
    """Verify and summarise the 213 primary calls for one condition."""
    pricing = PRICING[provider]
    records = read_predictions(provider, prompt_version)

    for record in records:
        if record.get("modelId") != pricing["model"]:
            raise RuntimeError(
                f"Unexpected model for {provider}: {record.get('modelId')}"
            )
        calculated = expected_cost(record, pricing)
        recorded = float(record.get("costUsd", 0.0))
        if not math.isclose(calculated, recorded, rel_tol=0.0, abs_tol=1e-12):
            raise RuntimeError(
                f"Cost check failed for {provider}, dialogue "
                f"{record['dialogueId']}, run {record['run']}"
            )

    main_records = [record for record in records if record.get("run") == 1]
    timestamps = [record["createdAtUtc"] for record in records]
    input_tokens = sum(record.get("inputTokens", 0) for record in main_records)
    output_tokens = sum(record.get("outputTokens", 0) for record in main_records)
    recorded_cost = sum(float(record.get("costUsd", 0.0)) for record in main_records)

    return {
        "provider": provider,
        "promptVersion": prompt_version,
        "model": pricing["model"],
        "mainCalls": len(main_records),
        "savedRowsIncludingRepeatability": len(records),
        "firstCallUtc": iso_minute(min(timestamps)),
        "lastCallUtc": iso_minute(max(timestamps)),
        "mainInputTokens": input_tokens,
        "mainOutputTokens": output_tokens,
        "mainRecordedCostUsd": recorded_cost,
        "mainCalculatedCostUsd": expected_cost(
            {"inputTokens": input_tokens, "outputTokens": output_tokens},
            pricing,
        ),
        "allStoredCostsVerified": True,
    }


def build_manifest():
    """Build the complete deterministic pricing record."""
    runs = []
    for prompt_version in PROMPT_VERSIONS:
        for provider in PROVIDERS:
            runs.append(summarise(provider, prompt_version))

    return {
        "currency": "USD",
        "calculation": "input_tokens / 1,000,000 * input_rate + output_tokens / 1,000,000 * output_rate",
        "scope": "Standard synchronous API pricing; no batch or prompt-cache discount was applied.",
        "prices": PRICING,
        "runs": runs,
    }


def main():
    """Verify every stored cost and write the pricing manifest."""
    manifest = build_manifest()
    OUTPUT_PATH.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Saved {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
