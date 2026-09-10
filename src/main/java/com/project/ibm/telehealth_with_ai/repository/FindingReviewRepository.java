package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.FindingReview;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/** Connects a symptom record to its single clinician review. */
public interface FindingReviewRepository extends JpaRepository<FindingReview, Long> {

    Optional<FindingReview> findBySymptomRecordSymptomRecordId(Long symptomRecordId);
}
