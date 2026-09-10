package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.model.Alert;
import com.project.ibm.telehealth_with_ai.repository.AlertEvidenceRepository;
import com.project.ibm.telehealth_with_ai.repository.AlertRepository;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Checks the alert detector with controlled database data.
 *
 * These tests validate the implementation, not real outbreak detection.
 * The detector uses:
 *
 * baseline = consultations in the previous 28 days / 4
 * score = observed consultations / max(baseline, 1)
 */
@SpringBootTest
@Transactional
class AlertDetectorScenarioTest {

    private static final Long CLINIC_ONE = 1L;

    @Autowired
    private AlertService alertService;

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private AlertEvidenceRepository evidenceRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** Three current cases against five baseline cases score 2.40. */
    @Test
    void belowThresholdDoesNotCreateAlert() {
        String code = "scenario.below.threshold";
        seedBaseline(code, 5);
        seedObserved(code, 3);

        alertService.detectForClinic(CLINIC_ONE);

        assertEquals(0, alertsFor(code).size());
    }

    /** Five current cases against eight baseline cases score exactly 2.50. */
    @Test
    void exactThresholdCreatesAlert() {
        String code = "scenario.exact.threshold";
        seedBaseline(code, 8);
        seedObserved(code, 5);

        alertService.detectForClinic(CLINIC_ONE);

        Alert alert = singleAlert(code);
        assertEquals(5, alert.getObservedCount());
        assertEquals(0, alert.getScore().compareTo(new BigDecimal("2.50")));
    }

    /** Eight current cases against four baseline cases clearly pass the rule. */
    @Test
    void aboveThresholdCreatesAlert() {
        String code = "scenario.above.threshold";
        seedBaseline(code, 4);
        seedObserved(code, 8);

        alertService.detectForClinic(CLINIC_ONE);

        Alert alert = singleAlert(code);
        assertEquals(0, alert.getScore().compareTo(new BigDecimal("8.00")));
    }

    /** No historical baseline uses a floor of one and avoids division by zero. */
    @Test
    void zeroBaselineUsesFloorOfOne() {
        String code = "scenario.zero.baseline";
        seedObserved(code, 3);

        alertService.detectForClinic(CLINIC_ONE);

        Alert alert = singleAlert(code);
        assertEquals(
                0,
                alert.getBaselineCount().compareTo(new BigDecimal("0.00"))
        );
        assertEquals(0, alert.getScore().compareTo(new BigDecimal("3.00")));
    }

    /** Only PRESENT findings count towards a current symptom trend. */
    @Test
    void nonPresentAssertionsAreIgnored() {
        String code = "scenario.non.present";
        seedBaseline(code, 4);
        seedObserved(code, 2);
        addConsultation(code, "NEGATED", 1);
        addConsultation(code, "UNCERTAIN", 1);
        addConsultation(code, "HISTORICAL", 1);

        alertService.detectForClinic(CLINIC_ONE);

        assertEquals(0, alertsFor(code).size());
    }

    /** Two reviews of one consultation still count as one consultation. */
    @Test
    void repeatedReviewCountsConsultationOnce() {
        String code = "scenario.repeated.review";
        seedBaseline(code, 4);
        Long consultationId = addConsultation(code, "PRESENT", 1);
        addReview(consultationId, code, "PRESENT", 1);
        addConsultation(code, "PRESENT", 1);
        addConsultation(code, "PRESENT", 1);

        alertService.detectForClinic(CLINIC_ONE);

        Alert alert = singleAlert(code);
        assertEquals(3, alert.getObservedCount());
        assertEquals(
                3,
                evidenceRepository.countByAlertAlertId(alert.getAlertId())
        );
    }

    /** Re-running the detector on the same day must not duplicate the alert. */
    @Test
    void repeatedDetectorRunKeepsOneAlert() {
        String code = "scenario.repeated.detector";
        seedBaseline(code, 4);
        seedObserved(code, 4);

        alertService.detectForClinic(CLINIC_ONE);
        alertService.detectForClinic(CLINIC_ONE);
        alertService.detectForClinic(CLINIC_ONE);

        assertEquals(1, alertsFor(code).size());
    }

    /** A new consultation updates the existing daily alert. */
    @Test
    void newConsultationUpdatesExistingAlert() {
        String code = "scenario.updated.alert";
        seedBaseline(code, 4);
        seedObserved(code, 5);
        alertService.detectForClinic(CLINIC_ONE);

        seedObserved(code, 1);
        alertService.detectForClinic(CLINIC_ONE);

        Alert alert = singleAlert(code);
        assertEquals(6, alert.getObservedCount());
    }

