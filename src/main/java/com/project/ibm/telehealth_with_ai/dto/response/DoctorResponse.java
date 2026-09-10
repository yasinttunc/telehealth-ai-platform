package com.project.ibm.telehealth_with_ai.dto.response;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Returns doctor/clinician profile data for scheduling and admin management.
 */
public class DoctorResponse {

    private Long doctorId;
    private String firstName;
    private String lastName;
    private String specialty;
    private List<Instant> availableTimes;
    private Instant createdAt;

    private Long appUserId;

    public Long getAppUserId() {
        return appUserId;
    }

    public void setAppUserId(Long appUserId) {
        this.appUserId = appUserId;
    }

    public Long getDoctorId() {
        return doctorId;
    }

    public void setDoctorId(Long doctorId) {
        this.doctorId = doctorId;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public String getSpecialty() {
        return specialty;
    }

    public void setSpecialty(String specialty) {
        this.specialty = specialty;
    }

    public List<Instant> getAvailableTimes() {
        return availableTimes;
    }

    public void setAvailableTimes(List<Instant> availableTimes) {
        this.availableTimes = availableTimes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
