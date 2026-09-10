-- Migration 03 - transcript provenance (idempotent form).
--
-- infra/postgres/init/03-transcript-provanance.sql runs only when the Docker
-- volume is created empty. An existing database never saw it, so this file
-- reapplies the same schema in a form that is safe to run on a database that
-- has some, all, or none of it already.

BEGIN;

CREATE TABLE IF NOT EXISTS transcript_segment (
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reconciles a table that was created by an earlier, narrower definition.
ALTER TABLE transcript_segment
    ADD COLUMN IF NOT EXISTS room_session_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS source_segment_id VARCHAR(120),
    ADD COLUMN IF NOT EXISTS participant_identity VARCHAR(80),
    ADD COLUMN IF NOT EXISTS speaker_label VARCHAR(80),
    ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'DEEPGRAM',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS, so check the catalog first.
DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'uq_transcript_segment_source'
              AND conrelid = 'transcript_segment'::regclass
        ) THEN
            ALTER TABLE transcript_segment
                ADD CONSTRAINT uq_transcript_segment_source
                    UNIQUE (consultation_id, room_session_id, source_segment_id);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ck_transcript_segment_role'
              AND conrelid = 'transcript_segment'::regclass
        ) THEN
            ALTER TABLE transcript_segment
                ADD CONSTRAINT ck_transcript_segment_role
                    CHECK (speaker_role IN ('DOCTOR', 'PATIENT', 'UNKNOWN'));
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ck_transcript_segment_source'
              AND conrelid = 'transcript_segment'::regclass
        ) THEN
            ALTER TABLE transcript_segment
                ADD CONSTRAINT ck_transcript_segment_source
                    CHECK (source IN ('DEEPGRAM', 'MANUAL_IMPORT'));
        END IF;
    END
$$;

CREATE INDEX IF NOT EXISTS idx_transcript_segment_consultation_time
    ON transcript_segment (consultation_id, start_ms);

ALTER TABLE consultation
    ADD COLUMN IF NOT EXISTS transcription_finalized_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(20) NOT NULL
        DEFAULT 'NOT_STARTED',
    ADD COLUMN IF NOT EXISTS transcript_revision INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS transcript_approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transcript_approved_by BIGINT
        REFERENCES app_user(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS transcript_approved_revision INTEGER;

DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ck_consultation_transcription_status'
              AND conrelid = 'consultation'::regclass
        ) THEN
            ALTER TABLE consultation
                ADD CONSTRAINT ck_consultation_transcription_status
                    CHECK (transcription_status IN
                        ('NOT_STARTED', 'ACTIVE', 'FINALIZED', 'FAILED', 'MANUAL'));
        END IF;
    END
$$;

ALTER TABLE symptom_record
    ADD COLUMN IF NOT EXISTS transcript_revision INTEGER;

COMMIT;
