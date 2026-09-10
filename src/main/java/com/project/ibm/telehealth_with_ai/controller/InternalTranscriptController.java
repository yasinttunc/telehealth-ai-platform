package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.request.AppendTranscriptSegmentRequest;
import com.project.ibm.telehealth_with_ai.dto.response.ConsultationResponse;
import com.project.ibm.telehealth_with_ai.dto.response.TranscriptSegmentResponse;
import com.project.ibm.telehealth_with_ai.dto.response.TranscriptionBootstrapResponse;
import com.project.ibm.telehealth_with_ai.service.ConsultationService;
import com.project.ibm.telehealth_with_ai.dto.request.TranscriptionSessionRequest;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/consultations")
public class InternalTranscriptController {

    private final ConsultationService consultationService;
    public InternalTranscriptController(ConsultationService consultationService) {
        this.consultationService = consultationService;
    }

    @PostMapping("/{consultationId}/transcription-bootstrap")
    public TranscriptionBootstrapResponse bootstrap(@PathVariable Long consultationId){
        return consultationService.createTranscriptionBootstrap(consultationId);
    }

    @PostMapping("/{consultationId}/transcript-segments")
    public TranscriptSegmentResponse append(
            @PathVariable Long consultationId,
            @Valid @RequestBody AppendTranscriptSegmentRequest request
            ){
        return consultationService.appendFinalSegment(
                consultationId,
                request
        );
    }

    /**
     * Refreshes liveness only for the worker session that owns the consultation.
     */
    @PostMapping("/{consultationId}/transcription-heartbeat")
    public void heartbeat(@PathVariable Long consultationId,
                          @Valid @RequestBody TranscriptionSessionRequest request){

        consultationService.heartbeatTranscription(
                consultationId,
                request.roomSessionId()
        );
    }

    /**
     * Finalizes only the worker session that currently owns the consultation.
     */
    @PostMapping("/{consultationId}/finalize-transcription")
    public ConsultationResponse finalizeTranscription(@PathVariable Long consultationId,
                                                      @Valid @RequestBody TranscriptionSessionRequest request){
        return consultationService.finalizeTranscription(
                consultationId,
                request.roomSessionId()
        );
    }

    /**
     * Marks a crashed provider session as failed without claiming clinical success.
     */
    @PostMapping("/{consultationId}/fail-transcription")
    public ConsultationResponse failTranscription(
            @PathVariable Long consultationId,
            @Valid @RequestBody TranscriptionSessionRequest request
    ){
        return consultationService.failTranscription(
                consultationId,
                request.roomSessionId()
        );
    }

}
