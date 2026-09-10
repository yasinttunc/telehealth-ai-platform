package com.project.ibm.telehealth_with_ai.config;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** External configuration for choosing the active extraction provider. */
@ConfigurationProperties(prefix = "app.ai")
public class AiExtractionProperties {

    private String provider = "mock";
    // Why: @ConfigurationProperties maps app.ai.* values to this class. baseUrl is not an OpenAI URL
    // and contains no secret. It is only the private address of the local Python process.
    private String baseUrl = "http://127.0.0.1:8000";
    private int timeoutSeconds = 45;
    private String promptVersion ="symptom-extraction-v1";

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public int getTimeoutSeconds() {
        return timeoutSeconds;
    }

    public void setTimeoutSeconds(int timeoutSeconds) {
        this.timeoutSeconds = timeoutSeconds;
    }

    public String getPromptVersion() {
        return promptVersion;
    }

    public void setPromptVersion(String promptVersion) {
        this.promptVersion = promptVersion;
    }
}
