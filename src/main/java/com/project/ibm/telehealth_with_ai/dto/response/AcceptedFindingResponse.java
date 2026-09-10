package com.project.ibm.telehealth_with_ai.dto.response;

import com.project.ibm.telehealth_with_ai.model.ClinicalFindingAssertion;

/** A backend-validated finding with its display name added. */
public record AcceptedFindingResponse(
        String code,
        String displayName,
        ClinicalFindingAssertion assertion
) {
}