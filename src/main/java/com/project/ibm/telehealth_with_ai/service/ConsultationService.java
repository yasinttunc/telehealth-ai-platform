package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.config.LiveKitProperties;
import com.project.ibm.telehealth_with_ai.dto.request.*;
import com.project.ibm.telehealth_with_ai.dto.response.ConsultationResponse;
import com.project.ibm.telehealth_with_ai.dto.response.TranscriptSegmentResponse;
import com.project.ibm.telehealth_with_ai.dto.response.TranscriptionBootstrapResponse;
import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.exception.ConflictException;
import com.project.ibm.telehealth_with_ai.exception.ResourceNotFoundException;
import com.project.ibm.telehealth_with_ai.model.*;
import com.project.ibm.telehealth_with_ai.repository.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.security.access.AccessDeniedException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@Transactional
public class ConsultationService {

    private final ConsultationRepository consultationRepository;
    private final PatientRepository patientRepository;
    private final AppUserRepository appUserRepository;
    private final ClinicRepository clinicRepository;
    private final TranscriptionSegmentRepository transcriptionSegmentRepository;
    private final LiveKitTokenService liveKitTokenService;
    private final LiveKitProperties liveKitProperties;

    public ConsultationService(ConsultationRepository consultationRepository, PatientRepository patientRepository, AppUserRepository appUserRepository, ClinicRepository clinicRepository, TranscriptionSegmentRepository transcriptionSegmentRepository, LiveKitTokenService liveKitTokenService, LiveKitProperties liveKitProperties) {
        this.consultationRepository = consultationRepository;
        this.patientRepository = patientRepository;
        this.appUserRepository = appUserRepository;
        this.clinicRepository = clinicRepository;
        this.transcriptionSegmentRepository = transcriptionSegmentRepository;
        this.liveKitTokenService = liveKitTokenService;
        this.liveKitProperties = liveKitProperties;
    }

    private ConsultationResponse toResponse(Consultation consultation) {
        ConsultationResponse response = new ConsultationResponse();
        response.setConsultationId(consultation.getConsultationId());
        response.setPatientId(consultation.getPatient().getPatientId());
        response.setPatientName(
                consultation.getPatient().getFirstName() + " "
                        + consultation.getPatient().getLastName()
        );
        response.setClinicianId(consultation.getClinician().getUserId());
        response.setClinicianUsername(consultation.getClinician().getUsername());
        response.setClinicId(consultation.getClinic().getClinicId());
        response.setClinicName(consultation.getClinic().getClinicName());
        response.setScheduledAt(consultation.getScheduledAt());
        response.setStatus(consultation.getStatus());
        response.setStartedAt(consultation.getStartedAt());
        response.setEndedAt(consultation.getEndedAt());
        response.setTranscript(consultation.getTranscript());
        response.setTranscriptionStatus(consultation.getTranscriptionStatus());
        response.setTranscriptionFinalizedAt(consultation.getTranscriptionFinalizedAt());
        response.setTranscriptRevision(consultation.getTranscriptRevision());
        response.setTranscriptApprovedAt(consultation.getTranscriptApprovedAt());
        response.setTranscriptApprovedBy(
                consultation.getTranscriptApprovedBy() == null
                        ? null
                        : consultation.getTranscriptApprovedBy().getUserId()
        );
        response.setTranscriptApprovedRevision(consultation.getTranscriptApprovedRevision());
        return response;
    }

