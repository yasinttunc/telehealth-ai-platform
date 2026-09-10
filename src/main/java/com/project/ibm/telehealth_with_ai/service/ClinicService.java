package com.project.ibm.telehealth_with_ai.service;


import com.project.ibm.telehealth_with_ai.dto.request.CreateClinicRequest;
import com.project.ibm.telehealth_with_ai.dto.request.CreateDoctorRequest;
import com.project.ibm.telehealth_with_ai.dto.request.UpdateClinicRequest;
import com.project.ibm.telehealth_with_ai.dto.response.ClinicResponse;
import com.project.ibm.telehealth_with_ai.dto.response.DoctorResponse;
import com.project.ibm.telehealth_with_ai.dto.response.PatientResponse;
import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.exception.DuplicateResourceException;
import com.project.ibm.telehealth_with_ai.exception.ResourceNotFoundException;
import com.project.ibm.telehealth_with_ai.model.Clinic;
import com.project.ibm.telehealth_with_ai.model.Doctor;
import com.project.ibm.telehealth_with_ai.model.Patient;
import com.project.ibm.telehealth_with_ai.repository.ClinicRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;

@Service
@Transactional
public class ClinicService {

    private final ClinicRepository clinicRepository;
    public ClinicService(ClinicRepository clinicRepository) {
        this.clinicRepository = clinicRepository;
    }

    private ClinicResponse toResponse(Clinic clinic) {

        ClinicResponse response = new ClinicResponse();
        response.setClinicId(clinic.getClinicId());
        response.setClinicName(clinic.getClinicName());
        response.setClinicAddress(clinic.getClinicAddress());

        return response;
    }

    public ClinicResponse createClinic(CreateClinicRequest request){
        Clinic clinic = new Clinic();
        if (clinicRepository.existsByClinicName(request.getClinicName())) {
            throw new DuplicateResourceException("Clinic name already exists");
        }
        clinic.setClinicName(request.getClinicName());
        clinic.setClinicAddress(request.getClinicAddress());
        clinicRepository.save(clinic);
        return toResponse(clinic);
    }

    public ClinicResponse updateClinic(Long clinicId, UpdateClinicRequest request){
        Clinic clinic = clinicRepository.findById(clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));
        clinic.setClinicName(request.getClinicName());
        clinic.setClinicAddress(request.getClinicAddress());
        clinicRepository.save(clinic);
        return toResponse(clinic);
    }

    public ClinicResponse getClinicById(Long clinicId){
        Clinic clinic = clinicRepository.findById(clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));
        return toResponse(clinic);
    }
    public ClinicResponse getClinicByName(String clinicName){
        Clinic clinic = clinicRepository.findByClinicName(clinicName);
        if (clinic == null) {
            throw new ResourceNotFoundException("Clinic not found");
        }
        return toResponse(clinic);
    }
    public boolean isClinicExist(Long clinicId) {
        return clinicId != null && clinicRepository.existsById(clinicId);
    }
    public List<ClinicResponse> getAllClinics(){
        return clinicRepository.findAll()
                .stream()
                .map(this::toResponse)
                .toList();
    }
    public void deleteClinic(Long clinicId){
        if (!isClinicExist(clinicId)) {
            throw new ResourceNotFoundException("Clinic not found");
        }
        clinicRepository.deleteById(clinicId);
    }

}
