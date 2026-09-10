package com.project.ibm.telehealth_with_ai.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ApproveTranscriptRequest(
        @NotBlank
        @Size(max =12_000)
        String transcript,

        @NotNull
        @Min(0)
        Integer expectedRevision
) {
}
