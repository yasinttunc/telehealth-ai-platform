"""Match predictions to gold and calculate the main dissertation metrics."""
import argparse
import json
import random
import statistics
import sys
from collections import Counter, defaultdict

from config import (
    ASSERTIONS,
    BOOTSTRAP_REPETITIONS,
    PREDICTIONS_DIR,
    PROVIDERS,
    RANDOM_SEED,
    RESULTS_DIR,
    prompt_suffix,
)
from corpus import normalise_concept, plain_text


def read_json(path):
    """Read one UTF-8 JSON file."""
    return json.loads(path.read_text(encoding="utf-8"))


def divide(numerator, denominator):
    """Return zero when a normal metric has no denominator."""
    return numerator / denominator if denominator else 0.0


def conditional_divide(numerator, denominator):
    """Return None when a conditional metric is undefined."""
    return numerator / denominator if denominator else None


def precision_recall_f1(tp, fp, fn):
    """Calculate precision, recall and F1."""
    precision = divide(tp, tp + fp)
    recall = divide(tp, tp + fn)
    f1 = divide(2 * precision * recall, precision + recall)

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


def prepare_predictions(items, use_aliases=True):
    """Group repeated provider items by normalised concept."""
    groups = defaultdict(list)

    for item in items:
        concept = normalise_concept(
            item.get("name"),
            use_aliases=use_aliases,
        )
        if concept:
            groups[concept].append(item)

    prepared = {}

    for concept, records in groups.items():
        assertions = {
            record["assertion"]
            for record in records
        }

        prepared[concept] = {
            "concept": concept,
            "assertion": (
                next(iter(assertions))
                if len(assertions) == 1
                else None
            ),
            "predictionConflict": len(assertions) > 1,
            "allAssertions": sorted(assertions),
            "records": records,
        }

    return prepared


def simplified_text(value):
    """Normalise text for the relaxed evidence measurement."""
    return plain_text(value)


def score_dialogue(gold_dialogue, prediction_row, use_aliases=True):
    """Produce independent metric counts for one dialogue."""
    raw_items = (
        prediction_row.get("items", [])
        if prediction_row and prediction_row.get("success")
        else []
    )

    predictions = prepare_predictions(
        raw_items,
        use_aliases=use_aliases,
    )
    gold = {
        finding["concept"]: finding
        for finding in gold_dialogue["findings"]
    }

    gold_concepts = set(gold)
    predicted_concepts = set(predictions)
    matched_concepts = gold_concepts & predicted_concepts

    row = {
        "dialogueId": gold_dialogue["dialogueId"],
        "conceptTp": len(matched_concepts),
        "conceptFp": len(predicted_concepts - gold_concepts),
        "conceptFn": len(gold_concepts - predicted_concepts),
        "assertionTp": 0,
        "assertionFp": len(predicted_concepts - gold_concepts),
        "assertionFn": 0,
        "goldPresent": 0,
        "goldNegated": 0,
        "matchedPresent": 0,
        "matchedNegated": 0,
        "falsePresence": 0,
        "falseNegation": 0,
        "conditionalCorrect": 0,
        "conditionalTotal": 0,
        "evidenceTotal": len(raw_items),
        "evidenceExact": 0,
        "evidenceNormalised": 0,
        "evidenceMissing": 0,
        "predictionConflicts": 0,
        "confusion": Counter(),
    }

    raw_transcript = gold_dialogue["transcript"]
    normalised_transcript = simplified_text(raw_transcript)

    # Evidence is measured over every raw provider item, including duplicates.
    for item in raw_items:
        evidence = item.get("evidence", "")

        if not evidence:
            row["evidenceMissing"] += 1
            continue

        if evidence in raw_transcript:
            row["evidenceExact"] += 1

        normalised_evidence = simplified_text(evidence)
        if (
            normalised_evidence
            and normalised_evidence in normalised_transcript
        ):
            row["evidenceNormalised"] += 1

    # Count complete gold denominators before considering model matches.
    for finding in gold.values():
        if finding["assertionConflict"]:
            continue
        if finding["assertion"] == "PRESENT":
            row["goldPresent"] += 1
        elif finding["assertion"] == "NEGATED":
            row["goldNegated"] += 1

    for concept in matched_concepts:
        gold_finding = gold[concept]
        prediction = predictions[concept]

        # Gold conflicts remain valid concept matches but leave assertion scoring.
        if gold_finding["assertionConflict"]:
            continue

        gold_assertion = gold_finding["assertion"]
        predicted_assertion = prediction["assertion"]
        predicted_set = set(prediction["allAssertions"])

        if gold_assertion == "PRESENT":
            row["matchedPresent"] += 1
        elif gold_assertion == "NEGATED":
            row["matchedNegated"] += 1

        row["conditionalTotal"] += 1

        if prediction["predictionConflict"]:
            row["predictionConflicts"] += 1
            row["assertionFp"] += 1
            row["assertionFn"] += 1
            row["confusion"][(gold_assertion, "CONFLICT")] += 1
        elif gold_assertion == predicted_assertion:
            row["conditionalCorrect"] += 1
            row["assertionTp"] += 1
            row["confusion"][(gold_assertion, predicted_assertion)] += 1
        else:
            row["assertionFp"] += 1
            row["assertionFn"] += 1
            row["confusion"][(gold_assertion, predicted_assertion)] += 1

        # A conflicting prediction is unsafe if it includes the opposite label.
        if gold_assertion == "NEGATED" and "PRESENT" in predicted_set:
            row["falsePresence"] += 1
        if gold_assertion == "PRESENT" and "NEGATED" in predicted_set:
            row["falseNegation"] += 1

    # Missed non-conflicted findings are assertion-aware false negatives.
    for concept in gold_concepts - predicted_concepts:
        if not gold[concept]["assertionConflict"]:
            row["assertionFn"] += 1

    row["confusion"] = {
        f"{gold_label}->{predicted_label}": count
        for (gold_label, predicted_label), count
        in row["confusion"].items()
    }

    return row


