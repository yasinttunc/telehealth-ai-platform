package com.project.ibm.telehealth_with_ai.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * Carries transcript text captured from a consultation before symptom extraction.
 */
public class UpdateTranscriptRequest {

    @NotBlank(message = "Transcript is required")
    private String transcript;

    public String getTranscript() {
        return transcript;
    }

    public void setTranscript(String transcript) {
        this.transcript = transcript;
    }
}
