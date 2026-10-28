"""Run reproducible supplementary analyses over saved provider predictions."""
import argparse
import csv
import hashlib
import json
import math
import re
import statistics
import sys
from collections import Counter
from datetime import datetime, timezone

from config import (
    ASSERTIONS,
    BOOTSTRAP_REPETITIONS,
    PREDICTIONS_DIR,
    PROVIDERS,
    RANDOM_SEED,
    RESULTS_DIR,
    prompt_suffix,
)
from corpus import build_gold, load_raw_data, split_corpus
from corpus import plain_text
from evaluate import (
    aggregate,
    conditional_divide,
    paired_bootstrap,
    prepare_predictions,
    read_json,
    score_dialogue,
)


PROMPT_VERSIONS = ("v1", "v2")
PROMPT_METRICS = (
    "conceptPrecision",
    "conceptRecall",
    "conceptF1",
    "assertionAwareF1",
)
CONFIDENCE_OUTCOMES = (
    "conceptCorrect",
    "assertionAwareCorrect",
)
CONFIDENCE_THRESHOLDS = (0.0, 0.7, 0.8, 0.9, 0.95)
ALIAS_CONDITIONS = {
    "no-alias": False,
    "frozen-alias": True,
}

OUTPUT_PATHS = {
    "report": RESULTS_DIR / "supplementary-analysis.md",
    "prompt": RESULTS_DIR / "prompt-bootstrap.csv",
    "confidence_summary": RESULTS_DIR / "confidence-summary.csv",
    "confidence_thresholds": RESULTS_DIR / "confidence-thresholds.csv",
    "alias": RESULTS_DIR / "alias-ablation.csv",
    "assertion": RESULTS_DIR / "assertion-recall.csv",
    "evidence": RESULTS_DIR / "evidence-turn-joining.csv",
}

SPEAKER_LABEL = re.compile(
    r"\b(?:doctor|patient|caregiver|clinician|provider)\s*:\s*",
    re.IGNORECASE,
)


def protected_paths():
    """Return files that a supplementary analysis must never modify."""
    paths = [
        RESULTS_DIR / "gold.json",
        RESULTS_DIR / "provenance.json",
        RESULTS_DIR / "evaluation.json",
        RESULTS_DIR / "report.md",
        RESULTS_DIR / "evaluation-promptv2.json",
        RESULTS_DIR / "report-promptv2.md",
    ]

    for provider in PROVIDERS:
        for prompt_version in PROMPT_VERSIONS:
            suffix = prompt_suffix(prompt_version)
            paths.append(PREDICTIONS_DIR / f"{provider}{suffix}.json")

    return paths


def file_digest(path):
    """Return a SHA-256 digest for one protected file."""
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def snapshot_protected_files():
    """Return hashes used to prove frozen inputs were not modified."""
    snapshots = {}

    for path in protected_paths():
        if not path.exists():
            raise FileNotFoundError(f"Required protected file is missing: {path}")
        snapshots[path] = file_digest(path)

    return snapshots


def verify_protected_files(snapshots):
    """Raise an error if any frozen input changed during execution."""
    for path, expected_digest in snapshots.items():
        actual_digest = file_digest(path)
        if actual_digest != expected_digest:
            raise RuntimeError(f"Protected file changed during analysis: {path}")


def load_main_predictions(provider, prompt_version, expected_ids):
    """Return the 213 saved run-one predictions indexed by dialogue ID."""
    suffix = prompt_suffix(prompt_version)
    path = PREDICTIONS_DIR / f"{provider}{suffix}.json"
    records = read_json(path)
    main_records = {}

    # Repeatability cases also have a run-one row in the main corpus. Only the
    # additional run-two rows must be excluded from these analyses.
    for record in records:
        if record.get("run") != 1:
            continue

        dialogue_id = str(record["dialogueId"])
        if dialogue_id in main_records:
            raise ValueError(
                f"Duplicate run-one prediction for {provider}, "
                f"{prompt_version}, dialogue {dialogue_id}"
            )
        main_records[dialogue_id] = record

    actual_ids = set(main_records)
    if actual_ids != expected_ids:
        missing_ids = sorted(expected_ids - actual_ids, key=int)
        extra_ids = sorted(actual_ids - expected_ids, key=int)
        raise ValueError(
            f"{provider} {prompt_version} does not match the 213 gold IDs. "
            f"Missing={missing_ids}, extra={extra_ids}"
        )

    return main_records


