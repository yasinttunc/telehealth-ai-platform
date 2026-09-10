-- Migration 06 - remove the abandoned second session column.
--
-- consultation carried two columns for the same fact: room_session_id, which
-- appendFinalSegment authorised against, and transcription_room_session_id,
-- which the bootstrap wrote. Because they were different columns every final
-- segment was rejected as belonging to a stale session, and no transcript
-- could be stored at all.
--
-- The entity now maps room_session_id only. transcription_room_session_id was
-- created by an earlier ddl-auto run and never had a migration; Hibernate's
-- validate mode ignores columns it does not map, so this column would linger
-- indefinitely as dead data that looks authoritative.
--
-- Any value it holds is a session id whose worker exited long ago, so nothing
-- is migrated across.

BEGIN;

ALTER TABLE consultation
    DROP COLUMN IF EXISTS transcription_room_session_id;

COMMIT;
