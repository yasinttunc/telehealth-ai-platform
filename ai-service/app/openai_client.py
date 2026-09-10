import os

from openai import OpenAI

from app.prompts import SYSTEM_PROMPT, build_user_prompt
from app.providers import AiProviderConfigurationError, AiProviderError
from app.schemas import ExtractionRequest, ExtractionResponse, GeneratedExtraction


class OpenAiExtractor:
    """Extract structured symptom mentions with the configured OpenAI model."""

    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY")
        model_name = os.getenv("OPENAI_MODEL")
        missing_settings = [
            name
            for name, value in (("OPENAI_API_KEY", api_key), ("OPENAI_MODEL", model_name))
            if not value
        ]
        if missing_settings:
            raise AiProviderConfigurationError(
                "Missing AI configuration: "
                + ", ".join(missing_settings)
                + ". Add them to ai-service/.env; never place them in frontend code."
            )

        self.model_name = model_name
        self.prompt_version = os.getenv("PROMPT_VERSION", "symptom-extraction-v1")
        self.client = OpenAI(
            api_key=api_key,
            timeout=float(os.getenv("OPENAI_TIMEOUT_SECONDS", "45")),
        )

    def extract(self, request: ExtractionRequest) -> ExtractionResponse:
        try:
            # openai==1.82.0 exposes Pydantic structured parsing via beta.
            completion = self.client.beta.chat.completions.parse(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": build_user_prompt(request)},
                ],
                response_format=GeneratedExtraction,
                # GPT-5.4 mini does not accept a custom temperature. Minimal
                # reasoning is sufficient for this narrow extraction task.
                reasoning_effort="minimal",
                # Prevent an extraction response from using an excessive number
                # of output tokens, even if the prompt or model misbehaves.
                max_completion_tokens=1000,
                # Do not retain this synthetic transcript request as API state.
                store=False,
            )
        except Exception as exception:
            raise AiProviderError("The GPT extraction provider was unavailable") from exception

        parsed = completion.choices[0].message.parsed
        if parsed is None:
            raise AiProviderError("GPT returned no structured extraction")

        return ExtractionResponse(
            items=parsed.items,
            provider="openai",
            modelName=self.model_name,
            promptVersion=self.prompt_version,
        )
