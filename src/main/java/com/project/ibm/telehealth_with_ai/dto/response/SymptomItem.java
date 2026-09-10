package com.project.ibm.telehealth_with_ai.dto.response;

/**
 * Represents one symptom extracted from a transcript by the AI service.
 */
public class SymptomItem {

    private String name;
    private String assertion;
    private Double confidence;
    private String evidence;

    public SymptomItem() {
        // Required by Jackson when a JSONB symptom list is deserialized.
    }

    public SymptomItem(String name, String assertion, Double confidence,String evidence) {
        this.name = name;
        this.assertion = assertion;
        this.confidence = confidence;
        this.evidence = evidence;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getAssertion() {
        return assertion;
    }

    public void setAssertion(String assertion) {
        this.assertion = assertion;
    }

    public Double getConfidence() {
        return confidence;
    }

    public void setConfidence(Double confidence) {
        this.confidence = confidence;
    }

    public String getEvidence() {
        return evidence;
    }

    public void setEvidence(String evidence) {
        this.evidence = evidence;
    }
}
