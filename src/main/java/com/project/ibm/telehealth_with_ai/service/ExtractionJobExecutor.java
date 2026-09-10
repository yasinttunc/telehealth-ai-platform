package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.exception.ResourceNotFoundException;
import com.project.ibm.telehealth_with_ai.model.Consultation;
import com.project.ibm.telehealth_with_ai.model.ExtractionJob;
import com.project.ibm.telehealth_with_ai.model.ExtractionJobStatus;
import com.project.ibm.telehealth_with_ai.model.SymptomRecord;
import com.project.ibm.telehealth_with_ai.repository.ExtractionJobRepository;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.function.Supplier;

/**
 * Executes extraction jobs after their database row has committed.
 */
@Service
public class ExtractionJobExecutor {

    private final ExtractionJobRepository extractionJobRepository;
    private final SymptomRecordService symptomRecordService;
    private final TransactionTemplate transactionTemplate;

    public ExtractionJobExecutor(
            ExtractionJobRepository extractionJobRepository,
            SymptomRecordService symptomRecordService,
            PlatformTransactionManager transactionManager
    ){
        this.extractionJobRepository = extractionJobRepository;
        this.symptomRecordService = symptomRecordService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    /**
     * Runs one job and records success or failure.
     *
     * Status changes use their own short transactions. This is deliberate: if
     * the provider call or symptom-record transaction fails, the failure marker
     * must still commit so the frontend can leave PENDING and show retry state.
     */
    public void runJob(Long jobId){
        JobContext context = runInTransaction(() -> {
            ExtractionJob job = extractionJobRepository.findById(jobId)
                    .orElseThrow(()-> new ResourceNotFoundException("Extraction job not found"));

            job.setStatus(ExtractionJobStatus.RUNNING);
            job.setStartedAt(Instant.now());

            Consultation consultation = job.getConsultation();
            consultation.getConsultationId();
            consultation.getTranscript();
            consultation.getTranscriptApprovedRevision();

            return new JobContext(consultation, job.getTranscriptRevision());
        });

        try {
            if(!context.transcriptRevision().equals(
                    context.consultation().getTranscriptApprovedRevision())){
                throw new BadRequestException("Approved transcript revision changed before extraction");
            }

            SymptomRecord result = symptomRecordService.extractApprovedRevisionForJob(
                    context.consultation(),
                    context.transcriptRevision());

            transactionTemplate.executeWithoutResult(status -> {
                ExtractionJob job = extractionJobRepository.findById(jobId)
                        .orElseThrow(() -> new ResourceNotFoundException("Extraction job not found"));
                job.setResultSymptomRecord(result);
                job.setStatus(ExtractionJobStatus.SUCCEEDED);
                job.setCompletedAt(Instant.now());
            });
        } catch (Exception exception){
            transactionTemplate.executeWithoutResult(status -> {
                ExtractionJob job = extractionJobRepository.findById(jobId)
                        .orElseThrow(() -> new ResourceNotFoundException("Extraction job not found"));
                job.setStatus(ExtractionJobStatus.FAILED);
                job.setErrorMessage(safeMessage(exception));
                job.setCompletedAt(Instant.now());
            });
        }

    }

    private <T> T runInTransaction(Supplier<T> callback) {
        return transactionTemplate.execute(status -> callback.get());
    }

    /**
     * Starts the background job only after the request transaction commits
     */
    @Async("extractionExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onExtractionJobCreated(ExtractionJobCreated event) {
        runJob(event.jobId());
    }

    /**
     * Stores a short safe error message, never stack traces or secrets.
     */
    private String safeMessage(Exception exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) {
            return "AI extraction failed";
        }
        return message.length() > 300 ? message.substring(0, 300) : message;
    }

    private record JobContext(Consultation consultation, Integer transcriptRevision) { }

}
