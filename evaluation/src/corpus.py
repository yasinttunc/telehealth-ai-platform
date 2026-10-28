"""Build the concept-only gold corpus from the MediTOD dataset."""
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict

from config import (
    ALIASES,
    DATA_DIR,
    DROP_VALUES,
    EXPECTED_ASSERTION_CONFLICTS,
    EXPECTED_DUPLICATE_PAIRS,
    EXPECTED_GOLD_FINDINGS,
    EXPECTED_RAW_RECORDS,
    EXPECTED_UNIQUE_DIALOGUES,
    MEDITOD_COMMIT,
    RESULTS_DIR,
    STATUS_TO_ASSERTION,
)


def read_json(path):
    """Read a UTF-8 JSON file."""
    return json.loads(path.read_text(encoding="utf-8"))


def plain_text(value):
    """Convert text into lowercase words separated by single spaces."""
    decomposed = unicodedata.normalize("NFD", str(value))
    without_accents = "".join(
        character
        for character in decomposed
        if not unicodedata.combining(character)
    )
    lowercase = without_accents.lower()
    without_punctuation = re.sub(r"[^a-z0-9]+", " ", lowercase)
    return re.sub(r"\s+", " ", without_punctuation).strip()


# Alias keys and values must use the same normalisation.
NORMALISED_ALIASES = {
    plain_text(key): plain_text(value)
    for key, value in ALIASES.items()
}

NORMALISED_DROP_VALUES = {
    plain_text(value)
    for value in DROP_VALUES
}


def normalise_concept(value, use_aliases=True):
    """Convert a raw symptom name into its canonical concept name."""
    if not value:
        return None

    concept = plain_text(value)

    # Assertion information belongs in the assertion field, not the name.
    for prefix in ("no ", "denies ", "negative for ", "absence of "):
        if concept.startswith(prefix):
            concept = concept[len(prefix):].strip()

    if use_aliases:
        concept = NORMALISED_ALIASES.get(concept, concept)

    if not concept or concept in NORMALISED_DROP_VALUES:
        return None

    return concept


def load_raw_data():
    """Load the two MediTOD source files."""
    dialogs = read_json(DATA_DIR / "dialogs.json")
    annotations = read_json(DATA_DIR / "annotations.json")
    return dialogs, annotations


def conversation_fingerprint(dialog):
    """Create a stable identifier from the conversation text."""
    lines = []

    for utterance in dialog["utterances"]:
        if utterance["speaker"] == "control":
            continue

        speaker = utterance["speaker"].strip().lower()
        text = " ".join(utterance["text"].strip().lower().split())
        lines.append(f"{speaker}:{text}")

    conversation = "\n".join(lines)
    return hashlib.sha256(conversation.encode("utf-8")).hexdigest()


def split_corpus(dialogs):
    """Separate unique dialogues from duplicate annotation pairs."""
    fingerprint_groups = defaultdict(list)

    for dialogue_id, dialog in dialogs.items():
        fingerprint = conversation_fingerprint(dialog)
        fingerprint_groups[fingerprint].append(dialogue_id)

    unique_ids = []
    duplicate_pairs = []

    for ids in fingerprint_groups.values():
        ordered_ids = sorted(ids, key=int)
        unique_ids.append(ordered_ids[0])

        if len(ordered_ids) == 2:
            duplicate_pairs.append(ordered_ids)
        elif len(ordered_ids) > 2:
            raise ValueError(f"Unexpected duplicate group: {ordered_ids}")

    return (
        sorted(unique_ids, key=int),
        sorted(duplicate_pairs, key=lambda pair: int(pair[0])),
    )


def build_transcript(dialog):
    """Convert one dialogue into the transcript sent to providers."""
    transcript_lines = []
    uid_text = {}
    uid_speaker = {}

    for utterance in dialog["utterances"]:
        if utterance["speaker"] == "control":
            continue

        uid = str(utterance["uttr_id"])
        speaker = utterance["speaker"].strip().lower()
        text = utterance["text"].strip()

        transcript_lines.append(f"{speaker.upper()}: {text}")
        uid_text[uid] = text
        uid_speaker[uid] = speaker

    return "\n".join(transcript_lines), uid_text, uid_speaker


