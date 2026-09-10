package com.project.ibm.telehealth_with_ai.dto.request;

import jakarta.validation.constraints.*;
import jakarta.validation.Valid;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Carries the data required to create a doctor/clinician profile.
 */
public class CreateDoctorRequest {

    @NotBlank(message = "First name is required")
    @Size(max = 100, message = "First name must be 100 characters or fewer")
    private String firstName;

    @NotBlank(message = "Last name is required")
    @Size(max = 100, message = "Last name must be 100 characters or fewer")
    private String lastName;

    @NotBlank(message = "Specialty is required")
    @Size(max = 100, message = "Specialty must be 100 characters or fewer")
    private String specialty;

    @Valid
    private List<@Future(message = "Available times must be in the future") Instant> availableTimes;

    @NotBlank(message = "Username is required")
    @Size(min = 3, max = 50, message = "Username must be between 3 and 50 characters")
    private String username;
    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;
    @NotBlank(message = "Password is required")
    @Size(min = 8, max = 100, message = "Password must be between 8 and 100 characters")
    private String password;

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
    public List<Instant>getAvailableTimes() {
        return availableTimes;
    }
    public void setAvailableTimes(List<Instant>availableTimes) {
        this.availableTimes = availableTimes;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
