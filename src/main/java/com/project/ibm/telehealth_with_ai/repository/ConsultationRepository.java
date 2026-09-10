package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.Consultation;
import com.project.ibm.telehealth_with_ai.model.ConsultationStatus;
import com.project.ibm.telehealth_with_ai.model.TranscriptionStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface

ConsultationRepository extends JpaRepository<Consultation, Long> {

    List<Consultation> findByPatientPatientIdOrderByScheduledAtDesc(Long patientId);

    List<Consultation> findByClinicianUserIdOrderByScheduledAtDesc(Long clinicianUserId);

    List<Consultation> findAllByOrderByScheduledAtDesc();

    /**
     * Signal handling cannot recover from SIGKILL(destroyForcibly()), machine sleep, process deadlock, or power loss. Spring therefore needs an independent liveness rule.
     *
     * Finds active transcription sessions whose worker heartbeat has expired
     */
    List<Consultation>
        findByStatusAndTranscriptionStatusAndTranscriptionLastSeenAtBefore(
                ConsultationStatus consultationStatus,
                TranscriptionStatus transcriptionStatus,
                Instant cutOFf
    );

}
