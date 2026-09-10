package com.project.ibm.telehealth_with_ai.exception;

/** Signals an authentication failure for a public route such as login. */
public class UnauthorizedException extends RuntimeException {
    public UnauthorizedException(String message) {
        super(message);
    }
}
