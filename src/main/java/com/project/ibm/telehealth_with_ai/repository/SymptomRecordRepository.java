package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.SymptomRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SymptomRecordRepository extends JpaRepository<SymptomRecord, Long> {
    List<SymptomRecord> findByConsultationConsultationIdOrderByCreatedAtDesc(Long consultationId);

}