def load_all_predictions(gold):
    """Return saved main predictions for both prompts and all providers."""
    expected_ids = set(gold)
    prediction_sets = {}

    for prompt_version in PROMPT_VERSIONS:
        prediction_sets[prompt_version] = {}
        for provider in PROVIDERS:
            prediction_sets[prompt_version][provider] = load_main_predictions(
                provider,
                prompt_version,
                expected_ids,
            )

    return prediction_sets


def score_prediction_set(gold, records, use_aliases=True):
    """Return primary-pipeline score rows for one saved prediction set."""
    rows = []

    for dialogue_id in sorted(gold, key=int):
        row = score_dialogue(
            gold[dialogue_id],
            records[dialogue_id],
            use_aliases=use_aliases,
        )
        rows.append(row)

    return rows


def score_all_frozen(gold, prediction_sets):
    """Return frozen-alias score rows for every provider and prompt."""
    scored_rows = {}

    for prompt_version in PROMPT_VERSIONS:
        scored_rows[prompt_version] = {}
        for provider in PROVIDERS:
            records = prediction_sets[prompt_version][provider]
            scored_rows[prompt_version][provider] = score_prediction_set(
                gold,
                records,
                use_aliases=True,
            )

    return scored_rows


def verify_frozen_results(scored_rows):
    """Return reproduced v1 metrics after checking the frozen result file."""
    frozen_result = read_json(RESULTS_DIR / "evaluation.json")
    reproduced = {}

    for provider in PROVIDERS:
        actual = aggregate(scored_rows["v1"][provider])
        expected = frozen_result["providers"][provider]
        reproduced[provider] = {}

        for metric_name in ("conceptF1", "assertionAwareF1"):
            actual_value = actual[metric_name]
            expected_value = expected[metric_name]
            values_match = math.isclose(
                actual_value,
                expected_value,
                rel_tol=0.0,
                abs_tol=1e-12,
            )

            if not values_match:
                raise RuntimeError(
                    "Frozen verification failed: "
                    f"provider={provider}, metric={metric_name}, "
                    f"expected={expected_value}, actual={actual_value}"
                )

            reproduced[provider][metric_name] = actual_value

    return reproduced


def prompt_bootstrap_rows(scored_rows):
    """Return paired prompt-v2 minus prompt-v1 bootstrap comparisons."""
    output_rows = []

    for provider in PROVIDERS:
        v1_rows = scored_rows["v1"][provider]
        v2_rows = scored_rows["v2"][provider]

        for metric_name in PROMPT_METRICS:
            comparison = paired_bootstrap(
                v2_rows,
                v1_rows,
                metric_name,
            )
            output_rows.append({
                "provider": provider,
                "metric": metric_name,
                "dialogues": comparison["dialogues"],
                "v1Value": comparison["secondValue"],
                "v2Value": comparison["firstValue"],
                "differenceV2MinusV1": comparison["difference"],
                "ciLow": comparison["low"],
                "ciHigh": comparison["high"],
                "intervalExcludesZero": comparison["excludesZero"],
            })

    return output_rows


def evidence_text_without_labels(value):
    """Return relaxed evidence text without transcript speaker labels."""
    without_labels = SPEAKER_LABEL.sub("", str(value))
    return plain_text(without_labels)


