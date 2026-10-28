"""Calculate confidence intervals for the frozen alias-table contribution.

This script uses saved predictions only. It does not contact any AI provider
and it does not change the primary evaluation results.
"""
import csv
import math

from config import PREDICTIONS_DIR, PROVIDERS, RESULTS_DIR, prompt_suffix
from corpus import build_gold, load_raw_data, split_corpus
from evaluate import aggregate, paired_bootstrap, read_json, score_dialogue


PROMPT_VERSIONS = ("v1", "v2")
METRICS = ("conceptF1", "assertionAwareF1")
OUTPUT_PATH = RESULTS_DIR / "alias-bootstrap.csv"
ABLATION_PATH = RESULTS_DIR / "alias-ablation.csv"


def load_main_predictions(provider, prompt_version, expected_ids):
    """Load one saved run-one prediction for every evaluation dialogue."""
    suffix = prompt_suffix(prompt_version)
    records = read_json(PREDICTIONS_DIR / f"{provider}{suffix}.json")
    predictions = {
        str(record["dialogueId"]): record
        for record in records
        if record.get("run") == 1
    }

    if set(predictions) != expected_ids:
        raise ValueError(
            f"{provider} {prompt_version} does not match the gold dialogues"
        )

    return predictions


def score_saved_predictions(gold, predictions, use_aliases):
    """Score saved predictions in stable dialogue order."""
    return [
        score_dialogue(
            gold[dialogue_id],
            predictions[dialogue_id],
            use_aliases=use_aliases,
        )
        for dialogue_id in sorted(gold, key=int)
    ]


def read_expected_ablation_values():
    """Read point estimates already reported by the ablation analysis."""
    expected = {}

    with ABLATION_PATH.open(encoding="utf-8", newline="") as input_file:
        for row in csv.DictReader(input_file):
            key = (row["promptVersion"], row["provider"], row["condition"])
            expected[key] = {
                "conceptF1": float(row["conceptF1"]),
                "assertionAwareF1": float(row["assertionAwareF1"]),
            }

    return expected


def check_point_estimate(actual, expected, description):
    """Stop if this script does not reproduce a reported point estimate."""
    if not math.isclose(actual, expected, rel_tol=0.0, abs_tol=1e-12):
        raise RuntimeError(
            f"Point-estimate check failed for {description}: "
            f"expected {expected}, calculated {actual}"
        )


def build_rows():
    """Return alias-on minus alias-off bootstrap comparisons."""
    dialogs, annotations = load_raw_data()
    dialogue_ids, _duplicate_pairs = split_corpus(dialogs)
    gold_without_aliases = build_gold(
        dialogs,
        annotations,
        dialogue_ids,
        use_aliases=False,
    )
    gold_with_aliases = build_gold(
        dialogs,
        annotations,
        dialogue_ids,
        use_aliases=True,
    )
    expected_ids = set(gold_with_aliases)
    expected_values = read_expected_ablation_values()
    output_rows = []

    for prompt_version in PROMPT_VERSIONS:
        for provider in PROVIDERS:
            predictions = load_main_predictions(
                provider,
                prompt_version,
                expected_ids,
            )
            rows_without_aliases = score_saved_predictions(
                gold_without_aliases,
                predictions,
                use_aliases=False,
            )
            rows_with_aliases = score_saved_predictions(
                gold_with_aliases,
                predictions,
                use_aliases=True,
            )

            summaries = {
                "no-alias": aggregate(rows_without_aliases),
                "frozen-alias": aggregate(rows_with_aliases),
            }

            for condition, summary in summaries.items():
                expected = expected_values[(prompt_version, provider, condition)]
                for metric_name in METRICS:
                    check_point_estimate(
                        summary[metric_name],
                        expected[metric_name],
                        f"{prompt_version}/{provider}/{condition}/{metric_name}",
                    )

            for metric_name in METRICS:
                comparison = paired_bootstrap(
                    rows_with_aliases,
                    rows_without_aliases,
                    metric_name,
                )
                output_rows.append({
                    "promptVersion": prompt_version,
                    "provider": provider,
                    "metric": metric_name,
                    "dialogues": comparison["dialogues"],
                    "noAliasValue": comparison["secondValue"],
                    "frozenAliasValue": comparison["firstValue"],
                    "differenceAliasMinusNoAlias": comparison["difference"],
                    "ciLow": comparison["low"],
                    "ciHigh": comparison["high"],
                    "intervalExcludesZero": comparison["excludesZero"],
                })

    return output_rows


def write_rows(rows):
    """Write the deterministic result table used by the dissertation."""
    fieldnames = (
        "promptVersion",
        "provider",
        "metric",
        "dialogues",
        "noAliasValue",
        "frozenAliasValue",
        "differenceAliasMinusNoAlias",
        "ciLow",
        "ciHigh",
        "intervalExcludesZero",
    )

    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    """Verify point estimates, run the bootstrap and save the CSV."""
    rows = build_rows()
    write_rows(rows)
    print(f"Saved {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
