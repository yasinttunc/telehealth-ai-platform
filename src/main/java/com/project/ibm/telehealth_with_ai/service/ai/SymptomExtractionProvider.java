package com.project.ibm.telehealth_with_ai.service.ai;

/**
 * Contract implemented by every symptom-extraction source.
 * The caller has already performed authorisation and transcript checks.
 */
public interface SymptomExtractionProvider {

    AiExtractionResult extract(Long consultationId, String transcript, String promptVersion);

}
