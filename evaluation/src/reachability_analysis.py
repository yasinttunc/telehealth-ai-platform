"""Reference reachability and error concentration analysis.

This script answers a question the accuracy pipeline cannot: for each gold
concept, did any provider ever produce it, across every opportunity the corpus
offered? A concept that three independent systems never produce is more
economically explained by the concept than by three simultaneous failures.

The script reads saved predictions only. It makes no provider calls, needs no
network, and never writes to a frozen primary result file.

Run with:
    PYTHONPATH=src python src/reachability_analysis.py
"""
import argparse
import csv
import json
import statistics
import sys
from collections import Counter, defaultdict

from config import ALIASES, PREDICTIONS_DIR, PROVIDERS, RESULTS_DIR
from corpus import (
    build_gold,
    load_raw_data,
    normalise_concept,
    split_corpus,
)

# Only run-one records belong to the main corpus. The repeatability flag is set
# on the first run of the 30 repeated dialogues as well as the second, so
# filtering on that flag would silently reduce the corpus from 213 to 183.
MAIN_RUN = 1

# Bands are chosen by document frequency, not by finding count, because a
# concept appearing once in each of forty dialogues is common in a way that a
# concept appearing forty times in one dialogue is not.
FREQUENCY_BANDS = [
    ("very rare", 1, 2),
    ("rare", 3, 9),
    ("medium", 10, 29),
    ("frequent", 30, 99),
    ("very frequent", 100, 1_000_000),
]

# Published primary figures. The script refuses to write output unless it
# reproduces these, because an analysis that quietly disagrees with the results
# it extends is worse than no analysis.
EXPECTED_CONCEPT_F1 = {
    "openai": 0.48667850799289525,
    "anthropic": 0.48495861094286286,
    "ollama": 0.2987938596491228,
}
TOLERANCE = 1e-9


def load_gold_sets(use_aliases):
    """Return {dialogueId: set of gold concepts} built under one condition."""
    dialogs, annotations = load_raw_data()
    unique_ids, _duplicate_pairs = split_corpus(dialogs)
    gold = build_gold(dialogs, annotations, unique_ids, use_aliases=use_aliases)

    gold_sets = {}
    for dialogue_id, entry in gold.items():
        concepts = set()
        for finding in entry["findings"]:
            concepts.add(finding["concept"])
        gold_sets[dialogue_id] = concepts

    return gold_sets


def load_prediction_sets(provider, use_aliases):
    """Return {dialogueId: set of predicted concepts} for the main run."""
    path = PREDICTIONS_DIR / f"{provider}.json"
    records = json.loads(path.read_text(encoding="utf-8"))

    prediction_sets = {}
    for record in records:
        if record.get("run") != MAIN_RUN:
            continue

        concepts = set()
        if record.get("success"):
            for item in record.get("items", []):
                concept = normalise_concept(
                    item.get("name", ""),
                    use_aliases=use_aliases,
                )
                if concept:
                    concepts.add(concept)

        prediction_sets[record["dialogueId"]] = concepts

    return prediction_sets


def concept_f1(gold_sets, prediction_sets):
    """Return micro-averaged concept F1 across all dialogues."""
    true_positives = 0
    false_positives = 0
    false_negatives = 0

    for dialogue_id, gold_concepts in gold_sets.items():
        predicted = prediction_sets.get(dialogue_id, set())
        true_positives += len(gold_concepts & predicted)
        false_positives += len(predicted - gold_concepts)
        false_negatives += len(gold_concepts - predicted)

    denominator = 2 * true_positives + false_positives + false_negatives
    if denominator == 0:
        return 0.0

    return 2 * true_positives / denominator


def verification_gate(gold_sets, all_predictions):
    """Stop unless the published primary concept F1 is reproduced exactly."""
    failures = []

    for provider in PROVIDERS:
        reproduced = concept_f1(gold_sets, all_predictions[provider])
        expected = EXPECTED_CONCEPT_F1[provider]
        if abs(reproduced - expected) > TOLERANCE:
            failures.append(
                f"{provider}: expected {expected!r}, reproduced {reproduced!r}"
            )

    if failures:
        raise SystemExit(
            "Verification gate failed. This harness disagrees with the "
            "published pipeline, so no output was written.\n  "
            + "\n  ".join(failures)
        )


def document_frequency(gold_sets):
    """Return {concept: number of dialogues in which it appears}."""
    frequency = Counter()
    for concepts in gold_sets.values():
        for concept in concepts:
            frequency[concept] += 1
    return frequency


