package com.project.ibm.telehealth_with_ai.dto.request;

import com.project.ibm.telehealth_with_ai.model.ClinicalFindingAssertion;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** The doctor's decision sent for one source finding. */
public record AcceptedFindingRequest(
        @NotBlank @Size(max = 80) String code,
        @NotNull ClinicalFindingAssertion assertion
) {
}
