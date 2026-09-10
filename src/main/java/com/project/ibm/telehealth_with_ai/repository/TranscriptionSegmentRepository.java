package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.TranscriptSegment;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Provides append-only access to final ASR transcript segments.
 */
public interface TranscriptionSegmentRepository
        extends JpaRepository<TranscriptSegment, Long> {

    /**
     * Finds a segment by the same three-column key enforced by PostgreSQL.
     */
    Optional<TranscriptSegment>
    findByConsultationConsultationIdAndRoomSessionIdAndSourceSegmentId(
            Long consultationId,
            String roomSessionId,
            String sourceSegmentId
    );

    /**
     * Inserts one final segment atomically or does nothing when it already exists.
     *
     * <p>ON CONFLICT closes the race where two concurrent retries both observe
     * no row and then attempt the same INSERT.</p>
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            INSERT INTO transcript_segment (
                consultation_id,
                room_session_id,
                source_segment_id,
                participant_identity,
                speaker_role,
                speaker_label,
                text,
                start_ms,
                end_ms,
                is_final,
                source,
                session_started_at,
                created_at
            ) VALUES (
                :consultationId,
                :roomSessionId,
                :sourceSegmentId,
                :participantIdentity,
                :speakerRole,
                :speakerLabel,
                :text,
                :startMs,
                :endMs,
                TRUE,
                'DEEPGRAM',
                :sessionStartedAt,
                now()
            )
            ON CONFLICT ON CONSTRAINT uq_transcript_segment_source
            DO NOTHING
            """, nativeQuery = true)
    int insertFinalSegmentIfAbsent(
            @Param("consultationId") Long consultationId,
            @Param("roomSessionId") String roomSessionId,
            @Param("sourceSegmentId") String sourceSegmentId,
            @Param("participantIdentity") String participantIdentity,
            @Param("speakerRole") String speakerRole,
            @Param("speakerLabel") String speakerLabel,
            @Param("text") String text,
            @Param("startMs") Long startMs,
            @Param("endMs") Long endMs,
            @Param("sessionStartedAt") Instant sessionStartedAt
    );

    /**
     * Lists final segments across worker restarts in stable timeline order.
     */
    @Query("""
            SELECT segment
            FROM TranscriptSegment segment
            WHERE segment.consultation.consultationId = :consultationId
            ORDER BY segment.sessionStartedAt ASC,
                     segment.startMs ASC,
                     segment.transcriptSegmentId ASC
            """)
    List<TranscriptSegment> findOrderedByConsultation(
            @Param("consultationId") Long consultationId
    );
}