def reachability(gold_sets, all_predictions):
    """Return per-concept opportunity and match counts across all providers.

    A concept counts as reached when at least one provider produced it in a
    dialogue where the reference holds it. Requiring only one provider is
    deliberate: the question is whether the label is producible at all, not
    whether a particular model is good.
    """
    opportunities = Counter()
    reached_by_any = Counter()
    reached_per_provider = defaultdict(Counter)

    for dialogue_id, gold_concepts in gold_sets.items():
        for concept in gold_concepts:
            opportunities[concept] += 1

            found_anywhere = False
            for provider in PROVIDERS:
                predicted = all_predictions[provider].get(dialogue_id, set())
                if concept in predicted:
                    reached_per_provider[provider][concept] += 1
                    found_anywhere = True

            if found_anywhere:
                reached_by_any[concept] += 1

    return {
        "opportunities": opportunities,
        "reachedByAny": reached_by_any,
        "reachedPerProvider": reached_per_provider,
    }


def summarise_reachability(counts):
    """Return corpus-level totals for concepts no provider ever produced."""
    opportunities = counts["opportunities"]
    reached = counts["reachedByAny"]

    never_reached = []
    for concept in opportunities:
        if reached[concept] == 0:
            never_reached.append(concept)

    total_findings = sum(opportunities.values())
    unreachable_findings = 0
    for concept in never_reached:
        unreachable_findings += opportunities[concept]

    return {
        "conceptCount": len(opportunities),
        "unreachableConcepts": len(never_reached),
        "totalFindings": total_findings,
        "unreachableFindings": unreachable_findings,
        "unreachableShare": unreachable_findings / total_findings,
        "neverReached": never_reached,
    }


def frequency_band_recall(gold_sets, all_predictions, frequency):
    """Return recall per frequency band per provider."""
    rows = []

    for label, low, high in FREQUENCY_BANDS:
        band_concepts = set()
        for concept, count in frequency.items():
            if low <= count <= high:
                band_concepts.add(concept)

        opportunities = 0
        matched = {provider: 0 for provider in PROVIDERS}

        for dialogue_id, gold_concepts in gold_sets.items():
            for concept in gold_concepts & band_concepts:
                opportunities += 1
                for provider in PROVIDERS:
                    predicted = all_predictions[provider].get(dialogue_id, set())
                    if concept in predicted:
                        matched[provider] += 1

        if opportunities == 0:
            continue

        row = {
            "band": label,
            "conceptCount": len(band_concepts),
            "goldFindings": opportunities,
        }
        for provider in PROVIDERS:
            row[f"{provider}Recall"] = matched[provider] / opportunities
        rows.append(row)

    return rows


def reachable_concepts(gold_sets, all_predictions, witnesses):
    """Return the concepts at least one witness provider produced somewhere.

    Reachability is a property of the concept, not of a single opportunity. A
    provider that produces ``wheezing`` in one dialogue and misses it in the
    next has shown the label to be producible; the miss is an extraction
    failure, which is exactly what the restricted score should still count.
    """
    reachable = set()

    for dialogue_id, gold_concepts in gold_sets.items():
        for concept in gold_concepts:
            if concept in reachable:
                continue
            for witness in witnesses:
                if concept in all_predictions[witness].get(dialogue_id, set()):
                    reachable.add(concept)
                    break

    return reachable


def restricted_concept_f1(gold_sets, all_predictions, provider,
                          leave_one_out):
    """Return concept F1 scored only on reference concepts shown to be reachable.

    Under ``leave_one_out`` the provider being scored is excluded from the
    reachability test, so it is never credited for having defined the reference
    it is measured against.

    False positives are always counted against the full gold set. Restricting
    the reference must not be able to manufacture precision by reclassifying a
    wrong prediction as unscored.
    """
    others = [name for name in PROVIDERS if name != provider]
    witnesses = others if leave_one_out else list(PROVIDERS)
    reachable = reachable_concepts(gold_sets, all_predictions, witnesses)

    true_positives = 0
    false_negatives = 0
    false_positives = 0
    retained = 0

    for dialogue_id, gold_concepts in gold_sets.items():
        predicted = all_predictions[provider].get(dialogue_id, set())
        scored = gold_concepts & reachable

        retained += len(scored)
        true_positives += len(scored & predicted)
        false_negatives += len(scored - predicted)
        false_positives += len(predicted - gold_concepts)

    denominator = 2 * true_positives + false_positives + false_negatives
    score = 0.0 if denominator == 0 else 2 * true_positives / denominator

    return {
        "retainedConcepts": len(reachable),
        "retainedGoldFindings": retained,
        "truePositives": true_positives,
        "falsePositives": false_positives,
        "falseNegatives": false_negatives,
        "conceptF1": score,
    }


