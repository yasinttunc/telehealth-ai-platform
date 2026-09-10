package com.project.ibm.telehealth_with_ai.exception;

import com.project.ibm.telehealth_with_ai.service.ai.AiExtractionUnavailableException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.http.HttpStatus;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse handleResourceNotFound(
            ResourceNotFoundException exception,
            HttpServletRequest request
    ) {
        return new ErrorResponse(
                404,
                exception.getMessage(),
                request.getRequestURI()
        );
    }

    @ExceptionHandler(DuplicateResourceException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ErrorResponse handleDuplicateResource(
            DuplicateResourceException exception,
            HttpServletRequest request
    ) {
        return new ErrorResponse(
                409,
                exception.getMessage(),
                request.getRequestURI()
        );
    }

    @ExceptionHandler(BadRequestException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleBadRequest(
            BadRequestException exception,
            HttpServletRequest request
    ) {
        return new ErrorResponse(
                400,
                exception.getMessage(),
                request.getRequestURI()
        );
    }

    @ExceptionHandler(UnauthorizedException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    public ErrorResponse handleUnauthorized(
            UnauthorizedException exception,
            HttpServletRequest request
    ) {
        return new ErrorResponse(
                HttpStatus.UNAUTHORIZED.value(),
                exception.getMessage(),
                request.getRequestURI()
        );
    }

    @ExceptionHandler(AccessDeniedException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public ErrorResponse handleAccessDenied(
            AccessDeniedException exception,
            HttpServletRequest request
    ) {
        return new ErrorResponse(
                403,
                exception.getMessage(),
                request.getRequestURI()
        );
    }

    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public ErrorResponse handleSpringAccessDenied(
            org.springframework.security.access.AccessDeniedException exception,
            HttpServletRequest request
    ) {
        return new ErrorResponse(
                403,
                exception.getMessage(),
                request.getRequestURI()
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request) {

        Map<String, String> fieldErrors = exception.getBindingResult()
                .getFieldErrors()
                .stream()
                .collect(Collectors.toMap(
                        FieldError::getField,
                        DefaultMessageSourceResolvable::getDefaultMessage,
                        (first, ignored) -> first,
                        LinkedHashMap::new
                ));

        return new ErrorResponse(HttpStatus.BAD_REQUEST.value(),
                "Validation failed",
                request.getRequestURI(),
                fieldErrors
        );
    }

    @ExceptionHandler(AiExtractionUnavailableException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public ErrorResponse handleAiExtractionUnavailable(
            AiExtractionUnavailableException exception,
            HttpServletRequest request
    ){
        return new ErrorResponse(
                HttpStatus.SERVICE_UNAVAILABLE.value(),
                exception.getMessage(),
                request.getRequestURI()
        );
    }

    @ExceptionHandler(ConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    public ErrorResponse handleConflict(
            ConflictException exception,
            HttpServletRequest request
    ){
        return new ErrorResponse(
                409,
                exception.getMessage(),
                request.getRequestURI()
        );
    }

    /**
     * Returns a safe response without exposing LiveKit credentials.
     */
    @ExceptionHandler(LiveKitUnavailableException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public ErrorResponse handleLiveKitUnavailable(
            LiveKitUnavailableException exception,
            HttpServletRequest request
    ) {
        return new ErrorResponse(
                HttpStatus.SERVICE_UNAVAILABLE.value(),
                exception.getMessage(),
                request.getRequestURI()
        );
    }

}
