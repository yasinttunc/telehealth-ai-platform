# Telehealth PostgreSQL Database

This folder contains a reproducible local PostgreSQL database for the AI-Integrated Telehealth project.

The database includes:

- app users with `ADMIN`, `DOCTOR`, and `PATIENT` roles
- patients with synthetic NHS-style numbers
- doctors and availability slots
- clinics
- consultations with realistic synthetic transcripts
- extracted symptom JSON records
- outbreak-style alerts for testing the analytics/admin workflow

All data is synthetic and safe for coursework/demo use.

## Start The Database

From the project root:

```bash
docker compose up -d postgres
```

PostgreSQL will be available at:

```text
localhost:55432
```

Connection details:

```text
Database: telehealth
Username: telehealth
Password: telehealth
```

JDBC URL:

```text
jdbc:postgresql://localhost:55432/telehealth
```

## Connect With `psql`

```bash
psql "postgresql://telehealth:telehealth@localhost:55432/telehealth"
```

## Apply Schema And Seed Data

If the Docker container cannot mount local init scripts, apply the SQL files from the host:

```bash
psql "postgresql://telehealth:telehealth@localhost:55432/telehealth" -f infra/postgres/init/01-schema.sql
psql "postgresql://telehealth:telehealth@localhost:55432/telehealth" -f infra/postgres/init/02-seed-data.sql
```

Useful checks:

```sql
\dt
SELECT * FROM app_user;
SELECT * FROM patient;
SELECT * FROM consultation;
SELECT * FROM symptom_record;
SELECT * FROM alert;
```

## Reset The Database

This deletes the local PostgreSQL volume. After starting PostgreSQL again, re-apply the schema and seed files.

```bash
docker compose down -v
docker compose up -d postgres
psql "postgresql://telehealth:telehealth@localhost:55432/telehealth" -f infra/postgres/init/01-schema.sql
psql "postgresql://telehealth:telehealth@localhost:55432/telehealth" -f infra/postgres/init/02-seed-data.sql
```

## Demo Login Seed Notes

The main seeded admin account is:

```text
Username: admin
Password: admin
Role: ADMIN
```

Treat it as development seed data only.

When you implement authentication properly, replace these users with records created through your registration/login service.

## Current Code Compatibility Notes

The current Java classes are still early. This schema supports the current class names and tables, but some model improvements are still needed:

- `Clinic` should get an `@Id` field for `clinicId`.
- `PatientRepository` currently has methods for `email` and `username`, but `Patient` does not have those fields.
- `DoctorRepository` currently has methods for `email` and `username`, but `Doctor` does not have those fields.
- The final project should eventually use Flyway migrations under `src/main/resources/db/migration`.
