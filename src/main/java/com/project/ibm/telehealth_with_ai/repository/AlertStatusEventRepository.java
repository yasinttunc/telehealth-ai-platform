package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.AlertStatusEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AlertStatusEventRepository extends JpaRepository<AlertStatusEvent, Long> {

    List<AlertStatusEvent> findByAlertAlertIdOrderByCreatedAtAsc(Long alertId);
}
