package com.project.ibm.telehealth_with_ai.security;

import com.project.ibm.telehealth_with_ai.exception.BadRequestException;
import com.project.ibm.telehealth_with_ai.model.AppUser;
import com.project.ibm.telehealth_with_ai.repository.AppUserRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class DatabaseUserDetailsService implements UserDetailsService {

    private final AppUserRepository appUserRepository;

    public DatabaseUserDetailsService(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        AppUser appUser = appUserRepository.findByEmailOrUsernameIgnoreCase(username, username)
                .orElseThrow(() -> new BadRequestException("Invalid username or email: " + username.replaceAll("@.*", "")));
        if (appUser == null) {
            throw new UsernameNotFoundException("User not found: " + username);
        }

        return User.withUsername(appUser.getUsername())
                .password(appUser.getPassword())
                .authorities(List.of(new SimpleGrantedAuthority(
                        "ROLE_" + appUser.getRole().name())))
                .disabled(!appUser.isEnabled())
                .build();

    }
}