def aggregate(rows):
    """Combine dialogue counts into RQ1 and RQ2 results."""
    totals = Counter()
    confusion = Counter()

    for row in rows:
        for key, value in row.items():
            if isinstance(value, (int, float)):
                totals[key] += value
        confusion.update(row["confusion"])

    concept = precision_recall_f1(
        totals["conceptTp"],
        totals["conceptFp"],
        totals["conceptFn"],
    )
    assertion = precision_recall_f1(
        totals["assertionTp"],
        totals["assertionFp"],
        totals["assertionFn"],
    )

    return {
        "dialogues": len(rows),
        "conceptPrecision": concept["precision"],
        "conceptRecall": concept["recall"],
        "conceptF1": concept["f1"],
        "assertionAwarePrecision": assertion["precision"],
        "assertionAwareRecall": assertion["recall"],
        "assertionAwareF1": assertion["f1"],
        "conditionalAssertionAccuracy": divide(
            totals["conditionalCorrect"],
            totals["conditionalTotal"],
        ),
        "falsePresenceIncidence": divide(
            totals["falsePresence"],
            totals["goldNegated"],
        ),
        "conditionalFalsePresenceRate": conditional_divide(
            totals["falsePresence"],
            totals["matchedNegated"],
        ),
        "falseNegationIncidence": divide(
            totals["falseNegation"],
            totals["goldPresent"],
        ),
        "conditionalFalseNegationRate": conditional_divide(
            totals["falseNegation"],
            totals["matchedPresent"],
        ),
        "presentConceptRecall": divide(
            totals["matchedPresent"],
            totals["goldPresent"],
        ),
        "negatedConceptRecall": divide(
            totals["matchedNegated"],
            totals["goldNegated"],
        ),
        "exactEvidenceRate": divide(
            totals["evidenceExact"],
            totals["evidenceTotal"],
        ),
        "normalisedEvidenceRate": divide(
            totals["evidenceNormalised"],
            totals["evidenceTotal"],
        ),
        "missingEvidenceRate": divide(
            totals["evidenceMissing"],
            totals["evidenceTotal"],
        ),
        "predictionConflicts": totals["predictionConflicts"],
        "confusion": dict(confusion),
    }


def percentile(values, probability):
    """Return a percentile from an ordered bootstrap result."""
    ordered = sorted(values)
    index = min(int(len(ordered) * probability), len(ordered) - 1)
    return ordered[index]


