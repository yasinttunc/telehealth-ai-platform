"""TEST GROUP 3 — The full Spring pipeline, in the order the worker uses it.

This walks one consultation from IN_PROGRESS to a stored AI result, calling the
exact HTTP routes the browser and the worker call. Nothing is mocked.

Prerequisites:
  - PostgreSQL up with the seed data loaded
  - Spring running (SERVER_PORT and .env SPRING_INTERNAL_BASE_URL must agree)
  - FastAPI running, and Spring started with AI_PROVIDER=python
  - INTERNAL_SERVICE_KEY identical in Spring's environment and ai-service/.env

Override the login with env vars if your seed differs:
  TEST_DOCTOR_USERNAME, TEST_DOCTOR_PASSWORD, TEST_CONSULTATION_ID
"""

import os
import time
import uuid

import httpx
import pytest

DOCTOR_USERNAME = os.getenv("TEST_DOCTOR_USERNAME", "dr.sarah.patel")

# Matches the bcrypt hash every non-admin row carries in
# infra/postgres/init/02-seed-data.sql. The earlier default was a guess and
# failed every login with 401, which surfaced as nineteen fixture errors that
# looked like a broken pipeline rather than a wrong password.
DOCTOR_PASSWORD = os.getenv("TEST_DOCTOR_PASSWORD", "password")

APPROVED_TRANSCRIPT = (
    "Doctor: What brings you in today?\n"
    "Patient: I have had a bad headache since Monday and a sore throat. "
    "I do not have a fever."
)


# --------------------------------------------------------------------------
# Session helpers
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def doctor_token(spring_url):
    """Log in as the assigned Doctor and keep the JWT for the whole module."""
    try:
        response = httpx.post(
            f"{spring_url}/api/auth/login",
            json={"usernameOrEmail": DOCTOR_USERNAME, "password": DOCTOR_PASSWORD},
            timeout=15.0,
        )
    except httpx.HTTPError as error:
        pytest.skip(f"Spring not reachable at {spring_url}: {error}")

    assert response.status_code == 200, (
        f"Login failed ({response.status_code}): {response.text[:200]}\n"
        f"Set TEST_DOCTOR_USERNAME / TEST_DOCTOR_PASSWORD if your seed differs."
    )
    body = response.json()
    token = body.get("accessToken") or body.get("token")
    assert token, f"No token in login response: {list(body)}"
    return token


@pytest.fixture(scope="module")
def auth(doctor_token):
    return {"Authorization": f"Bearer {doctor_token}"}


@pytest.fixture(scope="module")
def internal(internal_key):
    return {"X-Internal-Service-Key": internal_key}


@pytest.fixture(scope="module")
def consultation_id(spring_url, auth):
    """Find (or take from env) one of this Doctor's consultations and start it."""
    forced = os.getenv("TEST_CONSULTATION_ID")
    if forced:
        consultation = httpx.get(
            f"{spring_url}/api/consultations/{forced}", headers=auth, timeout=15.0
        ).json()
    else:
        mine = httpx.get(
            f"{spring_url}/api/consultations/mine", headers=auth, timeout=15.0
        ).json()
        candidates = [c for c in mine if c["status"] in ("SCHEDULED", "IN_PROGRESS")]
        if not candidates:
            pytest.skip("No SCHEDULED/IN_PROGRESS consultation for this Doctor")
        consultation = candidates[0]

    cid = consultation["consultationId"]

    if consultation["status"] != "IN_PROGRESS":
        response = httpx.put(
            f"{spring_url}/api/consultations/{cid}/status",
            headers=auth, json={"status": "IN_PROGRESS"}, timeout=15.0,
        )
        assert response.status_code == 200, (
            f"Could not move consultation {cid} to IN_PROGRESS: {response.text[:200]}"
        )

    print(f"\n[3.x] using consultation {cid}")
    return cid


# --------------------------------------------------------------------------
# 3.1  LiveKit token for the browser
# --------------------------------------------------------------------------

