package com.project.ibm.telehealth_with_ai.exception;

/**
 * Indicates that the external video service is not currently configured.
 */
public class LiveKitUnavailableException extends RuntimeException {

    public LiveKitUnavailableException(String message) {
        super(message);
    }
}