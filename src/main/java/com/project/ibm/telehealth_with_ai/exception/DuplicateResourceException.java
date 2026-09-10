package com.project.ibm.telehealth_with_ai.exception;

/*
Example cases:
   Username already exists
    Email already exists
    NHS number already exists
 */

public class DuplicateResourceException extends RuntimeException{
    public DuplicateResourceException(String message) {
        super(message);
    }
}
