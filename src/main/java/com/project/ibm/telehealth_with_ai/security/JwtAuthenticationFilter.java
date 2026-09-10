package com.project.ibm.telehealth_with_ai.security;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.SecretKey;
import java.io.IOException;

public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final DatabaseUserDetailsService userDetailsService;

    public JwtAuthenticationFilter(JwtService jwtService, DatabaseUserDetailsService userDetailsService) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain
    ) throws ServletException, IOException{

        String header = request.getHeader("Authorization");

        if(header == null || !header.startsWith("Bearer")){
//doFilterInternal is Spring's hook; it receives the HTTP request/response and the remaining filter chain.
            chain.doFilter(request, response);
            return;
        }

        try{
            //substring(7) removes exactly Bearer, including the space. The preceding startsWith check makes this safe.
            String token = header.substring(7);
            String username = jwtService.extractUsername(token);
            //
            if(SecurityContextHolder.getContext().getAuthentication()==null){
                UserDetails details = userDetailsService.loadUserByUsername(username);
                UsernamePasswordAuthenticationToken authenticationToken =
                        UsernamePasswordAuthenticationToken.authenticated(details, null, details.getAuthorities());
                SecurityContextHolder.getContext().setAuthentication(authenticationToken);
                //authenticated(details, null, authorities) creates a trusted Spring Authentication; null ensures a raw password is never retained.
                //SecurityContextHolder...setAuthentication is the critical line: later @PreAuthorize and getCurrentUser() can now see this caller.
            }
        }catch (JwtException | UsernameNotFoundException exception){
            // Deliberately do not authenticate an invalid token. The configured
            // entry point will produce JSON 401 if the target is protected.
            SecurityContextHolder.clearContext();
        }
        chain.doFilter(request, response);
      //The final filterChain.doFilter passes control to the next security filter and then a controller. Forgetting it makes every request hang or fail.
    }
}
