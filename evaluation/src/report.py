"""Create dissertation-ready Markdown and CSV result tables."""
import csv
import json

import argparse
import sys

from config import PROVIDERS, RESULTS_DIR, prompt_suffix


def read_json(path):
    """Read one UTF-8 JSON file."""
    return json.loads(path.read_text(encoding="utf-8"))


def display(value, digits=4):
    """Display missing values as N/A and numbers consistently."""
    if value is None:
        return "N/A"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def confidence_interval(summary, metric):
    """Format the confidence interval stored for one metric."""
    interval = summary["confidenceIntervals"][metric]
    return (
        f"{display(interval['low'])} - "
        f"{display(interval['high'])}"
    )


# Set by main(). A non-default prompt version writes its CSV files beside
# the primary ones instead of replacing them.
FILE_SUFFIX = ""


def write_csv(filename, fieldnames, rows):
    """Write a list of dictionaries as a CSV file."""
    stem, extension = filename.rsplit(".", 1)
    path = RESULTS_DIR / f"{stem}{FILE_SUFFIX}.{extension}"

    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def dataset_section(provenance):
    """Create the dataset composition section."""
    return [
        "## Dataset",
        "",
        "| Measurement | Value |",
        "|---|---:|",
        f"| Raw records | {provenance['rawRecords']} |",
        f"| Unique dialogues | {provenance['uniqueDialogues']} |",
        f"| Duplicate annotation pairs | {provenance['duplicatePairs']} |",
        f"| Gold findings | {provenance['goldFindings']} |",
        f"| Assertion conflicts | {provenance['assertionConflicts']} |",
        f"| MediTOD commit | `{provenance['commit']}` |",
        "",
        "The 213 unique dialogues form the main evaluation corpus.",
        "The 18 duplicate pairs are used for the inter-annotator reference.",
        "",
    ]


def annotator_section(reference):
    """Show how much the two MediTOD annotations agree."""
    if reference is None:
        return []

    return [
        "## Inter-annotator reference",
        "",
        "| Measurement | Value |",
        "|---|---:|",
        f"| Duplicate pairs | {reference['duplicatePairs']} |",
        f"| Concept F1 | {display(reference['conceptF1'])} |",
        f"| Assertion agreement | {display(reference['assertionAgreement'])} |",
        f"| Cohen's kappa | {display(reference['cohensKappa'])} |",
        f"| Assertion comparisons | {reference['assertionComparisons']} |",
        "",
        "This is a reference point for interpreting results, not a fixed",
        "performance ceiling.",
        "",
    ]


def rq1_section(evaluation):
    """Create the extraction-accuracy table for RQ1."""
    lines = [
        "## RQ1: Clinical finding extraction accuracy",
        "",
        "| Provider | Precision | Recall | Concept F1 (95% CI) | "
        "Assertion-aware F1 (95% CI) |",
        "|---|---:|---:|---:|---:|",
    ]
    csv_rows = []

    for provider in PROVIDERS:
        result = evaluation["providers"][provider]
        concept_interval = confidence_interval(result, "conceptF1")
        assertion_interval = confidence_interval(
            result,
            "assertionAwareF1",
        )

        lines.append(
            f"| {provider.title()} "
            f"| {display(result['conceptPrecision'])} "
            f"| {display(result['conceptRecall'])} "
            f"| {display(result['conceptF1'])} ({concept_interval}) "
            f"| {display(result['assertionAwareF1'])} "
            f"({assertion_interval}) |"
        )

        csv_rows.append({
            "provider": provider,
            "conceptPrecision": result["conceptPrecision"],
            "conceptRecall": result["conceptRecall"],
            "conceptF1": result["conceptF1"],
            "assertionAwarePrecision": result["assertionAwarePrecision"],
            "assertionAwareRecall": result["assertionAwareRecall"],
            "assertionAwareF1": result["assertionAwareF1"],
            "assertionCiLow": result["confidenceIntervals"]
            ["assertionAwareF1"]["low"],
            "assertionCiHigh": result["confidenceIntervals"]
            ["assertionAwareF1"]["high"],
            "conceptCiLow": result["confidenceIntervals"]
            ["conceptF1"]["low"],
            "conceptCiHigh": result["confidenceIntervals"]
            ["conceptF1"]["high"],
        })

    write_csv(
        "rq1-accuracy.csv",
        list(csv_rows[0]),
        csv_rows,
    )

    lines += [
        "",
        "Assertion-aware F1 is the headline result because both the concept "
        "and its assertion must be correct.",
        "",
    ]
    return lines


