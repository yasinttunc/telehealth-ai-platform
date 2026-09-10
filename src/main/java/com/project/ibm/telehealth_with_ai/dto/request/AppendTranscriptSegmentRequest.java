package com.project.ibm.telehealth_with_ai.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Payload accepted only from the configured transcription worker. */
public class AppendTranscriptSegmentRequest {

    @NotBlank
    @Size(max = 80)
    private String roomSessionId;

    @NotBlank
    @Size(max = 120)
    private String sourceSegmentId;

    @NotBlank
    @Size(max = 80)
    private String participantIdentity;

    @Size(max = 80)
    private String speakerLabel;

    @NotBlank
    @Size(max = 4000)
    private String text;

    @NotNull @Min(0)
    private Long startMs;

    @NotNull
    @Min(0)
    private Long endMs;

    public String getRoomSessionId() {
        return roomSessionId;
    }

    public void setRoomSessionId(String roomSessionId) {
        this.roomSessionId = roomSessionId;
    }

    public String getSourceSegmentId() {
        return sourceSegmentId;
    }

    public void setSourceSegmentId(String sourceSegmentId) {
        this.sourceSegmentId = sourceSegmentId;
    }

    public String getParticipantIdentity() {
        return participantIdentity;
    }

    public void setParticipantIdentity(String participantIdentity) {
        this.participantIdentity = participantIdentity;
    }

    public String getSpeakerLabel() {
        return speakerLabel;
    }

    public void setSpeakerLabel(String speakerLabel) {
        this.speakerLabel = speakerLabel;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public Long getStartMs() {
        return startMs;
    }

    public void setStartMs(Long startMs) {
        this.startMs = startMs;
    }

    public Long getEndMs() {
        return endMs;
    }

    public void setEndMs(Long endMs) {
        this.endMs = endMs;
    }
}
