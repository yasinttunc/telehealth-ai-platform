"""Focused tests for corpus preparation, validation and scoring."""
import json

import pytest
import evaluate
import providers
import report
import run_all

from config import DATA_DIR, PROMPTS, SYSTEM_PROMPT, prompt_suffix
from corpus import (
    build_findings,
    build_gold,
    conversation_fingerprint,
    load_raw_data,
    normalise_concept,
    split_corpus,
    validate_counts,
)
from evaluate import (
    aggregate,
    bootstrap_interval,
    concept_jaccard,
    paired_bootstrap,
    prepare_predictions,
    repeatability_summary,
    score_dialogue,
)
from providers import (
    call_ollama,
    collect,
    missing_price_variables,
    price_variable_names,
    validate_output,
)
from reliability import cohens_kappa, inter_annotator_reference


def gold_finding(concept, assertion, conflict=False):
    """Create a small gold finding for a scoring test."""
    assertions = [assertion] if assertion else ["NEGATED", "PRESENT"]
    return {
        "concept": concept,
        "assertion": assertion,
        "assertionConflict": conflict,
        "allAssertions": assertions,
        "uids": ["1"],
    }


def gold_dialogue(findings, transcript="PATIENT: I have a cough."):
    """Create a small gold dialogue without loading the full dataset."""
    return {
        "dialogueId": "test-1",
        "transcript": transcript,
        "findings": findings,
    }


def predicted_item(
    name="cough",
    assertion="PRESENT",
    evidence="I have a cough.",
):
    """Create one valid provider prediction item."""
    return {
        "name": name,
        "assertion": assertion,
        "confidence": 0.9,
        "evidence": evidence,
    }


def prediction_row(items=None, success=True):
    """Create the stored prediction format consumed by score_dialogue."""
    return {
        "success": success,
        "items": items or [],
    }


# The MediTOD corpus is fetched locally and never committed (see README).
requires_meditod = pytest.mark.skipif(
    not (DATA_DIR / "dialogs.json").exists()
    or not (DATA_DIR / "annotations.json").exists(),
    reason="MediTOD corpus not present in evaluation/data; see evaluation/README.md",
)


@requires_meditod
def test_real_meditod_corpus_has_expected_counts():
    """The local MediTOD files must produce the frozen corpus counts."""
    dialogs, annotations = load_raw_data()
    unique_ids, duplicate_pairs = split_corpus(dialogs)
    gold = build_gold(dialogs, annotations, unique_ids)
    findings, conflicts = validate_counts(dialogs, gold, duplicate_pairs)

    assert len(dialogs) == 231
    assert len(gold) == 213
    assert len(duplicate_pairs) == 18
    assert len(findings) == 5005
    assert len(conflicts) == 96


def test_fingerprint_ignores_control_utterances():
    """Control text must not make two identical conversations different."""
    first = {
        "utterances": [
            {"speaker": "patient", "text": "I feel dizzy."},
            {"speaker": "doctor", "text": "When did it start?"},
        ]
    }
    second = {
        "utterances": [
            {"speaker": "control", "text": "Scenario instructions"},
            {"speaker": "patient", "text": "I feel dizzy."},
            {"speaker": "doctor", "text": "When did it start?"},
        ]
    }

    assert conversation_fingerprint(first) == conversation_fingerprint(second)


def test_concept_normalisation_uses_frozen_aliases():
    """Spelling variants and aliases must map to one concept."""
    assert normalise_concept("Head ache") == "headache"
    assert normalise_concept("short of breath") == "dyspnea"
    assert normalise_concept("sputum") == "colored excess sputum"
    assert normalise_concept("colored/excess sputum") == "colored excess sputum"


def test_concept_normalisation_removes_negation_prefixes_and_drop_values():
    """Assertion words are removed and non-clinical values are dropped."""
    assert normalise_concept("No fever") == "fever"
    assert normalise_concept("Denies vomiting") == "vomiting"
    assert normalise_concept("general") is None
    assert normalise_concept("") is None