    public ConsultationResponse createConsultation(CreateConsultationRequest request) {

        Patient patient = patientRepository.findById(request.getPatientId())
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));

        AppUser clinician = appUserRepository.findById(request.getClinicianId())
                .orElseThrow(() -> new ResourceNotFoundException("Clinician not found"));

        if(clinician.getRole() != AppUser.Role.DOCTOR) {
            throw new BadRequestException("Selected user must have the DOCTOR role");
        }

        if (!request.getScheduledAt().isAfter(Instant.now())) {
            throw new BadRequestException("Scheduled time must be in the future");
        }

        AppUser currentUser = getCurrentUser();
        if (currentUser.getRole() == AppUser.Role.DOCTOR
                && !clinician.getUserId().equals(currentUser.getUserId())) {
            throw new AccessDeniedException(
                    "Doctors can create consultations only for themselves"
            );
        }

        Clinic clinic = clinicRepository.findById(request.getClinicId())
                .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));

        Consultation consultation = new Consultation();
        consultation.setPatient(patient);
        consultation.setClinician(clinician);
        consultation.setClinic(clinic);
        consultation.setScheduledAt(request.getScheduledAt());
        consultation.setStatus(ConsultationStatus.SCHEDULED);
        return toResponse(consultationRepository.save(consultation));
    }

    @Transactional(readOnly = true)
    public List<ConsultationResponse> getAllConsultations() {
        return  consultationRepository.findAllByOrderByScheduledAtDesc()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public ConsultationResponse getConsultationById(Long consultationId) {
        Consultation consultation = findConsultation(consultationId);
        assertCanRead(consultation, getCurrentUser());
        return toResponse(consultation);
    }

    private Consultation findConsultation(Long consultationId) {
        return consultationRepository.findById(consultationId)
                .orElseThrow(() -> new ResourceNotFoundException("Consultation not found"));
    }

    private AppUser getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()) {
            throw new BadRequestException("No authenticated user found");
        }

        AppUser currentUser =
                appUserRepository.findByUsernameIgnoreCase(authentication.getName());

        if (currentUser == null) {
            throw new ResourceNotFoundException("Current user not found");
        }

        return currentUser;
    }
    private void assertCanRead(Consultation consultation, AppUser currentUser) {
        if (currentUser.getRole() == AppUser.Role.ADMIN) return;

        if (currentUser.getRole() == AppUser.Role.DOCTOR
                && consultation.getClinician().getUserId().equals(currentUser.getUserId())) {
            return;
        }

        if (currentUser.getRole() == AppUser.Role.PATIENT
                && consultation.getPatient().getAppUser() != null
                && consultation.getPatient().getAppUser().getUserId().equals(currentUser.getUserId())) {
            return;
        }

        throw new AccessDeniedException("You are not allowed to access this consultation");
    }

    private void assertCanManage(Consultation consultation, AppUser currentUser) {
        if (currentUser.getRole() == AppUser.Role.ADMIN) return;

        if (currentUser.getRole() == AppUser.Role.DOCTOR
                && consultation.getClinician().getUserId().equals(currentUser.getUserId())) {
            return;
        }

        throw new AccessDeniedException("You are not allowed to manage this consultation");
    }

    private boolean isAllowedTransition(
            ConsultationStatus current,
            ConsultationStatus next
    ){
        return switch (current){
            case SCHEDULED ->  next == ConsultationStatus.IN_PROGRESS
            || next == ConsultationStatus.COMPLETED
                    || next == ConsultationStatus.CANCELLED;
            case IN_PROGRESS -> next == ConsultationStatus.COMPLETED
                    || next == ConsultationStatus.CANCELLED;
            case COMPLETED, CANCELLED -> false;
        };
    }

    public ConsultationResponse updateStatus(
            Long consultationId,
            UpdateConsultationStatusRequest request
    ) {
        Consultation consultation = findConsultation(consultationId);
        assertCanManage(consultation, getCurrentUser());

        if (!isAllowedTransition(consultation.getStatus(), request.getStatus())) {
            throw new BadRequestException(
                    "Status transition from " + consultation.getStatus()
                            + " to " + request.getStatus() + " is not allowed"
            );
        }

        consultation.setStatus(request.getStatus());
        if (request.getStatus() == ConsultationStatus.IN_PROGRESS
                && consultation.getStartedAt() == null) {
            consultation.setStartedAt(Instant.now());
        }
        if (request.getStatus() == ConsultationStatus.COMPLETED) {
            if (consultation.getTranscriptionStatus() == TranscriptionStatus.ACTIVE) {
                throw new BadRequestException(
                        "Finalize transcription before completing the consultation"
                );
            }
            if (consultation.getEndedAt() == null) {
                consultation.setEndedAt(Instant.now());
            }
            if (consultation.getTranscriptionStatus() == TranscriptionStatus.NOT_STARTED
                    || consultation.getTranscriptionStatus() == TranscriptionStatus.FAILED) {
                consultation.setTranscriptionStatus(TranscriptionStatus.MANUAL);
            }
        }
        return toResponse(consultationRepository.save(consultation));
    }

    public ConsultationResponse updateTranscript(Long consultationId, UpdateTranscriptRequest request) {

        Consultation consultation = findConsultation(consultationId);
        assertCanManage(consultation, getCurrentUser());

        if (consultation.getStatus() != ConsultationStatus.IN_PROGRESS
                && consultation.getStatus() != ConsultationStatus.COMPLETED) {
            throw new BadRequestException(
                    "Transcript can only be updated when consultation is in progress or completed"
            );
        }

        String newTranscript = request.getTranscript().trim();
        if (!Objects.equals(consultation.getTranscript(), newTranscript)) {
            consultation.setTranscript(newTranscript);
            int currentRevision = consultation.getTranscriptRevision() == null
                    ? 0
                    : consultation.getTranscriptRevision();
            consultation.setTranscriptRevision(currentRevision + 1);
            consultation.setTranscriptApprovedAt(null);
            consultation.setTranscriptApprovedBy(null);
            consultation.setTranscriptApprovedRevision(null);
        }

        if(consultation.getStatus()==ConsultationStatus.COMPLETED
            && consultation.getTranscriptionStatus()
                == TranscriptionStatus.NOT_STARTED
        ){
            consultation.setTranscriptionStatus(TranscriptionStatus.MANUAL);
        }


        return toResponse(consultationRepository.save(consultation));
    }

    @Transactional(readOnly = true)
    public List<ConsultationResponse> getMyConsultations() {
        AppUser currentUser = getCurrentUser();

        if (currentUser.getRole() == AppUser.Role.DOCTOR) {
            return consultationRepository
                    .findByClinicianUserIdOrderByScheduledAtDesc(currentUser.getUserId())
                    .stream()
                    .map(this::toResponse)
                    .toList();
        }

        if (currentUser.getRole() == AppUser.Role.PATIENT) {
            Patient patient = patientRepository.findByAppUserUserId(currentUser.getUserId())
                    .orElseThrow(() -> new ResourceNotFoundException("Patient profile not found"));

            return consultationRepository
                    .findByPatientPatientIdOrderByScheduledAtDesc(patient.getPatientId())
                    .stream()
                    .map(this::toResponse)
                    .toList();
        }

        throw new AccessDeniedException("This route is for doctors and patients only");
    }

    /**
     * Resolves a LiveKit identity such as user-7 into the consultation speaker role.
     *
     * The worker does not get to decide whether a speaker is DOCTOR or PATIENT.
     * Spring derives the role from the consultation's assigned clinician and linked
     * patient account.
     */
    private SpeakerRole resolveParticipantRole(
            Consultation consultation,
            String identity
    ) {
        if (!identity.matches("^user-\\d+$")) {
            throw new AccessDeniedException("Invalid participant identity");
        }

        Long userId = Long.parseLong(identity.substring(5));
        if (userId.equals(consultation.getClinician().getUserId())) {
            return SpeakerRole.DOCTOR;
        }

        AppUser patientUser = consultation.getPatient().getAppUser();
        if (patientUser != null && userId.equals(patientUser.getUserId())) {
            return SpeakerRole.PATIENT;
        }

        throw new AccessDeniedException("You are not allowed to access this consultation");
    }

    /**
     * Saves a new final ASR segment after Spring has derived the speaker role.
     */

    /**
     * Converts a persisted transcript segment into a safe staff-facing DTO.
     */
    private TranscriptSegmentResponse toResponse(TranscriptSegment segment) {
        return new TranscriptSegmentResponse(
                segment.getTranscriptSegmentId(),
                segment.getSourceSegmentId(),
                segment.getSpeakerRole(),
                segment.getText(),
                segment.getStartMs(),
                segment.getEndMs(),
                segment.getSource()
        );
    }

    /**
     * Persists ONE final ASR segment, idempotently and race-free.
     *
     * <p>The lookup-then-insert version this replaces had two defects. It could
     * lose a race - two concurrent retries both saw "no row" and both tried to
     * INSERT, and catching the resulting DataIntegrityViolationException inside
     * this same {@code @Transactional} method does not work, because the
     * violation marks the transaction rollback-only and the recovery read then
     * fails at commit with UnexpectedRollbackException. And it accepted writes
     * from any worker, including a stale one whose rows carry a different
     * room_session_id and therefore never collide with the current session's.</p>
     *
     * <p>Flow: verify the consultation is live, verify the caller owns the
     * current worker session, let Spring derive the clinical role, then let
     * PostgreSQL arbitrate the duplicate with ON CONFLICT DO NOTHING and read
     * back the one durable row - so an insert and a retry return the same
     * response.</p>
     */
    @Transactional
    public TranscriptSegmentResponse appendFinalSegment(
            Long consultationId,
            AppendTranscriptSegmentRequest request
    ) {
        Consultation consultation = findConsultation(consultationId);

        if (consultation.getStatus() != ConsultationStatus.IN_PROGRESS) {
            throw new BadRequestException(
                    "Transcript segments require an in-progress consultation"
            );
        }

        if (request.getEndMs() < request.getStartMs()) {
            throw new BadRequestException("Segment end time cannot precede its start time");
        }

        // Ownership: only the session issued by the latest bootstrap may write.
        if (consultation.getRoomSessionId() == null
                || !consultation.getRoomSessionId().equals(request.getRoomSessionId())) {
            throw new ConflictException("This transcription session is no longer active");
        }

        Instant sessionStartedAt = consultation.getTranscriptionSessionStartedAt();
        if (sessionStartedAt == null) {
            // Only reachable if a bootstrap row predates this column being set.
            throw new ConflictException("This transcription session has no start anchor");
        }

        String text = request.getText().trim();
        if (text.isEmpty()) {
            // Deepgram can emit an empty final on silence. Storing it would add
            // blank lines to the canonical transcript for no benefit.
            throw new BadRequestException("Segment text cannot be blank");
        }

        // AUTHORITY: the role comes from the consultation relationship, never
        // from a label supplied by the worker.
        SpeakerRole derivedRole = resolveParticipantRole(
                consultation,
                request.getParticipantIdentity()
        );

        /**§
         * Record liveness BEFORE the insert, not after.
         *
         * insertFinalSegmentIfAbsent is @Modifying(clearAutomatically = true),
         * so it detaches everything in the persistence context. A setter called
         * after it would run on a detached Consultation and never be written.
         * Setting it here means flushAutomatically = true flushes this change
         * as part of the same transaction.
         */
        consultation.setTranscriptionLastSeenAt(Instant.now());

        transcriptionSegmentRepository.insertFinalSegmentIfAbsent(
                consultationId,
                request.getRoomSessionId(),
                request.getSourceSegmentId(),
                request.getParticipantIdentity(),
                derivedRole.name(),
                request.getSpeakerLabel(),
                text,
                request.getStartMs(),
                request.getEndMs(),
                sessionStartedAt
        );

        return transcriptionSegmentRepository
                .findByConsultationConsultationIdAndRoomSessionIdAndSourceSegmentId(
                        consultationId,
                        request.getRoomSessionId(),
                        request.getSourceSegmentId()
                )
                .map(this::toResponse)
                .orElseThrow(() -> new IllegalStateException(
                        "Final transcript segment was not persisted"
                ));
    }

    public ConsultationResponse approveTranscript(
            Long consultationId,
            ApproveTranscriptRequest request
    ){
        Consultation consultation = findConsultation(consultationId);
        AppUser doctor = getCurrentUser();

        if (doctor.getRole() != AppUser.Role.DOCTOR
                || !doctor.getUserId().equals(
                consultation.getClinician().getUserId())) {
            throw new AccessDeniedException(
                    "Only the assigned Doctor can approve this transcript"
            );
        }

        if(consultation.getStatus() != ConsultationStatus.COMPLETED) {
            throw new BadRequestException(
                    "Complete the consultation before approving the transcript"
            );
        }

        if(consultation.getTranscriptionStatus() != TranscriptionStatus.FINALIZED
            && consultation.getTranscriptionStatus() != TranscriptionStatus.MANUAL){
            throw new BadRequestException(
                    "Transcription must be finished before approving the transcript"
            );
        }

        if(!consultation.getTranscriptRevision()
                .equals(request.expectedRevision())){
            throw new ConflictException(
                    "Transcript was changed. Refresh and review the latest revision"
            );
        }

        String approvedText = request.transcript().trim();

        if(!Objects.equals(consultation.getTranscript(), approvedText)){
            consultation.setTranscript(approvedText);
            consultation.setTranscriptRevision(
                    consultation.getTranscriptRevision()+1
            );
        }

        consultation.setTranscriptApprovedAt(Instant.now());
        consultation.setTranscriptApprovedBy(doctor);
        consultation.setTranscriptApprovedRevision(consultation.getTranscriptRevision());
        return  toResponse(consultationRepository.save(consultation));
    }

    @Transactional(readOnly = true)
    public List<TranscriptSegmentResponse> getTranscriptSegments(Long consultationId) {
        Consultation consultation = findConsultation(consultationId);
        assertCanManage(consultation, getCurrentUser());

        return transcriptionSegmentRepository
                .findOrderedByConsultation(consultationId)
                .stream()
                .map(this::toResponse)
                .toList();

    }

    /**
     * Builds the LiveKit worker bootstrap response for one active consultation.
     *
     * The response is for the internal Python worker only. It includes a worker
     * room token, a random room session id, and the non-identifying participant
     * role map needed for caption routing.
     */
    public TranscriptionBootstrapResponse createTranscriptionBootstrap(Long consultationId) {

        Consultation consultation = findConsultation(consultationId);
        if (consultation.getStatus() != ConsultationStatus.IN_PROGRESS) {
            throw new BadRequestException("Transcription can start only during an in-progress consultation");
        }

        if (consultation.getTranscriptionStatus() == TranscriptionStatus.FINALIZED) {
            throw new BadRequestException("Transcription is already finalized");
        }

        String roomName = "consultation-" + consultationId;
        String roomSessionId = UUID.randomUUID().toString();

        /*
         * Persist the session BEFORE handing the token out. The generated id is
         * what appendFinalSegment authorises against and what every segment
         * stores as its ordering anchor, so throwing it away here would leave
         * the whole provenance chain without an owner.
         *
         * Re-bootstrapping is intentional and safe: a restarted worker gets a
         * new id, which immediately makes the previous worker's writes stale.
         */
        Instant sessionStartedAt = Instant.now();
        consultation.setRoomSessionId(roomSessionId);
        consultation.setTranscriptionSessionStartedAt(sessionStartedAt);
        consultation.setTranscriptionLastSeenAt(sessionStartedAt);
        consultation.setTranscriptionStatus(TranscriptionStatus.ACTIVE);
        consultationRepository.save(consultation);

        String workerId = "transcriber-"+roomSessionId;

        String token = liveKitTokenService.createWorkerToken(roomName,workerId);
        List<TranscriptionBootstrapResponse.ParticipantRoleResponse> participants = new ArrayList<>();

        participants.add(
                new TranscriptionBootstrapResponse.ParticipantRoleResponse(
                        "user-"+ consultation.getClinician().getUserId(),"DOCTOR"
                )
        );
        AppUser patientUser = consultation.getPatient().getAppUser();

        if (patientUser != null) {
            participants.add(
                    new TranscriptionBootstrapResponse.ParticipantRoleResponse(
                            "user-" + patientUser.getUserId(),
                            "PATIENT"
                    )
            );
        }

        return new TranscriptionBootstrapResponse(
                liveKitProperties.getUrl(),
                roomName,
                token,
                roomSessionId,
                participants
        );
    }

    /**
     * Prevents an older worker from mutating a newer transcription session.
     */
    public void assertCurrentTranscriptionSession(
            Consultation consultation,
            String roomSessionId
    ){
        /*
         * A null stored id means no bootstrap has claimed this consultation
         * yet. Objects.equals(null, null) would call that a match, so the
         * null case is rejected explicitly before the comparison.
         */
        if (consultation.getRoomSessionId() == null
                || !Objects.equals(
                        consultation.getRoomSessionId(), roomSessionId)) {
            throw new ConflictException(
                    "Transcription session is stale"
            );
        }
    }

    /**
     * Records that the current transcription worker is still responsive.
     */
    public void heartbeatTranscription(
            Long consultationId,
            String roomSessionId
    ){
        Consultation consultation = findConsultation(consultationId);

        assertCurrentTranscriptionSession(consultation, roomSessionId);

        if(consultation.getStatus() != ConsultationStatus.IN_PROGRESS
            || consultation.getTranscriptionStatus() != TranscriptionStatus.ACTIVE){
                throw new BadRequestException("Only an active transcription can recive heartbeats");
            }

        consultation.setTranscriptionLastSeenAt(Instant.now());
        consultationRepository.save(consultation);
    }

    /**
     * Records worker failure while leaving the consultation available for manual text
     */
    public ConsultationResponse failTranscription(
            Long consultationId,
            String roomSessionId
    ) {
        Consultation consultation = findConsultation(consultationId);
        assertCurrentTranscriptionSession(consultation, roomSessionId);

        if (consultation.getTranscriptionStatus()
                == TranscriptionStatus.FAILED) {
            return toResponse(consultation);
        }
        if (consultation.getStatus() != ConsultationStatus.IN_PROGRESS
                || consultation.getTranscriptionStatus()
                != TranscriptionStatus.ACTIVE) {
            throw new BadRequestException(
                    "Only an active transcription can be marked as failed"
            );
        }

        consultation.setTranscriptionStatus(TranscriptionStatus.FAILED);
        return toResponse(consultationRepository.save(consultation));
    }



    /**
     * Marks transcription as finalized after the worker flushes all speech streams.
     *
     * A repeated call after successful finalization returns the same completed
     * consultation so worker retries do not create a false failure.
     */
    public ConsultationResponse finalizeTranscription(Long consultationId, String roomSessionId) {
        Consultation consultation = findConsultation(consultationId);

        assertCurrentTranscriptionSession(consultation,roomSessionId);

        if (consultation.getStatus() == ConsultationStatus.COMPLETED
                && consultation.getTranscriptionStatus()
                == TranscriptionStatus.FINALIZED) {
            return toResponse(consultation);
        }
        if (consultation.getStatus() != ConsultationStatus.IN_PROGRESS) {
            throw new BadRequestException(
                    "Only an in-progress consultation can be finalized"
            );
        }
        if (consultation.getTranscriptionStatus()
                != TranscriptionStatus.ACTIVE) {
            throw new BadRequestException(
                    "Transcription must be active before finalization"
            );
        }

        Instant now = Instant.now();
        consultation.setTranscriptionStatus(TranscriptionStatus.FINALIZED);
        consultation.setTranscriptionFinalizedAt(now);
        consultation.setStatus(ConsultationStatus.COMPLETED);
        consultation.setEndedAt(now);

        return toResponse(consultationRepository.save(consultation));
    }


}
