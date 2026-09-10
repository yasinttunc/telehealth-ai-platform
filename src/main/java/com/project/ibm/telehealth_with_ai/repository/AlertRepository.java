package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.Alert;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Alert records and Doctor queries limited by clinic visibility. */
public interface AlertRepository extends JpaRepository<Alert, Long> {

    List<Alert> findAllByOrderByCreatedAtDesc();

    /** Finds the existing window alert when the detector runs again. */
    Optional<Alert> findByClinicClinicIdAndSymptomCodeAndWindowStartAndWindowEndAndDetectorVersion(
            Long clinicId,
            String symptomCode,
            Instant windowStart,
            Instant windowEnd,
            String detectorVersion
    );

    /** A Doctor sees alerts only for clinics where they have a consultation. */
    @Query("""
            SELECT DISTINCT a
            FROM Alert a
            WHERE EXISTS (
                SELECT c.consultationId
                FROM Consultation c
                WHERE c.clinic = a.clinic
                  AND c.clinician.userId = :doctorUserId
            )
            ORDER BY a.createdAt DESC
            """)
    List<Alert> findVisibleForDoctor(@Param("doctorUserId") Long doctorUserId);

    /** Applies the same Doctor clinic scope when a single alert is opened. */
    @Query("""
            SELECT a
            FROM Alert a
            WHERE a.alertId = :alertId
              AND EXISTS (
                  SELECT c.consultationId
                  FROM Consultation c
                  WHERE c.clinic = a.clinic
                    AND c.clinician.userId = :doctorUserId
              )
            """)
    Optional<Alert> findVisibleByIdForDoctor(
            @Param("alertId") Long alertId,
            @Param("doctorUserId") Long doctorUserId
    );
}