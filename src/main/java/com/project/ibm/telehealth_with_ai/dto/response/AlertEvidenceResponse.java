package com.project.ibm.telehealth_with_ai.dto.response;

import java.time.Instant;

/** One frozen alert evidence record displayed to the user. */
public record AlertEvidenceResponse(
        Long alertEvidenceId,
        Long consultationId,
        Long findingReviewId,
        String symptomCode,
        AcceptedFindingResponse finding,
        Instant includedAt
) {
}