package com.project.ibm.telehealth_with_ai.security;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.*;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class InternalServiceKeyFilter extends OncePerRequestFilter {

    private final byte[] expectedKey;
    private final JsonAuthenticationEntryPoint entryPoint;

    public InternalServiceKeyFilter(
            @Value("${app.internal.service-key:}") String key,
            JsonAuthenticationEntryPoint entryPoint
    ) {
        this.expectedKey = key.getBytes(StandardCharsets.UTF_8);
        this.entryPoint = entryPoint;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/internal/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain
    ) throws ServletException, IOException {

        List<String> headers = Collections.list(
                request.getHeaders("X-Internal-Service-Key")
        );

        boolean valid = expectedKey.length >= 32
                && headers.size() == 1
                && MessageDigest.isEqual(
                expectedKey,
                headers.getFirst().getBytes(StandardCharsets.UTF_8)
        );

        if (!valid) {
            SecurityContextHolder.clearContext();
            entryPoint.commence(
                    request,
                    response,
                    new InsufficientAuthenticationException(
                            "Invalid internal service key"
                    )
            );
            return;
        }

        var authentication = UsernamePasswordAuthenticationToken.authenticated(
                "transcription-worker",
                null,
                List.of(new SimpleGrantedAuthority("INTERNAL_SERVICE"))
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);
        chain.doFilter(request, response);
    }
}
