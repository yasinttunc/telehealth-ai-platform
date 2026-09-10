package com.project.ibm.telehealth_with_ai.exception;

/** Returned when a request was based on stale resource state. */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
