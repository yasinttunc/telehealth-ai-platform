package com.project.ibm.telehealth_with_ai.dto.response;

/**
 * Returns clinic details used to group consultations, symptoms, and alerts.
 */
public class ClinicResponse {

    private Long clinicId;
    private String clinicName;
    private String clinicAddress;

    public Long getClinicId() {
        return clinicId;
    }

    public void setClinicId(Long clinicId) {
        this.clinicId = clinicId;
    }

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