def build_findings(annotation_turns, use_aliases=True):
    """Aggregate utterance annotations into consultation-level findings."""
    observations = defaultdict(list)

    for turn in annotation_turns:
        for record in turn:
            if not isinstance(record, dict):
                continue
            if record.get("slot") != "symptom":
                continue
            if record.get("intent") != "inform":
                continue

            assertion = STATUS_TO_ASSERTION.get(record.get("status"))
            value = record.get("value")

            if assertion is None or not value:
                continue

            # MediTOD sometimes stores multiple symptoms in one value.
            for raw_concept in str(value).split(","):
                concept = normalise_concept(
                    raw_concept,
                    use_aliases=use_aliases,
                )

                if concept:
                    observations[concept].append(
                        (str(record["uid"]), assertion)
                    )

    findings = []

    for concept, mentions in sorted(observations.items()):
        assertions = sorted({
            assertion
            for _, assertion in mentions
        })
        uids = sorted({
            uid
            for uid, _ in mentions
        }, key=int)

        has_conflict = len(assertions) > 1

        findings.append({
            "concept": concept,
            "assertion": None if has_conflict else assertions[0],
            "assertionConflict": has_conflict,
            "allAssertions": assertions,
            "uids": uids,
        })

    return findings


def build_gold(dialogs, annotations, unique_ids, use_aliases=True):
    """Build the main 213-dialogue gold dictionary."""
    gold = {}

    for dialogue_id in unique_ids:
        transcript, uid_text, uid_speaker = build_transcript(
            dialogs[dialogue_id]
        )

        gold[dialogue_id] = {
            "dialogueId": dialogue_id,
            "transcript": transcript,
            "uidText": uid_text,
            "uidSpeaker": uid_speaker,
            "findings": build_findings(
                annotations.get(dialogue_id, []),
                use_aliases=use_aliases,
            ),
        }

    return gold


def validate_counts(dialogs, gold, duplicate_pairs):
    """Stop execution if the expected dataset counts have changed."""
    findings = [
        finding
        for dialogue in gold.values()
        for finding in dialogue["findings"]
    ]
    conflicts = [
        finding
        for finding in findings
        if finding["assertionConflict"]
    ]

    actual = (
        len(dialogs),
        len(gold),
        len(duplicate_pairs),
        len(findings),
        len(conflicts),
    )

    expected = (
        EXPECTED_RAW_RECORDS,
        EXPECTED_UNIQUE_DIALOGUES,
        EXPECTED_DUPLICATE_PAIRS,
        EXPECTED_GOLD_FINDINGS,
        EXPECTED_ASSERTION_CONFLICTS,
    )

    if actual != expected:
        raise ValueError(
            f"Expected counts {expected}, but received {actual}. "
            "Do not run paid provider calls."
        )

    return findings, conflicts


def main():
    """Build, validate and save the evaluation corpus."""
    dialogs, annotations = load_raw_data()
    unique_ids, duplicate_pairs = split_corpus(dialogs)
    gold = build_gold(dialogs, annotations, unique_ids)
    findings, conflicts = validate_counts(
        dialogs,
        gold,
        duplicate_pairs,
    )

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    (RESULTS_DIR / "gold.json").write_text(
        json.dumps(gold, indent=2),
        encoding="utf-8",
    )
    (RESULTS_DIR / "duplicate_pairs.json").write_text(
        json.dumps(duplicate_pairs, indent=2),
        encoding="utf-8",
    )

    assertion_counts = Counter(
        finding["assertion"]
        for finding in findings
        if not finding["assertionConflict"]
    )

    provenance = {
        "repository": "https://github.com/dair-iitd/MediTOD",
        "commit": MEDITOD_COMMIT,
        "rawRecords": len(dialogs),
        "uniqueDialogues": len(gold),
        "duplicatePairs": len(duplicate_pairs),
        "goldFindings": len(findings),
        "assertionConflicts": len(conflicts),
        "assertionCounts": dict(assertion_counts),
    }

    (RESULTS_DIR / "provenance.json").write_text(
        json.dumps(provenance, indent=2),
        encoding="utf-8",
    )

    print(f"Raw records: {len(dialogs)}")
    print(f"Unique dialogues: {len(gold)}")
    print(f"Duplicate pairs: {len(duplicate_pairs)}")
    print(f"Gold findings: {len(findings)}")
    print(f"Assertion conflicts: {len(conflicts)}")
    print("Gold corpus validation passed.")


if __name__ == "__main__":
    main()