    /** A consultation eight days old belongs to baseline, not observation. */
    @Test
    void observationWindowBoundaryIsRespected() {
        String code = "scenario.window.boundary";
        seedBaseline(code, 4);
        seedObserved(code, 2);
        addConsultation(code, "PRESENT", 8);

        alertService.detectForClinic(CLINIC_ONE);

        assertEquals(0, alertsFor(code).size());
    }

    /** Consultations from a different clinic cannot affect clinic one. */
    @Test
    void clinicsAreIsolated() {
        String code = "scenario.clinic.isolation";
        Long otherClinic = secondClinicId();
        Assumptions.assumeTrue(otherClinic != null, "A second clinic is required");

        for (int index = 0; index < 5; index++) {
            addConsultationForClinic(otherClinic, code, "PRESENT", 1);
        }

        alertService.detectForClinic(CLINIC_ONE);

        assertEquals(0, alertsFor(code).size());
    }

    /** Every current contributing consultation becomes one evidence row. */
    @Test
    void evidenceCountMatchesObservedConsultations() {
        String code = "scenario.evidence.count";
        seedBaseline(code, 4);
        seedObserved(code, 4);

        alertService.detectForClinic(CLINIC_ONE);

        Alert alert = singleAlert(code);
        assertEquals(
                4,
                evidenceRepository.countByAlertAlertId(alert.getAlertId())
        );
    }

    /** Add consultations safely inside the 28-day baseline period. */
    private void seedBaseline(String code, int count) {
        for (int index = 0; index < count; index++) {
            addConsultation(code, "PRESENT", 10 + index);
        }
    }

    /** Add consultations safely inside the 7-day observation period. */
    private void seedObserved(String code, int count) {
        for (int index = 0; index < count; index++) {
            addConsultation(code, "PRESENT", 1);
        }
    }

    private Long addConsultation(String code, String assertion, int daysAgo) {
        return addConsultationForClinic(
                CLINIC_ONE,
                code,
                assertion,
                daysAgo
        );
    }

    /** Create one completed consultation and one accepted finding review. */
    private Long addConsultationForClinic(
            Long clinicId,
            String code,
            String assertion,
            int daysAgo
    ) {
        Long consultationId = jdbcTemplate.queryForObject(
                """
                INSERT INTO consultation (
                    patient_id, clinician_id, clinic_id, scheduled_at, status
                ) VALUES (1, 2, ?, ?, 'COMPLETED')
                RETURNING consultation_id
                """,
                Long.class,
                clinicId,
                Timestamp.from(Instant.now().minus(daysAgo, ChronoUnit.DAYS))
        );

        addReview(consultationId, code, assertion, daysAgo);
        return consultationId;
    }

    /** Add one reviewed finding to an existing consultation. */
    private void addReview(
            Long consultationId,
            String code,
            String assertion,
            int daysAgo
    ) {
        Instant reviewTime = Instant.now().minus(daysAgo, ChronoUnit.DAYS);
        Long symptomRecordId = jdbcTemplate.queryForObject(
                """
                INSERT INTO symptom_record (
                    consultation_id, symptoms, model_name, prompt_version,
                    created_at, transcript_revision
                ) VALUES (?, '[]'::jsonb, 'scenario-test', 'v1', ?, 0)
                RETURNING symptom_record_id
                """,
                Long.class,
                consultationId,
                Timestamp.from(reviewTime)
        );

        String findings = """
                [{"code":"%s","displayName":"%s","assertion":"%s"}]
                """.formatted(code, code, assertion);

        jdbcTemplate.update(
                """
                INSERT INTO finding_review (
                    symptom_record_id, consultation_id, accepted_findings,
                    reviewed_by, reviewed_at, updated_at
                ) VALUES (?, ?, CAST(? AS jsonb), 2, ?, ?)
                """,
                symptomRecordId,
                consultationId,
                findings,
                Timestamp.from(reviewTime),
                Timestamp.from(reviewTime)
        );
    }

    private List<Alert> alertsFor(String code) {
        return alertRepository.findAll().stream()
                .filter(alert -> code.equals(alert.getSymptomCode()))
                .toList();
    }

    private Alert singleAlert(String code) {
        List<Alert> alerts = alertsFor(code);
        assertEquals(1, alerts.size());
        return alerts.getFirst();
    }

    /** Return a clinic other than clinic one, when the seed data has one. */
    private Long secondClinicId() {
        List<Long> ids = jdbcTemplate.queryForList(
                """
                SELECT clinic_id
                FROM clinic
                WHERE clinic_id <> 1
                ORDER BY clinic_id
                LIMIT 1
                """,
                Long.class
        );
        return ids.isEmpty() ? null : ids.getFirst();
    }
}
