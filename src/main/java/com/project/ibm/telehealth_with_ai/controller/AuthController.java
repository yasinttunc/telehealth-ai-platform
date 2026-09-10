package com.project.ibm.telehealth_with_ai.controller;

import com.project.ibm.telehealth_with_ai.dto.request.LoginRequest;
import com.project.ibm.telehealth_with_ai.dto.response.AuthResponse;
import com.project.ibm.telehealth_with_ai.security.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    public AuthController(AuthService authService) {
        this.authService = authService;
    }
    @PostMapping("/login")
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
