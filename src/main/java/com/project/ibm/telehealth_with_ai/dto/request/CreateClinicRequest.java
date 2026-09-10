package com.project.ibm.telehealth_with_ai.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Carries the details required to create a clinic used for grouping consultations and alerts.
 */
public class CreateClinicRequest {

    @NotBlank(message = "Clinic name is required")
    @Size(max = 160, message = "Clinic name must be 160 characters or fewer")
    private String clinicName;

    @NotBlank(message = "Clinic address is required")
    @Size(max = 255, message = "Clinic address must be 255 characters or fewer")
    private String clinicAddress;

    public String getClinicName() {
        return clinicName;
    }

    public void setClinicName(String clinicName) {
        this.clinicName = clinicName;
    }

    public String getClinicAddress() {
        return clinicAddress;
    }

    public void setClinicAddress(String clinicAddress) {
        this.clinicAddress = clinicAddress;
    }

}
