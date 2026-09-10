package com.project.ibm.telehealth_with_ai.dto.response;

import com.project.ibm.telehealth_with_ai.model.AlertStatus;
import java.time.Instant;

/** API representation of a workflow history row. */
public record AlertStatusEventResponse(
        Long alertStatusEventId,
        AlertStatus previousStatus,
        AlertStatus newStatus,
        Long changedBy,
        String changedByUsername,
        boolean systemGenerated,
        String note,
        Instant createdAt
) {
}