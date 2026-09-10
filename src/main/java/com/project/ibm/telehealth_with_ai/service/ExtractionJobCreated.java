package com.project.ibm.telehealth_with_ai.service;

/**
 * Application event published after an extraction job is committed.
 */
public record ExtractionJobCreated(Long jobId) {
}
