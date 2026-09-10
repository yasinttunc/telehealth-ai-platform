package com.project.ibm.telehealth_with_ai;

import com.project.ibm.telehealth_with_ai.model.AlertStatus;
import com.project.ibm.telehealth_with_ai.repository.AlertRepository;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Integration tests for the main review and alert security rules. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AlertFeatureIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void patientCannotListAlerts() throws Exception {
        mockMvc.perform(get("/api/alerts")
                        .header("Authorization", bearerToken(
                                "patient.oliver.hughes", "password")))
                .andExpect(status().isForbidden());
    }

    @Test
    void doctorSeesOnlyAlertsFromRelevantClinics() throws Exception {
        Long unrelatedClinicId = jdbcTemplate.queryForObject(
                """
                INSERT INTO clinic (clinic_name, clinic_address)
                VALUES ('API test clinic', 'Not assigned to this Doctor')
                RETURNING clinic_id
                """,
                Long.class
        );

        Instant now = Instant.now();
        jdbcTemplate.update(
                """
                INSERT INTO alert (
                    clinic_id, symptom_code, symptom_name, window_start,
                    window_end, observed_count, baseline_count, score,
                    threshold, status, detector_version, created_at,
                    updated_at, last_evaluated_at, version
                ) VALUES (?, 'scope.test', 'Scope test', ?, ?, 3, 1, 3,
                          2.5, 'OPEN', 'scope-test-v1', ?, ?, ?, 0)
                """,
                unrelatedClinicId,
                Timestamp.from(now.minusSeconds(604800)),
                Timestamp.from(now),
                Timestamp.from(now),
                Timestamp.from(now),
                Timestamp.from(now)
        );

        mockMvc.perform(get("/api/alerts")
                        .header("Authorization", bearerToken(
                                "dr.sarah.patel", "password")))
                .andExpect(status().isOk())
                .andExpect(jsonPath(
                        "$[?(@.clinicId == " + unrelatedClinicId + ")]"
                ).isEmpty());
    }

    @Test
    void assignedDoctorCanSaveFindingReview() throws Exception {
        mockMvc.perform(put("/api/symptom-records/1/review")
                        .header("Authorization", bearerToken(
                                "dr.sarah.patel", "password"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"acceptedFindings\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.symptomRecordId").value(1))
                .andExpect(jsonPath("$.acceptedFindings").isArray());
    }

    @Test
    void adminCannotSaveFindingReview() throws Exception {
        mockMvc.perform(put("/api/symptom-records/1/review")
                        .header("Authorization", bearerToken("admin", "admin"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"acceptedFindings\":[]}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void closingAlertRequiresANote() throws Exception {
        var openAlert = alertRepository.findAll().stream()
                .filter(alert -> alert.getStatus() == AlertStatus.OPEN)
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "Seed data must include one OPEN alert"));

        mockMvc.perform(put("/api/alerts/" + openAlert.getAlertId() + "/status")
                        .header("Authorization", bearerToken("admin", "admin"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DISMISSED\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "A note is required when an alert is closed"));
    }

    @Test
    void statusNoteAndActorAppearInHistory() throws Exception {
        var openAlert = alertRepository.findAll().stream()
                .filter(alert -> alert.getStatus() == AlertStatus.OPEN)
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "Seed data must include one OPEN alert"));
        String adminToken = bearerToken("admin", "admin");

        mockMvc.perform(put("/api/alerts/" + openAlert.getAlertId() + "/status")
                        .header("Authorization", adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ACKNOWLEDGED\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/alerts/" + openAlert.getAlertId() + "/status")
                        .header("Authorization", adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "status": "RESOLVED",
                                  "note": "Trend checked with the clinic"
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/alerts/" + openAlert.getAlertId() + "/history")
                        .header("Authorization", adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.newStatus == 'RESOLVED')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.note == 'Trend checked with the clinic')]")
                        .isNotEmpty())
                .andExpect(jsonPath("$[?(@.changedByUsername == 'admin')]")
                        .isNotEmpty());
    }

    /** Logs in through the real endpoint and returns its Bearer header value. */
    private String bearerToken(String usernameOrEmail, String password)
            throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(usernameOrEmail, password)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        String marker = "\"accessToken\":\"";
        int tokenStart = response.indexOf(marker) + marker.length();
        int tokenEnd = response.indexOf('"', tokenStart);

        if (tokenStart < marker.length() || tokenEnd < 0) {
            throw new AssertionError("Login response did not contain accessToken");
        }
        return "Bearer " + response.substring(tokenStart, tokenEnd);
    }

    private String loginBody(String usernameOrEmail, String password) {
        return "{\"usernameOrEmail\":\"" + usernameOrEmail
                + "\",\"password\":\"" + password + "\"}";
    }
}