def rq2_section(evaluation):
    """Create the assertion classification table for RQ2."""
    lines = [
        "## RQ2: Assertion classification",
        "",
        "| Provider | Assertion accuracy | PRESENT recall | "
        "NEGATED recall | Prediction conflicts |",
        "|---|---:|---:|---:|---:|",
    ]
    csv_rows = []

    for provider in PROVIDERS:
        result = evaluation["providers"][provider]

        lines.append(
            f"| {provider.title()} "
            f"| {display(result['conditionalAssertionAccuracy'])} "
            f"| {display(result['presentConceptRecall'])} "
            f"| {display(result['negatedConceptRecall'])} "
            f"| {result['predictionConflicts']} |"
        )

        csv_rows.append({
            "provider": provider,
            "conditionalAssertionAccuracy":
                result["conditionalAssertionAccuracy"],
            "falsePresenceIncidence":
                result["falsePresenceIncidence"],
            "falsePresenceCiLow": result["confidenceIntervals"]
                ["falsePresenceIncidence"]["low"],
            "falsePresenceCiHigh": result["confidenceIntervals"]
                ["falsePresenceIncidence"]["high"],
            "conditionalFalsePresenceRate":
                result["conditionalFalsePresenceRate"],
            "falseNegationIncidence":
                result["falseNegationIncidence"],
            "falseNegationCiLow": result["confidenceIntervals"]
                ["falseNegationIncidence"]["low"],
            "falseNegationCiHigh": result["confidenceIntervals"]
                ["falseNegationIncidence"]["high"],
            "conditionalFalseNegationRate":
                result["conditionalFalseNegationRate"],
            "presentConceptRecall":
                result["presentConceptRecall"],
            "negatedConceptRecall":
                result["negatedConceptRecall"],
            "predictionConflicts":
                result["predictionConflicts"],
        })

    write_csv(
        "rq2-assertions.csv",
        list(csv_rows[0]),
        csv_rows,
    )

    lines += [
        "",
        "### Critical assertion errors",
        "",
        "| Provider | False presence incidence (95% CI) | Conditional "
        "false presence | False negation incidence (95% CI) | Conditional "
        "false negation |",
        "|---|---:|---:|---:|---:|",
    ]

    for provider in PROVIDERS:
        result = evaluation["providers"][provider]
        presence_interval = confidence_interval(
            result,
            "falsePresenceIncidence",
        )
        negation_interval = confidence_interval(
            result,
            "falseNegationIncidence",
        )

        lines.append(
            f"| {provider.title()} "
            f"| {display(result['falsePresenceIncidence'])} "
            f"({presence_interval}) "
            f"| {display(result['conditionalFalsePresenceRate'])} "
            f"| {display(result['falseNegationIncidence'])} "
            f"({negation_interval}) "
            f"| {display(result['conditionalFalseNegationRate'])} |"
        )

    lines += [
        "",
        "False presence means a gold NEGATED finding was reported as PRESENT.",
        "False negation is the reverse direction. Incidence uses every gold",
        "finding of that assertion as its denominator. Conditional rates use",
        "only findings the provider located and show N/A when none were found.",
        "",
    ]
    return lines


def confusion_section(evaluation):
    """Show the assertion confusion matrix for each provider."""
    columns = ("PRESENT", "NEGATED", "UNCERTAIN", "CONFLICT")
    lines = ["## Assertion confusion matrices", ""]

    for provider in PROVIDERS:
        confusion = evaluation["providers"][provider]["confusion"]
        lines += [
            f"### {provider.title()}",
            "",
            "Rows are gold assertions and columns are predictions.",
            "",
            "| Gold | " + " | ".join(columns) + " |",
            "|---|" + "---:|" * len(columns),
        ]

        for gold_label in ("PRESENT", "NEGATED", "UNCERTAIN"):
            values = [
                str(confusion.get(f"{gold_label}->{prediction}", 0))
                for prediction in columns
            ]
            lines.append(
                f"| **{gold_label}** | " + " | ".join(values) + " |"
            )

        lines.append("")

    lines += [
        "The CONFLICT column contains concepts returned more than once with",
        "different assertions. Conflicts never receive assertion credit.",
        "",
    ]
    return lines