def adjacent_turn_windows(transcript):
    """Return normalised single-turn and adjacent-two-turn transcript windows."""
    turns = []

    for line in transcript.splitlines():
        if not line.strip():
            continue
        turns.append(evidence_text_without_labels(line))

    windows = []
    for index, turn in enumerate(turns):
        windows.append(turn)
        if index + 1 < len(turns):
            windows.append(f"{turn} {turns[index + 1]}")

    return windows


def evidence_matches_adjacent_turns(evidence, windows):
    """Return whether evidence occurs within one or two adjacent turns."""
    normalised_evidence = evidence_text_without_labels(evidence)
    if not normalised_evidence:
        return False

    for window in windows:
        if normalised_evidence in window:
            return True

    return False


def evidence_turn_joining_rows(gold, prediction_sets, scored_rows):
    """Return evidence rates tolerant of one adjacent question-answer join."""
    output_rows = []

    for prompt_version in PROMPT_VERSIONS:
        for provider in PROVIDERS:
            records = prediction_sets[prompt_version][provider]
            primary_summary = aggregate(
                scored_rows[prompt_version][provider]
            )
            total = 0
            matched = 0

            for dialogue_id in sorted(gold, key=int):
                record = records[dialogue_id]
                raw_items = (
                    record.get("items", [])
                    if record.get("success")
                    else []
                )
                windows = adjacent_turn_windows(
                    gold[dialogue_id]["transcript"]
                )

                for item in raw_items:
                    total += 1
                    if evidence_matches_adjacent_turns(
                        item.get("evidence", ""),
                        windows,
                    ):
                        matched += 1

            output_rows.append({
                "promptVersion": prompt_version,
                "provider": provider,
                "evidenceItems": total,
                "matchedItems": matched,
                "exactEvidenceRate": primary_summary["exactEvidenceRate"],
                "normalisedEvidenceRate": primary_summary[
                    "normalisedEvidenceRate"
                ],
                "adjacentTurnEvidenceRate": conditional_divide(
                    matched,
                    total,
                ),
            })

    return output_rows


def confidence_for_group(prediction):
    """Return the largest confidence in one normalised concept group."""
    values = []

    for record in prediction["records"]:
        confidence = record.get("confidence")
        if isinstance(confidence, bool) or not isinstance(
            confidence,
            (int, float),
        ):
            raise ValueError(f"Confidence must be numeric: {confidence!r}")
        if not 0.0 <= confidence <= 1.0:
            raise ValueError(f"Confidence must be between 0 and 1: {confidence}")
        values.append(float(confidence))

    if not values:
        raise ValueError("A prepared prediction group has no source records")

    return max(values)


def confidence_observations(gold, records):
    """Return one confidence observation per unique predicted concept."""
    observations = []

    for dialogue_id in sorted(gold, key=int):
        record = records[dialogue_id]
        raw_items = record.get("items", []) if record.get("success") else []
        predictions = prepare_predictions(raw_items, use_aliases=True)
        gold_findings = {
            finding["concept"]: finding
            for finding in gold[dialogue_id]["findings"]
        }

        for concept in sorted(predictions):
            prediction = predictions[concept]
            gold_finding = gold_findings.get(concept)
            concept_correct = gold_finding is not None
            assertion_correct = False

            # A conflicted gold label has no defensible correct assertion, so
            # it is retained for concept analysis but omitted from assertion
            # confidence analysis.
            if gold_finding and gold_finding["assertionConflict"]:
                assertion_correct = None
            elif gold_finding:
                assertion_correct = (
                    not prediction["predictionConflict"]
                    and prediction["assertion"] == gold_finding["assertion"]
                )

            observations.append({
                "dialogueId": dialogue_id,
                "concept": concept,
                "confidence": confidence_for_group(prediction),
                "conceptCorrect": concept_correct,
                "assertionAwareCorrect": assertion_correct,
            })

    return observations


