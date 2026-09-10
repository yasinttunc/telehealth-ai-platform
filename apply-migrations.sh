#!/usr/bin/env bash
#
# Applies every versioned migration to the running PostgreSQL container, in
# order, and then verifies that the columns Hibernate validates against exist.
#
# The files under infra/postgres/init/ run only when Docker creates the volume
# empty, so an existing database never receives them. This script is the path
# for a database that already has data.
#
# Usage:  ./apply-migrations.sh
set -euo pipefail

MIGRATION_DIR="infra/postgres/migrations"

# Credentials come from .env when it exists, so this script and docker-compose
# always agree about which database is being changed.
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi
DB_NAME="${POSTGRES_DB:-telehealth}"
DB_USER="${POSTGRES_USER:-telehealth}"

# --- locate the container -------------------------------------------------
# The compose file names it explicitly. Searching for "any postgres container"
# is wrong on a machine that runs more than one project: it silently picks a
# stranger's database. Override with PG_CONTAINER=... if you renamed it.
DEFAULT_CONTAINER="telehealth-ai-postgres"
CONTAINER="${PG_CONTAINER:-}"

if [ -z "${CONTAINER}" ] \
   && docker ps --format '{{.Names}}' | grep -qx "${DEFAULT_CONTAINER}"; then
  CONTAINER="${DEFAULT_CONTAINER}"
fi

if [ -z "${CONTAINER}" ]; then
  echo "Could not find the container '${DEFAULT_CONTAINER}'." >&2
  echo "" >&2
  echo "Running containers:" >&2
  docker ps --format '  {{.Names}}  ({{.Image}})' >&2
  echo "" >&2
  echo "Start the project database with:  docker compose up -d" >&2
  echo "Or point this script at an existing one:" >&2
  echo "  PG_CONTAINER=<name> ./apply-migrations.sh" >&2
  exit 1
fi

# --- confirm the target really is this project's database -----------------
# A container can be running PostgreSQL and still be the wrong one. Failing
# here is much cheaper than half-applying migrations to another project.
if ! docker exec -i "${CONTAINER}" \
     psql -U "${DB_USER}" -d "${DB_NAME}" -c 'SELECT 1' >/dev/null 2>&1; then
  echo "Container '${CONTAINER}' is running, but user '${DB_USER}' cannot open" >&2
  echo "database '${DB_NAME}'. This is probably a different project's database." >&2
  echo "" >&2
  echo "Databases in that container:" >&2
  docker exec -i "${CONTAINER}" psql -U postgres -lqt 2>/dev/null \
    | cut -d'|' -f1 | sed 's/^/  /' >&2 || true
  exit 1
fi

echo "Using container: ${CONTAINER}  database: ${DB_NAME}"

# --- apply every migration in filename order ------------------------------
# Each file is written to be safe to run twice, so re-running this script
# after a partial failure is not destructive.
for file in $(ls "${MIGRATION_DIR}"/*.sql | sort); do
  echo ""
  echo "--> applying $(basename "${file}")"
  docker exec -i "${CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" < "${file}"
done

# --- verify what Hibernate will validate ----------------------------------
echo ""
echo "--> verifying schema"
docker exec -i "${CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" <<'SQL'
\echo '--- consultation ---'
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'consultation'
  AND column_name IN (
      'room_session_id',
      'transcription_session_started_at',
      'transcription_last_seen_at',
      'transcription_status',
      'transcription_finalized_at',
      'transcript_revision',
      'transcript_approved_revision')
ORDER BY column_name;

\echo '--- transcript_segment ---'
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'transcript_segment'
  AND column_name IN ('room_session_id', 'source_segment_id', 'session_started_at')
ORDER BY column_name;

\echo '--- extraction_job ---'
SELECT count(*) AS extraction_job_columns
FROM information_schema.columns
WHERE table_name = 'extraction_job';

\echo '--- there must be NO transcription_room_session_id column ---'
SELECT count(*) AS should_be_zero
FROM information_schema.columns
WHERE table_name = 'consultation'
  AND column_name = 'transcription_room_session_id';

\echo '--- alert completion ---'
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('finding_review', 'alert_evidence', 'alert_status_event')
ORDER BY table_name;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'alert'
  AND column_name IN (
      'symptom_code',
      'detector_version',
      'updated_at',
      'last_evaluated_at',
      'version')
ORDER BY column_name;

\echo '--- deduplication index must exist ---'
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'alert'
  AND indexname = 'uq_alert_detection_window';

\echo '--- every alert must have at least one history event ---'
SELECT count(*) AS should_be_zero
FROM alert a
WHERE NOT EXISTS (
    SELECT 1
    FROM alert_status_event event
    WHERE event.alert_id = a.alert_id
);
SQL

echo ""
echo "Done. Expected: 7 consultation columns, 3 transcript_segment columns,"
echo "extraction_job_columns = 10, should_be_zero = 0,"
echo "3 alert-completion tables, 5 alert columns, 1 deduplication index,"
echo "and no alert without a history event."
echo "Now start Spring: ddl-auto=validate will confirm the schema matches."
