package com.project.ibm.telehealth_with_ai.model;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "consultation")
public class Consultation {
    public Consultation() {}

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long consultationId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinician_id", nullable = false)
    private AppUser clinician;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinic_id", nullable = false)
    private Clinic clinic;

    @Column(name="scheduled_at", nullable = false)
    private Instant scheduledAt;

    @Enumerated(EnumType.STRING)
    @Column(name="status", nullable = false, length = 30)
    private ConsultationStatus status;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Column(name = "transcript", columnDefinition = "TEXT")
    private String transcript;

    @Enumerated(EnumType.STRING)
    @Column(name="transcription_status", nullable = false, length = 20)
    private TranscriptionStatus transcriptionStatus = TranscriptionStatus.NOT_STARTED;

    @Column(name="transcription_finalized_at")
    private Instant transcriptionFinalizedAt;

    @Column(name = "transcript_revision", nullable = false)
    private Integer transcriptRevision= 0;

    @Column(name = "transcript_approved_at")
    private Instant transcriptApprovedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name="transcript_approved_by")
    private AppUser transcriptApprovedBy;

    @Column(name = "transcript_approved_revision")
    private Integer transcriptApprovedRevision;

    /**
     * Worker session currently authorised to append transcript segments.
     *
     * A segment carrying a different session id belongs to a stale worker and
     * is rejected. Without this check two concurrently running workers would
     * both write, and because room_session_id is part of the segment unique
     * key their rows would NOT collide - the transcript would silently double.
     */
    @Column(name = "room_session_id", length = 80)
    private String roomSessionId;

    @Column(name = "transcription_session_started_at")
    private Instant transcriptionSessionStartedAt;

    @Column(name = "transcription_last_seen_at")
    private Instant transcriptionLastSeenAt;

    public String getRoomSessionId() {
        return roomSessionId;
    }

    public void setRoomSessionId(String roomSessionId) {
        this.roomSessionId = roomSessionId;
    }


    public Instant getTranscriptionSessionStartedAt() {
        return transcriptionSessionStartedAt;
    }

    public void setTranscriptionSessionStartedAt(Instant transcriptionSessionStartedAt) {
        this.transcriptionSessionStartedAt = transcriptionSessionStartedAt;
    }

    public Instant getTranscriptionLastSeenAt() {
        return transcriptionLastSeenAt;
    }

    public void setTranscriptionLastSeenAt(Instant transcriptionLastSeenAt) {
        this.transcriptionLastSeenAt = transcriptionLastSeenAt;
    }

    public Long getConsultationId() {
        return consultationId;
    }

    public void setConsultationId(Long consultationId) {
        this.consultationId = consultationId;
    }

    public Patient getPatient() {
        return patient;
    }

    public void setPatient(Patient patient) {
        this.patient = patient;
    }

    public AppUser getClinician() {
        return clinician;
    }

    public void setClinician(AppUser clinician) {
        this.clinician = clinician;
    }

    public Clinic getClinic() {
        return clinic;
    }

    public void setClinic(Clinic clinic) {
        this.clinic = clinic;
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

    public TranscriptionStatus getTranscriptionStatus() {
        return transcriptionStatus;
    }

    public void setTranscriptionStatus(TranscriptionStatus transcriptionStatus) {
        this.transcriptionStatus = transcriptionStatus;
    }

    public Instant getTranscriptionFinalizedAt() {
        return transcriptionFinalizedAt;
    }

    public void setTranscriptionFinalizedAt(Instant transcriptionFinalizedAt) {
        this.transcriptionFinalizedAt = transcriptionFinalizedAt;
    }

    public Integer getTranscriptRevision() {
        return transcriptRevision;
    }

    public void setTranscriptRevision(Integer transcriptRevision) {
        this.transcriptRevision = transcriptRevision;
    }

    public Instant getTranscriptApprovedAt() {
        return transcriptApprovedAt;
    }

    public void setTranscriptApprovedAt(Instant transcriptApprovedAt) {
        this.transcriptApprovedAt = transcriptApprovedAt;
    }

    public AppUser getTranscriptApprovedBy() {
        return transcriptApprovedBy;
    }

    public void setTranscriptApprovedBy(AppUser transcriptApprovedBy) {
        this.transcriptApprovedBy = transcriptApprovedBy;
    }

    public Integer getTranscriptApprovedRevision() {
        return transcriptApprovedRevision;
    }

    public void setTranscriptApprovedRevision(Integer transcriptApprovedRevision) {
        this.transcriptApprovedRevision = transcriptApprovedRevision;
    }
}
