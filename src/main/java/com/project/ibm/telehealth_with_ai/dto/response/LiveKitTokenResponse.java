package com.project.ibm.telehealth_with_ai.dto.response;

public record LiveKitTokenResponse(
        String roomName,
        String serverUrl,
        String token,
        long expiresInSeconds
) {}