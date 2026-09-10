package com.project.ibm.telehealth_with_ai.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "finding_review")
public class FindingReview {

    @Id
    @GeneratedValue(strategy =GenerationType.IDENTITY)
    private Long findingReviewId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "symptom_record_id", nullable = false, unique = true)
    private SymptomRecord symptomRecord;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "consultation_id", nullable = false)
    private Consultation consultation;

    /**
     * Accepted findings as a JSON array of {code, displayName, assertion}.
     * Held as a String and mapped by Hibernate's JSON type: the application
     * never queries inside it from Java, only writes it whole and reads it
     * whole. The detector expands it in SQL instead.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "accepted_findings", nullable = false, columnDefinition = "jsonb")
    private String acceptedFindings = "[]";

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reviewed_by", nullable = false)
    private AppUser reviewedBy;

    @Column(name = "reviewed_at", nullable = false, updatable = false)
    private Instant reviewedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getFindingReviewId() {
        return findingReviewId;
    }

    public void setFindingReviewId(Long findingReviewId) {
        this.findingReviewId = findingReviewId;
    }

    public SymptomRecord getSymptomRecord() {
        return symptomRecord;
    }

    public void setSymptomRecord(SymptomRecord symptomRecord) {
        this.symptomRecord = symptomRecord;
    }

    public Consultation getConsultation() {
        return consultation;
    }

    public void setConsultation(Consultation consultation) {
        this.consultation = consultation;
    }

    public String getAcceptedFindings() {
        return acceptedFindings;
    }

    public void setAcceptedFindings(String acceptedFindings) {
        this.acceptedFindings = acceptedFindings;
    }

    public AppUser getReviewedBy() {
        return reviewedBy;
    }

    public void setReviewedBy(AppUser reviewedBy) {
        this.reviewedBy = reviewedBy;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(Instant reviewedAt) {
        this.reviewedAt = reviewedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