def rank_auc(correct_values, incorrect_values):
    """Return exact tie-aware rank AUC, or None for a missing class."""
    if not correct_values or not incorrect_values:
        return None

    labelled_values = []
    for value in correct_values:
        labelled_values.append((value, True))
    for value in incorrect_values:
        labelled_values.append((value, False))
    labelled_values.sort(key=confidence_sort_key)

    correct_rank_sum = 0.0
    start = 0

    while start < len(labelled_values):
        end = start + 1
        while (
            end < len(labelled_values)
            and labelled_values[end][0] == labelled_values[start][0]
        ):
            end += 1

        # Ranks are one-based. Every tied value receives the average rank.
        first_rank = start + 1
        last_rank = end
        average_rank = (first_rank + last_rank) / 2

        for _, is_correct in labelled_values[start:end]:
            if is_correct:
                correct_rank_sum += average_rank

        start = end

    correct_count = len(correct_values)
    incorrect_count = len(incorrect_values)
    minimum_correct_rank_sum = correct_count * (correct_count + 1) / 2
    mann_whitney_u = correct_rank_sum - minimum_correct_rank_sum
    return mann_whitney_u / (correct_count * incorrect_count)


def confidence_sort_key(item):
    """Return the confidence used to sort one labelled AUC observation."""
    return item[0]


def confidence_frequency_sort_key(item):
    """Return the order for common confidence values and their counts."""
    value, count = item
    return -count, value


def frequent_confidences(observations):
    """Return a compact string containing the five common confidence values."""
    counts = Counter(observation["confidence"] for observation in observations)
    ordered = sorted(
        counts.items(),
        key=confidence_frequency_sort_key,
    )
    return "; ".join(
        f"{value:g}:{count}"
        for value, count in ordered[:5]
    )


def confidence_analysis(gold, prediction_sets):
    """Return confidence summary and threshold rows for every saved run."""
    summary_rows = []
    threshold_rows = []

    for prompt_version in PROMPT_VERSIONS:
        for provider in PROVIDERS:
            records = prediction_sets[prompt_version][provider]
            all_observations = confidence_observations(gold, records)

            for outcome_name in CONFIDENCE_OUTCOMES:
                observations = [
                    observation
                    for observation in all_observations
                    if observation[outcome_name] is not None
                ]
                correct = [
                    observation["confidence"]
                    for observation in observations
                    if observation[outcome_name]
                ]
                incorrect = [
                    observation["confidence"]
                    for observation in observations
                    if not observation[outcome_name]
                ]

                summary_rows.append({
                    "promptVersion": prompt_version,
                    "provider": provider,
                    "outcome": outcome_name,
                    "observations": len(observations),
                    "correct": len(correct),
                    "incorrect": len(incorrect),
                    "distinctConfidenceValues": len({
                        observation["confidence"]
                        for observation in observations
                    }),
                    "fiveMostFrequent": frequent_confidences(observations),
                    "meanConfidenceCorrect": (
                        statistics.mean(correct) if correct else None
                    ),
                    "meanConfidenceIncorrect": (
                        statistics.mean(incorrect) if incorrect else None
                    ),
                    "rankAuc": rank_auc(correct, incorrect),
                })

                for threshold in CONFIDENCE_THRESHOLDS:
                    retained = [
                        observation
                        for observation in observations
                        if observation["confidence"] >= threshold
                    ]
                    correct_retained = sum(
                        bool(observation[outcome_name])
                        for observation in retained
                    )

                    threshold_rows.append({
                        "promptVersion": prompt_version,
                        "provider": provider,
                        "outcome": outcome_name,
                        "threshold": threshold,
                        "eligibleObservations": len(observations),
                        "retainedObservations": len(retained),
                        "retainedFraction": conditional_divide(
                            len(retained),
                            len(observations),
                        ),
                        "correctRetained": correct_retained,
                        "precisionAmongRetained": conditional_divide(
                            correct_retained,
                            len(retained),
                        ),
                    })

    return summary_rows, threshold_rows


