package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.dto.request.UpdateAlertStatusRequest;
import com.project.ibm.telehealth_with_ai.dto.response.AcceptedFindingResponse;
import com.project.ibm.telehealth_with_ai.dto.response.AlertEvidenceResponse;
import com.project.ibm.telehealth_with_ai.dto.response.AlertResponse;
import com.project.ibm.telehealth_with_ai.dto.response.AlertStatusEventResponse;
import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.exception.ResourceNotFoundException;
import com.project.ibm.telehealth_with_ai.model.Alert;
import com.project.ibm.telehealth_with_ai.model.AlertEvidence;
import com.project.ibm.telehealth_with_ai.model.AlertStatus;
import com.project.ibm.telehealth_with_ai.model.AlertStatusEvent;
import com.project.ibm.telehealth_with_ai.model.AppUser;
import com.project.ibm.telehealth_with_ai.model.Clinic;
import com.project.ibm.telehealth_with_ai.model.Consultation;
import com.project.ibm.telehealth_with_ai.model.FindingReview;
import com.project.ibm.telehealth_with_ai.repository.AlertEvidenceRepository;
import com.project.ibm.telehealth_with_ai.repository.AlertRepository;
import com.project.ibm.telehealth_with_ai.repository.AlertStatusEventRepository;
import com.project.ibm.telehealth_with_ai.repository.AppUserRepository;
import com.project.ibm.telehealth_with_ai.repository.ClinicRepository;
import com.project.ibm.telehealth_with_ai.repository.ConsultationRepository;
import com.project.ibm.telehealth_with_ai.repository.FindingReviewRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Manages alert listing, workflow actions, and the simple trend detector.
 * All write operations run in a transaction so alert, evidence, and history
 * records cannot be saved separately from one another.
 */
@Service
@Transactional
public class AlertService {

    // Together, these constants define version 1 of the detector rule.
    private static final int OBSERVATION_DAYS = 7;
    private static final int BASELINE_DAYS = 28;
    private static final int BASELINE_PERIODS = 4;
    private static final int MINIMUM_OBSERVED = 3;
    private static final BigDecimal RATIO_THRESHOLD = new BigDecimal("2.50");
    private static final String DETECTOR_VERSION = "clinic-symptom-ratio-v1";

    // Counts distinct consultations in the observation and baseline periods
    // for each symptom.
    private static final String CANDIDATE_SQL = """
            WITH eligible AS (
                SELECT
                    r.consultation_id,
                    f->>'code' AS symptom_code,
                    f->>'displayName' AS display_name,
                    r.reviewed_at
                FROM finding_review r
                JOIN consultation c
                  ON c.consultation_id = r.consultation_id
                CROSS JOIN LATERAL jsonb_array_elements(r.accepted_findings) AS f
                WHERE c.clinic_id = :clinicId
                  AND r.reviewed_at >= :baselineStart
                  AND r.reviewed_at < :windowEnd
                  AND f->>'assertion' = 'PRESENT'
            )
            SELECT
                symptom_code,
                MIN(display_name) AS display_name,
                COUNT(DISTINCT consultation_id)
                    FILTER (WHERE reviewed_at >= :windowStart) AS observed_count,
                COUNT(DISTINCT consultation_id)
                    FILTER (WHERE reviewed_at < :windowStart)::numeric
                    / :baselinePeriods AS baseline_count
            FROM eligible
            GROUP BY symptom_code
            HAVING COUNT(DISTINCT consultation_id)
                FILTER (WHERE reviewed_at >= :windowStart) >= :minimumObserved
            ORDER BY symptom_code
            """;

