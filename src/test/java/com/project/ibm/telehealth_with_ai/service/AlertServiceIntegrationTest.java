package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.dto.request.UpdateAlertStatusRequest;
import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.model.AlertStatus;
import com.project.ibm.telehealth_with_ai.repository.AppUserRepository;
import com.project.ibm.telehealth_with_ai.repository.AlertRepository;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@Transactional
class AlertServiceIntegrationTest {

    @Autowired
    private AlertService alertService;

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private AppUserRepository appUserRepository;

    /** AlertService reads the current user from Spring Security. */
    @BeforeEach
    void logInAsAdmin() {
        var admin = appUserRepository.findByUsernameIgnoreCase("admin");
        if (admin == null) {
            throw new AssertionError("Seed data must include the admin user");
        }

        var authentication = new UsernamePasswordAuthenticationToken(
                admin.getUsername(),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    @AfterEach
    void clearLogin() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void openAlertCannotSkipAcknowledgementAndResolveDirectly() {
        var alert = alertRepository.findAll().stream()
                .filter(item -> item.getStatus() == AlertStatus.OPEN)
                .findFirst()
                .orElseThrow(() -> new AssertionError("Seed data must include one OPEN alert"));

        UpdateAlertStatusRequest request = new UpdateAlertStatusRequest();
        request.setStatus(AlertStatus.RESOLVED);
        request.setNote("Checked by the clinician");

        assertThrows(BadRequestException.class,
                () -> alertService.updateStatus(alert.getAlertId(), request));

        assertEquals(AlertStatus.OPEN,
                alertRepository.findById(alert.getAlertId()).orElseThrow().getStatus());
    }
}