def test_build_findings_ignores_non_symptom_and_non_inform_records():
    """Only symptom records with the inform intent enter the gold set."""
    turns = [[
        {
            "slot": "symptom",
            "intent": "inform",
            "status": "Yes",
            "value": "head ache",
            "uid": 1,
        },
        {
            "slot": "medication",
            "intent": "inform",
            "status": "Yes",
            "value": "paracetamol",
            "uid": 1,
        },
        {
            "slot": "symptom",
            "intent": "inquire",
            "status": "Yes",
            "value": "fever",
            "uid": 2,
        },
    ]]

    findings = build_findings(turns)

    assert len(findings) == 1
    assert findings[0]["concept"] == "headache"
    assert findings[0]["assertion"] == "PRESENT"


def test_build_findings_marks_conflicting_gold_assertions():
    """The same concept labelled both present and absent is a conflict."""
    turns = [[
        {
            "slot": "symptom",
            "intent": "inform",
            "status": "Yes",
            "value": "cough",
            "uid": 1,
        },
        {
            "slot": "symptom",
            "intent": "inform",
            "status": "No",
            "value": "cough",
            "uid": 2,
        },
    ]]

    finding = build_findings(turns)[0]

    assert finding["assertionConflict"] is True
    assert finding["assertion"] is None
    assert finding["allAssertions"] == ["NEGATED", "PRESENT"]


def test_repeated_prediction_with_same_assertion_is_not_a_conflict():
    """Repeated equivalent items count as one concept."""
    prepared = prepare_predictions([
        predicted_item(),
        predicted_item(evidence="a cough"),
    ])

    assert set(prepared) == {"cough"}
    assert prepared["cough"]["assertion"] == "PRESENT"
    assert prepared["cough"]["predictionConflict"] is False


def test_prediction_conflict_is_independent_of_item_order():
    """Changing duplicate item order must not change conflict handling."""
    present = predicted_item(assertion="PRESENT")
    negated = predicted_item(assertion="NEGATED")

    first = prepare_predictions([present, negated])["cough"]
    second = prepare_predictions([negated, present])["cough"]

    assert first["assertion"] is None
    assert second["assertion"] is None
    assert first["allAssertions"] == second["allAssertions"]
    assert first["predictionConflict"] is True


def test_perfect_prediction_scores_one():
    """A correct concept and assertion must receive perfect scores."""
    gold = gold_dialogue([gold_finding("cough", "PRESENT")])
    prediction = prediction_row([predicted_item()])

    metrics = aggregate([score_dialogue(gold, prediction)])

    assert metrics["conceptF1"] == pytest.approx(1.0)
    assert metrics["assertionAwareF1"] == pytest.approx(1.0)
    assert metrics["conditionalAssertionAccuracy"] == pytest.approx(1.0)


def test_wrong_assertion_keeps_concept_match_but_fails_assertion_match():
    """Finding the concept does not excuse assigning the wrong assertion."""
    gold = gold_dialogue([gold_finding("cough", "NEGATED")])
    prediction = prediction_row([
        predicted_item(assertion="PRESENT"),
    ])

    metrics = aggregate([score_dialogue(gold, prediction)])

    assert metrics["conceptF1"] == pytest.approx(1.0)
    assert metrics["assertionAwareF1"] == pytest.approx(0.0)
    assert metrics["conditionalAssertionAccuracy"] == pytest.approx(0.0)


def test_failed_provider_call_is_scored_as_an_empty_prediction():
    """A failed call must not disappear from the accuracy denominator."""
    gold = gold_dialogue([gold_finding("cough", "PRESENT")])
    failed = prediction_row([predicted_item()], success=False)

    metrics = aggregate([score_dialogue(gold, failed)])

    assert metrics["conceptRecall"] == pytest.approx(0.0)
    assert metrics["conceptF1"] == pytest.approx(0.0)
    assert metrics["assertionAwareF1"] == pytest.approx(0.0)


def test_false_presence_uses_clear_denominators():
    """False-presence incidence and conditional rate use different totals."""
    gold = gold_dialogue([
        gold_finding("cough", "NEGATED"),
        gold_finding("fever", "NEGATED"),
    ])
    prediction = prediction_row([
        predicted_item(assertion="PRESENT"),
    ])

    metrics = aggregate([score_dialogue(gold, prediction)])

    assert metrics["falsePresenceIncidence"] == pytest.approx(0.5)
    assert metrics["conditionalFalsePresenceRate"] == pytest.approx(1.0)
    assert metrics["negatedConceptRecall"] == pytest.approx(0.5)


