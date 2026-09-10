package com.project.ibm.telehealth_with_ai.model;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * Immutable final ASR segment. This records text provenance, not audio media.
 */
@Entity
@Table(
        name = "transcript_segment",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_transcript_segment_source",
                columnNames = {"consultation_id", "room_session_id", "source_segment_id"}
        )
)
public class TranscriptSegment {


    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long transcriptSegmentId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "consultation_id",nullable = false)
    private Consultation consultation;


    /**
     * Distinguishes a new worker session or reconnect from an earlier call attempt. It must not contain a username.
     */
    @Column(name = "room_session_id", nullable = false, length = 80)
    private String roomSessionId;

    /**
     * Makes retries idempotent inside one room session. The same final Deepgram event cannot create two rows.
     */
    @Column(name = "source_segment_id", nullable = false, length = 120)
    private String sourceSegmentId;

    /**
     * Stores the non-identifying signed LiveKit identity, such as user-7, that Spring uses to derive the role.
     */
    @Column(name = "participant_identity", nullable = false, length = 80)
    private String participantIdentity;

    /**
     * DOCTOR, PATIENT, or UNKNOWN; Spring derives it from the consultation relationship instead of trusting a worker-supplied role.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "speaker_role", nullable = false, length = 20)
    private SpeakerRole speakerRole;

    /**
     * Keeps an optional ASR/source label such as track-doctor for debugging; it is not a verified identity.
     */
    @Column(name = "speaker_label", length = 80)
    private String speakerLabel;

    /**
     * KEEPS THE TRANSCRIPTION TEXT
     */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String text;


    @Column(name = "start_ms", nullable = false)
    private Long startMs;


    @Column(name = "end_ms", nullable = false)
    private Long endMs;

    /**
     * A database guardrail: do not save interim captions.
     */
    @Column(name = "is_final", nullable = false)
    private boolean finalSegment = true;

    /**
     * Records that the text came from Deepgram rather than a manual edit.
     */
    @Column(nullable = false, length = 30)
    private String source = "DEEPGRAM";

    /**
     * Keeps a record of instant for transcription creation.
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "session_started_at", nullable = false)
    private Instant sessionStartedAt;

    public Instant getSessionStartedAt() {
        return sessionStartedAt;
    }

    public void setSessionStartedAt(Instant sessionStartedAt) {
        this.sessionStartedAt = sessionStartedAt;
    }

    public Long getTranscriptSegmentId() {
        return transcriptSegmentId;
    }

    public void setTranscriptSegmentId(Long transcriptSegmentId) {
        this.transcriptSegmentId = transcriptSegmentId;
    }

    public Consultation getConsultation() {
        return consultation;
    }

    public void setConsultation(Consultation consultation) {
        this.consultation = consultation;
    }

    public String getRoomSessionId() {
        return roomSessionId;
    }

    public void setRoomSessionId(String roomSessionId) {
        this.roomSessionId = roomSessionId;
    }

    public String getSourceSegmentId() {
        return sourceSegmentId;
    }

    public void setSourceSegmentId(String sourceSegmentId) {
        this.sourceSegmentId = sourceSegmentId;
    }

    public String getParticipantIdentity() {
        return participantIdentity;
    }

    public void setParticipantIdentity(String participantIdentity) {
        this.participantIdentity = participantIdentity;
    }

    public SpeakerRole getSpeakerRole() {
        return speakerRole;
    }

    public void setSpeakerRole(SpeakerRole speakerRole) {
        this.speakerRole = speakerRole;
    }

    public String getSpeakerLabel() {
        return speakerLabel;
    }

    public void setSpeakerLabel(String speakerLabel) {
        this.speakerLabel = speakerLabel;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public Long getStartMs() {
        return startMs;
    }

    public void setStartMs(Long startMs) {
        this.startMs = startMs;
    }

    public Long getEndMs() {
        return endMs;
    }

    public void setEndMs(Long endMs) {
        this.endMs = endMs;
    }

    public boolean isFinalSegment() {
        return finalSegment;
    }

    public void setFinalSegment(boolean finalSegment) {
        this.finalSegment = finalSegment;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