def build_alias_gold_sets():
    """Return gold rebuilt from raw annotations for both alias conditions."""
    dialogs, annotations = load_raw_data()
    unique_ids, _duplicate_pairs = split_corpus(dialogs)
    gold_sets = {}

    for condition, use_aliases in ALIAS_CONDITIONS.items():
        gold_sets[condition] = build_gold(
            dialogs,
            annotations,
            unique_ids,
            use_aliases=use_aliases,
        )

    return gold_sets


def alias_ablation_rows(gold_sets, prediction_sets):
    """Return symmetric no-alias and frozen-alias scoring results."""
    raw_results = []

    for prompt_version in PROMPT_VERSIONS:
        for provider in PROVIDERS:
            for condition, use_aliases in ALIAS_CONDITIONS.items():
                gold_uses_aliases = use_aliases
                prediction_uses_aliases = use_aliases

                # Comparing different normalisation conditions across the two
                # sides would not be a valid measurement of alias contribution.
                assert gold_uses_aliases == prediction_uses_aliases

                gold = gold_sets[condition]
                records = prediction_sets[prompt_version][provider]
                rows = score_prediction_set(
                    gold,
                    records,
                    use_aliases=prediction_uses_aliases,
                )
                summary = aggregate(rows)
                raw_results.append({
                    "promptVersion": prompt_version,
                    "provider": provider,
                    "condition": condition,
                    "conceptPrecision": summary["conceptPrecision"],
                    "conceptRecall": summary["conceptRecall"],
                    "conceptF1": summary["conceptF1"],
                    "assertionAwareF1": summary["assertionAwareF1"],
                })

    baselines = {}
    for row in raw_results:
        if row["condition"] == "no-alias":
            key = (row["promptVersion"], row["provider"])
            baselines[key] = row

    output_rows = []
    for row in raw_results:
        key = (row["promptVersion"], row["provider"])
        baseline = baselines[key]
        output_row = dict(row)
        output_row["conceptF1DifferenceFromNoAlias"] = (
            row["conceptF1"] - baseline["conceptF1"]
        )
        output_row["assertionAwareF1DifferenceFromNoAlias"] = (
            row["assertionAwareF1"] - baseline["assertionAwareF1"]
        )
        output_rows.append(output_row)

    return output_rows


def assertion_recall_rows(gold, prediction_sets):
    """Return concept and end-to-end recall for each assertion class."""
    output_rows = []

    for prompt_version in PROMPT_VERSIONS:
        for provider in PROVIDERS:
            records = prediction_sets[prompt_version][provider]
            counts = {
                assertion: {
                    "gold": 0,
                    "located": 0,
                    "correct": 0,
                }
                for assertion in ASSERTIONS
            }

            for dialogue_id in sorted(gold, key=int):
                record = records[dialogue_id]
                raw_items = (
                    record.get("items", [])
                    if record.get("success")
                    else []
                )
                predictions = prepare_predictions(
                    raw_items,
                    use_aliases=True,
                )

                for finding in gold[dialogue_id]["findings"]:
                    if finding["assertionConflict"]:
                        continue

                    assertion = finding["assertion"]
                    if assertion not in counts:
                        continue

                    counts[assertion]["gold"] += 1
                    prediction = predictions.get(finding["concept"])
                    if not prediction:
                        continue

                    counts[assertion]["located"] += 1
                    assertion_matches = (
                        not prediction["predictionConflict"]
                        and prediction["assertion"] == assertion
                    )
                    if assertion_matches:
                        counts[assertion]["correct"] += 1

            for assertion in ASSERTIONS:
                class_counts = counts[assertion]
                gold_count = class_counts["gold"]
                located_count = class_counts["located"]
                correct_count = class_counts["correct"]
                output_rows.append({
                    "promptVersion": prompt_version,
                    "provider": provider,
                    "assertion": assertion,
                    "goldCount": gold_count,
                    "locatedCount": located_count,
                    "correctAssertionCount": correct_count,
                    "conceptRecall": conditional_divide(
                        located_count,
                        gold_count,
                    ),
                    "conditionalAssertionAccuracy": conditional_divide(
                        correct_count,
                        located_count,
                    ),
                    "endToEndAssertionRecall": conditional_divide(
                        correct_count,
                        gold_count,
                    ),
                })

    return output_rows