def test_3_1_doctor_receives_a_room_scoped_livekit_token(spring_url, auth, consultation_id):
    response = httpx.post(
        f"{spring_url}/api/consultations/{consultation_id}/livekit-token",
        headers=auth, timeout=15.0,
    )
    assert response.status_code == 200, response.text[:300]
    body = response.json()

    assert body["roomName"] == f"consultation-{consultation_id}"
    assert body["serverUrl"].startswith("wss://")
    assert body["token"].count(".") == 2, "not a JWT"
    print(f"[3.1] room={body['roomName']} ttl={body.get('expiresInSeconds')}s")


def test_3_2_livekit_token_lifetime_is_actually_short(spring_url, auth, consultation_id):
    """Decodes exp-iat. Proves setTtl's UNIT, which nothing else verifies.

    If this reports ~120000 seconds (33 hours), AccessToken.setTtl expects
    SECONDS and every TTL value in the project is 1000x too large.
    """
    import base64
    import json

    token = httpx.post(
        f"{spring_url}/api/consultations/{consultation_id}/livekit-token",
        headers=auth, timeout=15.0,
    ).json()["token"]

    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload))
    lifetime = claims["exp"] - claims["iat"]
    print(f"[3.2] token lifetime = {lifetime} seconds")

    assert lifetime < 3600, (
        f"Token is valid for {lifetime}s ({lifetime / 3600:.1f} hours). "
        f"setTtl(120000) was interpreted as SECONDS, not milliseconds. "
        f"This is a security finding, not a cosmetic bug."
    )


# --------------------------------------------------------------------------
# 3.3  Worker bootstrap
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def bootstrap(spring_url, internal, consultation_id):
    response = httpx.post(
        f"{spring_url}/internal/consultations/{consultation_id}"
        f"/transcription-bootstrap",
        headers=internal, timeout=15.0,
    )
    assert response.status_code == 200, (
        f"Bootstrap failed ({response.status_code}): {response.text[:300]}\n"
        f"  401 -> INTERNAL_SERVICE_KEY mismatch (must be >= 32 chars both sides)"
    )
    body = response.json()
    print(f"[3.x] roomSessionId={body.get('roomSessionId')}")
    return body


def test_3_3_bootstrap_returns_a_restricted_worker_session(bootstrap):
    for key in ("serverUrl", "roomName", "token", "roomSessionId", "participants"):
        assert key in bootstrap, f"bootstrap response is missing '{key}'"
    assert bootstrap["participants"], "no participant role map returned"


def test_3_4_bootstrap_leaks_no_personal_data(bootstrap):
    """The worker must never receive names, e-mails or patient identifiers."""
    import json
    blob = json.dumps(bootstrap).lower()
    for leak in ("@", "firstname", "lastname", "email", "patientname"):
        assert leak not in blob, (
            f"bootstrap payload contains '{leak}' - the worker only needs "
            f"opaque user-<id> identities"
        )


def test_3_5_worker_token_can_subscribe_but_not_publish_media(bootstrap):
    """Decodes the LiveKit grants. The worker must be an observer only."""
    import base64
    import json

    payload = bootstrap["token"].split(".")[1]
    payload += "=" * (-len(payload) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload))
    grants = claims.get("video", {})
    print(f"[3.5] grants: {grants}")

    assert grants.get("roomJoin") is True
    assert grants.get("canSubscribe") is True
    assert grants.get("canPublish") is not True, (
        "The transcription worker can publish media. A bug in the worker could "
        "inject audio or video into a clinical consultation."
    )
    assert grants.get("canPublishData") is True, (
        "canPublishData is false - captions can never reach the browser."
    )


# --------------------------------------------------------------------------
# 3.6  Segment persistence and idempotency
# --------------------------------------------------------------------------

def _segment(bootstrap, patient_identity, source_id, text, start, end):
    return {
        "roomSessionId": bootstrap["roomSessionId"],
        "sourceSegmentId": source_id,
        "participantIdentity": patient_identity,
        "speakerLabel": "track-test",
        "text": text,
        "startMs": start,
        "endMs": end,
    }


@pytest.fixture(scope="module")
def patient_identity(bootstrap):
    for participant in bootstrap["participants"]:
        if participant["role"] == "PATIENT":
            return participant["identity"]
    pytest.skip("No PATIENT identity in the bootstrap map")


