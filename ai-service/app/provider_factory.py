from app.openai_client import OpenAiExtractor
from app.providers import ExtractionProvider

def create_extractor() -> ExtractionProvider:
    # Keep provider construction in one place so the HTTP layer remains
    # independent of the external SDK.
    return OpenAiExtractor()