def test_conflicting_prediction_is_an_assertion_error_and_safety_error():
    """A PRESENT/NEGATED prediction conflict cannot receive assertion credit."""
    gold = gold_dialogue([gold_finding("cough", "NEGATED")])
    prediction = prediction_row([
        predicted_item(assertion="NEGATED"),
        predicted_item(assertion="PRESENT"),
    ])

    metrics = aggregate([score_dialogue(gold, prediction)])

    assert metrics["assertionAwareF1"] == pytest.approx(0.0)
    assert metrics["predictionConflicts"] == 1
    assert metrics["falsePresenceIncidence"] == pytest.approx(1.0)
    assert metrics["confusion"]["NEGATED->CONFLICT"] == 1


def test_exact_and_normalised_evidence_are_reported_separately():
    """Case and punctuation changes fail exact matching but pass relaxed matching."""
    transcript = "PATIENT: I have chest pain."
    gold = gold_dialogue(
        [gold_finding("chest pain", "PRESENT")],
        transcript=transcript,
    )
    prediction = prediction_row([
        predicted_item(
            name="chest pain",
            evidence="I HAVE CHEST PAIN!",
        )
    ])

    metrics = aggregate([score_dialogue(gold, prediction)])

    assert metrics["exactEvidenceRate"] == pytest.approx(0.0)
    assert metrics["normalisedEvidenceRate"] == pytest.approx(1.0)


def test_provider_output_validation_accepts_valid_json():
    """A response matching production restrictions must be accepted."""
    raw_text = json.dumps({
        "items": [predicted_item()],
    })

    items, error = validate_output(raw_text)

    assert error is None
    assert len(items) == 1
    assert items[0]["confidence"] == pytest.approx(0.9)


@pytest.mark.parametrize(
    "payload",
    [
        {"items": "not a list"},
        {"items": [{**predicted_item(), "name": ""}]},
        {"items": [{**predicted_item(), "assertion": "MAYBE"}]},
        {"items": [{**predicted_item(), "confidence": True}]},
        {"items": [{**predicted_item(), "confidence": 1.5}]},
        {"items": [{**predicted_item(), "evidence": "x" * 501}]},
        {"items": [{**predicted_item(), "evidence": "   "}]},
        {"items": [{**predicted_item(), "unexpected": "value"}]},
        {"items": [], "unexpected": "value"},
    ],
)
def test_provider_output_validation_rejects_invalid_content(payload):
    """Invalid provider fields must become validation failures."""
    items, error = validate_output(json.dumps(payload))

    assert items == []
    assert error is not None


def test_provider_output_validation_rejects_invalid_json():
    """Malformed JSON must not be treated as an empty successful response."""
    items, error = validate_output("this is not json")

    assert items == []
    assert error.startswith("Invalid JSON:")


def test_bootstrap_interval_is_exact_for_identical_perfect_rows():
    """Resampling perfect rows must keep both interval limits at one."""
    gold = gold_dialogue([gold_finding("cough", "PRESENT")])
    row = score_dialogue(gold, prediction_row([predicted_item()]))

    interval = bootstrap_interval([row] * 8, "conceptF1")

    assert interval["low"] == pytest.approx(1.0)
    assert interval["high"] == pytest.approx(1.0)


def test_cohens_kappa_is_one_for_identical_labels():
    """Perfect assertion agreement must give a kappa of one."""
    labels = ["PRESENT", "NEGATED", "PRESENT", "UNCERTAIN"]

    assert cohens_kappa(labels, labels) == pytest.approx(1.0)


def test_cohens_kappa_is_zero_for_chance_level_agreement():
    """Agreement equal to chance must give a kappa of zero."""
    first = ["PRESENT", "PRESENT", "NEGATED", "NEGATED"]
    second = ["PRESENT", "NEGATED", "PRESENT", "NEGATED"]

    assert cohens_kappa(first, second) == pytest.approx(0.0)


