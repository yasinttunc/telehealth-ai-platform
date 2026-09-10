-- infra/postgres/migrations/04-transcript-session-order.sql
--
-- PURPOSE
-- -------
-- Closes the gap between the Java model and the database for transcript
-- provenance. Two columns are added:
--
--   transcript_segment.session_started_at
--       The ordering anchor for one worker session. A restarted worker gets a
--       NEW room_session_id whose monotonic clock restarts at zero, so ordering
--       by start_ms alone would interleave a later session before an earlier
--       one. Ordering by (session_started_at, start_ms) fixes that.
--
--       This column is an ORDERING ANCHOR ONLY. Never use it for duration
--       arithmetic: it is a wall clock and a clock correction can move it
--       backwards.
--
--   consultation.room_session_id
--       The worker session currently authorised to append segments. Without it
--       a stale worker process (for example one still flushing its buffer after
--       a restart) can keep writing into a session that has already been
--       replaced, and because room_session_id is part of the segment unique key
--       those writes do NOT collide - every sentence would be stored twice.

BEGIN;

-- 1) Add the anchor as nullable first so existing rows do not break the ALTER.
ALTER TABLE transcript_segment
    ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;

-- 2) Backfill: the earliest created_at of each session is a best-effort anchor,
--    which keeps any pre-existing demo rows in a stable relative order.
UPDATE transcript_segment ts
SET session_started_at = anchor.first_seen
FROM (
    SELECT consultation_id,
           room_session_id,
           MIN(created_at) AS first_seen
    FROM transcript_segment
    GROUP BY consultation_id, room_session_id
) AS anchor
WHERE ts.consultation_id = anchor.consultation_id
  AND ts.room_session_id = anchor.room_session_id
  AND ts.session_started_at IS NULL;

-- 3) Only now can the column be mandatory, matching the JPA entity which
--    declares @Column(name = "session_started_at", nullable = false).
ALTER TABLE transcript_segment
    ALTER COLUMN session_started_at SET NOT NULL;

-- 4) The index must match the repository's ORDER BY, otherwise PostgreSQL sorts
--    in memory every time a transcript is rendered.
DROP INDEX IF EXISTS idx_transcript_segment_consultation_time;

CREATE INDEX IF NOT EXISTS idx_transcript_segment_order
    ON transcript_segment (consultation_id, session_started_at, start_ms);

-- 5) Consultation-level worker session ownership.
ALTER TABLE consultation
    ADD COLUMN IF NOT EXISTS room_session_id VARCHAR(80),
    ADD COLUMN IF NOT EXISTS transcription_session_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transcription_last_seen_at TIMESTAMPTZ;

COMMIT;
