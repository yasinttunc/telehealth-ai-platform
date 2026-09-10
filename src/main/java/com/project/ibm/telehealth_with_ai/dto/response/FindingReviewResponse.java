package com.project.ibm.telehealth_with_ai.dto.response;

import java.time.Instant;
import java.util.List;

/** Record and reviewer information required by the finding review screen. */
public record FindingReviewResponse(
        Long findingReviewId,
        Long symptomRecordId,
        Long consultationId,
        List<AcceptedFindingResponse> acceptedFindings,
        Long reviewedBy,
        String reviewedByUsername,
        Instant reviewedAt,
        Instant updatedAt
) {
}