package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.response.ExtractionJobResponse;
import com.project.ibm.telehealth_with_ai.service.ExtractionJobService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * HTTP API for asynchronous symptom-extraction jobs.
 *
 * The browser never calls the AI provider directly. It asks Spring to create a
 * durable job row, then polls this controller for backend-owned job state.
 */
@RestController
@RequestMapping("/api/consultations/{consultationId}/extraction-jobs")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Extraction jobs", description = "Clinician-initiated structured symptom extraction jobs.")
public class ExtractionJobController {

    private final ExtractionJobService extractionJobService;

    public ExtractionJobController(ExtractionJobService extractionJobService) {
        this.extractionJobService = extractionJobService;
    }

    /**
     * Queues extraction for the authenticated assigned Doctor.
     *
     * The response is 202 because the expensive provider call runs later on the
     * Spring async executor. The returned job is the state object the frontend
     * should render and poll.
     */
    @PostMapping
    @PreAuthorize("hasRole('DOCTOR')")
    public ResponseEntity<ExtractionJobResponse> requestExtraction(
            @PathVariable Long consultationId
    ) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(extractionJobService.requestExtraction(consultationId));
    }

    /**
     * Lists all extraction attempts for this consultation, newest first.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    public List<ExtractionJobResponse> list(
            @PathVariable Long consultationId
    ) {
        return extractionJobService.listForConsultation(consultationId);
    }

    /**
     * Returns only the newest job so the frontend can poll with a small payload.
     */
    @GetMapping("/latest")
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    public ResponseEntity<ExtractionJobResponse> latest(
            @PathVariable Long consultationId
    ) {
        return extractionJobService.latestForConsultation(consultationId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
