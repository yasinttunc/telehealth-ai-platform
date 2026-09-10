INSERT INTO app_user (user_id, username, password, role, email, enabled, created_at) VALUES
    (1, 'admin', '$2a$10$E6LkCtrd6qgvY3u4tFLip.bGTtJoJT0o93L3Z8XiJ57MOshVRGV.e', 'ADMIN', 'admin@telehealth.local', TRUE, now() - interval '40 days'),
    (2, 'dr.sarah.patel', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'DOCTOR', 'sarah.patel@telehealth.local', TRUE, now() - interval '38 days'),
    (3, 'dr.james.wilson', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'DOCTOR', 'james.wilson@telehealth.local', TRUE, now() - interval '37 days'),
    (4, 'dr.emily.chen', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'DOCTOR', 'emily.chen@telehealth.local', TRUE, now() - interval '36 days'),
    (5, 'patient.oliver.hughes', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'PATIENT', 'oliver.hughes@example.local', TRUE, now() - interval '30 days'),
    (6, 'patient.amelia.brown', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'PATIENT', 'amelia.brown@example.local', TRUE, now() - interval '29 days'),
    (7, 'patient.noah.taylor', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'PATIENT', 'noah.taylor@example.local', TRUE, now() - interval '28 days'),
    (8, 'patient.isla.evans', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'PATIENT', 'isla.evans@example.local', TRUE, now() - interval '27 days'),
    (9, 'patient.jack.roberts', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'PATIENT', 'jack.roberts@example.local', TRUE, now() - interval '26 days'),
    (10, 'patient.sophia.walker', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'PATIENT', 'sophia.walker@example.local', TRUE, now() - interval '25 days'),
    (11, 'patient.mia.johnson', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'PATIENT', 'mia.johnson@example.local', TRUE, now() - interval '24 days'),
    (12, 'patient.george.davies', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'PATIENT', 'george.davies@example.local', TRUE, now() - interval '23 days'),
    (13, 'patient.freya.thomas', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'PATIENT', 'freya.thomas@example.local', TRUE, now() - interval '22 days'),
    (14, 'patient.leo.williams', '$2a$10$vWaWc8ERBdsLOeHpKm44N.oDIeb5sdubxyVnNb3Ce0DS9pwpo7xmS', 'PATIENT', 'leo.williams@example.local', TRUE, now() - interval '21 days');

INSERT INTO patient (patient_id, app_user_id, nhs_number, first_name, last_name, date_of_birth, created_at) VALUES
    (1, 5, '4857773456', 'Oliver', 'Hughes', '1991-04-12', now() - interval '30 days'),
    (2, 6, '6392018842', 'Amelia', 'Brown', '1984-09-23', now() - interval '29 days'),
    (3, 7, '7245189031', 'Noah', 'Taylor', '2000-01-16', now() - interval '28 days'),
    (4, 8, '3901185274', 'Isla', 'Evans', '1976-11-05', now() - interval '27 days'),
    (5, 9, '8124706395', 'Jack', 'Roberts', '1998-07-31', now() - interval '26 days'),
    (6, 10, '5640391728', 'Sophia', 'Walker', '1969-03-18', now() - interval '25 days'),
    (7, 11, '1038462917', 'Mia', 'Johnson', '1989-12-09', now() - interval '24 days'),
    (8, 12, '9572301846', 'George', 'Davies', '1958-06-02', now() - interval '23 days'),
    (9, 13, '2486915037', 'Freya', 'Thomas', '1995-10-27', now() - interval '22 days'),
    (10, 14, '6719053824', 'Leo', 'Williams', '2003-02-14', now() - interval '21 days');

INSERT INTO doctor (doctor_id, app_user_id, first_name, last_name, specialty, created_at) VALUES
    (1, 2, 'Sarah', 'Patel', 'General Practice', now() - interval '38 days'),
    (2, 3, 'James', 'Wilson', 'Respiratory Medicine', now() - interval '37 days'),
    (3, 4, 'Emily', 'Chen', 'Infectious Disease', now() - interval '36 days');

