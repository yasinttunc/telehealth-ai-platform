package com.project.ibm.telehealth_with_ai.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Metadata for the browser-facing REST API specification. */
@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI telehealthOpenApi() {
        return new OpenAPI().info(new Info()
                .title("AI-Integrated Telehealth Platform API")
                .version("v1")
                .description("Browser-facing REST API for the synthetic-data telehealth research prototype. "
                        + "Most endpoints require a JWT obtained through the login endpoint. "
                        + "Internal worker endpoints are intentionally excluded."))
                .addSecurityItem(new SecurityRequirement().addList("bearerAuth"))
                .components(new Components().addSecuritySchemes("bearerAuth", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("Paste the JWT returned by POST /api/auth/login.")));
    }
}
