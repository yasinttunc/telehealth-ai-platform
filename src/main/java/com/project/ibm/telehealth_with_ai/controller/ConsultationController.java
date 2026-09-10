package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.request.ApproveTranscriptRequest;
import com.project.ibm.telehealth_with_ai.dto.request.UpdateConsultationStatusRequest;
import com.project.ibm.telehealth_with_ai.dto.request.UpdateTranscriptRequest;
import com.project.ibm.telehealth_with_ai.dto.response.TranscriptSegmentResponse;
import org.springframework.web.bind.annotation.PutMapping;
import com.project.ibm.telehealth_with_ai.dto.request.CreateConsultationRequest;
import com.project.ibm.telehealth_with_ai.dto.response.ConsultationResponse;
import com.project.ibm.telehealth_with_ai.service.ConsultationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/consultations")
public class ConsultationController {

    private final ConsultationService consultationService;
    public ConsultationController(ConsultationService consultationService) {
        this.consultationService = consultationService;
    }

    @GetMapping("/mine")
    @PreAuthorize("hasAnyRole('DOCTOR', 'PATIENT')")
    public List<ConsultationResponse> getMine() {
        return consultationService.getMyConsultations();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    public ResponseEntity<ConsultationResponse> createConsultation(
            @Valid @RequestBody CreateConsultationRequest request
    ){
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(consultationService.createConsultation(request));
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<ConsultationResponse> getAll() {
        return consultationService.getAllConsultations();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR', 'PATIENT')")
    public ConsultationResponse getById(@PathVariable Long id) {
        return consultationService.getConsultationById(id);
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    public ConsultationResponse updateConsultationStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateConsultationStatusRequest request
    ){
        return consultationService.updateStatus(id,request);
    }

    @PutMapping("/{id}/transcript")
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    public ConsultationResponse updateTranscript(
            @PathVariable Long id,
            @Valid @RequestBody UpdateTranscriptRequest request
    ){
        return consultationService.updateTranscript(id,request);
    }

    @GetMapping("/{id}/transcript-segments")
    @PreAuthorize("hasAnyRole('ADMIN','DOCTOR')")
    public List<TranscriptSegmentResponse> getTranscriptSegments(
            @PathVariable Long id
    ){
        return consultationService.getTranscriptSegments(id);
    }

    @PostMapping("/{id}/approve-transcript")
    @PreAuthorize("hasRole('DOCTOR')")
    public ConsultationResponse approveTranscript(
            @PathVariable Long id,
            @Valid @RequestBody ApproveTranscriptRequest request
    ){
        return consultationService.approveTranscript(id,request);
    }


}
