package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.request.UpdateAlertStatusRequest;
import com.project.ibm.telehealth_with_ai.dto.response.AlertEvidenceResponse;
import com.project.ibm.telehealth_with_ai.dto.response.AlertResponse;
import com.project.ibm.telehealth_with_ai.dto.response.AlertStatusEventResponse;
import com.project.ibm.telehealth_with_ai.model.AlertStatus;
import com.project.ibm.telehealth_with_ai.service.AlertService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Clinic trend alert API for administrators and Doctors. */
@RestController
@RequestMapping("/api/alerts")
@PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
public class AlertController {

    private final AlertService alertService;

    public AlertController(AlertService alertService) {
        this.alertService = alertService;
    }

    /** Lists authorised alerts with optional status and date filters. */
    @GetMapping
    public List<AlertResponse> listAuthorisedAlerts(
            @RequestParam(required = false) AlertStatus status,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to
    ) {
        return alertService.list(status, from, to);
    }

    /** Returns the consultation evidence that produced the alert count. */
    @GetMapping("/{alertId}/evidence")
    public List<AlertEvidenceResponse> getEvidence(@PathVariable Long alertId) {
        return alertService.evidence(alertId);
    }

    /** Returns alert workflow audit history in chronological order. */
    @GetMapping("/{alertId}/history")
    public List<AlertStatusEventResponse> getHistory(@PathVariable Long alertId) {
        return alertService.history(alertId);
    }

    /** Changes alert status; the service requires a note for closing actions. */
    @PutMapping("/{alertId}/status")
    public AlertResponse updateStatus(
            @PathVariable Long alertId,
            @Valid @RequestBody UpdateAlertStatusRequest request
    ) {
        return alertService.updateStatus(alertId, request);
    }
}