def test_3_6_final_segment_is_persisted(spring_url, internal, consultation_id,
                                        bootstrap, patient_identity):
    source_id = f"TR_test:{uuid.uuid4().hex[:8]}:1000:1500"
    response = httpx.post(
        f"{spring_url}/internal/consultations/{consultation_id}/transcript-segments",
        headers=internal,
        json=_segment(bootstrap, patient_identity, source_id,
                      "I have had a bad headache since Monday", 1000, 1500),
        timeout=15.0,
    )
    assert response.status_code in (200, 201), response.text[:300]
    assert response.json()["speakerRole"] == "PATIENT", (
        "Spring must DERIVE the role from the consultation, not trust the worker"
    )


def test_3_7_retrying_the_same_segment_creates_no_duplicate(
        spring_url, internal, auth, consultation_id, bootstrap, patient_identity):
    """Verify that a retried segment remains idempotent.

    A flaky network makes the worker retry. If this fails, every sentence gets
    duplicated in the clinical record.
    """
    source_id = f"TR_test:{uuid.uuid4().hex[:8]}:2000:2400"
    payload = _segment(bootstrap, patient_identity, source_id,
                       "and a sore throat", 2000, 2400)

    first = httpx.post(
        f"{spring_url}/internal/consultations/{consultation_id}/transcript-segments",
        headers=internal, json=payload, timeout=15.0)
    second = httpx.post(
        f"{spring_url}/internal/consultations/{consultation_id}/transcript-segments",
        headers=internal, json=payload, timeout=15.0)

    assert first.status_code in (200, 201), first.text[:300]
    assert second.status_code in (200, 201), (
        f"The retry was rejected with {second.status_code}: {second.text[:300]}\n"
        f"A 500 here means the unique-constraint violation escaped as an "
        f"exception instead of being handled idempotently."
    )

    segments = httpx.get(
        f"{spring_url}/api/consultations/{consultation_id}/transcript-segments",
        headers=auth, timeout=15.0).json()
    matching = [s for s in segments if s["sourceSegmentId"] == source_id]
    assert len(matching) == 1, f"Retry created {len(matching)} rows, expected 1"


def test_3_8_unrelated_participant_is_rejected(spring_url, internal,
                                               consultation_id, bootstrap):
    """A speaker who is not part of this consultation must never be stored."""
    response = httpx.post(
        f"{spring_url}/internal/consultations/{consultation_id}/transcript-segments",
        headers=internal,
        json=_segment(bootstrap, "user-999999",
                      f"TR_x:{uuid.uuid4().hex[:8]}:1:2", "unauthorised", 1, 2),
        timeout=15.0,
    )
    assert response.status_code in (400, 403), (
        f"An unrelated identity was accepted with {response.status_code}"
    )


def test_3_9_internal_routes_reject_a_missing_key(spring_url, consultation_id):
    """No browser and no curl without the key may write clinical segments."""
    response = httpx.post(
        f"{spring_url}/internal/consultations/{consultation_id}"
        f"/transcription-bootstrap",
        timeout=15.0,
    )
    assert response.status_code in (401, 403), (
        f"Internal route answered {response.status_code} with NO service key"
    )


def test_3_10_patient_cannot_read_transcript_segments(spring_url, consultation_id):
    """Segment history is staff-only."""
    login = httpx.post(
        f"{spring_url}/api/auth/login",
        json={"usernameOrEmail": os.getenv("TEST_PATIENT_USERNAME",
                                           "patient.oliver.hughes"),
              "password": DOCTOR_PASSWORD},
        timeout=15.0,
    )
    if login.status_code != 200:
        pytest.skip("Patient login failed; set TEST_PATIENT_USERNAME")

    token = login.json().get("accessToken") or login.json().get("token")
    response = httpx.get(
        f"{spring_url}/api/consultations/{consultation_id}/transcript-segments",
        headers={"Authorization": f"Bearer {token}"}, timeout=15.0,
    )
    assert response.status_code in (401, 403), (
        f"A Patient read staff transcript segments ({response.status_code})"
    )


