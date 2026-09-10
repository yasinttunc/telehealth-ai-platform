package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.AlertEvidence;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Reads an alert's source consultation evidence and prevents duplicate evidence.
 */
public interface AlertEvidenceRepository extends JpaRepository<AlertEvidence, Long> {

    List<AlertEvidence> findByAlertAlertIdOrderByIncludedAtAsc(Long alertId);

    long countByAlertAlertId(Long alertId);

    /** Avoids adding the same review and symptom evidence when the detector runs again. */
    boolean existsByAlertAlertIdAndFindingReviewFindingReviewIdAndSymptomCode(
            Long alertId,
            Long findingReviewId,
            String symptomCode
    );
}
