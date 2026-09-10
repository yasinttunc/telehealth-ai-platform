package com.project.ibm.telehealth_with_ai.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

@SpringBootTest
class DoctorServiceIntegrationTest {

    @Autowired
    private DoctorService doctorService;

    @Test
    void getAllDoctorsLoadsTheirAvailableTimes() {
        assertDoesNotThrow(doctorService::getAllDoctors);
    }
}
