package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.model.Consultation;
import com.project.ibm.telehealth_with_ai.model.ConsultationStatus;
import com.project.ibm.telehealth_with_ai.model.TranscriptionStatus;
import com.project.ibm.telehealth_with_ai.repository.ConsultationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Converts abandoned ACTIVE sessions into FAILED after heartbeat expiry.
 */
@Service
public class TranscriptionSessionWatchdog {

    private static final Logger LOGGER = LoggerFactory.getLogger(TranscriptionSessionWatchdog.class);

    private final ConsultationRepository consultationRepository;
    private final long staleAfterSeconds;

    /**
     * Injects the repository and the maximum allowed heartbeat silence.
     */
    public TranscriptionSessionWatchdog(
            ConsultationRepository consultationRepository,
            @Value("${app.transcription.worker.stale-after-seconds:60}")
            long staleAfterSeconds
    ) {
        this.consultationRepository = consultationRepository;
        this.staleAfterSeconds = staleAfterSeconds;
    }

    /**
     * Marks dead sessions failed so the Doctor can use the manual fallback.
     */
    @Scheduled(fixedDelayString =
        "${app.transcription.worker.watchdog-delay-ms:15000}"
    )
    @Transactional
    public void failExpiredSessions(){
        Instant cutOff = Instant.now().minus(
                staleAfterSeconds,
                ChronoUnit.SECONDS
        );

    List<Consultation> expiredConsultations = consultationRepository.findByStatusAndTranscriptionStatusAndTranscriptionLastSeenAtBefore(
            ConsultationStatus.IN_PROGRESS,
            TranscriptionStatus.ACTIVE,
            cutOff
    );

    for (Consultation consultation : expiredConsultations){
        /*
         * FAILED, not FINALIZED. A worker that stopped sending heartbeats
         * crashed, was killed, or lost its connection; its transcript is
         * incomplete. Writing FINALIZED here would present a truncated
         * clinical record as a successfully completed one.
         *
         * The consultation itself stays IN_PROGRESS and transcriptionFinalizedAt
         * stays null, so the clinician can still finish the consultation or
         * fall back to a manual transcript.
         */
        consultation.setTranscriptionStatus(TranscriptionStatus.FAILED);
        LOGGER.warn("Marked transcription as FAILED consultationId={} sessionId={}",
                consultation.getConsultationId(),
                consultation.getRoomSessionId()
        );
    }
      consultationRepository.saveAll(expiredConsultations);
    }
}
