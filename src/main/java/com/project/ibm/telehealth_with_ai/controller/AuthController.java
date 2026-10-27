package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.request.LoginRequest;
import com.project.ibm.telehealth_with_ai.dto.response.AuthResponse;
import com.project.ibm.telehealth_with_ai.security.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@io.swagger.v3.oas.annotations.tags.Tag(name = "Authentication", description = "Obtain a JWT for protected API operations.")
public class AuthController {

    private final AuthService authService;
    public AuthController(AuthService authService) {
        this.authService = authService;
    }
    @PostMapping("/login")
    @io.swagger.v3.oas.annotations.Operation(
            summary = "Authenticate and obtain a JWT",
            security = {}
    )
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest request
    ){
        return ResponseEntity.ok(authService.login(request));
    }
//    @GetMapping("/me")
//    public AppUserResponse me(){
//        return authService.getCurrentUserResponse();
//    }
}
