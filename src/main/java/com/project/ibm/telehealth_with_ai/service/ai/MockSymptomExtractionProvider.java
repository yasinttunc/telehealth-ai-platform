package com.project.ibm.telehealth_with_ai.service.ai;

import com.project.ibm.telehealth_with_ai.service.MockSymptomExtractionService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Service;

/** Uses the existing deterministic mock for tests and offline demonstrations. */
@Service
@ConditionalOnProperty(
        prefix = "app.ai",
        name="provider",
        havingValue = "mock",
        matchIfMissing = true
        )
public class MockSymptomExtractionProvider implements SymptomExtractionProvider {
    private final MockSymptomExtractionService mockSymptomExtractionService;

    public MockSymptomExtractionProvider(MockSymptomExtractionService mockSymptomExtractionService) {
        this.mockSymptomExtractionService = mockSymptomExtractionService;
    }

    @Override
    public AiExtractionResult extract(Long consultationId, String transcript, String promptVersion) {
        return new AiExtractionResult(
                mockSymptomExtractionService.extract(transcript),
                "mock-extractor",
                promptVersion
        );

    }

}