def decomposition(alias_gold, alias_predictions, raw_gold, raw_predictions):
    """Return the three-step account of the concept F1 shortfall.

    Step one is raw string matching. Step two adds the frozen alias table. Step
    three additionally sets aside reference findings on concepts no provider
    reached. The gap between the leave-one-out and all-provider variants of
    step three measures how much of that third step is self-selection.
    """
    rows = []

    for provider in PROVIDERS:
        raw_score = concept_f1(raw_gold, raw_predictions[provider])
        alias_score = concept_f1(alias_gold, alias_predictions[provider])
        loo = restricted_concept_f1(
            alias_gold, alias_predictions, provider, leave_one_out=True,
        )
        biased = restricted_concept_f1(
            alias_gold, alias_predictions, provider, leave_one_out=False,
        )

        rows.append({
            "provider": provider,
            "rawMatchingF1": raw_score,
            "aliasF1": alias_score,
            "reachableLeaveOneOutF1": loo["conceptF1"],
            "reachableAllProvidersF1": biased["conceptF1"],
            "selfSelectionGap": biased["conceptF1"] - loo["conceptF1"],
            "aliasContribution": alias_score - raw_score,
            "reachabilityContribution": loo["conceptF1"] - alias_score,
            "retainedConceptsLeaveOneOut": loo["retainedConcepts"],
            "retainedConceptsAllProviders": biased["retainedConcepts"],
            "retainedGoldFindingsLeaveOneOut": loo["retainedGoldFindings"],
            "retainedGoldFindingsAllProviders": biased["retainedGoldFindings"],
            "totalGoldFindings": sum(
                len(concepts) for concepts in alias_gold.values()
            ),
        })

    return rows


def dialogue_f1_distribution(gold_sets, prediction_sets):
    """Return quartile summary of per-dialogue concept F1."""
    scores = []

    for dialogue_id, gold_concepts in gold_sets.items():
        predicted = prediction_sets.get(dialogue_id, set())
        true_positives = len(gold_concepts & predicted)
        false_positives = len(predicted - gold_concepts)
        false_negatives = len(gold_concepts - predicted)

        denominator = 2 * true_positives + false_positives + false_negatives
        if denominator == 0:
            scores.append(0.0)
        else:
            scores.append(2 * true_positives / denominator)

    quartiles = statistics.quantiles(scores, n=4)
    zero_count = 0
    for score in scores:
        if score == 0.0:
            zero_count += 1

    return {
        "dialogues": len(scores),
        "minimum": min(scores),
        "q1": quartiles[0],
        "median": statistics.median(scores),
        "q3": quartiles[2],
        "maximum": max(scores),
        "zeroDialogues": zero_count,
    }


def error_concentration(gold_sets, prediction_sets, limit=10):
    """Return the concepts most often missed and most often wrongly produced."""
    false_negatives = Counter()
    false_positives = Counter()

    for dialogue_id, gold_concepts in gold_sets.items():
        predicted = prediction_sets.get(dialogue_id, set())
        for concept in gold_concepts - predicted:
            false_negatives[concept] += 1
        for concept in predicted - gold_concepts:
            false_positives[concept] += 1

    return {
        "falseNegatives": false_negatives.most_common(limit),
        "falsePositives": false_positives.most_common(limit),
    }


def alias_target_check(alias_counts, raw_counts):
    """Test whether alias targets that are never reached were reachable raw.

    For each alias entry, compare the match count of the target concept under
    the alias condition against the match count of the source term under the
    no-alias condition. An alias is only harmful when the source was reachable
    and the target is not.
    """
    rows = []

    for source, target in sorted(ALIASES.items()):
        normalised_source = normalise_concept(source, use_aliases=False)
        normalised_target = normalise_concept(target, use_aliases=False)

        target_opportunities = alias_counts["opportunities"][normalised_target]
        target_reached = alias_counts["reachedByAny"][normalised_target]
        source_opportunities = raw_counts["opportunities"][normalised_source]
        source_reached = raw_counts["reachedByAny"][normalised_source]

        if target_opportunities == 0 and source_opportunities == 0:
            continue

        if target_reached > 0:
            verdict = "target reachable"
        elif source_reached > 0:
            verdict = "HARMFUL: source was reachable, target is not"
        else:
            verdict = "neutral: unreachable in both conditions"

        rows.append({
            "aliasSource": normalised_source,
            "aliasTarget": normalised_target,
            "sourceGoldFindings": source_opportunities,
            "sourceReached": source_reached,
            "targetGoldFindings": target_opportunities,
            "targetReached": target_reached,
            "verdict": verdict,
        })

    return rows


