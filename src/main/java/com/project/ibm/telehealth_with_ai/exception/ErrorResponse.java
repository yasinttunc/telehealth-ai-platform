package com.project.ibm.telehealth_with_ai.exception;

import java.time.Instant;
import java.util.Map;

public class ErrorResponse {
    private final Instant timestamp = Instant.now();
    private final int status;
    private final String message;
    private final String path;
    private final Map<String, String> fieldErrors;

    public ErrorResponse(int status, String message, String path) {
        this(status, message, path, Map.of());
    }

    public ErrorResponse(int status, String message, String path,
                         Map<String, String> fieldErrors) {
        this.status = status;
        this.message = message;
        this.path = path;
        this.fieldErrors = Map.copyOf(fieldErrors);
    }

    public int getStatus() {
        return status;
    }
    public String getMessage() {
        return message;
    }
    public String getPath() {
        return path;
    }
    public Instant getTimestamp() {
        return timestamp;
    }

    public Map<String, String> getFieldErrors() {
        return fieldErrors;
    }

}