    // Loads source reviews from the observation window for a symptom that
    // crossed the threshold. Results are stored as snapshots in alert_evidence.
    private static final String EVIDENCE_SQL = """
            SELECT DISTINCT ON (r.consultation_id)
                r.finding_review_id,
                r.consultation_id,
                f::text AS finding_json
            FROM finding_review r
            JOIN consultation c
              ON c.consultation_id = r.consultation_id
            CROSS JOIN LATERAL jsonb_array_elements(r.accepted_findings) AS f
            WHERE c.clinic_id = :clinicId
              AND r.reviewed_at >= :windowStart
              AND r.reviewed_at < :windowEnd
              AND f->>'assertion' = 'PRESENT'
              AND f->>'code' = :symptomCode
            ORDER BY r.consultation_id, r.reviewed_at DESC, r.finding_review_id DESC
            """;

    private final AlertRepository alertRepository;
    private final AlertEvidenceRepository alertEvidenceRepository;
    private final AlertStatusEventRepository alertStatusEventRepository;
    private final FindingReviewRepository findingReviewRepository;
    private final ConsultationRepository consultationRepository;
    private final ClinicRepository clinicRepository;
    private final AppUserRepository appUserRepository;
    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final JsonMapper jsonMapper;

    public AlertService(
            AlertRepository alertRepository,
            AlertEvidenceRepository alertEvidenceRepository,
            AlertStatusEventRepository alertStatusEventRepository,
            FindingReviewRepository findingReviewRepository,
            ConsultationRepository consultationRepository,
            ClinicRepository clinicRepository,
            AppUserRepository appUserRepository,
            NamedParameterJdbcTemplate jdbcTemplate,
            JsonMapper jsonMapper
    ) {
        this.alertRepository = alertRepository;
        this.alertEvidenceRepository = alertEvidenceRepository;
        this.alertStatusEventRepository = alertStatusEventRepository;
        this.findingReviewRepository = findingReviewRepository;
        this.consultationRepository = consultationRepository;
        this.clinicRepository = clinicRepository;
        this.appUserRepository = appUserRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.jsonMapper = jsonMapper;
    }

    /**
     * Returns alerts visible to the current user.
     * An administrator sees all records; a Doctor sees only relevant clinics.
     */
    @Transactional(readOnly = true)
    public List<AlertResponse> list(AlertStatus status, Instant from, Instant to) {
        if (from != null && to != null && !from.isBefore(to)) {
            throw new BadRequestException("The from date must be before the to date");
        }

        AppUser actor = currentUser();
        List<Alert> visible = actor.getRole() == AppUser.Role.ADMIN
                ? alertRepository.findAllByOrderByCreatedAtDesc()
                : alertRepository.findVisibleForDoctor(actor.getUserId());

        return visible.stream()
                .filter(alert -> status == null || alert.getStatus() == status)
                .filter(alert -> from == null || !alert.getCreatedAt().isBefore(from))
                .filter(alert -> to == null || alert.getCreatedAt().isBefore(to))
                .map(this::toResponse)
                .toList();
    }

    /** Checks alert visibility and returns its frozen evidence records. */
    @Transactional(readOnly = true)
    public List<AlertEvidenceResponse> evidence(Long alertId) {
        loadVisible(alertId, currentUser());
        return alertEvidenceRepository.findByAlertAlertIdOrderByIncludedAtAsc(alertId)
                .stream()
                .map(this::toEvidenceResponse)
                .toList();
    }

    /** Returns status history from alert creation through the latest staff action. */
    @Transactional(readOnly = true)
    public List<AlertStatusEventResponse> history(Long alertId) {
        loadVisible(alertId, currentUser());
        return alertStatusEventRepository.findByAlertAlertIdOrderByCreatedAtAsc(alertId)
                .stream()
                .map(this::toEventResponse)
                .toList();
    }

