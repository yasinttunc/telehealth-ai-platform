package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.ExtractionJob;
import com.project.ibm.telehealth_with_ai.model.ExtractionJobStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * Database access for recoverable AI extraction jobs.
 */
public interface ExtractionJobRepository extends JpaRepository<ExtractionJob, Long> {

    /**
     * Lists all extraction attempts for one consultation, newest first.
     */
    List<ExtractionJob> findByConsultationConsultationIdOrderByCreatedAtDesc(
            Long consultationId
    );

    /**
     * Finds an existing active job for the same approved transcript revision.
     */
    Optional<ExtractionJob> findFirstByConsultationConsultationIdAndTranscriptRevisionAndStatusIn(
            Long consultationId,
            Integer transcriptRevision,
            Collection<ExtractionJobStatus> statuses
    );

}