INSERT INTO available_times (doctor_id, available_at) VALUES
    (1, now() + interval '1 day' + interval '9 hours'),
    (1, now() + interval '1 day' + interval '11 hours'),
    (1, now() + interval '2 days' + interval '14 hours'),
    (2, now() + interval '1 day' + interval '10 hours'),
    (2, now() + interval '3 days' + interval '15 hours'),
    (3, now() + interval '2 days' + interval '9 hours'),
    (3, now() + interval '4 days' + interval '13 hours');

INSERT INTO clinic (clinic_id, clinic_name, clinic_address) VALUES
    (1, 'Swansea Central Telehealth Clinic', '12 Wind Street, Swansea SA1 1AA'),
    (2, 'Bay Health Virtual Practice', '45 Fabian Way, Swansea SA1 8QB'),
    (3, 'Uplands Community Medical Hub', '7 Uplands Crescent, Swansea SA2 0PG');

INSERT INTO consultation (
    consultation_id, patient_id, clinician_id, clinic_id, scheduled_at, status, started_at, ended_at, transcript
) VALUES
    (1, 1, 2, 1, now() - interval '9 days', 'COMPLETED', now() - interval '9 days', now() - interval '9 days' + interval '18 minutes',
     'Patient reports a dry cough, mild fever, and fatigue for two days. Denies chest pain.'),
    (2, 2, 2, 1, now() - interval '8 days', 'COMPLETED', now() - interval '8 days', now() - interval '8 days' + interval '16 minutes',
     'Patient describes sore throat, cough, headache, and chills. No shortness of breath reported.'),
    (3, 3, 3, 2, now() - interval '2 hours', 'IN_PROGRESS', now() - interval '20 minutes', NULL,
     NULL),
    (4, 4, 4, 3, now() + interval '1 day', 'SCHEDULED', NULL, NULL, NULL),
    (5, 5, 2, 2, now() + interval '2 days', 'SCHEDULED', NULL, NULL, NULL),
    (6, 6, 3, 1, now() - interval '1 day', 'CANCELLED', NULL, NULL, NULL);

INSERT INTO symptom_record (symptom_record_id, consultation_id, symptoms, model_name, prompt_version, created_at) VALUES
    (1, 1, '[{"name":"cough","assertion":"present","confidence":0.94},{"name":"fever","assertion":"present","confidence":0.88},{"name":"fatigue","assertion":"present","confidence":0.91}]', 'seed-extractor', 'seed-v1', now() - interval '9 days'),
    (2, 2, '[{"name":"sore throat","assertion":"present","confidence":0.92},{"name":"cough","assertion":"present","confidence":0.90},{"name":"chills","assertion":"present","confidence":0.86}]', 'seed-extractor', 'seed-v1', now() - interval '8 days');

INSERT INTO alert (
    alert_id, clinic_id, symptom_name, window_start, window_end,
    observed_count, baseline_count, score, threshold, status, created_at
) VALUES
    (1, 1, 'cough', now() - interval '9 days', now(), 6, 2.00, 3.00, 2.50, 'OPEN', now() - interval '10 hours'),
    (2, 1, 'fever', now() - interval '9 days', now(), 5, 1.50, 3.33, 2.50, 'ACKNOWLEDGED', now() - interval '10 hours'),
    (3, 3, 'headache', now() - interval '3 days', now(), 1, 1.00, 1.00, 2.50, 'DISMISSED', now() - interval '18 hours');

SELECT setval('app_user_user_id_seq', (SELECT MAX(user_id) FROM app_user));
SELECT setval('patient_patient_id_seq', (SELECT MAX(patient_id) FROM patient));
SELECT setval('doctor_doctor_id_seq', (SELECT MAX(doctor_id) FROM doctor));
SELECT setval('clinic_clinic_id_seq', (SELECT MAX(clinic_id) FROM clinic));
SELECT setval('consultation_consultation_id_seq', (SELECT MAX(consultation_id) FROM consultation));
SELECT setval('symptom_record_symptom_record_id_seq', (SELECT MAX(symptom_record_id) FROM symptom_record));
SELECT setval('alert_alert_id_seq', (SELECT MAX(alert_id) FROM alert));

-- 3. ID dizisini sonraki otomatik kayıttan önce düzelt.
SELECT setval('app_user_user_id_seq', (SELECT MAX(user_id) FROM app_user));
