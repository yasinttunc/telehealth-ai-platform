package com.project.ibm.telehealth_with_ai.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.List;
import java.time.LocalDateTime;

@Entity
@Table(name = "doctor")
public class Doctor {
    public Doctor() {}

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long doctorId;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "app_user_id", unique = true)
    private AppUser appUser;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    @Column(name= "specialty", nullable = false, length = 100)
    private String specialty;

    @ElementCollection
    @CollectionTable(
            name = "available_times",
            joinColumns = @JoinColumn(name = "doctor_id")
    )
    @Column(name = "available_at")
    private List<Instant> availableTimes;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

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

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public AppUser getAppUser() {
        return appUser;
    }

    public void setAppUser(AppUser appUser) {
        this.appUser = appUser;
    }

    public List<Instant> getAvailableTimes() {
        return availableTimes;
    }

    public void setAvailableTimes(List<Instant> availableTimes) {
        this.availableTimes = availableTimes;
    }
}
