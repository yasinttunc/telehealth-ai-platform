package com.project.ibm.telehealth_with_ai.model;

/**
 * AI providers can be slow or unavailable. A failed provider should create a failed job, not corrupt the consultation.
 * Lifecycle state of one AI extraction request.
 */
public enum ExtractionJobStatus {
    PENDING,
    RUNNING,
    SUCCEEDED,
    FAILED,
}