@requires_meditod
def test_inter_annotator_reference_uses_real_duplicate_pairs():
    """The 18 duplicate pairs must produce the expected reference range."""
    dialogs, annotations = load_raw_data()
    _, duplicate_pairs = split_corpus(dialogs)

    reference = inter_annotator_reference(duplicate_pairs, annotations)

    assert reference["duplicatePairs"] == 18
    assert reference["assertionComparisons"] > 300
    assert 0.8 < reference["conceptF1"] < 1.0
    assert 0.8 < reference["cohensKappa"] < 1.0


def test_concept_jaccard_measures_set_overlap():
    """Jaccard must handle identical, empty and partly shared sets."""
    assert concept_jaccard({"cough"}, {"cough"}) == pytest.approx(1.0)
    assert concept_jaccard(set(), set()) == pytest.approx(1.0)
    assert concept_jaccard({"cough"}, {"fever"}) == pytest.approx(0.0)
    assert concept_jaccard({"cough", "fever"}, {"cough"}) == pytest.approx(0.5)


def test_repeatability_counts_a_critical_assertion_change():
    """PRESENT changing to NEGATED between runs is critical instability."""
    records = [
        {
            "dialogueId": "1",
            "run": 1,
            "repeatabilityCase": True,
            "success": True,
            "items": [predicted_item(assertion="PRESENT")],
        },
        {
            "dialogueId": "1",
            "run": 2,
            "repeatabilityCase": True,
            "success": True,
            "items": [predicted_item(assertion="NEGATED")],
        },
    ]

    summary = repeatability_summary(records)

    assert summary["dialoguesCompared"] == 1
    assert summary["meanConceptJaccard"] == pytest.approx(1.0)
    assert summary["assertionAgreement"] == pytest.approx(0.0)
    assert summary["criticalAssertionChanges"] == 1


def test_repeatability_is_unavailable_without_run_two():
    """A missing second run must produce no summary rather than a crash."""
    records = [{
        "dialogueId": "1",
        "run": 1,
        "repeatabilityCase": True,
        "success": True,
        "items": [],
    }]

    assert repeatability_summary(records) is None


def test_paired_bootstrap_finds_no_difference_for_identical_rows():
    """Identical providers must have a difference interval containing zero."""
    gold = gold_dialogue([gold_finding("cough", "PRESENT")])
    row = score_dialogue(gold, prediction_row([predicted_item()]))
    row["dialogueId"] = "1"

    comparison = paired_bootstrap([row], [row], "conceptF1")

    assert comparison["difference"] == pytest.approx(0.0)
    assert comparison["excludesZero"] is False


def test_missing_price_variables_are_reported(monkeypatch):
    """Missing prices must be visible instead of silently appearing as zero."""
    input_name, output_name = price_variable_names("openai")
    monkeypatch.delenv(input_name, raising=False)
    monkeypatch.delenv(output_name, raising=False)

    assert missing_price_variables("openai") == [input_name, output_name]

    monkeypatch.setenv(input_name, "1.0")
    monkeypatch.setenv(output_name, "2.0")

    assert missing_price_variables("openai") == []


def test_collect_requires_explicit_paid_call_confirmation():
    """Calling collect directly must still require explicit confirmation."""
    with pytest.raises(SystemExit, match="confirm_paid_calls=True"):
        collect("openai")


def test_experimental_prompt_writes_to_its_own_file():
    """The primary prediction files must never be overwritten."""
    assert prompt_suffix("v1") == ""
    assert prompt_suffix("v2") == "-promptv2"


def test_experimental_prompt_does_not_leak_the_concept_vocabulary():
    """Prompt v2 must not hand the model the reference concept list."""
    prompt = PROMPTS["v2"]

    assert "Do not choose from any supplied list" in prompt
    for concept in ("dyspnea", "ageusia", "rhinorrhea", "pharyngitis"):
        assert concept not in prompt.lower()


