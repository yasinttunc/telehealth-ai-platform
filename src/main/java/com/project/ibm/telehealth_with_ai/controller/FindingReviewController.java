package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.request.UpsertFindingReviewRequest;
import com.project.ibm.telehealth_with_ai.dto.response.FindingReviewResponse;
import com.project.ibm.telehealth_with_ai.service.FindingReviewService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Endpoints for the assigned Doctor to read and save a finding review. */
@RestController
@RequestMapping("/api/symptom-records/{symptomRecordId}/review")
@PreAuthorize("hasRole('DOCTOR')")
public class FindingReviewController {

    private final FindingReviewService findingReviewService;

    public FindingReviewController(FindingReviewService findingReviewService) {
        this.findingReviewService = findingReviewService;
    }

    /** Returns 204 instead of an error when absent, allowing the initial review form. */
    @GetMapping
    public ResponseEntity<FindingReviewResponse> getFindingReview(
            @PathVariable Long symptomRecordId
    ) {
        return findingReviewService.getFindingReview(symptomRecordId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** The same endpoint creates the first record or updates the existing one. */
    @PutMapping
    public FindingReviewResponse saveFindingReview(
            @PathVariable Long symptomRecordId,
            @Valid @RequestBody UpsertFindingReviewRequest request
    ) {
        return findingReviewService.saveFindingReview(symptomRecordId, request);
    }
}