def csv_value(value):
    """Return an empty field for undefined CSV measurements."""
    return "" if value is None else value


def write_csv(path, fieldnames, rows):
    """Write deterministic UTF-8 CSV output with a fixed column order."""
    with path.open("w", encoding="utf-8", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                field: csv_value(row.get(field))
                for field in fieldnames
            })


def display_number(value, digits=4):
    """Return a rounded Markdown value or N/A for an undefined value."""
    if value is None:
        return "N/A"
    return f"{value:.{digits}f}"


def markdown_table(headers, rows):
    """Return a simple Markdown table from display-ready rows."""
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]

    for row in rows:
        lines.append("| " + " | ".join(str(value) for value in row) + " |")

    return "\n".join(lines)


def build_report(
    verification,
    prompt_rows,
    evidence_rows,
    confidence_rows,
    threshold_rows,
    alias_rows,
    assertion_rows,
):
    """Return the complete supplementary Markdown report."""
    generated_at = datetime.now(timezone.utc).isoformat()
    lines = [
        "# Supplementary Evaluation Analysis",
        "",
        f"Generated at: `{generated_at}`",
        f"Dialogue-level bootstrap seed: `{RANDOM_SEED}`",
        f"Bootstrap repetitions: `{BOOTSTRAP_REPETITIONS}`",
        "Main evaluation dialogues: `213`",
        "",
        "> These analyses are exploratory and supplementary to the frozen "
        "primary results. They use saved predictions only, make no provider "
        "calls, and do not replace the primary evaluation.",
        "",
        "## Verification gate",
        "",
        "The frozen prompt-v1 concept F1 and assertion-aware F1 values were "
        "reproduced at full numerical precision before any output was written.",
        "",
    ]

    verification_table = []
    for provider in PROVIDERS:
        verification_table.append([
            provider,
            display_number(verification[provider]["conceptF1"]),
            display_number(verification[provider]["assertionAwareF1"]),
            "Passed",
        ])
    lines.append(markdown_table(
        ["Provider", "Concept F1", "Assertion-aware F1", "Gate"],
        verification_table,
    ))

    lines.extend([
        "",
        "## 1. Paired prompt comparison",
        "",
    ])
    prompt_table = []
    for row in prompt_rows:
        prompt_table.append([
            row["provider"],
            row["metric"],
            display_number(row["v1Value"]),
            display_number(row["v2Value"]),
            display_number(row["differenceV2MinusV1"]),
            "["
            + display_number(row["ciLow"])
            + ", "
            + display_number(row["ciHigh"])
            + "]",
            "Yes" if row["intervalExcludesZero"] else "No",
        ])
    lines.append(markdown_table(
        ["Provider", "Metric", "V1", "V2", "V2 - V1", "95% CI", "Excludes 0"],
        prompt_table,
    ))
    lines.extend([
        "",
        "Positive differences favour prompt v2. Because prompt v2 was written "
        "after inspecting v1 results, these intervals describe a post-hoc "
        "exploratory comparison and do not establish an unbiased prompt effect.",
        "",
        "## 2. Evidence formatting sensitivity",
        "",
    ])

    evidence_table = []
    for row in evidence_rows:
        evidence_table.append([
            row["promptVersion"],
            row["provider"],
            row["evidenceItems"],
            row["matchedItems"],
            display_number(row["exactEvidenceRate"]),
            display_number(row["normalisedEvidenceRate"]),
            display_number(row["adjacentTurnEvidenceRate"]),
        ])
    lines.append(markdown_table(
        [
            "Prompt",
            "Provider",
            "Evidence items",
            "Matched",
            "Exact",
            "Normalised",
            "Adjacent-turn",
        ],
        evidence_table,
    ))
    lines.extend([
        "",
        "This sensitivity metric removes speaker labels and permits evidence "
        "to match within one transcript turn or one pair of adjacent turns. It "
        "handles question-plus-short-answer evidence without joining distant "
        "parts of a dialogue. The results show that much of the lower exact "
        "evidence rate was a formatting effect. This tolerant metric does not "
        "prove that every matched span is clinically sufficient.",
        "",
        "## 3. Self-reported confidence",
        "",
    ])

    confidence_table = []
    for row in confidence_rows:
        confidence_table.append([
            row["promptVersion"],
            row["provider"],
            row["outcome"],
            row["observations"],
            row["distinctConfidenceValues"],
            display_number(row["meanConfidenceCorrect"]),
            display_number(row["meanConfidenceIncorrect"]),
            display_number(row["rankAuc"]),
        ])
    lines.append(markdown_table(
        [
            "Prompt",
            "Provider",
            "Outcome",
            "N",
            "Distinct",
            "Mean correct",
            "Mean incorrect",
            "Rank AUC",
        ],
        confidence_table,
    ))

    threshold_table = []
    for row in threshold_rows:
        if row["threshold"] != 0.9:
            continue
        threshold_table.append([
            row["promptVersion"],
            row["provider"],
            row["outcome"],
            display_number(row["retainedFraction"]),
            display_number(row["precisionAmongRetained"]),
        ])
    lines.extend([
        "",
        "The compact table below shows the 0.90 threshold. All five thresholds "
        "are available in `confidence-thresholds.csv`.",
        "",
        markdown_table(
            ["Prompt", "Provider", "Outcome", "Coverage", "Retained precision"],
            threshold_table,
        ),
        "",
        "Rank AUC measures ordering, not probability calibration. These "
        "self-reported confidence values must not be interpreted as clinical "
        "risk probabilities or used to auto-accept findings from this test-set "
        "analysis.",
        "",
        "## 4. Frozen alias-table ablation",
        "",
    ])

    alias_table = []
    for row in alias_rows:
        alias_table.append([
            row["promptVersion"],
            row["provider"],
            row["condition"],
            display_number(row["conceptPrecision"]),
            display_number(row["conceptRecall"]),
            display_number(row["conceptF1"]),
            display_number(row["conceptF1DifferenceFromNoAlias"]),
            display_number(row["assertionAwareF1"]),
        ])
    lines.append(markdown_table(
        [
            "Prompt",
            "Provider",
            "Condition",
            "Precision",
            "Recall",
            "Concept F1",
            "F1 delta",
            "Assertion F1",
        ],
        alias_table,
    ))
    lines.extend([
        "",
        "The provider outputs are identical in both conditions. The difference "
        "measures how the frozen equivalence table changes scoring; it is not a "
        "change in model capability. No location, fuzzy or UMLS rule was added.",
        "",
        "## 5. Recall by assertion class",
        "",
    ])

    assertion_table = []
    for row in assertion_rows:
        assertion_table.append([
            row["promptVersion"],
            row["provider"],
            row["assertion"],
            row["goldCount"],
            row["locatedCount"],
            row["correctAssertionCount"],
            display_number(row["conceptRecall"]),
            display_number(row["conditionalAssertionAccuracy"]),
            display_number(row["endToEndAssertionRecall"]),
        ])
    lines.append(markdown_table(
        [
            "Prompt",
            "Provider",
            "Class",
            "Gold",
            "Located",
            "Correct assertion",
            "Concept recall",
            "Conditional accuracy",
            "End-to-end recall",
        ],
        assertion_table,
    ))
    lines.extend([
        "",
        "The 96 gold assertion conflicts are excluded because they have no "
        "single reliable class label. Class recall is safety-relevant coverage "
        "within this simulated corpus; it does not establish clinical safety or "
        "generalisation to real patients.",
        "",
    ])

    return "\n".join(lines)


