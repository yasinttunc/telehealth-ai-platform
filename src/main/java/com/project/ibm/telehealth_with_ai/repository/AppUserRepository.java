package com.project.ibm.telehealth_with_ai.repository;

import com.project.ibm.telehealth_with_ai.model.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AppUserRepository extends JpaRepository<AppUser, Long> {

    AppUser findByEmail(String email);

    AppUser findByUserId(Long userId);

    AppUser findByUsernameIgnoreCase(String username);

    AppUser findByUsernameLikeIgnoreCase(String username);

    AppUser findByEmailOrUsername(String email, String username);

    Optional<AppUser> findByEmailOrUsernameIgnoreCase(String email, String username);

    List<AppUser> findByRole(AppUser.Role role);

    @Override
    List<AppUser> findAll();

    List<AppUser> findByUsernameLike(String username);
    boolean existsByUsernameIgnoreCaseAndUserIdNot(String username, Long userId);

    boolean existsByEmailAndUserIdNot(String email, Long userId);



}
