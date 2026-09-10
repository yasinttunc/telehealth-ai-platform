package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.response.SymptomRecordResponse;
import com.project.ibm.telehealth_with_ai.service.SymptomRecordService;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Staff-only HTTP API for immutable AI-Generated symptom-extraction results.
 */
@RestController
@RequestMapping("/api")
public class SymptomRecordController {
    private final SymptomRecordService symptomRecordService;
    public SymptomRecordController(SymptomRecordService symptomRecordService) {
        this.symptomRecordService = symptomRecordService;
    }

    @GetMapping("/consultations/{consultationId}/symptom-records")
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    public List<SymptomRecordResponse> listForConsultation(
            @PathVariable Long consultationId
    ) {
        return symptomRecordService.getForConsultation(consultationId);
    }

    @GetMapping("/symptom-records/{symptomRecordId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    public SymptomRecordResponse getById(@PathVariable Long symptomRecordId){
        return symptomRecordService.getById(symptomRecordId);
    }
}