def test_ollama_adapter_has_enough_context_for_long_dialogues(monkeypatch):
    """Ollama must leave enough context space for a complete JSON response."""
    captured_request = {}

    class FakeResponse:
        def raise_for_status(self):
            """The fake response represents a successful local request."""

        def json(self):
            """Return the small response shape used by the Ollama adapter."""
            return {
                "message": {
                    "content": json.dumps({
                        "items": [predicted_item()],
                    })
                },
                "prompt_eval_count": 100,
                "eval_count": 30,
            }

    def fake_post(url, **kwargs):
        """Capture the request instead of loading the local model."""
        captured_request["url"] = url
        captured_request.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(providers.httpx, "post", fake_post)
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "gpt-oss:20b")
    monkeypatch.setenv("OLLAMA_INPUT_PRICE_PER_MILLION", "0")
    monkeypatch.setenv("OLLAMA_OUTPUT_PRICE_PER_MILLION", "0")

    adapter_result = call_ollama(
        "PATIENT: I have a cough.",
        SYSTEM_PROMPT,
    )

    assert adapter_result["success"] is True
    assert adapter_result["items"] == [predicted_item()]
    assert adapter_result["inputTokens"] == 100
    assert adapter_result["outputTokens"] == 30
    assert captured_request["url"].endswith("/api/chat")
    assert captured_request["json"]["think"] == "low"
    assert captured_request["json"]["options"] == {
        "temperature": 0,
        "num_ctx": 16384,
        "num_predict": 4000,
    }


def test_runner_requires_a_prediction_file_for_every_provider(
    tmp_path,
    monkeypatch,
):
    """Scoring must wait until all three provider files are available."""
    assert set(providers.CALLERS) == set(evaluate.PROVIDERS)

    monkeypatch.setattr(run_all, "PREDICTIONS_DIR", tmp_path)

    for provider in evaluate.PROVIDERS[:-1]:
        (tmp_path / f"{provider}.json").write_text("[]")

    assert run_all.predictions_are_ready() is False

    last_provider = evaluate.PROVIDERS[-1]
    (tmp_path / f"{last_provider}.json").write_text("[]")

    assert run_all.predictions_are_ready() is True


def test_complete_scoring_and_report_pipeline(tmp_path, monkeypatch):
    """Saved predictions must produce JSON, Markdown and CSV results."""
    results_dir = tmp_path / "results"
    predictions_dir = tmp_path / "predictions"
    results_dir.mkdir()
    predictions_dir.mkdir()

    gold = {
        "1": {
            **gold_dialogue([gold_finding("cough", "PRESENT")]),
            "dialogueId": "1",
        }
    }
    (results_dir / "gold.json").write_text(json.dumps(gold))
    (results_dir / "provenance.json").write_text(json.dumps({
        "rawRecords": 1,
        "uniqueDialogues": 1,
        "duplicatePairs": 0,
        "goldFindings": 1,
        "assertionConflicts": 0,
        "commit": "test",
    }))
    (results_dir / "inter_annotator.json").write_text(json.dumps({
        "duplicatePairs": 18,
        "conceptF1": 0.9,
        "assertionAgreement": 0.95,
        "cohensKappa": 0.9,
        "assertionComparisons": 300,
    }))

    for provider in evaluate.PROVIDERS:
        base = {
            "dialogueId": "1",
            "repeatabilityCase": True,
            "success": True,
            "items": [predicted_item()],
            "latencyMs": 10.0,
            "inputTokens": 10,
            "outputTokens": 5,
            "costUsd": 0.0,
            "pricingConfigured": False,
            "errorType": None,
        }
        rows = [{**base, "run": 1}, {**base, "run": 2}]
        (predictions_dir / f"{provider}.json").write_text(json.dumps(rows))

    monkeypatch.setattr(evaluate, "RESULTS_DIR", results_dir)
    monkeypatch.setattr(evaluate, "PREDICTIONS_DIR", predictions_dir)
    monkeypatch.setattr(evaluate, "BOOTSTRAP_REPETITIONS", 10)
    evaluate.main()

    evaluation_result = json.loads(
        (results_dir / "evaluation.json").read_text()
    )
    assert set(evaluation_result["providers"]) == set(evaluate.PROVIDERS)
    assert len(evaluation_result["pairedComparisons"]) == 12

    monkeypatch.setattr(report, "RESULTS_DIR", results_dir)
    report.main()

    generated_report = (results_dir / "report.md").read_text()
    assert "Inter-annotator reference" in generated_report
    assert "Assertion confusion matrices" in generated_report
    assert "Repeatability" in generated_report
    assert "Paired provider differences" in generated_report
    assert "Not configured" in generated_report
    assert "| Anthropic |" in generated_report
    assert "| Ollama |" in generated_report
    assert (results_dir / "provider-differences.csv").exists()
