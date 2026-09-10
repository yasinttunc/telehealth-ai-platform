package com.project.ibm.telehealth_with_ai.model;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * Persistent background job for extracting symptoms from one approved transcript revision.
 */
@Entity
@Table(name = "extraction_job")
public class ExtractionJob {

    @Id
    @GeneratedValue(strategy =GenerationType.IDENTITY)
    private Long extractionJobId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "consultation_id", nullable = false)
    private Consultation consultation;

    @Column(name = "transcript_revision", nullable = false)
    private Integer transcriptRevision;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ExtractionJobStatus status = ExtractionJobStatus.PENDING;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requested_by", nullable = false)
    private AppUser requestedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "result_symptom_record_id")
    private SymptomRecord resultSymptomRecord;

    @Column(name = "error_message", length = 300)
    private String errorMessage;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    public Long getExtractionJobId() {
        return extractionJobId;
    }

    public void setExtractionJobId(Long extractionJobId) {
        this.extractionJobId = extractionJobId;
    }

    public Consultation getConsultation() {
        return consultation;
    }

    public void setConsultation(Consultation consultation) {
        this.consultation = consultation;
    }

    public Integer getTranscriptRevision() {
        return transcriptRevision;
    }

    public void setTranscriptRevision(Integer transcriptRevision) {
        this.transcriptRevision = transcriptRevision;
    }

    public ExtractionJobStatus getStatus() {
        return status;
    }

    public void setStatus(ExtractionJobStatus status) {
        this.status = status;
    }

    public AppUser getRequestedBy() {
        return requestedBy;
    }

    public void setRequestedBy(AppUser requestedBy) {
        this.requestedBy = requestedBy;
    }

    public SymptomRecord getResultSymptomRecord() {
        return resultSymptomRecord;
    }

    public void setResultSymptomRecord(SymptomRecord resultSymptomRecord) {
        this.resultSymptomRecord = resultSymptomRecord;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }
}