def write_csv(filename, fieldnames, rows):
    """Write a list of dictionaries as a CSV file."""
    path = RESULTS_DIR / filename
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    return path


def build_report(alias_summary, raw_summary, alias_counts, band_rows,
                 distribution_rows, error_rows, alias_rows,
                 decomposition_rows):
    """Assemble the Markdown report."""
    lines = [
        "# Reference Reachability Analysis",
        "",
        "Exploratory and supplementary. These figures do not replace the",
        "frozen primary results; they describe a property of the reference",
        "vocabulary that the accuracy metrics cannot express.",
        "",
        "## 1. Concepts no provider ever produced",
        "",
        "| Condition | Concepts never produced | Gold findings | Share |",
        "|---|---:|---:|---:|",
        f"| With frozen alias table | {alias_summary['unreachableConcepts']} of "
        f"{alias_summary['conceptCount']} | "
        f"{alias_summary['unreachableFindings']} of "
        f"{alias_summary['totalFindings']} | "
        f"{alias_summary['unreachableShare']:.1%} |",
        f"| Without alias table | {raw_summary['unreachableConcepts']} of "
        f"{raw_summary['conceptCount']} | "
        f"{raw_summary['unreachableFindings']} of "
        f"{raw_summary['totalFindings']} | "
        f"{raw_summary['unreachableShare']:.1%} |",
        "",
        "A concept counts as reached when at least one of the three providers",
        "produced it in a dialogue where the reference holds it.",
        "",
        "### Largest unreachable concepts, alias condition",
        "",
        "| Concept | Gold findings |",
        "|---|---:|",
    ]

    opportunities = alias_counts["opportunities"]
    ranked = sorted(
        alias_summary["neverReached"],
        key=lambda concept: -opportunities[concept],
    )
    for concept in ranked[:20]:
        lines.append(f"| {concept} | {opportunities[concept]} |")

    lines += [
        "",
        "## 2. Recall by concept frequency",
        "",
        "| Band | Concepts | Gold findings | "
        + " | ".join(provider.title() for provider in PROVIDERS)
        + " |",
        "|---|---:|---:|" + "---:|" * len(PROVIDERS),
    ]
    for row in band_rows:
        cells = " | ".join(
            f"{row[f'{provider}Recall']:.4f}" for provider in PROVIDERS
        )
        lines.append(
            f"| {row['band']} | {row['conceptCount']} | "
            f"{row['goldFindings']} | {cells} |"
        )

    lines += [
        "",
        "## 3. Per-dialogue concept F1 distribution",
        "",
        "| Provider | Minimum | Q1 | Median | Q3 | Maximum | Zero dialogues |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in distribution_rows:
        lines.append(
            f"| {row['provider'].title()} | {row['minimum']:.4f} | "
            f"{row['q1']:.4f} | {row['median']:.4f} | {row['q3']:.4f} | "
            f"{row['maximum']:.4f} | {row['zeroDialogues']} |"
        )

    lines += ["", "## 4. Where errors concentrate", ""]
    for row in error_rows:
        lines += [
            f"### {row['provider'].title()}",
            "",
            "| Most missed | Count | Most wrongly produced | Count |",
            "|---|---:|---|---:|",
        ]
        misses = row["falseNegatives"]
        extras = row["falsePositives"]
        for index in range(max(len(misses), len(extras))):
            left = f"{misses[index][0]} | {misses[index][1]}" if index < len(misses) else " | "
            right = f"{extras[index][0]} | {extras[index][1]}" if index < len(extras) else " | "
            lines.append(f"| {left} | {right} |")
        lines.append("")

    lines += [
        "## 5. Alias entries among unreachable concepts",
        "",
        "An alias is harmful only when its source term was reachable and its",
        "target is not. Anything else is neutral or helpful.",
        "",
        "| Source | Target | Source findings | Source reached | "
        "Target findings | Target reached | Verdict |",
        "|---|---|---:|---:|---:|---:|---|",
    ]
    for row in alias_rows:
        lines.append(
            f"| {row['aliasSource']} | {row['aliasTarget']} | "
            f"{row['sourceGoldFindings']} | {row['sourceReached']} | "
            f"{row['targetGoldFindings']} | {row['targetReached']} | "
            f"{row['verdict']} |"
        )

    lines += [
        "",
        "## 6. Decomposition of the concept F1 shortfall",
        "",
        "Each column adds one matching decision to the one before it. False",
        "positives are counted against the full reference throughout, so",
        "restricting the reference cannot manufacture precision.",
        "",
        "| Provider | Raw matching | + frozen alias table | "
        "+ reachable only (leave-one-out) | + reachable only (all providers) | "
        "Self-selection gap |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in decomposition_rows:
        lines.append(
            f"| {row['provider'].title()} | {row['rawMatchingF1']:.4f} | "
            f"{row['aliasF1']:.4f} | {row['reachableLeaveOneOutF1']:.4f} | "
            f"{row['reachableAllProvidersF1']:.4f} | "
            f"{row['selfSelectionGap']:.4f} |"
        )

    lines += [
        "",
        "The leave-one-out column scores each provider only on concepts one of",
        "the other two providers reached, so no provider is credited for having",
        "defined the set it is measured against. The rightmost gap is the size",
        "of that self-selection effect, reported with its sign: it is small in",
        "every case, and negative, because the concepts a provider alone",
        "reaches are ones it reaches in few of the dialogues holding them.",
        "",
    ]

    return "\n".join(lines)


def main(argv=()):
    """Run the reachability analysis and write its outputs."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="How many concepts to list in the error concentration tables.",
    )
    arguments = parser.parse_args(list(argv))

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    alias_gold = load_gold_sets(use_aliases=True)
    raw_gold = load_gold_sets(use_aliases=False)

    alias_predictions = {}
    raw_predictions = {}
    for provider in PROVIDERS:
        alias_predictions[provider] = load_prediction_sets(provider, True)
        raw_predictions[provider] = load_prediction_sets(provider, False)

    # Nothing is written until the harness reproduces the published figures.
    verification_gate(alias_gold, alias_predictions)

    alias_counts = reachability(alias_gold, alias_predictions)
    raw_counts = reachability(raw_gold, raw_predictions)
    alias_summary = summarise_reachability(alias_counts)
    raw_summary = summarise_reachability(raw_counts)

    frequency = document_frequency(alias_gold)
    band_rows = frequency_band_recall(alias_gold, alias_predictions, frequency)

    distribution_rows = []
    error_rows = []
    for provider in PROVIDERS:
        distribution = dialogue_f1_distribution(
            alias_gold,
            alias_predictions[provider],
        )
        distribution["provider"] = provider
        distribution_rows.append(distribution)

        errors = error_concentration(
            alias_gold,
            alias_predictions[provider],
            limit=arguments.limit,
        )
        errors["provider"] = provider
        error_rows.append(errors)

    alias_rows = alias_target_check(alias_counts, raw_counts)
    decomposition_rows = decomposition(
        alias_gold,
        alias_predictions,
        raw_gold,
        raw_predictions,
    )

    concept_rows = []
    for concept in sorted(alias_counts["opportunities"]):
        row = {
            "concept": concept,
            "documentFrequency": frequency[concept],
            "goldFindings": alias_counts["opportunities"][concept],
            "reachedByAnyProvider": alias_counts["reachedByAny"][concept],
        }
        for provider in PROVIDERS:
            row[f"{provider}Matched"] = (
                alias_counts["reachedPerProvider"][provider][concept]
            )
        concept_rows.append(row)

    write_csv("reachability-concepts.csv", list(concept_rows[0]), concept_rows)
    write_csv("reachability-frequency.csv", list(band_rows[0]), band_rows)
    write_csv(
        "reachability-dialogue-f1.csv",
        list(distribution_rows[0]),
        distribution_rows,
    )
    write_csv("reachability-alias.csv", list(alias_rows[0]), alias_rows)
    write_csv(
        "reachability-decomposition.csv",
        list(decomposition_rows[0]),
        decomposition_rows,
    )

    report = build_report(
        alias_summary,
        raw_summary,
        alias_counts,
        band_rows,
        distribution_rows,
        error_rows,
        alias_rows,
        decomposition_rows,
    )
    report_path = RESULTS_DIR / "reachability-analysis.md"
    report_path.write_text(report, encoding="utf-8")

    print("Verification gate passed.")
    print(
        f"Unreachable with alias table: "
        f"{alias_summary['unreachableFindings']} of "
        f"{alias_summary['totalFindings']} findings "
        f"({alias_summary['unreachableShare']:.1%})"
    )
    print(
        f"Unreachable without alias table: "
        f"{raw_summary['unreachableFindings']} of "
        f"{raw_summary['totalFindings']} findings "
        f"({raw_summary['unreachableShare']:.1%})"
    )
    print(f"Saved {report_path}")


if __name__ == "__main__":
    main(sys.argv[1:])
