package com.project.ibm.telehealth_with_ai.dto.response;

import com.project.ibm.telehealth_with_ai.model.ConsultationStatus;
import com.project.ibm.telehealth_with_ai.model.TranscriptionStatus;
import java.time.Instant;

/**
 * Returns consultation data, including transcript state and linked patient/clinician identifiers.
 */
public class ConsultationResponse {

    private Long consultationId;
    private Long patientId;
    private String patientName;
    private Long clinicianId;
    private String clinicianUsername;
    private Long clinicId;
    private String clinicName;
    private Instant scheduledAt;
    private ConsultationStatus status;
    private Instant startedAt;
    private Instant endedAt;
    private String transcript;
    private TranscriptionStatus transcriptionStatus;
    private Instant transcriptionFinalizedAt;
    private Integer transcriptRevision;
    private Instant transcriptApprovedAt;
    private Long transcriptApprovedBy;
    private Integer transcriptApprovedRevision;

    public Long getConsultationId() {
        return consultationId;
    }

    public void setConsultationId(Long consultationId) {
        this.consultationId = consultationId;
    }

    public Long getPatientId() {
        return patientId;
    }

    public void setPatientId(Long patientId) {
        this.patientId = patientId;
    }

    public String getPatientName() {
        return patientName;
    }

    public void setPatientName(String patientName) {
        this.patientName = patientName;
    }

    public Long getClinicianId() {
        return clinicianId;
    }

    public void setClinicianId(Long clinicianId) {
        this.clinicianId = clinicianId;
    }

    public String getClinicianUsername() {
        return clinicianUsername;
    }

    public void setClinicianUsername(String clinicianUsername) {
        this.clinicianUsername = clinicianUsername;
    }

    public Long getClinicId() {
        return clinicId;
    }

    public void setClinicId(Long clinicId) {
        this.clinicId = clinicId;
    }

    public String getClinicName() {
        return clinicName;
    }

    public void setClinicName(String clinicName) {
        this.clinicName = clinicName;
    }

    public Instant getScheduledAt() {
        return scheduledAt;
    }

    public void setScheduledAt(Instant scheduledAt) {
        this.scheduledAt = scheduledAt;
    }

    public ConsultationStatus getStatus() {
        return status;
    }

    public void setStatus(ConsultationStatus status) {
        this.status = status;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getEndedAt() {
        return endedAt;
    }

    public void setEndedAt(Instant endedAt) {
        this.endedAt = endedAt;
    }

    public String getTranscript() {
        return transcript;
    }

    public void setTranscript(String transcript) {
        this.transcript = transcript;
    }

    public TranscriptionStatus getTranscriptionStatus() { return transcriptionStatus; }
    public void setTranscriptionStatus(TranscriptionStatus transcriptionStatus) { this.transcriptionStatus = transcriptionStatus; }
    public Instant getTranscriptionFinalizedAt() { return transcriptionFinalizedAt; }
    public void setTranscriptionFinalizedAt(Instant transcriptionFinalizedAt) { this.transcriptionFinalizedAt = transcriptionFinalizedAt; }
    public Integer getTranscriptRevision() { return transcriptRevision; }
    public void setTranscriptRevision(Integer transcriptRevision) { this.transcriptRevision = transcriptRevision; }
    public Instant getTranscriptApprovedAt() { return transcriptApprovedAt; }
    public void setTranscriptApprovedAt(Instant transcriptApprovedAt) { this.transcriptApprovedAt = transcriptApprovedAt; }
    public Long getTranscriptApprovedBy() { return transcriptApprovedBy; }
    public void setTranscriptApprovedBy(Long transcriptApprovedBy) { this.transcriptApprovedBy = transcriptApprovedBy; }
    public Integer getTranscriptApprovedRevision() { return transcriptApprovedRevision; }
    public void setTranscriptApprovedRevision(Integer transcriptApprovedRevision) { this.transcriptApprovedRevision = transcriptApprovedRevision; }
}
