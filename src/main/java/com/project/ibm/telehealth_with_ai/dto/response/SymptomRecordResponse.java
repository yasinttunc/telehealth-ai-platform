package com.project.ibm.telehealth_with_ai.dto.response;

import java.time.Instant;
import java.util.List;

/**
 * Returns the structured symptom extraction result linked to a consultation.
 */
public class SymptomRecordResponse {

    private Long symptomRecordId;
    private Long consultationId;
    private String modelName;
    private String promptVersion;
    private List<SymptomItem> symptoms;
    private Instant createdAt;

    public Long getSymptomRecordId() {
        return symptomRecordId;
    }

    public void setSymptomRecordId(Long symptomRecordId) {
        this.symptomRecordId = symptomRecordId;
    }

    public Long getConsultationId() {
        return consultationId;
    }

    public void setConsultationId(Long consultationId) {
        this.consultationId = consultationId;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public String getPromptVersion() {
        return promptVersion;
    }

    public void setPromptVersion(String promptVersion) {
        this.promptVersion = promptVersion;
    }

    public List<SymptomItem> getSymptoms() {
        return symptoms;
    }

    public void setSymptoms(List<SymptomItem> symptoms) {
        this.symptoms = symptoms;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
