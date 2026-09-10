package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.request.CreateClinicRequest;
import com.project.ibm.telehealth_with_ai.dto.request.UpdateClinicRequest;
import com.project.ibm.telehealth_with_ai.dto.request.UpdateDoctorRequest;
import com.project.ibm.telehealth_with_ai.dto.response.ClinicResponse;
import com.project.ibm.telehealth_with_ai.dto.response.DoctorResponse;
import com.project.ibm.telehealth_with_ai.service.ClinicService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/clinics")
public class ClinicController {

    private final ClinicService clinicService;
    public ClinicController(ClinicService clinicService) {
        this.clinicService = clinicService;
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ClinicResponse> create(
            @Valid @RequestBody CreateClinicRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(clinicService.createClinic(request));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR', 'PATIENT')")
    public ClinicResponse getById(@PathVariable Long id) {
        return clinicService.getClinicById(id);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR', 'PATIENT')")
    public List<ClinicResponse> getAll() {
        return clinicService.getAllClinics();
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ClinicResponse updateDoctor(
            @PathVariable Long id,
            @Valid @RequestBody UpdateClinicRequest request
    ){
        return clinicService.updateClinic(id,request);
    }
    @PreAuthorize("hasAnyRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteDoctor(@PathVariable Long id){
        clinicService.deleteClinic(id);
        return ResponseEntity.noContent().build();
    }
}
