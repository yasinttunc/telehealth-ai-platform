package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.dto.response.ExtractionJobResponse;
import com.project.ibm.telehealth_with_ai.exception.AccessDeniedException;
import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.exception.ResourceNotFoundException;
import com.project.ibm.telehealth_with_ai.model.AppUser;
import com.project.ibm.telehealth_with_ai.model.Consultation;
import com.project.ibm.telehealth_with_ai.model.ExtractionJob;
import com.project.ibm.telehealth_with_ai.repository.AppUserRepository;
import com.project.ibm.telehealth_with_ai.repository.ConsultationRepository;
import com.project.ibm.telehealth_with_ai.repository.ExtractionJobRepository;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;

import static com.project.ibm.telehealth_with_ai.model.ExtractionJobStatus.*;

/**
 * Handles Doctor requests to extract symptoms from an approved transcript revision
 */
@Service
public class ExtractionJobService {

    private final ExtractionJobRepository extractionJobRepository;
    private final ConsultationRepository consultationRepository;
    private final AppUserRepository appUserRepository;
    private final ExtractionJobExecutor extractionJobExecutor;
    private final Executor extractionExecutor;

    public ExtractionJobService(
            ExtractionJobRepository extractionJobRepository,
            ConsultationRepository consultationRepository,
            AppUserRepository appUserRepository,
            ExtractionJobExecutor extractionJobExecutor,
            @Qualifier("extractionExecutor") Executor extractionExecutor
    ){
        this.extractionJobRepository = extractionJobRepository;
        this.consultationRepository = consultationRepository;
        this.appUserRepository = appUserRepository;
        this.extractionJobExecutor = extractionJobExecutor;
        this.extractionExecutor = extractionExecutor;
    }

    /**
     * Resolves the JWT-authenticated Spring user for request-thread checks.
     */
    private AppUser getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()) {
            throw new BadRequestException("No authenticated user found");
        }

        AppUser currentUser = appUserRepository.findByUsernameIgnoreCase(authentication.getName());

        if (currentUser == null) {
            throw new ResourceNotFoundException("Current user not found");
        }

        return currentUser;
    }

    /**
     * Allows only administrators and the Doctor assigned to the consultation to
     * read extraction job state. Patients never see extraction jobs.
     */
    private void assertCanReadJobs(Consultation consultation, AppUser currentUser) {
        if (currentUser.getRole() == AppUser.Role.ADMIN) {
            return;
        }

        if (currentUser.getRole() == AppUser.Role.DOCTOR
                && consultation.getClinician().getUserId().equals(currentUser.getUserId())) {
            return;
        }

        throw new AccessDeniedException("You are not allowed to access extraction jobs for this consultation");
    }

    /**
     * Converts an entity into a safe API response.
     */
    private ExtractionJobResponse toResponse(ExtractionJob job) {
        Long resultId = job.getResultSymptomRecord() == null
                ? null
                : job.getResultSymptomRecord().getSymptomRecordId();

        return new ExtractionJobResponse(
                job.getExtractionJobId(),
                job.getConsultation().getConsultationId(),
                job.getTranscriptRevision(),
                job.getStatus(),
                resultId,
                job.getErrorMessage(),
                job.getCreatedAt(),
                job.getStartedAt(),
                job.getCompletedAt()
        );
    }


    /**
     * Creates the PENDING row and schedules async execution after commit.
     */
    private ExtractionJobResponse createJob(
            Consultation consultation,
            Integer revision,
            AppUser doctor
    ){
        ExtractionJob job = new ExtractionJob();
        job.setConsultation(consultation);
        job.setTranscriptRevision(revision);
        job.setRequestedBy(doctor);
        job.setStatus(PENDING);

        ExtractionJob saved = extractionJobRepository.save(job);
        scheduleJob(saved.getExtractionJobId());
        return toResponse(saved);
    }

    /**
     * Starts the expensive provider work after the job row has been saved.
     *
     * The repository save owns its database transaction here, so the background
     * worker can immediately reload the durable job by id and move it through
     * RUNNING, SUCCEEDED, or FAILED without depending on SecurityContext.
     */
    private void scheduleJob(Long jobId) {
        extractionExecutor.execute(() -> extractionJobExecutor.runJob(jobId));
    }


    /**
     * Request AI extraction for the currently approved transcript revision.
     *
     * This method must run on the HTTP request thread because it checks the
     * assigned Doctor. The async executor must not read SecurityContext
     */
    public ExtractionJobResponse requestExtraction(
            Long consultationId,
            AppUser doctor
    ){
        Consultation consultation = consultationRepository.findById(consultationId)
                .orElseThrow(()-> new ResourceNotFoundException("Consultation not found"));

        if(doctor.getRole() != AppUser.Role.DOCTOR
                || !doctor.getUserId().equals(consultation.getClinician().getUserId())){
            throw new BadRequestException("Only the assigned Doctor can request extraction");
        }

        if(consultation.getTranscriptApprovedAt()==null
        ||!consultation.getTranscriptRevision().equals(consultation.getTranscriptApprovedRevision())){
            throw new BadRequestException("The current transcript revision is not approved");
        }

        Integer revision = consultation.getTranscriptRevision();

        return extractionJobRepository
                .findFirstByConsultationConsultationIdAndTranscriptRevisionAndStatusIn(
                        consultationId,
                        revision,
                        List.of(PENDING, RUNNING, SUCCEEDED)
                ).map(this::toResponse)
                .orElseGet(()->createJob(consultation,revision,doctor));
    }

    /**
     * Request extraction as the authenticated assigned Doctor.
     */
    public ExtractionJobResponse requestExtraction(Long consultationId) {
        return requestExtraction(consultationId, getCurrentUser());
    }

    /**
     * Lists extraction attempts for a consultation, newest first.
     */
    public List<ExtractionJobResponse> listForConsultation(Long consultationId) {
        Consultation consultation = consultationRepository.findById(consultationId)
                .orElseThrow(() -> new ResourceNotFoundException("Consultation not found"));
        assertCanReadJobs(consultation, getCurrentUser());

        return extractionJobRepository.findByConsultationConsultationIdOrderByCreatedAtDesc(consultationId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * Returns the newest extraction attempt, if one exists.
     */
    public Optional<ExtractionJobResponse> latestForConsultation(Long consultationId) {
        return listForConsultation(consultationId).stream().findFirst();
    }


}