def write_outputs(
    report,
    prompt_rows,
    evidence_rows,
    confidence_rows,
    threshold_rows,
    alias_rows,
    assertion_rows,
):
    """Write the completed report and all supporting CSV files."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    write_csv(
        OUTPUT_PATHS["prompt"],
        [
            "provider",
            "metric",
            "dialogues",
            "v1Value",
            "v2Value",
            "differenceV2MinusV1",
            "ciLow",
            "ciHigh",
            "intervalExcludesZero",
        ],
        prompt_rows,
    )
    write_csv(
        OUTPUT_PATHS["evidence"],
        [
            "promptVersion",
            "provider",
            "evidenceItems",
            "matchedItems",
            "exactEvidenceRate",
            "normalisedEvidenceRate",
            "adjacentTurnEvidenceRate",
        ],
        evidence_rows,
    )
    write_csv(
        OUTPUT_PATHS["confidence_summary"],
        [
            "promptVersion",
            "provider",
            "outcome",
            "observations",
            "correct",
            "incorrect",
            "distinctConfidenceValues",
            "fiveMostFrequent",
            "meanConfidenceCorrect",
            "meanConfidenceIncorrect",
            "rankAuc",
        ],
        confidence_rows,
    )
    write_csv(
        OUTPUT_PATHS["confidence_thresholds"],
        [
            "promptVersion",
            "provider",
            "outcome",
            "threshold",
            "eligibleObservations",
            "retainedObservations",
            "retainedFraction",
            "correctRetained",
            "precisionAmongRetained",
        ],
        threshold_rows,
    )
    write_csv(
        OUTPUT_PATHS["alias"],
        [
            "promptVersion",
            "provider",
            "condition",
            "conceptPrecision",
            "conceptRecall",
            "conceptF1",
            "assertionAwareF1",
            "conceptF1DifferenceFromNoAlias",
            "assertionAwareF1DifferenceFromNoAlias",
        ],
        alias_rows,
    )
    write_csv(
        OUTPUT_PATHS["assertion"],
        [
            "promptVersion",
            "provider",
            "assertion",
            "goldCount",
            "locatedCount",
            "correctAssertionCount",
            "conceptRecall",
            "conditionalAssertionAccuracy",
            "endToEndAssertionRecall",
        ],
        assertion_rows,
    )
    OUTPUT_PATHS["report"].write_text(report, encoding="utf-8")


def main(argv=()):
    """Run all supplementary analyses and write their result files."""
    parser = argparse.ArgumentParser(
        description="Analyse saved v1 and v2 provider predictions.",
    )
    parser.parse_args(list(argv))

    protected_snapshots = snapshot_protected_files()
    frozen_gold = read_json(RESULTS_DIR / "gold.json")
    prediction_sets = load_all_predictions(frozen_gold)
    scored_rows = score_all_frozen(frozen_gold, prediction_sets)

    # This gate runs before output construction or writing so a changed scoring
    # pipeline cannot silently produce dissertation tables.
    verification = verify_frozen_results(scored_rows)

    prompt_rows = prompt_bootstrap_rows(scored_rows)
    evidence_rows = evidence_turn_joining_rows(
        frozen_gold,
        prediction_sets,
        scored_rows,
    )
    confidence_rows, threshold_rows = confidence_analysis(
        frozen_gold,
        prediction_sets,
    )
    gold_sets = build_alias_gold_sets()
    alias_rows = alias_ablation_rows(gold_sets, prediction_sets)
    assertion_rows = assertion_recall_rows(frozen_gold, prediction_sets)

    report = build_report(
        verification,
        prompt_rows,
        evidence_rows,
        confidence_rows,
        threshold_rows,
        alias_rows,
        assertion_rows,
    )

    verify_protected_files(protected_snapshots)
    write_outputs(
        report,
        prompt_rows,
        evidence_rows,
        confidence_rows,
        threshold_rows,
        alias_rows,
        assertion_rows,
    )
    verify_protected_files(protected_snapshots)

    print("Supplementary analysis completed.")
    for name, path in OUTPUT_PATHS.items():
        print(f"{name}: {path}")


if __name__ == "__main__":
    main(sys.argv[1:])