def bootstrap_interval(rows, metric_name):
    """Calculate a 95% interval by resampling whole dialogues."""
    generator = random.Random(RANDOM_SEED)
    values = []

    for _ in range(BOOTSTRAP_REPETITIONS):
        sample = generator.choices(rows, k=len(rows))
        values.append(aggregate(sample)[metric_name])

    return {
        "low": percentile(values, 0.025),
        "high": percentile(values, 0.975),
    }


def concept_jaccard(first_concepts, second_concepts):
    """Measure concept overlap between two runs of the same transcript.

    Jaccard = shared concepts / all concepts. Two empty outputs count as
    complete agreement because both runs made the same decision.
    """
    if not first_concepts and not second_concepts:
        return 1.0

    shared = first_concepts & second_concepts
    combined = first_concepts | second_concepts
    return divide(len(shared), len(combined))


def repeatability_summary(records):
    """Compare run one and run two for the fixed 30-dialogue sample."""
    first_run = {}
    second_run = {}

    for record in records:
        if not record.get("repeatabilityCase"):
            continue
        if record["run"] == 1:
            first_run[record["dialogueId"]] = record
        elif record["run"] == 2:
            second_run[record["dialogueId"]] = record

    compared_ids = sorted(set(first_run) & set(second_run), key=int)
    if not compared_ids:
        return None

    jaccard_scores = []
    assertion_matches = 0
    assertion_comparisons = 0
    critical_changes = []

    for dialogue_id in compared_ids:
        first_items = (
            first_run[dialogue_id].get("items", [])
            if first_run[dialogue_id].get("success")
            else []
        )
        second_items = (
            second_run[dialogue_id].get("items", [])
            if second_run[dialogue_id].get("success")
            else []
        )

        first_predictions = prepare_predictions(first_items)
        second_predictions = prepare_predictions(second_items)
        first_concepts = set(first_predictions)
        second_concepts = set(second_predictions)

        jaccard_scores.append(
            concept_jaccard(first_concepts, second_concepts)
        )

        for concept in sorted(first_concepts & second_concepts):
            first_assertion = first_predictions[concept]["assertion"]
            second_assertion = second_predictions[concept]["assertion"]
            assertion_comparisons += 1

            if first_assertion == second_assertion:
                assertion_matches += 1

            if {first_assertion, second_assertion} == {
                "PRESENT",
                "NEGATED",
            }:
                critical_changes.append({
                    "dialogueId": dialogue_id,
                    "concept": concept,
                    "runOne": first_assertion,
                    "runTwo": second_assertion,
                })

    return {
        "dialoguesCompared": len(compared_ids),
        "meanConceptJaccard": divide(
            sum(jaccard_scores),
            len(jaccard_scores),
        ),
        "assertionAgreement": divide(
            assertion_matches,
            assertion_comparisons,
        ),
        "assertionComparisons": assertion_comparisons,
        "criticalAssertionChanges": len(critical_changes),
        "criticalChangeExamples": critical_changes[:10],
    }


def paired_bootstrap(first_rows, second_rows, metric_name):
    """Estimate a provider difference using the same sampled dialogues.

    A 95% interval that does not include zero provides evidence that the
    providers differ for this metric on this evaluation corpus.
    """
    first_by_id = {row["dialogueId"]: row for row in first_rows}
    second_by_id = {row["dialogueId"]: row for row in second_rows}
    shared_ids = sorted(set(first_by_id) & set(second_by_id), key=int)

    if not shared_ids:
        raise ValueError("Paired bootstrap requires shared dialogue IDs")

    generator = random.Random(RANDOM_SEED)
    differences = []

    for _ in range(BOOTSTRAP_REPETITIONS):
        sampled_ids = generator.choices(shared_ids, k=len(shared_ids))
        first_sample = [first_by_id[item] for item in sampled_ids]
        second_sample = [second_by_id[item] for item in sampled_ids]

        first_value = aggregate(first_sample)[metric_name]
        second_value = aggregate(second_sample)[metric_name]
        differences.append(first_value - second_value)

    first_value = aggregate([first_by_id[item] for item in shared_ids])[
        metric_name
    ]
    second_value = aggregate([second_by_id[item] for item in shared_ids])[
        metric_name
    ]
    low = percentile(differences, 0.025)
    high = percentile(differences, 0.975)

    return {
        "metric": metric_name,
        "dialogues": len(shared_ids),
        "firstValue": first_value,
        "secondValue": second_value,
        "difference": first_value - second_value,
        "low": low,
        "high": high,
        "excludesZero": not (low <= 0 <= high),
    }


