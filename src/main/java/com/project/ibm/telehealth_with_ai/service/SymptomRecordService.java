package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.config.AiExtractionProperties;
import com.project.ibm.telehealth_with_ai.service.ai.AiExtractionResult;
import com.project.ibm.telehealth_with_ai.service.ai.SymptomExtractionProvider;
import com.project.ibm.telehealth_with_ai.dto.response.SymptomItem;
import com.project.ibm.telehealth_with_ai.dto.response.SymptomRecordResponse;
import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.exception.ResourceNotFoundException;
import com.project.ibm.telehealth_with_ai.model.AppUser;
import com.project.ibm.telehealth_with_ai.model.Consultation;
import com.project.ibm.telehealth_with_ai.model.SymptomRecord;
import com.project.ibm.telehealth_with_ai.repository.AppUserRepository;
import com.project.ibm.telehealth_with_ai.repository.ConsultationRepository;
import com.project.ibm.telehealth_with_ai.repository.SymptomRecordRepository;
import java.util.List;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Saves and reads staff-only, immutable mock symptom-extraction snapshots.
 */
@Service
@Transactional
public class SymptomRecordService {

    private final SymptomRecordRepository symptomRecordRepository;
    private final ConsultationRepository consultationRepository;
    private final AppUserRepository appUserRepository;
    private final JsonMapper jsonMapper;
    private final SymptomExtractionProvider symptomExtractionProvider;
    private final AiExtractionProperties aiExtractionProperties;


    public SymptomRecordService(
            SymptomRecordRepository symptomRecordRepository,
            ConsultationRepository consultationRepository,
            AppUserRepository appUserRepository,
            JsonMapper jsonMapper,
            SymptomExtractionProvider symptomExtractionProvider,
            AiExtractionProperties aiExtractionProperties
    ) {
        this.symptomRecordRepository = symptomRecordRepository;
        this.consultationRepository = consultationRepository;
        this.appUserRepository = appUserRepository;
        this.jsonMapper = jsonMapper;
        this.symptomExtractionProvider = symptomExtractionProvider;
        this.aiExtractionProperties = aiExtractionProperties;
    }

    public SymptomRecordResponse extractFromConsultation(Long consultationId) {
        Consultation consultation = findConsultation(consultationId);
        assertCurrentUserCanManage(consultation);

        if (!StringUtils.hasText(consultation.getTranscript())) {
            throw new BadRequestException("A consultation transcript is required before extraction");
        }
        if (!StringUtils.hasText(consultation.getTranscript())) {
            throw new BadRequestException(
                    "An approved transcript is required before extraction"
            );
        }

        if (consultation.getTranscriptApprovedAt() == null) {
            throw new BadRequestException(
                    "A Doctor must approve the transcript before extraction"
            );
        }

        if (!consultation.getTranscriptRevision().equals(
                consultation.getTranscriptApprovedRevision())) {
            throw new BadRequestException(
                    "The current transcript revision is not approved"
            );
        }
        AiExtractionResult extractionResult= symptomExtractionProvider.extract(
                consultationId,
                consultation.getTranscript(),
                aiExtractionProperties.getPromptVersion()
        );



        SymptomRecord record = new SymptomRecord();
        record.setConsultation(consultation);
        record.setSymptoms(writeSymptoms(extractionResult.items()));
        record.setModelName(extractionResult.modelName());
        record.setPromptVersion(extractionResult.promptVersion());

        return toResponse(symptomRecordRepository.save(record));
    }

    @Transactional(readOnly = true)
    public List<SymptomRecordResponse> getForConsultation(Long consultationId) {
        Consultation consultation = findConsultation(consultationId);
        assertCurrentUserCanManage(consultation);

        return symptomRecordRepository
                .findByConsultationConsultationIdOrderByCreatedAtDesc(consultationId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public SymptomRecordResponse getById(Long symptomRecordId) {
        SymptomRecord record = symptomRecordRepository.findById(symptomRecordId)
                .orElseThrow(() -> new ResourceNotFoundException("Symptom record not found: " + symptomRecordId));
        assertCurrentUserCanManage(record.getConsultation());
        return toResponse(record);
    }

    private Consultation findConsultation(Long consultationId) {
        return consultationRepository.findById(consultationId)
                .orElseThrow(() -> new ResourceNotFoundException("Consultation not found: " + consultationId));
    }

    private AppUser getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new AccessDeniedException("Authentication is required");
        }

        AppUser currentUser = appUserRepository.findByUsernameIgnoreCase(authentication.getName());
        if (currentUser == null) {
            throw new AccessDeniedException("Authenticated user was not found");
        }
        return currentUser;
    }

    private void assertCurrentUserCanManage(Consultation consultation) {
        AppUser currentUser = getCurrentUser();

        if (currentUser.getRole() == AppUser.Role.ADMIN) {
            return;
        }

        boolean isAssignedDoctor = currentUser.getRole() == AppUser.Role.DOCTOR
                && consultation.getClinician() != null
                && currentUser.getUserId().equals(consultation.getClinician().getUserId());

        if (!isAssignedDoctor) {
            throw new AccessDeniedException("You cannot access symptom records for this consultation");
        }
    }

    private String writeSymptoms(List<SymptomItem> items) {
        try {
            return jsonMapper.writeValueAsString(items);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Could not store extracted symptoms", exception);
        }
    }

    private SymptomRecordResponse toResponse(SymptomRecord record) {
        SymptomRecordResponse response = new SymptomRecordResponse();
        response.setSymptomRecordId(record.getSymptomRecordId());
        response.setConsultationId(record.getConsultation().getConsultationId());
        response.setModelName(record.getModelName());
        response.setPromptVersion(record.getPromptVersion());
        response.setSymptoms(readSymptoms(record.getSymptoms()));
        response.setCreatedAt(record.getCreatedAt());
        return response;
    }

    private List<SymptomItem> readSymptoms(String storedJson) {
        try {
            return jsonMapper.readValue(storedJson, new TypeReference<List<SymptomItem>>() { });
        } catch (JacksonException exception) {
            throw new IllegalStateException("Stored symptom data is invalid", exception);
        }
    }

    /**
     * Extracts symptoms for a background job without reading SecurityContext.
     *
     * The HTTP request already checked the assigned Doctor before creating the job.
     * The executor verifies the approved revision again, then calls this method.
     */
    @Transactional
    public SymptomRecord extractApprovedRevisionForJob(
            Consultation consultation,
            Integer transcriptRevision
    ) {
        if (!transcriptRevision.equals(consultation.getTranscriptApprovedRevision())) {
            throw new BadRequestException("The approved transcript revision is stale");
        }

        AiExtractionResult extractionResult = symptomExtractionProvider.extract(
                consultation.getConsultationId(),
                consultation.getTranscript(),
                aiExtractionProperties.getPromptVersion()
        );

        SymptomRecord record = new SymptomRecord();
        record.setConsultation(consultation);
        record.setSymptoms(writeSymptoms(extractionResult.items()));
        record.setModelName(extractionResult.modelName());
        record.setPromptVersion(extractionResult.promptVersion());
        record.setTranscriptRevision(transcriptRevision);

        return symptomRecordRepository.save(record);
    }
}