package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.model.AlertStatus;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Small unit tests for the two alert rules that do not need Spring. */
class AlertServiceRuleTest {

    @Test
    void detectorRequiresAtLeastThreeConsultations() {
        assertFalse(AlertService.passesThreshold(2, new BigDecimal("4.00")));
    }

    @Test
    void detectorRequiresAHighEnoughRatio() {
        assertFalse(AlertService.passesThreshold(4, new BigDecimal("2.49")));
        assertTrue(AlertService.passesThreshold(4, new BigDecimal("2.50")));
    }

    @Test
    void scoreUsesAOnePointZeroBaselineFloor() {
        assertTrue(AlertService.calculateScore(
                3,
                BigDecimal.ZERO
        ).compareTo(new BigDecimal("3.00")) == 0);
        assertTrue(AlertService.calculateScore(
                3,
                new BigDecimal("0.50")
        ).compareTo(new BigDecimal("3.00")) == 0);
    }

    @Test
    void scoreUsesTheWeeklyBaselineWhenItIsAboveOne() {
        assertTrue(AlertService.calculateScore(
                5,
                new BigDecimal("2.00")
        ).compareTo(new BigDecimal("2.50")) == 0);
    }

    @Test
    void openAlertCanBeAcknowledgedOrDismissed() {
        assertTrue(AlertService.isAllowedTransition(
                AlertStatus.OPEN,
                AlertStatus.ACKNOWLEDGED));
        assertTrue(AlertService.isAllowedTransition(
                AlertStatus.OPEN,
                AlertStatus.DISMISSED));
        assertFalse(AlertService.isAllowedTransition(
                AlertStatus.OPEN,
                AlertStatus.RESOLVED));
    }

    @Test
    void closedAlertCannotChangeAgain() {
        assertFalse(AlertService.isAllowedTransition(
                AlertStatus.RESOLVED,
                AlertStatus.OPEN));
        assertFalse(AlertService.isAllowedTransition(
                AlertStatus.DISMISSED,
                AlertStatus.OPEN));
    }
}
