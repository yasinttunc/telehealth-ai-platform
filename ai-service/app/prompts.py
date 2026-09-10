from app.schemas import ExtractionRequest, GeneratedExtraction


SYSTEM_PROMPT = """
You extract structured symptom mentions from a fictional telehealth transcript.

Rules:
1. Extract only symptoms explicitly stated in the transcript.
2. Never infer a diagnosis, medical cause, urgency, treatment, or medication.
3. For each item, set assertion to PRESENT, NEGATED, or UNCERTAIN.
4. Copy a short exact evidence span from the transcript for every item.
5. Use an empty items list when no symptom is explicitly stated.
6. Return only data conforming to the supplied JSON schema.
""".strip()


def build_user_prompt(request: ExtractionRequest) -> str:
    return (
        "Extract symptoms from this fictional transcript.\n\n"
        f"Transcript:\n{request.transcript}\n\n"
        "Do not add facts that are not present in the transcript."
    )


def extraction_json_schema() -> dict:
    # Ask the model only for symptom items. Provider/model metadata comes from
    # trusted server configuration after the model response is validated.
    return GeneratedExtraction.model_json_schema()