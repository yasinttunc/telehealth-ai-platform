package com.project.ibm.telehealth_with_ai.security;

import com.project.ibm.telehealth_with_ai.dto.request.LoginRequest;
import com.project.ibm.telehealth_with_ai.dto.response.AppUserResponse;
import com.project.ibm.telehealth_with_ai.dto.response.AuthResponse;
import com.project.ibm.telehealth_with_ai.exception.UnauthorizedException;
import com.project.ibm.telehealth_with_ai.model.AppUser;
import com.project.ibm.telehealth_with_ai.repository.AppUserRepository;
import com.project.ibm.telehealth_with_ai.security.JwtService;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private final AuthenticationManager authenticationManager;
    private final AppUserRepository appUserRepository;
    private final JwtService jwtService;

    public AuthService(AuthenticationManager authenticationManager,
                       AppUserRepository appUserRepository,
                       JwtService jwtService) {
        this.authenticationManager = authenticationManager;
        this.appUserRepository = appUserRepository;
        this.jwtService = jwtService;
    }

    public AuthResponse login(LoginRequest request){
        try{
            authenticationManager.authenticate(
                    //UsernamePasswordAuthenticationToken.unauthenticated(...) represents credentials before trust has been established.
                    // It is the correct input to AuthenticationManager.
                    UsernamePasswordAuthenticationToken.unauthenticated(
                            request.getUsernameOrEmail(),request.getPassword()
                    ));
        }catch (AuthenticationException exception){
            throw new UnauthorizedException("Invalid credentials");
        }

        AppUser user = appUserRepository
                .findByEmailOrUsernameIgnoreCase(
                        request.getUsernameOrEmail(), request.getUsernameOrEmail())
                .orElseThrow(() -> new UnauthorizedException("Invalid credentials"));

        AuthResponse response = new AuthResponse();
        response.setAccessToken(jwtService.generateToken(user));
        response.setUserId(user.getUserId());
        response.setUsername(user.getUsername());
        response.setEmail(user.getEmail());
        response.setRole(user.getRole().name());
        return response;
    }


}
