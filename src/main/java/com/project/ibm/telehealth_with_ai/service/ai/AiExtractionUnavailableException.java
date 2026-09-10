package com.project.ibm.telehealth_with_ai.service.ai;

/** Signals a provider failure without exposing provider internals to the client. */
public class AiExtractionUnavailableException extends RuntimeException {

    public AiExtractionUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }

    public AiExtractionUnavailableException(String message) {
        super(message);
    }
}