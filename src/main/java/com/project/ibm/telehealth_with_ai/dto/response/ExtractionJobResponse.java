package com.project.ibm.telehealth_with_ai.dto.response;

import com.project.ibm.telehealth_with_ai.model.ExtractionJobStatus;

import java.time.Instant;

public record ExtractionJobResponse(
        Long extractionJobId,
        Long consultationId,
        Integer transcriptRevision,
        ExtractionJobStatus status,
        Long resultSymptomRecordId,
        String errorMessage,
        Instant createdAt,
        Instant startedAt,
        Instant completedAt
) { }
