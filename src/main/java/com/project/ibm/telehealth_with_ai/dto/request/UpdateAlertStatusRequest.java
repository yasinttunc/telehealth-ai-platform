package com.project.ibm.telehealth_with_ai.dto.request;

import com.project.ibm.telehealth_with_ai.model.AlertStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Request body used by staff to move one alert through its workflow. */
public class UpdateAlertStatusRequest {

    @NotNull
    private AlertStatus status;

    @Size(max = 500)
    private String note;

    public AlertStatus getStatus() {
        return status;
    }

    public void setStatus(AlertStatus status) {
        this.status = status;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}