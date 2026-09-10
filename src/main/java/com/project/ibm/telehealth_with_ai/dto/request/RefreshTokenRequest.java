package com.project.ibm.telehealth_with_ai.dto.request;

import jakarta.validation.constraints.NotBlank;

/**
 * Carries a refresh token when the client asks for a new access token.
 */
public class RefreshTokenRequest {

    @NotBlank(message = "Refresh token is required")
    private String refreshToken;

    public String getRefreshToken() {
        return refreshToken;
    }

    public void setRefreshToken(String refreshToken) {
        this.refreshToken = refreshToken;
    }
}
