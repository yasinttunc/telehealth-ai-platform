package com.project.ibm.telehealth_with_ai.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** The complete list of accepted findings for one symptom record. */
public record UpsertFindingReviewRequest(
        @NotNull
        @Size(max = 100)
        List<@Valid AcceptedFindingRequest> acceptedFindings
) {
}
