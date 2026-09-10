package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.Clinic;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ClinicRepository extends JpaRepository<Clinic, Long> {
    public Clinic findByClinicId(Long clinicId);
    public Clinic findByClinicName(String clinicName);
    public Clinic findByClinicAddress(String clinicAddress);
    List<Clinic> findAll();
    boolean existsByClinicName(String clinicName);
    boolean existsByClinicId(Long clinicId);
}
