CREATE TABLE transcript_segment (
                                    transcript_segment_id BIGSERIAL PRIMARY KEY,
                                    consultation_id BIGINT NOT NULL
                                        REFERENCES consultation(consultation_id) ON DELETE CASCADE,
                                    room_session_id VARCHAR(80) NOT NULL,
                                    source_segment_id VARCHAR(120) NOT NULL,
                                    participant_identity VARCHAR(80) NOT NULL,
                                    speaker_role VARCHAR(20) NOT NULL,
                                    speaker_label VARCHAR(80),
                                    text TEXT NOT NULL,
                                    start_ms BIGINT NOT NULL CHECK (start_ms >= 0),
                                    end_ms BIGINT NOT NULL CHECK (end_ms >= start_ms),
                                    is_final BOOLEAN NOT NULL DEFAULT TRUE,
                                    source VARCHAR(30) NOT NULL DEFAULT 'DEEPGRAM',
                                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                                    CONSTRAINT uq_transcript_segment_source
                                        UNIQUE (consultation_id, room_session_id, source_segment_id),
                                    CONSTRAINT ck_transcript_segment_role
                                        CHECK (speaker_role IN ('DOCTOR', 'PATIENT', 'UNKNOWN')),
                                    CONSTRAINT ck_transcript_segment_source
                                        CHECK (source IN ('DEEPGRAM', 'MANUAL_IMPORT'))
);

CREATE INDEX idx_transcript_segment_consultation_time
    ON transcript_segment (consultation_id, start_ms);

ALTER TABLE consultation
    ADD COLUMN IF NOT EXISTS transcription_finalized_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(20) NOT NULL
    DEFAULT 'NOT_STARTED'
CHECK (transcription_status IN
    ('NOT_STARTED', 'ACTIVE', 'FINALIZED', 'FAILED', 'MANUAL')),
    ADD COLUMN IF NOT EXISTS transcript_revision INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS transcript_approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transcript_approved_by BIGINT
    REFERENCES app_user(user_id) ON DELETE SET NULL,
                                        ADD COLUMN IF NOT EXISTS transcript_approved_revision INTEGER;

ALTER TABLE symptom_record
    ADD COLUMN IF NOT EXISTS transcript_revision INTEGER;