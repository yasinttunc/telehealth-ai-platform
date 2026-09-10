package com.project.ibm.telehealth_with_ai.dto.response;

import com.project.ibm.telehealth_with_ai.model.AlertStatus;
import java.math.BigDecimal;
import java.time.Instant;

/** Safe API representation for the alert list and drawer. */
public record AlertResponse(
        Long alertId,
        Long clinicId,
        String clinicName,
        String symptomCode,
        String symptomName,
        Instant windowStart,
        Instant windowEnd,
        Integer observedCount,
        BigDecimal baselineCount,
        BigDecimal score,
        BigDecimal threshold,
        String severity,
        AlertStatus status,
        String detectorVersion,
        long evidenceCount,
        Instant createdAt,
        Instant updatedAt,
        Instant lastEvaluatedAt
) {
}