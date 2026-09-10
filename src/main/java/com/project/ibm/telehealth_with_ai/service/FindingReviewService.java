package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.dto.request.AcceptedFindingRequest;
import com.project.ibm.telehealth_with_ai.dto.request.UpsertFindingReviewRequest;
import com.project.ibm.telehealth_with_ai.dto.response.AcceptedFindingResponse;
import com.project.ibm.telehealth_with_ai.dto.response.FindingReviewResponse;
import com.project.ibm.telehealth_with_ai.dto.response.SymptomItem;
import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.exception.ResourceNotFoundException;
import com.project.ibm.telehealth_with_ai.model.AppUser;
import com.project.ibm.telehealth_with_ai.model.Consultation;
import com.project.ibm.telehealth_with_ai.model.FindingReview;
import com.project.ibm.telehealth_with_ai.model.SymptomRecord;
import com.project.ibm.telehealth_with_ai.repository.AppUserRepository;
import com.project.ibm.telehealth_with_ai.repository.FindingReviewRepository;
import com.project.ibm.telehealth_with_ai.repository.SymptomRecordRepository;
import java.text.Normalizer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Turns an AI symptom record into a Doctor decision.
 * It checks client codes against the source record and runs the relevant clinic
 * detector after the review is saved.
 */
@Service
@Transactional
public class FindingReviewService {

    private final FindingReviewRepository findingReviewRepository;
    private final SymptomRecordRepository symptomRecordRepository;
    private final AppUserRepository appUserRepository;
    private final AlertService alertService;
    private final JsonMapper jsonMapper;

    public FindingReviewService(
            FindingReviewRepository findingReviewRepository,
            SymptomRecordRepository symptomRecordRepository,
            AppUserRepository appUserRepository,
            AlertService alertService,
            JsonMapper jsonMapper
    ) {
        this.findingReviewRepository = findingReviewRepository;
        this.symptomRecordRepository = symptomRecordRepository;
        this.appUserRepository = appUserRepository;
        this.alertService = alertService;
        this.jsonMapper = jsonMapper;
    }

    /** Returns the existing review; the controller returns 204 when none exists. */
    @Transactional(readOnly = true)
    public Optional<FindingReviewResponse> getFindingReview(Long symptomRecordId) {
        SymptomRecord record = symptomRecordRepository.findById(symptomRecordId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Symptom record not found: " + symptomRecordId));

        assertAssignedDoctor(record.getConsultation());

        return findingReviewRepository
                .findBySymptomRecordSymptomRecordId(symptomRecordId)
                .map(this::toResponse);
    }

    /**
     * Creates or updates the review. reviewedAt is written on the first save;
     * only updatedAt changes on later saves.
     */
    public FindingReviewResponse saveFindingReview(
            Long symptomRecordId,
            UpsertFindingReviewRequest request
    ) {
        // 1. Load the original AI result.
        SymptomRecord record = symptomRecordRepository.findById(symptomRecordId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Symptom record not found: " + symptomRecordId));

        Consultation consultation = record.getConsultation();

        // 2. Only the Doctor assigned to this consultation may review it.
        AppUser doctor = assertAssignedDoctor(consultation);

        // 3. Read the immutable AI findings from JSONB.
        List<SymptomItem> sourceFindings;
        try {
            sourceFindings = jsonMapper.readValue(
                    record.getSymptoms(),
                    new TypeReference<List<SymptomItem>>() { }
            );
        } catch (JacksonException exception) {
            throw new IllegalStateException(
                    "Stored symptom record is invalid",
                    exception
            );
        }

        // 4. Build a code-to-name lookup from the original AI findings.
        Map<String, String> sourceNames = new LinkedHashMap<>();
        for (SymptomItem item : sourceFindings) {
            sourceNames.putIfAbsent(
                    normaliseCode(item.getName()),
                    item.getName()
            );
        }

        // 5. Validate every finding selected by the Doctor.
        Set<String> seenCodes = new LinkedHashSet<>();
        List<AcceptedFindingResponse> accepted = new ArrayList<>();

        for (AcceptedFindingRequest item : request.acceptedFindings()) {
            String code = normaliseCode(item.code());
            String displayName = sourceNames.get(code);

            if (displayName == null) {
                throw new BadRequestException(
                        "Finding does not exist in the AI result: " + code
                );
            }

            if (!seenCodes.add(code)) {
                throw new BadRequestException(
                        "Duplicate finding code: " + code
                );
            }

            accepted.add(new AcceptedFindingResponse(
                    code,
                    displayName,
                    item.assertion()
            ));
        }

        // 6. Create the review on first save, or update the existing row.
        Instant now = Instant.now();
        FindingReview review = findingReviewRepository
                .findBySymptomRecordSymptomRecordId(symptomRecordId)
                .orElseGet(() -> {
                    FindingReview created = new FindingReview();
                    created.setSymptomRecord(record);
                    created.setConsultation(consultation);
                    created.setReviewedAt(now);
                    return created;
                });

        try {
            review.setAcceptedFindings(
                    jsonMapper.writeValueAsString(accepted)
            );
        } catch (JacksonException exception) {
            throw new IllegalStateException(
                    "Could not store finding review",
                    exception
            );
        }

        review.setReviewedBy(doctor);
        review.setUpdatedAt(now);
        FindingReview saved = findingReviewRepository.saveAndFlush(review);

        // 7. Recalculate alerts after the approved findings have been stored.
        alertService.detectForClinic(consultation.getClinic().getClinicId());
        return toResponse(saved);
    }

    /** Converts a name such as "Dry cough" into a stable code such as "dry.cough". */
    private String normaliseCode(String value) {
        String ascii = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        String code = ascii.toLowerCase(Locale.ROOT)
                .trim()
                .replaceAll("[^a-z0-9]+", ".")
                .replaceAll("^\\.+|\\.+$", "");

        if (code.isBlank()) {
            throw new BadRequestException("Finding code cannot be empty");
        }
        return code;
    }

    /** Restricts review permission to the Doctor assigned to the consultation. */
    private AppUser assertAssignedDoctor(Consultation consultation) {
        Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()) {
            throw new AccessDeniedException("Authentication is required");
        }

        AppUser current = appUserRepository
                .findByUsernameIgnoreCase(authentication.getName());

        if (current == null) {
            throw new AccessDeniedException("Authenticated user was not found");
        }

        boolean assigned = current.getRole() == AppUser.Role.DOCTOR
                && consultation.getClinician() != null
                && current.getUserId().equals(
                consultation.getClinician().getUserId());

        if (!assigned) {
            throw new AccessDeniedException(
                    "Only the assigned Doctor can review these findings");
        }
        return current;
    }

    /** Maps the entity and reviewer details to the frontend response. */
    private FindingReviewResponse toResponse(FindingReview review) {
        try {
            List<AcceptedFindingResponse> accepted = jsonMapper.readValue(
                    review.getAcceptedFindings(),
                    new TypeReference<List<AcceptedFindingResponse>>() { }
            );

            return new FindingReviewResponse(
                    review.getFindingReviewId(),
                    review.getSymptomRecord().getSymptomRecordId(),
                    review.getConsultation().getConsultationId(),
                    accepted,
                    review.getReviewedBy().getUserId(),
                    review.getReviewedBy().getUsername(),
                    review.getReviewedAt(),
                    review.getUpdatedAt()
            );
        } catch (JacksonException exception) {
            throw new IllegalStateException(
                    "Stored finding review is invalid",
                    exception
            );
        }
    }
}
