package com.project.ibm.telehealth_with_ai.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Identifies the worker session requesting a transcription state transition.
 */
public record TranscriptionSessionRequest(
        @NotBlank
        @Size(max = 80)
        String roomSessionId
) {
}