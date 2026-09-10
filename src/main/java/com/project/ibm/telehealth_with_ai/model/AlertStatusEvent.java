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
import java.time.Instant;

/** Records one status transition in the alert workflow. */
@Entity
@Table(name = "alert_status_event")
public class AlertStatusEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "alert_status_event_id")
    private Long alertStatusEventId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "alert_id", nullable = false)
    private Alert alert;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", length = 30)
    private AlertStatus previousStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", nullable = false, length = 30)
    private AlertStatus newStatus;

    /** Null for detector events; the acting user for staff actions. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "changed_by")
    private AppUser changedBy;

    @Column(name = "system_generated", nullable = false)
    private boolean systemGenerated;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public Long getAlertStatusEventId() {
        return alertStatusEventId;
    }

    public void setAlertStatusEventId(Long alertStatusEventId) {
        this.alertStatusEventId = alertStatusEventId;
    }

    public Alert getAlert() {
        return alert;
    }

    public void setAlert(Alert alert) {
        this.alert = alert;
    }

    public AlertStatus getPreviousStatus() {
        return previousStatus;
    }

    public void setPreviousStatus(AlertStatus previousStatus) {
        this.previousStatus = previousStatus;
    }

    public AlertStatus getNewStatus() {
        return newStatus;
    }

    public void setNewStatus(AlertStatus newStatus) {
        this.newStatus = newStatus;
    }

    public AppUser getChangedBy() {
        return changedBy;
    }

    public void setChangedBy(AppUser changedBy) {
        this.changedBy = changedBy;
    }

    public boolean isSystemGenerated() {
        return systemGenerated;
    }

    public void setSystemGenerated(boolean systemGenerated) {
        this.systemGenerated = systemGenerated;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}