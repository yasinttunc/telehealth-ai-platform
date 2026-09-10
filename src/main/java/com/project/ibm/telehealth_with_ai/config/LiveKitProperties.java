package com.project.ibm.telehealth_with_ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

/**
 * Holds trusted LiveKit server configuration.
 *
 * These values must come from backend environment variables.
 * They must never be returned directly to the browser.
 */
@ConfigurationProperties(prefix = "app.livekit")
public class LiveKitProperties {
    private String url;
    private  String apiKey;
    private  String apiSecret;
    private long tokenTtlMs = 120_000;

    /**
     * Checks whether all required LiveKit credentials are available.
     */
    public boolean isConfigured() {
        return StringUtils.hasText(url)
                && StringUtils.hasText(apiKey)
                && StringUtils.hasText(apiSecret);
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getApiSecret() {
        return apiSecret;
    }

    public void setApiSecret(String apiSecret) {
        this.apiSecret = apiSecret;
    }

    public long getTokenTtlMs() {
        return tokenTtlMs;
    }

    public void setTokenTtlMs(long tokenTtlMs) {
        this.tokenTtlMs = tokenTtlMs;
    }
}
