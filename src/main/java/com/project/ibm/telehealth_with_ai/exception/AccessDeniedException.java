package com.project.ibm.telehealth_with_ai.exception;

/** Signals an authenticated user is not allowed to access the requested resource. */
public class AccessDeniedException extends RuntimeException {

    public AccessDeniedException(String message) {
        super(message);
    }
}
