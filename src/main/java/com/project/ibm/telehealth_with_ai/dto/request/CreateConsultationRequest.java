package com.project.ibm.telehealth_with_ai.dto.request;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

/**
 * Carries only the client-editable values required to schedule a consultation.
 * The service always creates it with SCHEDULED status.
 */
public class CreateConsultationRequest {

    @NotNull(message = "Patient ID is required")
    private Long patientId;

    @NotNull(message = "Clinician user ID is required")
    private Long clinicianId;

    @NotNull(message = "Clinic ID is required")
    private Long clinicId;

    @NotNull(message = "Scheduled time is required")
    @Future(message = "Scheduled time must be in the future")
    private Instant scheduledAt;

    public Long getPatientId() {
        return patientId;
    }

    public void setPatientId(Long patientId) {
        this.patientId = patientId;
    }

    public Long getClinicianId() {
        return clinicianId;
    }

    public void setClinicianId(Long clinicianId) {
        this.clinicianId = clinicianId;
    }

    public Long getClinicId() {
        return clinicId;
    }

    public void setClinicId(Long clinicId) {
        this.clinicId = clinicId;
    }

    public Instant getScheduledAt() {
        return scheduledAt;
    }

    public void setScheduledAt(Instant scheduledAt) {
        this.scheduledAt = scheduledAt;
    }
}