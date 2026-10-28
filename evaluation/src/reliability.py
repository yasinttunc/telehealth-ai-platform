"""Measure agreement between the two MediTOD annotators.

MediTOD contains 18 conversations that were annotated twice. Comparing the
two versions gives a useful reference for interpreting the model scores.
"""
import json

from config import ASSERTIONS, RESULTS_DIR
from corpus import build_findings, load_raw_data


def read_json(path):
    """Read one UTF-8 JSON file."""
    return json.loads(path.read_text(encoding="utf-8"))


def divide(numerator, denominator):
    """Return zero when a metric has no denominator."""
    return numerator / denominator if denominator else 0.0


def findings_by_concept(annotation_turns):
    """Index one annotation's findings by normalised concept name."""
    return {
        finding["concept"]: finding
        for finding in build_findings(annotation_turns)
    }


def compare_pair(first_findings, second_findings):
    """Compare the concepts and assertions in one duplicate pair."""
    first_concepts = set(first_findings)
    second_concepts = set(second_findings)
    shared_concepts = first_concepts & second_concepts

    first_labels = []
    second_labels = []

    for concept in sorted(shared_concepts):
        first = first_findings[concept]
        second = second_findings[concept]

        # A conflicted finding has no single assertion label to compare.
        if first["assertionConflict"] or second["assertionConflict"]:
            continue

        first_labels.append(first["assertion"])
        second_labels.append(second["assertion"])

    return {
        "truePositives": len(shared_concepts),
        "falsePositives": len(second_concepts - first_concepts),
        "falseNegatives": len(first_concepts - second_concepts),
        "firstLabels": first_labels,
        "secondLabels": second_labels,
    }


def cohens_kappa(first_labels, second_labels):
    """Calculate agreement after correcting for chance agreement.

    Kappa = (observed agreement - expected agreement)
            / (1 - expected agreement)
    """
    total = len(first_labels)
    if total == 0:
        return 0.0

    matches = sum(
        first == second
        for first, second in zip(first_labels, second_labels)
    )
    observed = matches / total

    expected = 0.0
    for label in ASSERTIONS:
        first_share = first_labels.count(label) / total
        second_share = second_labels.count(label) / total
        expected += first_share * second_share

    if expected >= 1.0:
        return 1.0

    return (observed - expected) / (1 - expected)


def inter_annotator_reference(duplicate_pairs, annotations):
    """Combine all duplicate pairs into one agreement summary."""
    true_positives = 0
    false_positives = 0
    false_negatives = 0
    all_first_labels = []
    all_second_labels = []

    for first_id, second_id in duplicate_pairs:
        first = findings_by_concept(annotations.get(first_id, []))
        second = findings_by_concept(annotations.get(second_id, []))
        comparison = compare_pair(first, second)

        true_positives += comparison["truePositives"]
        false_positives += comparison["falsePositives"]
        false_negatives += comparison["falseNegatives"]
        all_first_labels += comparison["firstLabels"]
        all_second_labels += comparison["secondLabels"]

    precision = divide(true_positives, true_positives + false_positives)
    recall = divide(true_positives, true_positives + false_negatives)
    concept_f1 = divide(2 * precision * recall, precision + recall)
    assertion_matches = sum(
        first == second
        for first, second in zip(all_first_labels, all_second_labels)
    )

    return {
        "duplicatePairs": len(duplicate_pairs),
        "conceptPrecision": precision,
        "conceptRecall": recall,
        "conceptF1": concept_f1,
        "sharedFindings": true_positives,
        "assertionComparisons": len(all_first_labels),
        "assertionAgreement": divide(
            assertion_matches,
            len(all_first_labels),
        ),
        "cohensKappa": cohens_kappa(
            all_first_labels,
            all_second_labels,
        ),
        "note": (
            "This is an inter-annotator reference, not a performance "
            "ceiling. Models are scored against the consolidated gold data."
        ),
    }


def main():
    """Calculate the reference and save it for the final report."""
    duplicate_pairs = read_json(RESULTS_DIR / "duplicate_pairs.json")
    _, annotations = load_raw_data()
    reference = inter_annotator_reference(duplicate_pairs, annotations)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "inter_annotator.json").write_text(
        json.dumps(reference, indent=2),
        encoding="utf-8",
    )

    print(f"Duplicate pairs: {reference['duplicatePairs']}")
    print(f"Concept F1: {reference['conceptF1']:.4f}")
    print(f"Assertion agreement: {reference['assertionAgreement']:.4f}")
    print(f"Cohen's kappa: {reference['cohensKappa']:.4f}")
    print(f"Assertion comparisons: {reference['assertionComparisons']}")
    print("Saved results/inter_annotator.json")


if __name__ == "__main__":
    main()
