package com.project.ibm.telehealth_with_ai.dto.request;

import com.project.ibm.telehealth_with_ai.model.ConsultationStatus;
import jakarta.validation.constraints.NotNull;

public class UpdateConsultationStatusRequest {

    @NotNull
    private ConsultationStatus status;

    public ConsultationStatus getStatus() {
        return status;
    }
    public void setStatus(ConsultationStatus status) {
        this.status = status;
    }
}