def operational_metrics(records):
    """Summarise provider latency, failures, tokens and cost."""
    main_records = [
        record for record in records
        if record["run"] == 1
    ]
    successful = [
        record for record in main_records
        if record["success"]
    ]
    latencies = sorted(
        record["latencyMs"]
        for record in successful
    )

    return {
        "calls": len(main_records),
        "failureRate": divide(
            sum(not record["success"] for record in main_records),
            len(main_records),
        ),
        "validationFailureRate": divide(
            sum(
                record.get("errorType") == "validation"
                for record in main_records
            ),
            len(main_records),
        ),
        "latencyMedianMs": (
            statistics.median(latencies)
            if latencies else None
        ),
        "latencyP95Ms": (
            percentile(latencies, 0.95)
            if latencies else None
        ),
        "inputTokens": sum(
            record.get("inputTokens", 0)
            for record in main_records
        ),
        "outputTokens": sum(
            record.get("outputTokens", 0)
            for record in main_records
        ),
        "costUsd": sum(
            record.get("costUsd", 0)
            for record in main_records
        ),
        "pricingConfigured": (
            all(record.get("pricingConfigured", False) for record in main_records)
            if main_records else False
        ),
    }


def evaluate_provider(provider, gold, suffix=""):
    """Evaluate one provider and return its summary and dialogue rows."""
    records = read_json(PREDICTIONS_DIR / f"{provider}{suffix}.json")

    run_one = {
        record["dialogueId"]: record
        for record in records
        if record["run"] == 1
    }

    if set(run_one) != set(gold):
        raise ValueError(
            f"{provider} must contain one run-one result "
            "for every gold dialogue"
        )

    rows = [
        score_dialogue(gold[dialogue_id], run_one[dialogue_id])
        for dialogue_id in sorted(gold, key=int)
    ]

    summary = aggregate(rows)
    summary["confidenceIntervals"] = {
        metric: bootstrap_interval(rows, metric)
        for metric in (
            "conceptF1",
            "assertionAwareF1",
            "falsePresenceIncidence",
            "falseNegationIncidence",
        )
    }
    summary["operational"] = operational_metrics(records)
    summary["repeatability"] = repeatability_summary(records)

    return summary, rows


def main(argv=()):
    """Evaluate every provider and write one JSON result."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--prompt-version",
        default="v1",
        choices=("v1", "v2"),
        help="v1 scores the frozen primary predictions. Another version "
             "scores its own prediction files and writes beside them.",
    )
    arguments = parser.parse_args(list(argv))
    suffix = prompt_suffix(arguments.prompt_version)

    gold = read_json(RESULTS_DIR / "gold.json")
    output = {"providers": {}, "pairedComparisons": []}
    provider_rows = {}

    for provider in PROVIDERS:
        summary, rows = evaluate_provider(provider, gold, suffix)
        output["providers"][provider] = summary
        provider_rows[provider] = rows
        print(
            f"{provider}: concept F1={summary['conceptF1']:.4f}, "
            f"assertion-aware F1={summary['assertionAwareF1']:.4f}"
        )

    compared_metrics = (
        "conceptF1",
        "assertionAwareF1",
        "falsePresenceIncidence",
        "falseNegationIncidence",
    )

    for position, first_provider in enumerate(PROVIDERS):
        for second_provider in PROVIDERS[position + 1:]:
            for metric_name in compared_metrics:
                comparison = paired_bootstrap(
                    provider_rows[first_provider],
                    provider_rows[second_provider],
                    metric_name,
                )
                comparison["firstProvider"] = first_provider
                comparison["secondProvider"] = second_provider
                output["pairedComparisons"].append(comparison)

    output["promptVersion"] = arguments.prompt_version

    evaluation_path = RESULTS_DIR / f"evaluation{suffix}.json"
    evaluation_path.write_text(
        json.dumps(output, indent=2, sort_keys=True),
        encoding="utf-8",
    )

    print(f"Saved {evaluation_path}")


if __name__ == "__main__":
    main(sys.argv[1:])
