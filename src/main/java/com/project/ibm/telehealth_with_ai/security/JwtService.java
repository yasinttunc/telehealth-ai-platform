package com.project.ibm.telehealth_with_ai.security;


import com.project.ibm.telehealth_with_ai.model.AppUser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

//This class has one job: create a signed token and read trusted claims from a token that has already passed signature/expiry validation.
@Service
public class JwtService {

    //SecretKey is constructed once. It is never sent to React. expirationMs holds the configured lifetime.
    private final SecretKey signingKey;
    private final long expirationMs;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration-ms}") long expirationMs
    ){
        //The constructor receives property values. secret.getBytes(UTF_8) turns text into deterministic bytes;
        // Keys.hmacShaKeyFor checks they are suitable for an HMAC signing key.
        this.signingKey= Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs= expirationMs;
    }

    //generateToken accepts the trusted database AppUser, not browser-provided role text.
    public String generateToken(AppUser user) {
        Date now = new Date();
        Date expiry = new Date(now.getTime()+expirationMs);
        //Jwts.builder() starts a token. subject(...) writes the standard sub identity claim.
        return Jwts.builder()
                .subject(user.getUsername())
                .claim("role",user.getRole().name())
                .issuedAt(now)
                .expiration(expiry)
                .signWith(signingKey)
                .compact();

        //claim("role", ...) writes a convenient role value. The filter still reloads UserDetails from the database, so a disabled account or
        // changed role takes effect immediately.
        //issuedAt and expiration make the token finite. One hour is plenty for this demo.
        //signWith(signingKey) calculates the signature. compact() serializes header, payload, and signature into the three-dot string returned to React.

    }

    //extractUsername is intentionally small: it parses claims once and returns the standard subject.
    public String extractUsername(String token){
        return parseClaims(token).getSubject();
    }


    // parseClaims is the verification boundary. verifyWith supplies the server-only secret, build creates a parser,
    // and parseSignedClaims validates structure, signature, and expiry before returning payload claims.
    // Invalid tokens throw an exception; the filter catches it.
    public Claims parseClaims(String token){
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }


}
