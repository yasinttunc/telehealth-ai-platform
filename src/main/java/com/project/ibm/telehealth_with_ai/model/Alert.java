package com.project.ibm.telehealth_with_ai.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * Represents the current state of a trend signal detected in one clinic.
 *
 * This entity does not store a diagnosis. It stores the counting window, score,
 * and workflow status so that the reason for the alert can be explained.
 */
@Entity
@Table(name = "alert")
public class Alert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "alert_id")
    private Long alertId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinic_id", nullable = false)
    private Clinic clinic;

    /** Stable code used for grouping. The user sees symptomName instead. */
    @Column(name = "symptom_code", nullable = false, length = 80)
    private String symptomCode;

    @Column(name = "symptom_name", nullable = false, length = 100)
    private String symptomName;

    @Column(name = "window_start", nullable = false)
    private Instant windowStart;

    @Column(name = "window_end", nullable = false)
    private Instant windowEnd;

    @Column(name = "observed_count", nullable = false)
    private Integer observedCount;

    @Column(name = "baseline_count", nullable = false, precision = 8, scale = 2)
    private BigDecimal baselineCount;

    @Column(name = "score", nullable = false, precision = 8, scale = 2)
    private BigDecimal score;

    @Column(name = "threshold", nullable = false, precision = 8, scale = 2)
    private BigDecimal threshold;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private AlertStatus status;

    /** Identifies the rule version that created the alert. */
    @Column(name = "detector_version", nullable = false, length = 50)
    private String detectorVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "last_evaluated_at")
    private Instant lastEvaluatedAt;

    /** Prevents concurrent updates to the same alert from silently overwriting each other. */
    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    public Long getAlertId() {
        return alertId;
    }

    public void setAlertId(Long alertId) {
        this.alertId = alertId;
    }

    public Clinic getClinic() {
        return clinic;
    }

    public void setClinic(Clinic clinic) {
        this.clinic = clinic;
    }

    public String getSymptomCode() {
        return symptomCode;
    }

    public void setSymptomCode(String symptomCode) {
        this.symptomCode = symptomCode;
    }

    public String getSymptomName() {
        return symptomName;
    }

    public void setSymptomName(String symptomName) {
        this.symptomName = symptomName;
    }

    public Instant getWindowStart() {
        return windowStart;
    }

    public void setWindowStart(Instant windowStart) {
        this.windowStart = windowStart;
    }

    public Instant getWindowEnd() {
        return windowEnd;
    }

    public void setWindowEnd(Instant windowEnd) {
        this.windowEnd = windowEnd;
    }

    public Integer getObservedCount() {
        return observedCount;
    }

    public void setObservedCount(Integer observedCount) {
        this.observedCount = observedCount;
    }

    public BigDecimal getBaselineCount() {
        return baselineCount;
    }

    public void setBaselineCount(BigDecimal baselineCount) {
        this.baselineCount = baselineCount;
    }

    public BigDecimal getScore() {
        return score;
    }

    public void setScore(BigDecimal score) {
        this.score = score;
    }

    public BigDecimal getThreshold() {
        return threshold;
    }

    public void setThreshold(BigDecimal threshold) {
        this.threshold = threshold;
    }

    public AlertStatus getStatus() {
        return status;
    }

    public void setStatus(AlertStatus status) {
        this.status = status;
    }

    public String getDetectorVersion() {
        return detectorVersion;
    }

    public void setDetectorVersion(String detectorVersion) {
        this.detectorVersion = detectorVersion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getLastEvaluatedAt() {
        return lastEvaluatedAt;
    }

    public void setLastEvaluatedAt(Instant lastEvaluatedAt) {
        this.lastEvaluatedAt = lastEvaluatedAt;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }
}