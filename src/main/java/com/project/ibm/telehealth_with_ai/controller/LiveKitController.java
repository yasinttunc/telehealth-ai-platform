package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.response.LiveKitTokenResponse;
import com.project.ibm.telehealth_with_ai.service.LiveKitTokenService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exposes short-lived room credentials to consultation participants.
 */
@RestController
@RequestMapping("/api/consultations")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Video rooms", description = "Short-lived LiveKit access tokens for consultation participants.")
public class LiveKitController {

    private final LiveKitTokenService  liveKitTokenService;

    public LiveKitController(LiveKitTokenService liveKitTokenService) {
        this.liveKitTokenService = liveKitTokenService;
    }

    /**
     * Spring first validates the JWT, role, consultation ownership and status.
     */
    @PostMapping("/{consultationId}/livekit-token")
    @PreAuthorize("hasAnyRole('DOCTOR', 'PATIENT')")
    public LiveKitTokenResponse createLiveKitToken(
            @PathVariable Long consultationId
    ){
        return liveKitTokenService.createToken(consultationId);
    }

}
