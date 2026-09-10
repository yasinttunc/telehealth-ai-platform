package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.config.LiveKitProperties;
import com.project.ibm.telehealth_with_ai.dto.response.LiveKitTokenResponse;
import com.project.ibm.telehealth_with_ai.exception.AccessDeniedException;
import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.exception.LiveKitUnavailableException;
import com.project.ibm.telehealth_with_ai.exception.ResourceNotFoundException;
import com.project.ibm.telehealth_with_ai.model.AppUser;
import com.project.ibm.telehealth_with_ai.model.Consultation;
import com.project.ibm.telehealth_with_ai.model.ConsultationStatus;
import com.project.ibm.telehealth_with_ai.repository.AppUserRepository;
import com.project.ibm.telehealth_with_ai.repository.ConsultationRepository;
import io.livekit.server.*;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Creates room-scoped LiveKit tokens after checking consultation ownership.
 *
 * This service is the only place where LiveKit API credentials are used.
 */
@Service
@Transactional(readOnly = true)
public class LiveKitTokenService {

    private final ConsultationRepository consultationRepository;
    private final AppUserRepository appUserRepository;
    private final LiveKitProperties liveKitProperties;
    private final TranscriptionWorkerLauncher transcriptionWorkerLauncher;

    public LiveKitTokenService(ConsultationRepository consultationRepository,
                               AppUserRepository appUserRepository,
                               LiveKitProperties liveKitProperties,
                               TranscriptionWorkerLauncher transcriptionWorkerLauncher
    ) {
        this.consultationRepository = consultationRepository;
        this.appUserRepository = appUserRepository;
        this.liveKitProperties = liveKitProperties;
        this.transcriptionWorkerLauncher = transcriptionWorkerLauncher;
    }


    /**
     * Resolves the JWT-authenticated Spring user.
     */
    private AppUser getCurrentUser() {
        Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()) {
            throw new AccessDeniedException("Authentication is required");
        }

        AppUser user = appUserRepository.findByUsernameIgnoreCase(
                authentication.getName()
        );

        if (user == null) {
            throw new AccessDeniedException(
                    "Authenticated user was not found"
            );
        }
        return user;
    }


    /**
     * Allows only the assigned Doctor or the Patient linked to this consultation.
     */
    private void assertCanUserIsConsultationParty(
            Consultation consultation,
            AppUser currentUser
    ) {
        boolean assignedDoctor =
                currentUser.getRole() == AppUser.Role.DOCTOR
                        && consultation.getClinician() != null
                        && currentUser.getUserId().equals(consultation.getClinician().getUserId());

        boolean linkedPatient =
                currentUser.getRole() == AppUser.Role.PATIENT
                        && consultation.getPatient() != null
                        && consultation.getPatient().getAppUser() != null
                        && currentUser.getUserId().equals(
                        consultation.getPatient()
                                .getAppUser().getUserId());

        if (!assignedDoctor && !linkedPatient) {
            throw new AccessDeniedException(
                    "You cannot join this consultation room"
            );
        }
    }


    /**
     * Produces credentials for assigned Doctor or linked Patient.
     */
    public LiveKitTokenResponse createToken(Long consultationId) {
        if (!liveKitProperties.isConfigured()) {
            throw new LiveKitUnavailableException(
                    "Video consultation service is not configured"
            );
        }

        Consultation consultation = consultationRepository
                .findById(consultationId)
                .orElseThrow(() ->
                        new ResourceNotFoundException("Consultation not found"));


        AppUser currentUser = getCurrentUser();
        assertCanUserIsConsultationParty(consultation, currentUser);

        if (consultation.getStatus() != ConsultationStatus.IN_PROGRESS) {
            throw new BadRequestException(
                    "Video access is available only during an in-progress consultation"
            );
        }

        transcriptionWorkerLauncher.ensureWorkerRunning(consultationId);

        String roomName = "consultation-" + consultationId.toString();
        String participantIdentity = "user-" + currentUser.getUserId();

        String participantName = currentUser.getRole() == AppUser.Role.DOCTOR
                ? "Doctor"
                : "Patient";

        AccessToken token = new AccessToken(
                liveKitProperties.getApiKey(),
                liveKitProperties.getApiSecret()
        );

        token.setIdentity(participantIdentity);
        token.setName(participantName);
        token.setTtl(liveKitProperties.getTokenTtlMs());

        /*
         * The participant may:
         * - join only this room,
         * - receive remote tracks,
         * - publish only camera and microphone tracks.
         *
         * The participant may not:
         * - publish data-channel messages,
         * - modify their own trusted metadata,
         * - publish screen-sharing tracks.
         */
        token.addGrants(
                new RoomJoin(true),
                new RoomName(roomName),
                new CanSubscribe(true),
                new CanPublishSources(List.of("camera", "microphone")),
                new CanPublishData(false),
                new CanUpdateOwnMetadata(false)
        );

        return new LiveKitTokenResponse(
                roomName,
                liveKitProperties.getUrl(),
                token.toJwt(),
                liveKitProperties.getTokenTtlMs() / 1000
        );
    }


    /**
     * Creates a restricted LiveKit token for the Python transcription worker.
     *
     * The worker may subscribe to audio tracks and publish caption data messages.
     * It must not publish camera, microphone, or screen-share media.
     */
    public String createWorkerToken(String roomName, String workerId) {

        AccessToken token = new AccessToken(
                liveKitProperties.getApiKey(),
                liveKitProperties.getApiSecret()
        );
        token.setIdentity(workerId);
        token.setName("Transcription Worker");
        token.setTtl(liveKitProperties.getTokenTtlMs());

        token.addGrants(
                new RoomJoin(true),
                new RoomName(roomName),
                new CanSubscribe(true),
                new CanPublish(false),
                new CanPublishData(true),
                new CanUpdateOwnMetadata(false)
        );

        return token.toJwt();
    }

}
