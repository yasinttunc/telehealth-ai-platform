package com.project.ibm.telehealth_with_ai.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Enables the server-side watchdog for abandoned transcription sessions.
 */
@Configuration
@EnableScheduling
public class TranscriptionSchedulingConfig {

}
