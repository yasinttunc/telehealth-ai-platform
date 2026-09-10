BEGIN;

-- Creates the table on a clean volume.
CREATE TABLE IF NOT EXISTS extraction_job (
                                              extraction_job_id BIGSERIAL PRIMARY KEY,
                                              consultation_id BIGINT NOT NULL
                                                  REFERENCES consultation(consultation_id) ON DELETE CASCADE,
                                              transcript_revision INTEGER NOT NULL,
                                              status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                                              requested_by BIGINT NOT NULL
                                                  REFERENCES app_user(user_id),
                                              result_symptom_record_id BIGINT
                                                  REFERENCES symptom_record(symptom_record_id) ON DELETE SET NULL,
                                              error_message VARCHAR(300),
                                              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                                              started_at TIMESTAMPTZ,
                                              completed_at TIMESTAMPTZ,
                                              CONSTRAINT ck_extraction_job_revision
                                                  CHECK (transcript_revision >= 0),
                                              CONSTRAINT ck_extraction_job_status
                                                  CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
                                              CONSTRAINT ck_extraction_job_terminal_time
                                                  CHECK (
                                                      (status IN ('PENDING', 'RUNNING') AND completed_at IS NULL)
                                                          OR
                                                      (status IN ('SUCCEEDED', 'FAILED') AND completed_at IS NOT NULL)
                                                      ),
                                              CONSTRAINT ck_extraction_job_result
                                                  CHECK (
                                                      (status = 'SUCCEEDED' AND result_symptom_record_id IS NOT NULL)
                                                          OR status <> 'SUCCEEDED'
                                                      )
);

-- Reconciles an older manually-created table instead of assuming that
-- CREATE TABLE IF NOT EXISTS changed its definition.
ALTER TABLE extraction_job
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE extraction_job
    ALTER COLUMN status SET DEFAULT 'PENDING';

-- PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS, so inspect the
-- catalog before adding constraints that may already exist.
DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ck_extraction_job_revision'
              AND conrelid = 'extraction_job'::regclass
        ) THEN
            ALTER TABLE extraction_job
                ADD CONSTRAINT ck_extraction_job_revision
                    CHECK (transcript_revision >= 0);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ck_extraction_job_status'
              AND conrelid = 'extraction_job'::regclass
        ) THEN
            ALTER TABLE extraction_job
                ADD CONSTRAINT ck_extraction_job_status
                    CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'));
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ck_extraction_job_terminal_time'
              AND conrelid = 'extraction_job'::regclass
        ) THEN
            ALTER TABLE extraction_job
                ADD CONSTRAINT ck_extraction_job_terminal_time
                    CHECK (
                        (status IN ('PENDING', 'RUNNING') AND completed_at IS NULL)
                            OR
                        (status IN ('SUCCEEDED', 'FAILED') AND completed_at IS NOT NULL)
                        );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ck_extraction_job_result'
              AND conrelid = 'extraction_job'::regclass
        ) THEN
            ALTER TABLE extraction_job
                ADD CONSTRAINT ck_extraction_job_result
                    CHECK (
                        (status = 'SUCCEEDED'
                            AND result_symptom_record_id IS NOT NULL)
                            OR status <> 'SUCCEEDED'
                        );
        END IF;
    END
$$;

-- Prevents duplicate active jobs while allowing retry after FAILED.
CREATE UNIQUE INDEX IF NOT EXISTS uq_extraction_job_active_revision
    ON extraction_job (consultation_id, transcript_revision)
    WHERE status IN ('PENDING', 'RUNNING', 'SUCCEEDED');

CREATE INDEX IF NOT EXISTS idx_extraction_job_consultation_created
    ON extraction_job (consultation_id, created_at DESC);

-- Existing seed rows predate transcript provenance and receive revision zero.
UPDATE symptom_record
SET transcript_revision = 0
WHERE transcript_revision IS NULL;

ALTER TABLE symptom_record
    ALTER COLUMN transcript_revision SET NOT NULL;

COMMIT;