    /**
     * Applies an allowed workflow transition and records an event in the same
     * transaction. A descriptive note is required for DISMISSED and RESOLVED.
     */
    public AlertResponse updateStatus(
            Long alertId,
            UpdateAlertStatusRequest request
    ) {
        AppUser actor = currentUser();
        Alert alert = loadVisible(alertId, actor);
        AlertStatus previous = alert.getStatus();
        AlertStatus next = request.getStatus();

        if (!isAllowedTransition(previous, next)) {
            throw new BadRequestException(
                    "Alert transition from " + previous + " to " + next
                            + " is not allowed");
        }

        String note = request.getNote() == null ? "" : request.getNote().trim();
        if ((next == AlertStatus.DISMISSED || next == AlertStatus.RESOLVED)
                && note.isEmpty()) {
            throw new BadRequestException(
                    "A note is required when an alert is closed");
        }

        Instant now = Instant.now();
        alert.setStatus(next);
        alert.setUpdatedAt(now);
        Alert saved = alertRepository.save(alert);

        AlertStatusEvent event = new AlertStatusEvent();
        event.setAlert(saved);
        event.setPreviousStatus(previous);
        event.setNewStatus(next);
        event.setChangedBy(actor);
        event.setSystemGenerated(false);
        event.setNote(note.isEmpty() ? null : note);
        event.setCreatedAt(now);
        alertStatusEventRepository.save(event);

        return toResponse(saved);
    }

