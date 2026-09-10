package com.project.ibm.telehealth_with_ai.dto.response;

import com.project.ibm.telehealth_with_ai.model.SpeakerRole;

/** Safe staff facing view of one final trasncription segment */
public record TranscriptSegmentResponse(
        Long transcriptSegmentId,
        String sourceSegmentId,
        SpeakerRole speakerRole,
        String text,
        Long startMs,
        Long endMs,
        String source

) { }
