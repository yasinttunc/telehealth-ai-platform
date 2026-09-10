CREATE TABLE app_user (
    user_id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('DOCTOR', 'ADMIN', 'PATIENT')),
    email VARCHAR(255) NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patient (
    patient_id BIGSERIAL PRIMARY KEY,
    app_user_id BIGINT UNIQUE REFERENCES app_user(user_id),
    nhs_number VARCHAR(10) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE doctor (
    doctor_id BIGSERIAL PRIMARY KEY,
    app_user_id BIGINT UNIQUE REFERENCES app_user(user_id),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    specialty VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE available_times (
    doctor_id BIGINT NOT NULL REFERENCES doctor(doctor_id) ON DELETE CASCADE,
    available_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (doctor_id, available_at)
);

CREATE TABLE clinic (
    clinic_id BIGSERIAL PRIMARY KEY,
    clinic_name VARCHAR(160) NOT NULL,
    clinic_address VARCHAR(255) NOT NULL
);

CREATE TABLE consultation (
    consultation_id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL REFERENCES patient(patient_id) ON DELETE RESTRICT,
    clinician_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE RESTRICT,
    clinic_id BIGINT NOT NULL REFERENCES clinic(clinic_id) ON DELETE RESTRICT,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    transcript TEXT
);

CREATE TABLE symptom_record (
    symptom_record_id BIGSERIAL PRIMARY KEY,
    consultation_id BIGINT NOT NULL REFERENCES consultation(consultation_id) ON DELETE CASCADE,
    symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
    model_name VARCHAR(100) NOT NULL DEFAULT 'seed-data',
    prompt_version VARCHAR(50) NOT NULL DEFAULT 'seed-v1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alert (
    alert_id BIGSERIAL PRIMARY KEY,
    clinic_id BIGINT NOT NULL REFERENCES clinic(clinic_id) ON DELETE RESTRICT,
    symptom_name VARCHAR(100) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    observed_count INTEGER NOT NULL,
    baseline_count NUMERIC(8, 2) NOT NULL,
    score NUMERIC(8, 2) NOT NULL,
    threshold NUMERIC(8, 2) NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultation_patient_scheduled
    ON consultation(patient_id, scheduled_at DESC);
CREATE INDEX idx_consultation_clinician_scheduled
    ON consultation(clinician_id, scheduled_at DESC);
CREATE INDEX idx_consultation_clinic_status
    ON consultation(clinic_id, status);
CREATE INDEX idx_symptom_record_consultation_id
    ON symptom_record(consultation_id);
CREATE INDEX idx_symptom_record_symptoms_gin
    ON symptom_record USING GIN (symptoms);
CREATE INDEX idx_alert_clinic_status
    ON alert(clinic_id, status);
