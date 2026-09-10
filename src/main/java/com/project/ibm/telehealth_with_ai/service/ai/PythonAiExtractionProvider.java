package com.project.ibm.telehealth_with_ai.service.ai;

import com.project.ibm.telehealth_with_ai.dto.response.SymptomItem;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/** Calls the local FastAPI service; it does not contain model or prompt logic. */
@Service
@ConditionalOnProperty(prefix = "app.ai", name = "provider", havingValue = "python")
public class PythonAiExtractionProvider implements SymptomExtractionProvider {

    private static final Logger LOGGER = LoggerFactory.getLogger(PythonAiExtractionProvider.class);

    private final RestClient restClient;
    private final JsonMapper jsonMapper;

    public PythonAiExtractionProvider(RestClient aiRestClient, JsonMapper jsonMapper) {
        this.restClient = aiRestClient;
        this.jsonMapper = jsonMapper;
    }


    //The records are public, so the HTTP boundary model is inspectable.

    /** JSON contract sent to the local FastAPI extraction endpoint. */
    public record PythonExtractionRequest(
            Long consultationId,
            String transcript,
            String promptVersion
    ) { }

    /** JSON contract returned by the local FastAPI extraction endpoint. */
    public record PythonExtractionResponse(
            List<SymptomItem> items,
            String provider,
            String modelName,
            String promptVersion
    ) { }

    private String writeRequest(PythonExtractionRequest request) {
        try {
            return jsonMapper.writeValueAsString(request);
        } catch (JacksonException exception) {
            throw new AiExtractionUnavailableException(
                    "Could not prepare the AI extraction request",
                    exception
            );
        }
    }


    @Override
    public AiExtractionResult extract(Long consultationId, String transcript, String promptVersion) {
        PythonExtractionRequest request = new PythonExtractionRequest(
                consultationId,
                transcript,
                promptVersion
        );

        try {
            PythonExtractionResponse response = restClient.post()
                    .uri("/api/v1/extractions")
                    .contentType(MediaType.APPLICATION_JSON)
                    //.body(writeRequest(request)) is the key repair. The method receives an actual JSON string such as {"consultationId":1,...},
                    // not an ambiguous Java object.
                    .body(writeRequest(request))
                    .retrieve()
                    .body(PythonExtractionResponse.class);

            if (response == null || response.items() == null) {
                throw new AiExtractionUnavailableException("AI service returned an empty response");
            }

            return new AiExtractionResult(
                    response.items(),
                    response.modelName(),
                    response.promptVersion()
            );
        } catch (RestClientException exception) {
            LOGGER.warn("Local AI extraction request failed{}", exception.getMessage());

            throw new AiExtractionUnavailableException(
                    "AI extraction is temporarily unavailable. Please try again later.",
                    exception
            );
        }
    }

}
