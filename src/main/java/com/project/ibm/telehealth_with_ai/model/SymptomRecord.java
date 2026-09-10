package com.project.ibm.telehealth_with_ai.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * Immutable snapshot of structured symptoms extracted from one consultation.
 * The symptoms field contains JSON stored in PostgreSQL JSONB.
 */
@Entity
@Table(name = "symptom_record")
public class SymptomRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long symptomRecordId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "consultation_id", nullable = false)
    private Consultation consultation;

    @Column(nullable = false, columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String symptoms = "[]";

    @Column(name = "model_name", nullable = false, length = 100)
    private String modelName = "mock-extractor";

    @Column(name = "prompt_version", nullable = false, length = 50)
    private String promptVersion = "v1";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "transcript_revision", nullable = false)
    private Integer transcriptRevision;

    public Integer getTranscriptRevision() {
        return transcriptRevision;
    }

    public void setTranscriptRevision(Integer transcriptRevision) {
        this.transcriptRevision = transcriptRevision;
    }

    public Long getSymptomRecordId() {
        return symptomRecordId;
    }

    public void setSymptomRecordId(Long symptomRecordId) {
        this.symptomRecordId = symptomRecordId;
    }

    public Consultation getConsultation() {
        return consultation;
    }

    public void setConsultation(Consultation consultation) {
        this.consultation = consultation;
    }

    public String getSymptoms() {
        return symptoms;
    }

    public void setSymptoms(String symptoms) {
        this.symptoms = symptoms;
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

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
