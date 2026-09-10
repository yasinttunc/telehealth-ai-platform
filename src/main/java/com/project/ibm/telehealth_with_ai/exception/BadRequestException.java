package com.project.ibm.telehealth_with_ai.exception;


/*
    Example cases:
    Invalid role
    Password confirmation does not match
    Consultation end time is before start time
 */

public class BadRequestException extends RuntimeException{

    public BadRequestException(String message) {
        super(message);
    }
}
