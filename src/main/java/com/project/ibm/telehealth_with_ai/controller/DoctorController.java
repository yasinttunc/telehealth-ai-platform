package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.request.CreateDoctorRequest;
import com.project.ibm.telehealth_with_ai.dto.request.UpdateDoctorRequest;
import com.project.ibm.telehealth_with_ai.dto.response.DoctorResponse;
import com.project.ibm.telehealth_with_ai.model.Doctor;
import com.project.ibm.telehealth_with_ai.repository.DoctorRepository;
import com.project.ibm.telehealth_with_ai.service.DoctorService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/doctors")
public class DoctorController {

    private final DoctorService doctorService;

    public DoctorController(DoctorService doctorService) {
        this.doctorService = doctorService;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public ResponseEntity<DoctorResponse> createDoctor(
            @Valid @RequestBody CreateDoctorRequest request
    ){
        return ResponseEntity.status(HttpStatus.CREATED).body(doctorService.createDoctor(request));
    }

    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR','PATIENT')")
    @GetMapping
    public List<DoctorResponse> getAllDoctors(){
        return doctorService.getAllDoctors();
    }

    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR','PATIENT')")
    @GetMapping("/{id}")
    public DoctorResponse getDoctorById(@PathVariable Long id){
        return doctorService.getDoctorById(id);
    }

    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR','PATIENT')")
    @GetMapping("/specialty/{specialty}")
    public List<DoctorResponse> getDoctorsBySpecialty(@PathVariable String specialty){
        return doctorService.getDoctorsBySpecialty(specialty);
    }

    @PreAuthorize("hasAnyRole('ADMIN')")
    @PutMapping("/{id}")
    public DoctorResponse updateDoctor(
            @PathVariable Long id,
            @Valid @RequestBody UpdateDoctorRequest request
    ){
        return doctorService.updateDoctor(id,request);
    }

    @PreAuthorize("hasAnyRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteDoctor(@PathVariable Long id){
        doctorService.deleteDoctor(id);
        return ResponseEntity.noContent().build();
    }











}
