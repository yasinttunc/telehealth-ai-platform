BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Clinician review of AI-extracted findings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finding_review (
    finding_review_id BIGSERIAL PRIMARY KEY,
    symptom_record_id BIGINT NOT NULL UNIQUE
        REFERENCES symptom_record(symptom_record_id) ON DELETE RESTRICT,
    consultation_id BIGINT NOT NULL
        REFERENCES consultation(consultation_id) ON DELETE RESTRICT,
    accepted_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
    reviewed_by BIGINT NOT NULL
        REFERENCES app_user(user_id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_finding_review_array
        CHECK (jsonb_typeof(accepted_findings) = 'array'),
    CONSTRAINT ck_finding_review_times
        CHECK (updated_at >= reviewed_at)
);

CREATE INDEX IF NOT EXISTS idx_finding_review_consultation
    ON finding_review(consultation_id);

CREATE INDEX IF NOT EXISTS idx_finding_review_reviewed_at
    ON finding_review(reviewed_at);

-- ---------------------------------------------------------------------------
-- 2. Alert provenance columns
-- ---------------------------------------------------------------------------
-- Add nullable columns first so existing rows can be backfilled safely.
ALTER TABLE alert
    ADD COLUMN IF NOT EXISTS symptom_code VARCHAR(80),
    ADD COLUMN IF NOT EXISTS detector_version VARCHAR(50),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS version BIGINT;

UPDATE alert
SET symptom_code = CASE symptom_name
        WHEN 'cough' THEN 'cough'
        WHEN 'fever' THEN 'fever'
        WHEN 'headache' THEN 'headache'
        ELSE lower(regexp_replace(trim(symptom_name), '[^a-zA-Z0-9]+', '.', 'g'))
    END
WHERE symptom_code IS NULL;

UPDATE alert
SET detector_version = 'legacy-seed-v1'
WHERE detector_version IS NULL;

-- NULL-only backfills preserve legitimate changes when this migration is rerun.
UPDATE alert
SET updated_at = created_at
WHERE updated_at IS NULL;

UPDATE alert
SET last_evaluated_at = created_at
WHERE last_evaluated_at IS NULL
  AND detector_version = 'legacy-seed-v1';

UPDATE alert
SET version = 0
WHERE version IS NULL;

ALTER TABLE alert
    ALTER COLUMN symptom_code SET NOT NULL,
    ALTER COLUMN detector_version SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET NOT NULL,
    ALTER COLUMN version SET DEFAULT 0,
    ALTER COLUMN version SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Deduplication and list-query support
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_detection_window
    ON alert (
        clinic_id,
        symptom_code,
        window_start,
        window_end,
        detector_version
    );

CREATE INDEX IF NOT EXISTS idx_alert_clinic_status_created
    ON alert(clinic_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Alert evidence
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_evidence (
    alert_evidence_id BIGSERIAL PRIMARY KEY,
    alert_id BIGINT NOT NULL
        REFERENCES alert(alert_id) ON DELETE CASCADE,
    finding_review_id BIGINT NOT NULL
        REFERENCES finding_review(finding_review_id) ON DELETE RESTRICT,
    consultation_id BIGINT NOT NULL
        REFERENCES consultation(consultation_id) ON DELETE RESTRICT,
    symptom_code VARCHAR(80) NOT NULL,
    finding_snapshot JSONB NOT NULL,
    included_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_alert_evidence_snapshot
        CHECK (jsonb_typeof(finding_snapshot) = 'object'),
    CONSTRAINT uq_alert_review_symptom_evidence
        UNIQUE (alert_id, finding_review_id, symptom_code)
);

CREATE INDEX IF NOT EXISTS idx_alert_evidence_alert
    ON alert_evidence(alert_id, included_at);

-- ---------------------------------------------------------------------------
-- 5. Workflow audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alert_status_event (
    alert_status_event_id BIGSERIAL PRIMARY KEY,
    alert_id BIGINT NOT NULL
        REFERENCES alert(alert_id) ON DELETE CASCADE,
    previous_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    changed_by BIGINT
        REFERENCES app_user(user_id) ON DELETE RESTRICT,
    system_generated BOOLEAN NOT NULL DEFAULT FALSE,
    note VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (previous_status IS NULL OR previous_status IN
        ('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED')),
    CHECK (new_status IN
        ('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED')),
    CONSTRAINT ck_alert_event_actor CHECK (
        (system_generated = TRUE AND changed_by IS NULL)
        OR (system_generated = FALSE AND changed_by IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_alert_status_event_alert_created
    ON alert_status_event(alert_id, created_at);

-- Alerts created before this migration have no workflow history. Add one
-- system event for their current state. NOT EXISTS makes this safe to rerun.
INSERT INTO alert_status_event (
    alert_id,
    previous_status,
    new_status,
    changed_by,
    system_generated,
    note,
    created_at
)
SELECT
    a.alert_id,
    NULL,
    a.status,
    NULL,
    TRUE,
    'Initial status backfilled during alert migration',
    a.created_at
FROM alert a
WHERE NOT EXISTS (
    SELECT 1
    FROM alert_status_event event
    WHERE event.alert_id = a.alert_id
);

COMMIT;
