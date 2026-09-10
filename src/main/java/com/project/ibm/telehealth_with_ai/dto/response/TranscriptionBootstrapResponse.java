package com.project.ibm.telehealth_with_ai.dto.response;

import java.util.List;

/**
 * Returned only to the internal transcription worker.
 */
public record TranscriptionBootstrapResponse(
        String  serverUrl,
        String roomName,
        String token,
        String roomSessionId,
        List<ParticipantRoleResponse> participants
) {
    public record ParticipantRoleResponse(
            String identity,
            String role
    ){

    }
}