# --------------------------------------------------------------------------
# 3.11  Finalisation, approval, extraction
# --------------------------------------------------------------------------

def test_3_11_finalisation_completes_the_consultation(
        spring_url, internal, auth, consultation_id, bootstrap):
    response = httpx.post(
        f"{spring_url}/internal/consultations/{consultation_id}"
        f"/finalize-transcription",
        headers=internal,
        json={"roomSessionId": bootstrap["roomSessionId"]},
        timeout=15.0,
    )
    assert response.status_code == 200, response.text[:300]

    consultation = httpx.get(
        f"{spring_url}/api/consultations/{consultation_id}",
        headers=auth, timeout=15.0).json()
    print(f"[3.11] status={consultation['status']} "
          f"transcription={consultation['transcriptionStatus']}")

    assert consultation["transcriptionStatus"] == "FINALIZED"
    assert consultation["status"] == "COMPLETED"


def test_3_12_finalisation_is_idempotent(
        spring_url, internal, consultation_id, bootstrap):
    """The worker retries after a network timeout. That must not be an error.

    KNOWN ISSUE: if finalisation rejects everything that is not IN_PROGRESS,
    this returns 400/409 and the worker reports a false failure.
    """
    response = httpx.post(
        f"{spring_url}/internal/consultations/{consultation_id}"
        f"/finalize-transcription",
        headers=internal,
        json={"roomSessionId": bootstrap["roomSessionId"]},
        timeout=15.0,
    )
    assert response.status_code == 200, (
        f"A repeated finalisation returned {response.status_code}: "
        f"{response.text[:200]}\nA successful finalisation followed by one "
        f"network timeout would be reported to the Doctor as a worker failure."
    )


def test_3_13_extraction_is_blocked_before_approval(
        spring_url, auth, consultation_id):
    """The approval gate is the whole point of the phase."""
    response = httpx.post(
        f"{spring_url}/api/consultations/{consultation_id}/extraction-jobs",
        headers=auth, timeout=15.0,
    )
    assert response.status_code in (400, 409), (
        f"Extraction was accepted without approval ({response.status_code})"
    )


@pytest.fixture(scope="module")
def approved(spring_url, auth, consultation_id):
    """Save a draft, then approve it as the assigned Doctor."""
    saved = httpx.put(
        f"{spring_url}/api/consultations/{consultation_id}/transcript",
        headers=auth, json={"transcript": APPROVED_TRANSCRIPT}, timeout=15.0,
    )
    assert saved.status_code == 200, saved.text[:300]
    revision = saved.json()["transcriptRevision"]

    response = httpx.post(
        f"{spring_url}/api/consultations/{consultation_id}/approve-transcript",
        headers=auth,
        json={"transcript": APPROVED_TRANSCRIPT, "expectedRevision": revision},
        timeout=15.0,
    )
    assert response.status_code == 200, (
        f"Approval failed ({response.status_code}): {response.text[:300]}"
    )
    body = response.json()
    print(f"[3.x] approved revision {body['transcriptApprovedRevision']}")
    return body


def test_3_14_approval_records_revision_and_approver(approved):
    assert approved["transcriptApprovedAt"] is not None
    assert approved["transcriptApprovedRevision"] == approved["transcriptRevision"]
    assert approved["transcriptApprovedBy"] is not None


def test_3_15_extraction_job_is_accepted_immediately(
        spring_url, auth, consultation_id, approved):
    """202 and a fast response prove the provider call is NOT inline."""
    started = time.perf_counter()
    response = httpx.post(
        f"{spring_url}/api/consultations/{consultation_id}/extraction-jobs",
        headers=auth, timeout=30.0,
    )
    elapsed = time.perf_counter() - started

    assert response.status_code in (200, 202), (
        f"{response.status_code}: {response.text[:400]}\n"
        f"  500 + 'relation \"extraction_job\" does not exist' -> the table was "
        f"never created; ddl-auto=none does not generate it."
    )
    print(f"[3.15] HTTP {response.status_code} in {elapsed:.2f}s, "
          f"status={response.json()['status']}")

    assert elapsed < 5.0, (
        f"The request took {elapsed:.1f}s. The GPT call is still running on "
        f"the HTTP thread - this is not asynchronous."
    )


