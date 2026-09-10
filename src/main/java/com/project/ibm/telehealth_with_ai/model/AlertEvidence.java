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
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * A single doctor-approved finding that contributed to an alert.
 * findingSnapshot is an evidence copy that does not change later.
 */
@Entity
@Table(name = "alert_evidence")
public class AlertEvidence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "alert_evidence_id")
    private Long alertEvidenceId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "alert_id", nullable = false)
    private Alert alert;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "finding_review_id", nullable = false)
    private FindingReview findingReview;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "consultation_id", nullable = false)
    private Consultation consultation;

    @Column(name = "symptom_code", nullable = false, length = 80)
    private String symptomCode;

    /** The accepted finding JSON object as it existed when the alert was created. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "finding_snapshot", nullable = false, columnDefinition = "jsonb")
    private String findingSnapshot;

    @Column(name = "included_at", nullable = false, updatable = false)
    private Instant includedAt;

    public Long getAlertEvidenceId() {
        return alertEvidenceId;
    }

    public void setAlertEvidenceId(Long alertEvidenceId) {
        this.alertEvidenceId = alertEvidenceId;
    }

    public Alert getAlert() {
        return alert;
    }

    public void setAlert(Alert alert) {
        this.alert = alert;
    }

    public FindingReview getFindingReview() {
        return findingReview;
    }

    public void setFindingReview(FindingReview findingReview) {
        this.findingReview = findingReview;
    }

    public Consultation getConsultation() {
        return consultation;
    }

    public void setConsultation(Consultation consultation) {
        this.consultation = consultation;
    }

    public String getSymptomCode() {
        return symptomCode;
    }

    public void setSymptomCode(String symptomCode) {
        this.symptomCode = symptomCode;
    }

    public String getFindingSnapshot() {
        return findingSnapshot;
    }

    public void setFindingSnapshot(String findingSnapshot) {
        this.findingSnapshot = findingSnapshot;
    }

    public Instant getIncludedAt() {
        return includedAt;
    }

    public void setIncludedAt(Instant includedAt) {
        this.includedAt = includedAt;
    }
}