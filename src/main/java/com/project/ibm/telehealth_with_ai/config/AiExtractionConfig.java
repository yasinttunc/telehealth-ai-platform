package com.project.ibm.telehealth_with_ai.config;

import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

/** Creates one HTTP client for the private local Python service. */
@Configuration
@EnableConfigurationProperties(AiExtractionProperties.class)
public class AiExtractionConfig {

    @Bean
    RestClient restClient(
            AiExtractionProperties aiExtractionProperties,
            JsonMapper jsonMapper
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setReadTimeout(Duration.ofSeconds(aiExtractionProperties.getTimeoutSeconds()));

        return RestClient.builder()
                .baseUrl(aiExtractionProperties.getBaseUrl())
                .requestFactory(requestFactory)
                .messageConverters(converters ->
                        converters.add(new JacksonJsonHttpMessageConverter(jsonMapper)))
                .build();
    }
}