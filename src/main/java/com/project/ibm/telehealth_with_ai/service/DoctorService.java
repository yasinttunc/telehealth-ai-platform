package com.project.ibm.telehealth_with_ai.service;

// Imports the request DTO used when creating a new doctor.
import com.project.ibm.telehealth_with_ai.dto.request.CreateDoctorRequest;

// Imports the request DTO used when updating an existing doctor.
import com.project.ibm.telehealth_with_ai.dto.request.UpdateDoctorRequest;

// Imports the response DTO returned to controllers/API clients.
import com.project.ibm.telehealth_with_ai.dto.response.DoctorResponse;

// Imports the Doctor JPA entity that is saved to/read from the database.
import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.exception.DuplicateResourceException;
import com.project.ibm.telehealth_with_ai.exception.ResourceNotFoundException;
import com.project.ibm.telehealth_with_ai.model.AppUser;
import com.project.ibm.telehealth_with_ai.model.Doctor;

// Imports the repository that handles database operations for Doctor.
import com.project.ibm.telehealth_with_ai.repository.AppUserRepository;
import com.project.ibm.telehealth_with_ai.repository.DoctorRepository;

// Marks this class as a Spring service bean.
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

// Gives service methods transactional database boundaries.
import org.springframework.transaction.annotation.Transactional;

// Java collection type used when returning many doctors.
import java.util.List;


@Service
@Transactional
public class DoctorService {

    private final DoctorRepository doctorRepository;
    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;

    public DoctorService(DoctorRepository doctorRepository, AppUserRepository appUserRepository, PasswordEncoder passwordEncoder) {
        this.doctorRepository = doctorRepository;
        this.appUserRepository = appUserRepository;
        this.passwordEncoder = passwordEncoder;
    }

    private DoctorResponse toResponse(Doctor doctor) {
        DoctorResponse response = new DoctorResponse();
        response.setAppUserId(
                doctor.getAppUser() == null
                        ? null
                        : doctor.getAppUser().getUserId()
        );
        response.setDoctorId(doctor.getDoctorId());
        response.setFirstName(doctor.getFirstName());
        response.setLastName(doctor.getLastName());
        response.setSpecialty(doctor.getSpecialty());
        response.setCreatedAt(doctor.getCreatedAt());
        response.setAvailableTimes(doctor.getAvailableTimes() == null
                ? List.of()
                : List.copyOf(doctor.getAvailableTimes()));
        return response;
    }

    public DoctorResponse createDoctor(CreateDoctorRequest request) {
        String username = request.getUsername().trim();
        String email = request.getEmail().trim();

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
         account.setEnabled(true);
         account.setRole(AppUser.Role.DOCTOR);

        AppUser savedAccount = appUserRepository.save(account);

        Doctor doctor = new Doctor();
        doctor.setAppUser(savedAccount);
        doctor.setFirstName(request.getFirstName().trim());
        doctor.setLastName(request.getLastName().trim());
        doctor.setSpecialty(request.getSpecialty().trim());
        doctor.setAvailableTimes(request.getAvailableTimes());

        Doctor savedDoctor = doctorRepository.save(doctor);
        return toResponse(savedDoctor);
    }

    // Read-only transaction because this method
    @Transactional(readOnly = true)
    public List<DoctorResponse> getAllDoctors() {
        return doctorRepository.findByAppUserEnabledTrue()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public DoctorResponse getDoctorById(Long id) {
        Doctor doctor = doctorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));
        return toResponse(doctor);
    }

    @Transactional(readOnly = true)
    public List<DoctorResponse> getDoctorsBySpecialty(String specialty) {
        return doctorRepository.findBySpecialtyIgnoreCase(specialty)
                .stream()
                .filter(doctor -> doctor.getAppUser() != null && doctor.getAppUser().isEnabled())
                .map(this::toResponse)
                .toList();
    }

    public DoctorResponse updateDoctor(Long id, UpdateDoctorRequest request) {

        Doctor doctor = doctorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));

        AppUser account = doctor.getAppUser();
        if(account == null){
            throw new BadRequestException("Doctor account not found");
        }

        String username = request.getUsername().trim();
        String email = request.getEmail().trim();

        if (appUserRepository.existsByUsernameIgnoreCaseAndUserIdNot(username, account.getUserId())) {
            throw new DuplicateResourceException("Username already exists");
        }

        if (appUserRepository.existsByEmailAndUserIdNot(email, account.getUserId())) {
            throw new DuplicateResourceException("Email already exists");
        }

        account.setUsername(username);
        account.setEmail(email);
        account.setEnabled(request.isEnabled());
        appUserRepository.save(account);

        doctor.setFirstName(request.getFirstName().trim());
        doctor.setLastName(request.getLastName().trim());
        doctor.setSpecialty(request.getSpecialty().trim());
        doctor.setAvailableTimes(request.getAvailableTimes());

        Doctor savedDoctor = doctorRepository.save(doctor);
        return toResponse(savedDoctor);
    }

    public void deleteDoctor(Long id) {
        Doctor doctor = doctorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));
        AppUser account = doctor.getAppUser();
        if (account == null) {
            throw new BadRequestException("Doctor account not found");
        }
        account.setEnabled(false);
        appUserRepository.save(account);
    }

    public boolean isDoctorExist(Long doctorId) {
        return doctorId != null && doctorRepository.existsById(doctorId);
    }




}
