package com.project.ibm.telehealth_with_ai.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * Carries a consultation transcript from Spring Boot to the AI extraction service.
 */
public class ExtractionRequest {

    @NotNull(message = "Consultation ID is required")
    private Long consultationId;

    @NotBlank(message = "Transcript is required")
    private String transcript;

    private String promptVersion = "v1";

    public Long getConsultationId() {
        return consultationId;
    }

    public void setConsultationId(Long consultationId) {
        this.consultationId = consultationId;
    }

    public String getTranscript() {
        return transcript;
    }

    public void setTranscript(String transcript) {
        this.transcript = transcript;
    }

    public String getPromptVersion() {
        return promptVersion;
    }

    public void setPromptVersion(String promptVersion) {
        this.promptVersion = promptVersion;
    }
}
