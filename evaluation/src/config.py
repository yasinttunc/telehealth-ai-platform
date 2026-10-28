"""Constants shared by the evaluation scripts."""
from pathlib import Path

EVALUATION_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = EVALUATION_DIR / "data"
PREDICTIONS_DIR = EVALUATION_DIR / "predictions"
RESULTS_DIR = EVALUATION_DIR / "results"

# Every evaluation stage uses this order so collection and reports stay aligned.
PROVIDERS = ("openai", "anthropic", "ollama")

MEDITOD_COMMIT = "0b7a87c3553c9056bc8371b0809811003f94b261"

SYSTEM_PROMPT = """You extract structured symptom mentions from a fictional telehealth transcript.

Rules:
1. Extract only symptoms explicitly stated in the transcript.
2. Never infer a diagnosis, medical cause, urgency, treatment, or medication.
3. For each item, set assertion to PRESENT, NEGATED, or UNCERTAIN.
4. Copy a short exact evidence span from the transcript for every item.
5. Use an empty items list when no symptom is explicitly stated.
6. Return only data conforming to the supplied JSON schema."""


# Post-hoc experiment only. The primary results use SYSTEM_PROMPT.
# The rules below were written after the primary run was scored, so any
# result produced with this version is exploratory and cannot replace the
# frozen primary comparison. It deliberately supplies no concept list:
# giving the model the reference vocabulary would leak the answer key.
SYSTEM_PROMPT_V2 = """You extract structured symptom mentions from a fictional telehealth
transcript.

WHAT COUNTS AS A FINDING
1. Extract only symptoms explicitly affirmed, explicitly denied, or
   explicitly described as uncertain by the patient or caregiver.
2. A clinician's question alone is not evidence that a symptom exists.
   Do not extract a symptom merely because the clinician asked about it.
3. Use a clinician statement only when it clearly repeats or summarises
   information already given by the patient or caregiver.
4. Read a short answer such as "yes", "no" or "not sure" together with the
   immediately preceding clinician question to determine which symptoms it
   refers to.
5. Never infer a symptom from a diagnosis, medication, test result,
   treatment, allergy, family history, risk factor, lifestyle detail, or
   from medical knowledge.
6. Exclude remote, resolved, childhood and family-history symptoms unless
   the transcript states they are part of the current episode.

ASSERTION
7. PRESENT   - explicitly reported as occurring in the current episode.
   NEGATED   - explicitly denied for the current episode.
   UNCERTAIN - the patient or caregiver explicitly expresses uncertainty.
8. An unanswered clinician question is not UNCERTAIN. Do not extract it.

NAMING
9.  Where a symptom has a standard clinical name, report that name rather
    than a lay description. Do not choose from any supplied list.
10. Do not put severity, duration, frequency, trigger or anatomical
    location inside the concept name.
11. Report each concept once. Merge repeated mentions that share the same
    assertion into a single item.
12. Do not split one finding into several overlapping concepts unless each
    is separately supported by the transcript.

EVIDENCE
13. Copy the evidence character-for-character from the transcript.
14. Do not paraphrase, correct, translate or summarise it.
15. Use the shortest contiguous span that supports the finding.
16. For a short answer such as "No", include the preceding question when
    needed to preserve meaning.
17. Every item must have non-empty evidence.

CONFIDENCE
18. Confidence describes how clearly the transcript supports the item, not
    the medical likelihood of the symptom. Use a value from 0.0 to 1.0.

OUTPUT
19. Return only data conforming to the supplied JSON schema.
20. Return an empty items list when no eligible symptom is present."""

# Selected on the command line with --prompt-version.
PROMPTS = {
    "v1": SYSTEM_PROMPT,
    "v2": SYSTEM_PROMPT_V2,
}


def prompt_suffix(prompt_version):
    """Return the filename suffix used by a prompt version.

    The primary prompt keeps the original filenames so the frozen results
    can never be overwritten. Any other version writes beside them.
    """
    if prompt_version == "v1":
        return ""
    return f"-prompt{prompt_version}"

STATUS_TO_ASSERTION = {
    "Yes": "PRESENT",
    "No": "NEGATED",
    "Not sure": "UNCERTAIN",
}

ASSERTIONS = ("PRESENT", "NEGATED", "UNCERTAIN")
DROP_VALUES = {"", "all", "general", "other", "none", "n/a"}

# These aliases are frozen before provider results are inspected.
ALIASES = {
    "head ache": "headache",
    "vomitting": "vomiting",
    "wheez": "wheezing",
    "dizzyness": "dizziness",
    "diarrhoea": "diarrhea",
    "palpitation": "palpitations",
    "taste loss": "ageusia",
    "smell loss": "anosmia",
    "smell problem": "sense of smell altered",
    "runny nose": "rhinorrhea",
    "sore throat": "pharyngitis",
    "hoarse tone": "dysphonia",
    "urination": "difficulty passing urine",
    "bowel movement": "change in faeces/bowel movements",
    "vision problem": "visual impairment",
    "hearing problem": "hearing impairment",
    "memory problem": "memory impairment",
    "sleep hydrosis": "night sweats",
    "fatigue extended": "fatigue",
    "loss of appetite": "appetite loss",
    "shortness of breath": "dyspnea",
    "short of breath": "dyspnea",
    "sputum": "colored/excess sputum",
}

RANDOM_SEED = 20260825
BOOTSTRAP_REPETITIONS = 1000
REPEATABILITY_DIALOGUES = 30

EXPECTED_RAW_RECORDS = 231
EXPECTED_UNIQUE_DIALOGUES = 213
EXPECTED_DUPLICATE_PAIRS = 18
EXPECTED_GOLD_FINDINGS = 5005
EXPECTED_ASSERTION_CONFLICTS = 96
