package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.dto.request.CreatePatientRequest;
import com.project.ibm.telehealth_with_ai.dto.request.UpdatePatientRequest;
import com.project.ibm.telehealth_with_ai.dto.response.PatientResponse;
import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.exception.DuplicateResourceException;
import com.project.ibm.telehealth_with_ai.exception.ResourceNotFoundException;
import com.project.ibm.telehealth_with_ai.model.AppUser;
import com.project.ibm.telehealth_with_ai.model.Patient;
import com.project.ibm.telehealth_with_ai.repository.AppUserRepository;
import com.project.ibm.telehealth_with_ai.repository.PatientRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional
public class PatientService {

    private final PatientRepository patientRepository;
    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;

    public PatientService(
            PatientRepository patientRepository,
            AppUserRepository appUserRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.patientRepository = patientRepository;
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public PatientResponse createPatient(CreatePatientRequest request) {
        if (patientRepository.existsByNhsNumber(request.getNhsNumber())) {
            throw new DuplicateResourceException("NHS number already exists");
        }

        String username = request.getUsername().trim();
        String email = request.getEmail().trim().toLowerCase();

        if (appUserRepository.findByUsernameIgnoreCase(username) != null) {
            throw new DuplicateResourceException("Username already exists");
        }
        if (appUserRepository.findByEmail(email) != null) {
            throw new DuplicateResourceException("Email already exists");
        }

        AppUser account = new AppUser();
        account.setUsername(username);
        account.setEmail(email);
        account.setPassword(passwordEncoder.encode(request.getPassword()));
        account.setRole(AppUser.Role.PATIENT);
        account.setEnabled(true);
        AppUser savedAccount = appUserRepository.save(account);

        Patient patient = new Patient();
        patient.setAppUser(savedAccount);
        patient.setNhsNumber(request.getNhsNumber().trim());
        patient.setFirstName(request.getFirstName().trim());
        patient.setLastName(request.getLastName().trim());
        patient.setDateOfBirth(request.getDateOfBirth());

        Patient saved = patientRepository.save(patient);

        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<PatientResponse> getAllPatients() {
        return patientRepository.findByAppUserIsNullOrAppUserEnabledTrue()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public PatientResponse getPatientById(Long id) {
        Patient patient = patientRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));

        return toResponse(patient);
    }

    @Transactional(readOnly = true)
    public PatientResponse getPatientByNhsNumber(String nhsNumber) {
        Patient patient = patientRepository.findByNhsNumber(nhsNumber);

        if (patient == null) {
            throw new ResourceNotFoundException("Patient not found");
        }

        return toResponse(patient);
    }

    public PatientResponse updatePatient(Long id, UpdatePatientRequest request) {
        Patient patient = patientRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));

        AppUser account = patient.getAppUser();
        if (account == null) {
            throw new BadRequestException("Patient account not found");
        }

        String username = request.getUsername().trim();
        String email = request.getEmail().trim().toLowerCase();
        if (appUserRepository.existsByUsernameIgnoreCaseAndUserIdNot(username, account.getUserId())) {
            throw new DuplicateResourceException("Username already exists");
        }
        if (appUserRepository.existsByEmailAndUserIdNot(email, account.getUserId())) {
            throw new DuplicateResourceException("Email already exists");
        }

        account.setUsername(username);
        account.setEmail(email);
        account.setEnabled(request.getEnabled());
        appUserRepository.save(account);

        patient.setFirstName(request.getFirstName().trim());
        patient.setLastName(request.getLastName().trim());
        patient.setDateOfBirth(request.getDateOfBirth());

        Patient saved = patientRepository.save(patient);

        return toResponse(saved);
    }

    public void deletePatient(Long id) {
        Patient patient = patientRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));
        AppUser account = patient.getAppUser();
        if (account == null) {
            throw new BadRequestException("Patient account not found");
        }
        account.setEnabled(false);
        appUserRepository.save(account);
    }

    @Transactional(readOnly = true)
    public boolean isPatientExist(Long patientId) {
        return patientId != null && patientRepository.existsById(patientId);
    }

    private PatientResponse toResponse(Patient patient) {
        PatientResponse response = new PatientResponse();
        response.setPatientId(patient.getPatientId());
        response.setNhsNumber(patient.getNhsNumber());
        response.setFirstName(patient.getFirstName());
        response.setLastName(patient.getLastName());
        response.setDateOfBirth(patient.getDateOfBirth());
        response.setCreatedAt(patient.getCreatedAt());
        response.setAppUserId(
                patient.getAppUser() == null
                        ? null
                        : patient.getAppUser().getUserId()
        );
        return response;
    }
}