def evidence_section(evaluation):
    """Create the evidence-grounding table."""
    lines = [
        "## Evidence grounding",
        "",
        "| Provider | Exact evidence | Normalised evidence | "
        "Missing evidence |",
        "|---|---:|---:|---:|",
    ]

    for provider in PROVIDERS:
        result = evaluation["providers"][provider]

        lines.append(
            f"| {provider.title()} "
            f"| {display(result['exactEvidenceRate'])} "
            f"| {display(result['normalisedEvidenceRate'])} "
            f"| {display(result['missingEvidenceRate'])} |"
        )

    lines += [
        "",
        "Exact evidence requires a character-for-character transcript match.",
        "Normalised evidence ignores case and punctuation differences.",
        "",
    ]
    return lines


def rq3_section(evaluation):
    """Create the provider operational comparison for RQ3."""
    lines = [
        "## RQ3: Provider comparison",
        "",
        "| Provider | Failure rate | Validation failure | "
        "Median latency ms | P95 latency ms | Cost USD |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    csv_rows = []

    for provider in PROVIDERS:
        operational = evaluation["providers"][provider]["operational"]

        cost = (
            display(operational["costUsd"], 6)
            if operational.get("pricingConfigured")
            else "Not configured"
        )

        lines.append(
            f"| {provider.title()} "
            f"| {display(operational['failureRate'])} "
            f"| {display(operational['validationFailureRate'])} "
            f"| {display(operational['latencyMedianMs'], 1)} "
            f"| {display(operational['latencyP95Ms'], 1)} "
            f"| {cost} |"
        )

        csv_rows.append({
            "provider": provider,
            **operational,
        })

    write_csv(
        "rq3-providers.csv",
        list(csv_rows[0]),
        csv_rows,
    )

    lines += [
        "",
        "Failed calls remain part of accuracy evaluation as empty predictions.",
        "Latency is calculated only from successful calls.",
        "",
    ]
    return lines


def repeatability_section(evaluation):
    """Show output stability between two runs of the same transcripts."""
    available = []
    for provider in PROVIDERS:
        summary = evaluation["providers"][provider].get("repeatability")
        if summary:
            available.append((provider, summary))

    if not available:
        return []

    lines = [
        "## Repeatability",
        "",
        "The same fixed sample of 30 dialogues was sent twice.",
        "",
        "| Provider | Dialogues | Concept Jaccard | Assertion agreement | "
        "Critical PRESENT/NEGATED changes |",
        "|---|---:|---:|---:|---:|",
    ]

    for provider, summary in available:
        lines.append(
            f"| {provider.title()} "
            f"| {summary['dialoguesCompared']} "
            f"| {display(summary['meanConceptJaccard'])} "
            f"| {display(summary['assertionAgreement'])} "
            f"| {summary['criticalAssertionChanges']} |"
        )

    lines += [
        "",
        "A critical change is the same concept changing directly between",
        "PRESENT and NEGATED for an identical transcript.",
        "",
    ]
    return lines


def paired_section(evaluation):
    """Show paired provider differences and their bootstrap intervals."""
    comparisons = evaluation.get("pairedComparisons", [])
    if not comparisons:
        return []

    lines = [
        "## Paired provider differences",
        "",
        "Both providers use the same resampled dialogue IDs.",
        "",
        "| Metric | First | Second | Difference | 95% interval | "
        "Excludes zero |",
        "|---|---|---|---:|---:|---|",
    ]

    for comparison in comparisons:
        excludes_zero = "yes" if comparison["excludesZero"] else "no"
        lines.append(
            f"| {comparison['metric']} "
            f"| {comparison['firstProvider'].title()} "
            f"| {comparison['secondProvider'].title()} "
            f"| {display(comparison['difference'])} "
            f"| {display(comparison['low'])} - "
            f"{display(comparison['high'])} "
            f"| {excludes_zero} |"
        )

    write_csv(
        "provider-differences.csv",
        list(comparisons[0]),
        comparisons,
    )

    lines += [
        "",
        "An interval excluding zero indicates an observed difference on this",
        "corpus. It does not establish clinical superiority.",
        "",
    ]
    return lines


def prompt_comparison_section(evaluation, prompt_version):
    """Compare an experimental prompt against the frozen primary prompt.

    The section is skipped for the primary prompt itself, and also when the
    primary evaluation file is missing, so the report never claims a
    comparison it cannot support.
    """
    if prompt_version == "v1":
        return []

    primary_path = RESULTS_DIR / "evaluation.json"
    if not primary_path.exists():
        return []

    primary = read_json(primary_path)
    metrics = [
        ("conceptF1", "Concept F1"),
        ("assertionAwareF1", "Assertion-aware F1"),
        ("conceptPrecision", "Concept precision"),
        ("conceptRecall", "Concept recall"),
    ]

    lines = [
        f"## Prompt v1 versus prompt {prompt_version}",
        "",
        "The same gold reference, the same alias table and the same scoring "
        "code are used for both columns. Only the extraction prompt differs.",
        "",
        "| Provider | Metric | Prompt v1 | "
        f"Prompt {prompt_version} | Change |",
        "|---|---|---:|---:|---:|",
    ]
    csv_rows = []

    for provider in PROVIDERS:
        if provider not in primary["providers"]:
            continue
        old_result = primary["providers"][provider]
        new_result = evaluation["providers"][provider]

        for key, label in metrics:
            change = new_result[key] - old_result[key]
            lines.append(
                f"| {provider.title()} "
                f"| {label} "
                f"| {display(old_result[key])} "
                f"| {display(new_result[key])} "
                f"| {change:+.4f} |"
            )
            csv_rows.append({
                "provider": provider,
                "metric": key,
                "promptV1": old_result[key],
                f"prompt{prompt_version.upper()}": new_result[key],
                "change": change,
            })

    if not csv_rows:
        return []

    write_csv(
        "prompt-comparison.csv",
        list(csv_rows[0]),
        csv_rows,
    )

    lines += [
        "",
        "The intervals reported earlier in this file are not paired across "
        "prompt versions, so an apparent gain here is descriptive only. "
        "The primary result remains the prompt v1 comparison.",
        "",
    ]
    return lines


def limitations_section():
    """Add the fixed limitations that must accompany the results."""
    return [
        "## Interpretation limitations",
        "",
        "- MediTOD contains simulated medical conversations.",
        "- The evaluation measures extraction, not diagnosis.",
        "- Body-location extraction is outside the evaluation scope.",
        "- HISTORICAL assertions are not evaluated.",
        "- The public case-level official test split is unavailable.",
        "- Alert behaviour is treated as implementation testing, not a "
        "clinical research question.",
        "",
    ]


def main(argv=()):
    """Build the complete Markdown report and CSV result files."""
    global FILE_SUFFIX

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--prompt-version",
        default="v1",
        choices=("v1", "v2"),
        help="Which evaluation file to report on.",
    )
    arguments = parser.parse_args(list(argv))
    FILE_SUFFIX = prompt_suffix(arguments.prompt_version)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    provenance = read_json(RESULTS_DIR / "provenance.json")
    evaluation = read_json(RESULTS_DIR / f"evaluation{FILE_SUFFIX}.json")
    annotator_path = RESULTS_DIR / "inter_annotator.json"
    annotator = read_json(annotator_path) if annotator_path.exists() else None

    title = "Dissertation Evaluation Results"
    if arguments.prompt_version != "v1":
        title += f" (prompt {arguments.prompt_version})"

    lines = [
        f"# {title}",
        "",
        "This report was generated from the saved provider predictions.",
        "",
    ]

    if arguments.prompt_version != "v1":
        lines += [
            "> **Post-hoc exploratory experiment.** These results use a",
            "> revised extraction prompt written after the primary run was",
            "> scored. They do not replace the primary comparison and must",
            "> not be reported as the main result.",
            "",
        ]

    lines += dataset_section(provenance)
    lines += annotator_section(annotator)
    lines += rq1_section(evaluation)
    lines += rq2_section(evaluation)
    lines += confusion_section(evaluation)
    lines += evidence_section(evaluation)
    lines += rq3_section(evaluation)
    lines += repeatability_section(evaluation)
    lines += paired_section(evaluation)
    lines += prompt_comparison_section(evaluation, arguments.prompt_version)
    lines += limitations_section()

    report_path = RESULTS_DIR / f"report{FILE_SUFFIX}.md"
    report_path.write_text(
        "\n".join(lines),
        encoding="utf-8",
    )

    print(f"Saved {report_path}")
    for name in ("rq1-accuracy", "rq2-assertions", "rq3-providers"):
        print(f"Saved {name}{FILE_SUFFIX}.csv")


if __name__ == "__main__":
    main(sys.argv[1:])
