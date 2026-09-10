package com.project.ibm.telehealth_with_ai;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ApiSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void validLoginReturnsJwtAndSafeIdentity() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("admin", "admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.username").value("admin"))
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.password").doesNotExist());
    }

    @Test
    void invalidLoginReturnsUnauthorizedWithoutAccountDetails() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody("admin", "wrong-password")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid credentials"));
    }

    @Test
    void protectedRouteWithoutTokenReturnsUnauthorizedJson() throws Exception {
        mockMvc.perform(get("/api/users"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void patientCannotAccessAdminOnlyUserRoute() throws Exception {
        String patientToken = bearerToken("patient.oliver.hughes", "password");

        mockMvc.perform(get("/api/users")
                        .header("Authorization", patientToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void patientCanReadOwnConsultationFeedOnlyThroughMineRoute() throws Exception {
        String patientToken = bearerToken("patient.oliver.hughes", "password");

        mockMvc.perform(get("/api/consultations/mine")
                        .header("Authorization", patientToken))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/consultations")
                        .header("Authorization", patientToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void patientCannotReadAnotherPatientsConsultation() throws Exception {
        String patientToken = bearerToken("patient.oliver.hughes", "password");

        // Seed consultation 2 belongs to Patient account 6, not Oliver's account 5.
        mockMvc.perform(get("/api/consultations/2")
                        .header("Authorization", patientToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void doctorCannotUpdateAnotherDoctorsConsultation() throws Exception {
        String doctorToken = bearerToken("dr.sarah.patel", "password");

        // Seed consultation 3 belongs to clinician user 3, not Dr Sarah's user 2.
        mockMvc.perform(put("/api/consultations/3/status")
                        .header("Authorization", doctorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CANCELLED\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void adminCannotChangeRoleOfLinkedPatientAccount() throws Exception {
        String adminToken = bearerToken("admin", "admin");

        mockMvc.perform(put("/api/users/5")
                        .header("Authorization", adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "patient.oliver.hughes",
                                  "email": "oliver.hughes@example.local",
                                  "role": "ADMIN",
                                  "enabled": true
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        "Role cannot be changed while this account is linked to a doctor or patient profile"
                ));
    }

    private String bearerToken(String usernameOrEmail, String password) throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody(usernameOrEmail, password)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        String marker = "\"accessToken\":\"";
        int start = response.indexOf(marker);
        if (start < 0) {
            throw new AssertionError("Login response did not contain accessToken");
        }

        int tokenStart = start + marker.length();
        int tokenEnd = response.indexOf('"', tokenStart);
        if (tokenEnd < 0) {
            throw new AssertionError("Login response contained an invalid accessToken");
        }

        return "Bearer " + response.substring(tokenStart, tokenEnd);
    }

    private String loginBody(String usernameOrEmail, String password) throws Exception {
        return "{\"usernameOrEmail\":\"" + usernameOrEmail
                + "\",\"password\":\"" + password + "\"}";
    }
}
