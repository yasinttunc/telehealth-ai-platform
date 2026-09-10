package com.project.ibm.telehealth_with_ai.service;

import com.project.ibm.telehealth_with_ai.dto.response.SymptomItem;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

@Service
public class MockSymptomExtractionService {

    public List<SymptomItem> extract(String transcript) {
        String text = transcript.toLowerCase(Locale.ROOT);
        List<SymptomItem> results = new ArrayList<>();

        if (text.contains("cough")) {
            results.add(new SymptomItem("cough", "PRESENT", 0.90,"mock keyword match: cough"));
        }
        if (text.contains("fever")) {
            results.add(new SymptomItem("fever", "PRESENT", 0.85,"mock keyword match: fever"));
        }
        if (text.contains("headache")) {
            results.add(new SymptomItem("headache", "PRESENT", 0.80,"mock keyword match: headache"));
        }
        return results;
    }
    private void addIfMentioned(
            String transcript,
            List<SymptomItem> items,
            String symptomName,
            double confidence,
            String evidence
    ){
        if(transcript.contains(symptomName)){
            items.add(new SymptomItem(symptomName, "PRESENT", confidence,evidence));
        }
    }
}
