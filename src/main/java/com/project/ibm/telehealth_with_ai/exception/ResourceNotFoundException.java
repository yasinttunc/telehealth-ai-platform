package com.project.ibm.telehealth_with_ai.exception;

/*
Example cases:
    Patient not found
    Doctor not found
    User not found
    Consultation not found
 */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
