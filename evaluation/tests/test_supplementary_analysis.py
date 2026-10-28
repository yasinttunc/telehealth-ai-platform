"""Focused tests for the supplementary dissertation analyses."""
import json

import pytest
import supplementary_analysis

from corpus import build_findings, normalise_concept
from evaluate import aggregate, paired_bootstrap, prepare_predictions, score_dialogue
from supplementary_analysis import (
    adjacent_turn_windows,
    assertion_recall_rows,
    confidence_for_group,
    evidence_matches_adjacent_turns,
    rank_auc,
    verify_frozen_results,
)


def finding(concept, assertion, conflict=False):
    """Return one small gold finding used by supplementary tests."""
    return {
        "concept": concept,
        "assertion": assertion,
        "assertionConflict": conflict,
        "allAssertions": (
            [assertion]
            if assertion
            else ["NEGATED", "PRESENT"]
        ),
        "uids": ["1"],
    }


def dialogue(findings):
    """Return one small gold dialogue used by supplementary tests."""
    return {
        "dialogueId": "1",
        "transcript": "PATIENT: I am short of breath but I have no fever.",
        "findings": findings,
    }


def item(name, assertion="PRESENT", confidence=0.9):
    """Return one small valid provider item."""
    return {
        "name": name,
        "assertion": assertion,
        "confidence": confidence,
        "evidence": name,
    }


def stored_prediction(items):
    """Return one saved main prediction row."""
    return {
        "dialogueId": "1",
        "run": 1,
        "repeatabilityCase": False,
        "success": True,
        "items": items,
    }


def all_prediction_sets(record):
    """Return one record repeated across providers and prompt versions."""
    return {
        prompt_version: {
            provider: {"1": record}
            for provider in supplementary_analysis.PROVIDERS
        }
        for prompt_version in supplementary_analysis.PROMPT_VERSIONS
    }


def test_alias_switch_keeps_the_frozen_default():
    """The optional switch must not change existing default behaviour."""
    assert normalise_concept("shortness of breath") == "dyspnea"
    assert normalise_concept(
        "shortness of breath",
        use_aliases=True,
    ) == "dyspnea"
    assert normalise_concept(
        "shortness of breath",
        use_aliases=False,
    ) == "shortness of breath"


def test_no_alias_keeps_base_normalisation_and_drop_rules():
    """Disabling aliases must disable only the frozen lookup table."""
    assert normalise_concept("No fever!", use_aliases=False) == "fever"
    assert normalise_concept("GENERAL", use_aliases=False) is None


def test_gold_and_prediction_can_use_the_same_no_alias_condition():
    """A no-alias comparison must apply the condition to both sides."""
    annotation = [[{
        "slot": "symptom",
        "intent": "inform",
        "status": "Yes",
        "value": "shortness of breath",
        "uid": 1,
    }]]
    gold_findings = build_findings(annotation, use_aliases=False)
    gold = dialogue(gold_findings)
    prediction = stored_prediction([item("shortness of breath")])

    metrics = aggregate([
        score_dialogue(gold, prediction, use_aliases=False)
    ])

    assert metrics["conceptF1"] == pytest.approx(1.0)


def test_rank_auc_handles_ties_separation_and_missing_classes():
    """Rank AUC must be exact and explicit when one class is missing."""
    assert rank_auc([0.5, 0.5], [0.5, 0.5]) == pytest.approx(0.5)
    assert rank_auc([0.8, 0.9], [0.1, 0.2]) == pytest.approx(1.0)
    assert rank_auc([], [0.1]) is None
    assert rank_auc([0.9], []) is None


def test_duplicate_aliases_use_one_maximum_confidence():
    """Equivalent duplicate names must form one confidence observation."""
    predictions = prepare_predictions([
        item("shortness of breath", confidence=0.7),
        item("dyspnea", confidence=0.95),
    ])

    assert set(predictions) == {"dyspnea"}
    assert confidence_for_group(predictions["dyspnea"]) == pytest.approx(0.95)


def test_evidence_can_join_one_question_and_short_answer():
    """Evidence may omit labels between one question and its short answer."""
    transcript = (
        "DOCTOR: Do you have chest pain?\n"
        "PATIENT: No.\n"
        "DOCTOR: Do you have a cough?"
    )
    windows = adjacent_turn_windows(transcript)

    assert evidence_matches_adjacent_turns(
        "Do you have chest pain? No.",
        windows,
    ) is True

    # Skipping the intervening patient turn must not create a valid span.
    assert evidence_matches_adjacent_turns(
        "Do you have chest pain? Do you have a cough?",
        windows,
    ) is False


def test_paired_bootstrap_is_zero_for_identical_prompt_rows():
    """Identical paired prompt rows must return an exact zero interval."""
    gold = dialogue([finding("dyspnea", "PRESENT")])
    prediction = stored_prediction([item("dyspnea")])
    row = score_dialogue(gold, prediction)

    comparison = paired_bootstrap([row], [row], "conceptF1")

    assert comparison["difference"] == pytest.approx(0.0)
    assert comparison["low"] == pytest.approx(0.0)
    assert comparison["high"] == pytest.approx(0.0)
    assert comparison["excludesZero"] is False


def test_assertion_recall_excludes_gold_conflicts():
    """Conflicted gold is excluded and wrong assertions are only located."""
    gold = {
        "1": dialogue([
            finding("dyspnea", "PRESENT"),
            finding("fever", "NEGATED"),
            finding("cough", None, conflict=True),
        ])
    }
    record = stored_prediction([
        item("dyspnea", assertion="NEGATED"),
        item("fever", assertion="NEGATED"),
        item("cough", assertion="PRESENT"),
    ])

    rows = assertion_recall_rows(gold, all_prediction_sets(record))
    openai_v1 = {
        row["assertion"]: row
        for row in rows
        if row["promptVersion"] == "v1" and row["provider"] == "openai"
    }

    assert openai_v1["PRESENT"]["goldCount"] == 1
    assert openai_v1["PRESENT"]["locatedCount"] == 1
    assert openai_v1["PRESENT"]["correctAssertionCount"] == 0
    assert openai_v1["NEGATED"]["goldCount"] == 1
    assert openai_v1["NEGATED"]["correctAssertionCount"] == 1
    assert sum(row["goldCount"] for row in openai_v1.values()) == 2


def test_verification_gate_accepts_frozen_values_and_rejects_changes(
    tmp_path,
    monkeypatch,
):
    """The gate must stop when a reproduced frozen metric changes."""
    gold = dialogue([finding("dyspnea", "PRESENT")])
    prediction = stored_prediction([item("dyspnea")])
    row = score_dialogue(gold, prediction)
    summary = aggregate([row])
    frozen = {
        "providers": {
            provider: {
                "conceptF1": summary["conceptF1"],
                "assertionAwareF1": summary["assertionAwareF1"],
            }
            for provider in supplementary_analysis.PROVIDERS
        }
    }
    (tmp_path / "evaluation.json").write_text(json.dumps(frozen))
    monkeypatch.setattr(supplementary_analysis, "RESULTS_DIR", tmp_path)
    scored_rows = {
        "v1": {
            provider: [row]
            for provider in supplementary_analysis.PROVIDERS
        }
    }

    verified = verify_frozen_results(scored_rows)
    assert verified["openai"]["conceptF1"] == pytest.approx(1.0)

    frozen["providers"]["openai"]["conceptF1"] = 0.5
    (tmp_path / "evaluation.json").write_text(json.dumps(frozen))

    with pytest.raises(RuntimeError, match="Frozen verification failed"):
        verify_frozen_results(scored_rows)
