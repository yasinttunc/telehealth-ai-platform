import pytest
from pydantic import ValidationError

from app.schemas import ExtractionRequest, SymptomItem


def test_request_accepts_camel_case_contract() -> None:
    request = ExtractionRequest.model_validate(
        {
            "consultationId": 5,
            "transcript": "The patient reports a cough.",
            "promptVersion": "symptom-extraction-v1",
        }
    )

    assert request.consultation_id == 5


def test_response_item_rejects_an_unknown_assertion() -> None:
    with pytest.raises(ValidationError):
        SymptomItem(
            name="cough",
            assertion="LIKELY",
            confidence=0.8,
            evidence="reports a cough",
        )