def test_3_16_double_click_creates_only_one_job(
        spring_url, auth, consultation_id, approved):
    first = httpx.post(
        f"{spring_url}/api/consultations/{consultation_id}/extraction-jobs",
        headers=auth, timeout=30.0)
    second = httpx.post(
        f"{spring_url}/api/consultations/{consultation_id}/extraction-jobs",
        headers=auth, timeout=30.0)
    assert first.status_code in (200, 202, 409)
    assert second.status_code in (200, 202, 409)

    jobs = httpx.get(
        f"{spring_url}/api/consultations/{consultation_id}/extraction-jobs",
        headers=auth, timeout=15.0).json()
    revision = approved["transcriptApprovedRevision"]
    active = [j for j in jobs
              if j["transcriptRevision"] == revision
              and j["status"] in ("PENDING", "RUNNING", "SUCCEEDED")]
    assert len(active) == 1, f"{len(active)} active jobs for one revision"


def test_3_17_job_reaches_succeeded_and_stores_a_result(
        spring_url, auth, consultation_id):
    """Poll until terminal. This proves GPT ran and Spring stored the output."""
    deadline = time.time() + 120
    job = None

    while time.time() < deadline:
        jobs = httpx.get(
            f"{spring_url}/api/consultations/{consultation_id}/extraction-jobs",
            headers=auth, timeout=15.0).json()
        if not jobs:
            time.sleep(2)
            continue
        job = jobs[0]
        if job["status"] in ("SUCCEEDED", "FAILED"):
            break
        time.sleep(2)

    assert job is not None, "no extraction job was created"
    print(f"[3.17] final job state: {job}")

    assert job["status"] == "SUCCEEDED", (
        f"Job ended as {job['status']}: {job.get('errorMessage')}\n"
        f"  'temporarily unavailable' -> FastAPI down or AI_PROVIDER != python\n"
        f"  'stale'                   -> the transcript changed mid-flight"
    )
    assert job["resultSymptomRecordId"] is not None, (
        "A SUCCEEDED job must reference its stored symptom record"
    )


def test_3_18_stored_record_came_from_gpt_not_a_mock(
        spring_url, auth, consultation_id):
    records = httpx.get(
        f"{spring_url}/api/consultations/{consultation_id}/symptom-records",
        headers=auth, timeout=15.0).json()
    assert records, "no symptom record was stored"

    newest = records[0]
    print(f"[3.18] modelName={newest['modelName']} "
          f"symptoms={[s['name'] for s in newest['symptoms']]}")

    assert "mock" not in newest["modelName"].lower(), (
        f"modelName is {newest['modelName']!r} - Spring is running with "
        f"AI_PROVIDER=mock, so no GPT call happened."
    )
    assert newest["modelName"] == os.getenv("OPENAI_MODEL", "gpt-5-mini")
    assert newest["symptoms"], "GPT returned no symptoms for a symptomatic text"

    names = " ".join(s["name"].lower() for s in newest["symptoms"])
    assert "headache" in names, f"'headache' not extracted; got {names}"


def test_3_19_editing_after_approval_clears_the_approval(
        spring_url, auth, consultation_id):
    """An edit must disable extraction until the Doctor approves again."""
    response = httpx.put(
        f"{spring_url}/api/consultations/{consultation_id}/transcript",
        headers=auth,
        json={"transcript": APPROVED_TRANSCRIPT + "\nDoctor: Added a note."},
        timeout=15.0)
    assert response.status_code == 200, response.text[:300]

    body = response.json()
    assert body["transcriptApprovedAt"] is None, (
        "Editing an approved transcript did NOT clear the approval"
    )

    blocked = httpx.post(
        f"{spring_url}/api/consultations/{consultation_id}/extraction-jobs",
        headers=auth, timeout=15.0)
    assert blocked.status_code in (400, 409), (
        f"Extraction was allowed on an unapproved revision ({blocked.status_code})"
    )
