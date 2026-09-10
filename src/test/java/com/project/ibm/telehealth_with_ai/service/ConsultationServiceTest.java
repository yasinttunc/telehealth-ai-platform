package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.dto.request.AppendTranscriptSegmentRequest;
import com.project.ibm.telehealth_with_ai.dto.request.UpdateTranscriptRequest;
import com.project.ibm.telehealth_with_ai.config.LiveKitProperties;
import com.project.ibm.telehealth_with_ai.exception.ConflictException;
import com.project.ibm.telehealth_with_ai.model.*;
import com.project.ibm.telehealth_with_ai.repository.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ConsultationServiceTest {

    @Mock ConsultationRepository consultationRepository;
    @Mock PatientRepository patientRepository;
    @Mock AppUserRepository appUserRepository;
    @Mock ClinicRepository clinicRepository;
    @Mock TranscriptionSegmentRepository segmentRepository;
    @Mock LiveKitTokenService liveKitTokenService;
    @Mock LiveKitProperties liveKitProperties;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void updatingChangedTranscriptIncrementsRevisionAndClearsApproval() {
        AppUser doctor = user(7L, "doctor", AppUser.Role.DOCTOR);
        Consultation consultation = consultation(doctor, ConsultationStatus.COMPLETED);
        consultation.setTranscript("Old transcript");
        consultation.setTranscriptRevision(2);
        consultation.setTranscriptApprovedAt(java.time.Instant.now());
        consultation.setTranscriptApprovedBy(doctor);
        consultation.setTranscriptApprovedRevision(2);

        when(consultationRepository.findById(10L)).thenReturn(Optional.of(consultation));
        when(consultationRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(appUserRepository.findByUsernameIgnoreCase("doctor")).thenReturn(doctor);
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated("doctor", null, java.util.List.of())
        );

        UpdateTranscriptRequest request = new UpdateTranscriptRequest();
        request.setTranscript("  Corrected transcript  ");
        service().updateTranscript(10L, request);

        assertEquals("Corrected transcript", consultation.getTranscript());
        assertEquals(3, consultation.getTranscriptRevision());
        assertNull(consultation.getTranscriptApprovedAt());
        assertNull(consultation.getTranscriptApprovedBy());
        assertNull(consultation.getTranscriptApprovedRevision());
        assertEquals(TranscriptionStatus.MANUAL, consultation.getTranscriptionStatus());
    }

    /**
     * A worker retry must not create a second row.
     *
     * The service no longer decides this in Java: it always calls the atomic
     * ON CONFLICT insert and then reads the durable row back, so an insert and
     * a duplicate produce the same response. The test therefore asserts the
     * atomic insert was used and that the entity save() path was not.
     */
    @Test
    void repeatedFinalSegmentReturnsExistingRowWithoutSavingDuplicate() {
        AppUser doctor = user(7L, "doctor", AppUser.Role.DOCTOR);
        Consultation consultation = activeTranscriptionConsultation(doctor);

        TranscriptSegment existing = new TranscriptSegment();
        existing.setTranscriptSegmentId(55L);
        existing.setSourceSegmentId("segment-1");
        existing.setSpeakerRole(SpeakerRole.DOCTOR);
        existing.setText("How are you feeling?");
        existing.setStartMs(100L);
        existing.setEndMs(900L);
        existing.setSource("DEEPGRAM");

        AppendTranscriptSegmentRequest request = segmentRequest("room-session-1");

        when(consultationRepository.findById(10L)).thenReturn(Optional.of(consultation));
        when(segmentRepository.findByConsultationConsultationIdAndRoomSessionIdAndSourceSegmentId(
                10L, "room-session-1", "segment-1"
        )).thenReturn(Optional.of(existing));

        var response = service().appendFinalSegment(10L, request);

        assertEquals(55L, response.transcriptSegmentId());
        verify(segmentRepository, never()).save(any());
        verify(segmentRepository).insertFinalSegmentIfAbsent(
                eq(10L),
                eq("room-session-1"),
                eq("segment-1"),
                eq("user-7"),
                eq("DOCTOR"),          // derived by Spring, never taken from the worker
                any(),                 // speakerLabel is optional
                eq("How are you feeling?"),
                eq(100L),
                eq(900L),
                any()                  // session anchor
        );
    }

    /**
     * A worker whose session was replaced by a newer bootstrap must be refused.
     *
     * Without this the stale process keeps writing, and because room_session_id
     * is part of the segment unique key its rows never collide with the current
     * session's - the transcript would silently contain every sentence twice.
     */
    @Test
    void segmentFromAStaleWorkerSessionIsRejected() {
        AppUser doctor = user(7L, "doctor", AppUser.Role.DOCTOR);
        Consultation consultation = activeTranscriptionConsultation(doctor);

        AppendTranscriptSegmentRequest request = segmentRequest("an-older-session");

        when(consultationRepository.findById(10L)).thenReturn(Optional.of(consultation));

        assertThrows(
                ConflictException.class,
                () -> service().appendFinalSegment(10L, request)
        );

        verify(segmentRepository, never()).insertFinalSegmentIfAbsent(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any()
        );
        verify(segmentRepository, never()).save(any());
    }

    /** Request body a worker sends for one final Deepgram segment. */
    private AppendTranscriptSegmentRequest segmentRequest(String roomSessionId) {
        AppendTranscriptSegmentRequest request = new AppendTranscriptSegmentRequest();
        request.setRoomSessionId(roomSessionId);
        request.setSourceSegmentId("segment-1");
        request.setParticipantIdentity("user-7");
        request.setText("How are you feeling?");
        request.setStartMs(100L);
        request.setEndMs(900L);
        return request;
    }

    /** An in-progress consultation that already owns a bootstrapped session. */
    private Consultation activeTranscriptionConsultation(AppUser doctor) {
        Consultation consultation = consultation(doctor, ConsultationStatus.IN_PROGRESS);
        consultation.setRoomSessionId("room-session-1");
        consultation.setTranscriptionSessionStartedAt(Instant.now());
        consultation.setTranscriptionStatus(TranscriptionStatus.ACTIVE);
        return consultation;
    }

    private ConsultationService service() {
        return new ConsultationService(
                consultationRepository,
                patientRepository,
                appUserRepository,
                clinicRepository,
                segmentRepository,
                liveKitTokenService,
                liveKitProperties
        );
    }

    private Consultation consultation(AppUser doctor, ConsultationStatus status) {
        Patient patient = new Patient();
        patient.setPatientId(20L);
        patient.setFirstName("Test");
        patient.setLastName("Patient");

        Clinic clinic = new Clinic();
        clinic.setClinicId(30L);
        clinic.setClinicName("Test Clinic");

        Consultation consultation = new Consultation();
        consultation.setConsultationId(10L);
        consultation.setPatient(patient);
        consultation.setClinician(doctor);
        consultation.setClinic(clinic);
        consultation.setStatus(status);
        return consultation;
    }

    private AppUser user(Long id, String username, AppUser.Role role) {
        AppUser user = new AppUser();
        user.setUserId(id);
        user.setUsername(username);
        user.setRole(role);
        return user;
    }
}
