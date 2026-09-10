package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.model.Alert;
import com.project.ibm.telehealth_with_ai.repository.AlertEvidenceRepository;
import com.project.ibm.telehealth_with_ai.repository.AlertRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Verifies the detector against PostgreSQL JSONB and date-window queries. */
@SpringBootTest
@Transactional
class AlertDetectorIntegrationTest {

    private static final String TEST_CODE = "integration.test.signal";

    @Autowired
    private AlertService alertService;

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private AlertEvidenceRepository evidenceRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void detectorCountsPresentConsultationsAndDoesNotCreateDuplicates() {
        // Four baseline consultations produce a weekly baseline average of 1.
        for (int day = 10; day <= 13; day++) {
            addReviewedConsultation("PRESENT", day);
        }

        Long firstConsultation = addReviewedConsultation("PRESENT", 1);
        addAnotherReview(firstConsultation, "PRESENT", 1);
        addReviewedConsultation("PRESENT", 1);
        addReviewedConsultation("PRESENT", 1);

        // NEGATED is inside the observation window but must not be counted.
        addReviewedConsultation("NEGATED", 1);

        alertService.detectForClinic(1L);
        alertService.detectForClinic(1L);

        List<Alert> matchingAlerts = alertRepository.findAll().stream()
                .filter(alert -> TEST_CODE.equals(alert.getSymptomCode()))
                .toList();

        assertEquals(1, matchingAlerts.size());
        Alert alert = matchingAlerts.getFirst();
        assertEquals(3, alert.getObservedCount());
        assertEquals(0, alert.getBaselineCount().compareTo(new java.math.BigDecimal("1.00")));
        assertEquals(0, alert.getScore().compareTo(new java.math.BigDecimal("3.00")));

        // The duplicate review belongs to the same consultation, so evidence
        // and the observed count both remain consultation-based.
        assertEquals(3, evidenceRepository.countByAlertAlertId(alert.getAlertId()));
    }

    private Long addReviewedConsultation(String assertion, int daysAgo) {
        Long consultationId = jdbcTemplate.queryForObject(
                """
                INSERT INTO consultation (
                    patient_id, clinician_id, clinic_id, scheduled_at, status
                ) VALUES (1, 2, 1, ?, 'COMPLETED')
                RETURNING consultation_id
                """,
                Long.class,
                Timestamp.from(Instant.now().minus(daysAgo, ChronoUnit.DAYS))
        );
        addAnotherReview(consultationId, assertion, daysAgo);
        return consultationId;
    }

    private void addAnotherReview(
            Long consultationId,
            String assertion,
            int daysAgo
    ) {
        Long symptomRecordId = jdbcTemplate.queryForObject(
                """
                INSERT INTO symptom_record (
                    consultation_id, symptoms, model_name, prompt_version,
                    created_at, transcript_revision
                ) VALUES (?, '[]'::jsonb, 'integration-test', 'v1', ?, 0)
                RETURNING symptom_record_id
                """,
                Long.class,
                consultationId,
                Timestamp.from(Instant.now().minus(daysAgo, ChronoUnit.DAYS))
        );

        String acceptedFindings = """
                [{
                  "code": "integration.test.signal",
                  "displayName": "Integration test signal",
                  "assertion": "%s"
                }]
                """.formatted(assertion);

        Instant reviewedAt = Instant.now().minus(daysAgo, ChronoUnit.DAYS);
        jdbcTemplate.update(
                """
                INSERT INTO finding_review (
                    symptom_record_id, consultation_id, accepted_findings,
                    reviewed_by, reviewed_at, updated_at
                ) VALUES (?, ?, CAST(? AS jsonb), 2, ?, ?)
                """,
                symptomRecordId,
                consultationId,
                acceptedFindings,
                Timestamp.from(reviewedAt),
                Timestamp.from(reviewedAt)
        );
    }
}