    /**
     * Calculates fixed day windows for one clinic and turns candidates that
     * cross the threshold into alerts. Because windows are fixed by day,
     * running the detector again on the same day does not create duplicates.
     */
    public void detectForClinic(Long clinicId) {
        // 1. The detector always belongs to one clinic.
        Clinic clinic = clinicRepository.findById(clinicId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Clinic not found: " + clinicId));

        // 2. Calculate one 7-day window and its previous 28-day baseline.
        Instant now = Instant.now();
        Instant windowEnd = LocalDate.ofInstant(now, ZoneOffset.UTC)
                .plusDays(1)
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant();
        Instant windowStart = windowEnd.minus(OBSERVATION_DAYS, ChronoUnit.DAYS);
        Instant baselineStart = windowStart.minus(BASELINE_DAYS, ChronoUnit.DAYS);

        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("clinicId", clinicId)
                .addValue("baselineStart", Timestamp.from(baselineStart))
                .addValue("windowStart", Timestamp.from(windowStart))
                .addValue("windowEnd", Timestamp.from(windowEnd))
                .addValue("baselinePeriods", BASELINE_PERIODS)
                .addValue("minimumObserved", MINIMUM_OBSERVED);

        // 3. Convert each SQL result row directly into a small Java record.
        List<AlertCandidate> candidates = jdbcTemplate.query(
                CANDIDATE_SQL,
                parameters,
                (resultSet, rowNumber) -> new AlertCandidate(
                        resultSet.getString("symptom_code"),
                        resultSet.getString("display_name"),
                        resultSet.getInt("observed_count"),
                        resultSet.getBigDecimal("baseline_count")
                )
        );

        // 4. Create an alert only when both detector rules pass.
        for (AlertCandidate candidate : candidates) {
            BigDecimal score = calculateScore(
                    candidate.observedCount(),
                    candidate.baselineCount()
            );

            if (passesThreshold(candidate.observedCount(), score)) {
                saveAlertAndEvidence(
                        clinic,
                        candidate,
                        windowStart,
                        windowEnd,
                        score,
                        now
                );
            }
        }
    }

    /** Workflow state machine rule, kept here so controllers do not repeat it. */
    static boolean isAllowedTransition(AlertStatus current, AlertStatus next) {
        return switch (current) {
            case OPEN -> next == AlertStatus.ACKNOWLEDGED
                    || next == AlertStatus.DISMISSED;
            case ACKNOWLEDGED -> next == AlertStatus.RESOLVED
                    || next == AlertStatus.DISMISSED;
            case DISMISSED, RESOLVED -> false;
        };
    }

    /** Returns true when both the minimum count and ratio threshold are met. */
    static boolean passesThreshold(int observedCount, BigDecimal score) {
        return observedCount >= MINIMUM_OBSERVED
                && score.compareTo(RATIO_THRESHOLD) >= 0;
    }

    /**
     * Compares the current count with the previous weekly average.
     * A floor of 1 avoids division by zero and reduces false alarms when the
     * clinic has little or no baseline data.
     */
    static BigDecimal calculateScore(
            int observedCount,
            BigDecimal baselineCount
    ) {
        BigDecimal safeBaseline = baselineCount.max(BigDecimal.ONE);
        return BigDecimal.valueOf(observedCount)
                .divide(safeBaseline, 2, RoundingMode.HALF_UP);
    }

    /** Updates the current daily alert or creates a new one and stores evidence. */
    private void saveAlertAndEvidence(
            Clinic clinic,
            AlertCandidate candidate,
            Instant windowStart,
            Instant windowEnd,
            BigDecimal score,
            Instant now
    ) {
        Alert alert = alertRepository
                .findByClinicClinicIdAndSymptomCodeAndWindowStartAndWindowEndAndDetectorVersion(
                        clinic.getClinicId(),
                        candidate.symptomCode(),
                        windowStart,
                        windowEnd,
                        DETECTOR_VERSION)
                .orElseGet(Alert::new);

        boolean isNew = alert.getAlertId() == null;
        alert.setClinic(clinic);
        alert.setSymptomCode(candidate.symptomCode());
        alert.setSymptomName(candidate.displayName());
        alert.setWindowStart(windowStart);
        alert.setWindowEnd(windowEnd);
        alert.setObservedCount(candidate.observedCount());
        alert.setBaselineCount(candidate.baselineCount().setScale(2, RoundingMode.HALF_UP));
        alert.setScore(score);
        alert.setThreshold(RATIO_THRESHOLD);
        alert.setDetectorVersion(DETECTOR_VERSION);
        alert.setLastEvaluatedAt(now);
        alert.setUpdatedAt(now);

        if (isNew) {
            alert.setStatus(AlertStatus.OPEN);
            alert.setCreatedAt(now);
        }

        Alert saved = alertRepository.saveAndFlush(alert);

        if (isNew) {
            AlertStatusEvent opened = new AlertStatusEvent();
            opened.setAlert(saved);
            opened.setPreviousStatus(null);
            opened.setNewStatus(AlertStatus.OPEN);
            opened.setChangedBy(null);
            opened.setSystemGenerated(true);
            opened.setNote("Created by " + DETECTOR_VERSION);
            opened.setCreatedAt(now);
            alertStatusEventRepository.save(opened);
        }

        saveEvidence(saved, candidate.symptomCode(), windowStart, windowEnd, now);
    }

    /** Stores observation evidence without adding the same review twice. */
    private void saveEvidence(
            Alert alert,
            String symptomCode,
            Instant windowStart,
            Instant windowEnd,
            Instant now
    ) {
        Map<String, Object> parameters = Map.of(
                "clinicId", alert.getClinic().getClinicId(),
                "symptomCode", symptomCode,
                "windowStart", Timestamp.from(windowStart),
                "windowEnd", Timestamp.from(windowEnd)
        );

        List<EvidenceCandidate> evidenceRows = jdbcTemplate.query(
                EVIDENCE_SQL,
                parameters,
                (resultSet, rowNumber) -> new EvidenceCandidate(
                        resultSet.getLong("finding_review_id"),
                        resultSet.getLong("consultation_id"),
                        resultSet.getString("finding_json")
                )
        );

        for (EvidenceCandidate row : evidenceRows) {
            boolean exists = alertEvidenceRepository
                    .existsByAlertAlertIdAndFindingReviewFindingReviewIdAndSymptomCode(
                            alert.getAlertId(),
                            row.findingReviewId(),
                            symptomCode
                    );

            if (exists) {
                continue;
            }

            FindingReview review = findingReviewRepository
                    .getReferenceById(row.findingReviewId());
            Consultation consultation = consultationRepository
                    .getReferenceById(row.consultationId());

            AlertEvidence evidence = new AlertEvidence();
            evidence.setAlert(alert);
            evidence.setFindingReview(review);
            evidence.setConsultation(consultation);
            evidence.setSymptomCode(symptomCode);
            evidence.setFindingSnapshot(row.findingJson());
            evidence.setIncludedAt(now);
            alertEvidenceRepository.save(evidence);
        }
    }

    /** Returns not found without revealing record existence to an unauthorised Doctor. */
    private Alert loadVisible(Long alertId, AppUser actor) {
        if (actor.getRole() == AppUser.Role.ADMIN) {
            return alertRepository.findById(alertId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Alert not found: " + alertId));
        }

        return alertRepository.findVisibleByIdForDoctor(alertId, actor.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Alert not found: " + alertId));
    }

    /** Loads from the database the user placed in SecurityContext by the JWT filter. */
    private AppUser currentUser() {
        Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new AccessDeniedException("Authentication is required");
        }

        AppUser user = appUserRepository
                .findByUsernameIgnoreCase(authentication.getName());
        if (user == null) {
            throw new AccessDeniedException("Authenticated user was not found");
        }
        return user;
    }

    /** Maps entity fields and the evidence count to the frontend DTO. */
    private AlertResponse toResponse(Alert alert) {
        BigDecimal highBoundary = alert.getThreshold()
                .multiply(new BigDecimal("1.50"));
        String severity = alert.getScore().compareTo(highBoundary) >= 0
                ? "HIGH"
                : "MEDIUM";

        return new AlertResponse(
                alert.getAlertId(),
                alert.getClinic().getClinicId(),
                alert.getClinic().getClinicName(),
                alert.getSymptomCode(),
                alert.getSymptomName(),
                alert.getWindowStart(),
                alert.getWindowEnd(),
                alert.getObservedCount(),
                alert.getBaselineCount(),
                alert.getScore(),
                alert.getThreshold(),
                severity,
                alert.getStatus(),
                alert.getDetectorVersion(),
                alertEvidenceRepository.countByAlertAlertId(alert.getAlertId()),
                alert.getCreatedAt(),
                alert.getUpdatedAt(),
                alert.getLastEvaluatedAt()
        );
    }

    /** Converts the frozen JSON snapshot back into a readable finding DTO. */
    private AlertEvidenceResponse toEvidenceResponse(AlertEvidence evidence) {
        try {
            AcceptedFindingResponse finding = jsonMapper.readValue(
                    evidence.getFindingSnapshot(),
                    AcceptedFindingResponse.class
            );
            return new AlertEvidenceResponse(
                    evidence.getAlertEvidenceId(),
                    evidence.getConsultation().getConsultationId(),
                    evidence.getFindingReview().getFindingReviewId(),
                    evidence.getSymptomCode(),
                    finding,
                    evidence.getIncludedAt()
            );
        } catch (JacksonException exception) {
            throw new IllegalStateException("Stored alert evidence is invalid", exception);
        }
    }

    /** Converts a status event entity into the response model used by the drawer. */
    private AlertStatusEventResponse toEventResponse(AlertStatusEvent event) {
        return new AlertStatusEventResponse(
                event.getAlertStatusEventId(),
                event.getPreviousStatus(),
                event.getNewStatus(),
                event.getChangedBy() == null
                        ? null
                        : event.getChangedBy().getUserId(),
                event.getChangedBy() == null
                        ? null
                        : event.getChangedBy().getUsername(),
                event.isSystemGenerated(),
                event.getNote(),
                event.getCreatedAt()
        );
    }

    /** Holds the calculated values returned by the detector aggregation query. */
    private record AlertCandidate(
            String symptomCode,
            String displayName,
            Integer observedCount,
            BigDecimal baselineCount
    ) {
    }

    /** Holds the identifiers for one finding review row supporting an alert. */
    private record EvidenceCandidate(
            Long findingReviewId,
            Long consultationId,
            String findingJson
    ) {
    }
}
