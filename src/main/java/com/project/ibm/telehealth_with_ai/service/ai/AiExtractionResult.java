package com.project.ibm.telehealth_with_ai.service.ai;
import com.project.ibm.telehealth_with_ai.dto.response.SymptomItem;

import java.util.List;

/**
 * Provider-neutral result used by the clinical workflow before persistence.
 * It contains no database entity and no HTTP concern.
 */

public record AiExtractionResult(
        List <SymptomItem> items,
        String modelName,
        String promptVersion
) {
}
