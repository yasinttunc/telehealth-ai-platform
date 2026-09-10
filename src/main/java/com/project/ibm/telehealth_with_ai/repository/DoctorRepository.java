package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.Doctor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface DoctorRepository extends JpaRepository<Doctor, Long> {

    Doctor findByDoctorId(Long doctorId);
    List<Doctor> findBySpecialtyIgnoreCase(String specialty);

    List<Doctor> findByAvailableTimesContains(Instant time);
    List<Doctor> findAll();
    List<Doctor> findByAppUserEnabledTrue();
    boolean existsByAppUserUserId(Long userId);

}
