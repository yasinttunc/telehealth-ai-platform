package com.project.ibm.telehealth_with_ai.service;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Starts and tracks one local Python transcription process per consultation.
 *
 * <p>This launcher is suitable for local development and coursework demos.
 * A production deployment should replace it with a queue or managed worker
 * service, because this in-memory process map only exists inside one JVM.</p>
 */
@Service
public class TranscriptionWorkerLauncher {

    private static final Logger LOGGER = LoggerFactory.getLogger(
            TranscriptionWorkerLauncher.class
    );

    private final boolean enabled;
    private final Path pythonExecutable;
    private final Path workingDirectory;
    private final Map<Long, Process> processes = new ConcurrentHashMap<>();

    /**
     * Resolves the configured worker paths once when Spring creates this bean.
     *
     * <p>For example, {@code ai-service/.venv/bin/python} is converted into an
     * absolute path under the project directory. That keeps worker startup
     * stable even if Spring was launched from a different terminal directory.</p>
     */
    public TranscriptionWorkerLauncher(
            @Value("${app.transcription.worker.enabled:false}") boolean enabled,
            @Value("${app.transcription.worker.python}") String pythonExecutable,
            @Value("${app.transcription.worker.working-directory}") String workingDirectory
    ) {
        Path projectDirectory = Path.of("").toAbsolutePath().normalize();
        this.enabled = enabled;
        this.pythonExecutable = projectDirectory
                .resolve(pythonExecutable)
                .normalize();
        this.workingDirectory = projectDirectory
                .resolve(workingDirectory)
                .normalize();

        LOGGER.info(
                "Transcription worker configuration python={} workingDirectory={}",
                this.pythonExecutable,
                this.workingDirectory
        );
    }

    /**
     * Starts a Python transcription worker unless one is already alive.
     *
     * <p>{@link Process} is Java's handle to an operating-system process. Here,
     * that external process is the command
     * {@code python -m worker.main --consultation_id <id>}. Java keeps the
     * handle so it can check whether the worker is alive, log its exit code, and
     * stop it when Spring shuts down.</p>
     */
    public void ensureWorkerRunning(Long consultationId) {
        if (!enabled) {
            LOGGER.info(
                    "Transcription worker launch is disabled for consultation {}",
                    consultationId
            );
            return;
        }

        /**
         * A Doctor and Patient can request LiveKit tokens at almost the same
         * time. Synchronizing this block makes the check-and-start sequence
         * atomic, so two requests cannot start two workers for one consultation.
         */
        synchronized (processes) {
            Process existing = processes.get(consultationId);
            if (existing != null && existing.isAlive()) {
                return;
            }
            processes.remove(consultationId);

            validateConfiguration();

            /*
             * ProcessBuilder prepares the terminal command Spring will run. It
             * does not start the worker until builder.start() is called.
             */
            ProcessBuilder builder = new ProcessBuilder(
                    pythonExecutable.toString(),
                    "-m",
                    "worker.main",
                    "--consultation_id",
                    consultationId.toString()
            );

            /*
             * The Python module import path depends on running from ai-service.
             * Without this working directory, "python -m worker.main" can fail
             * with "No module named worker.main".
             */
            builder.directory(workingDirectory.toFile());

            /*
             * Merge Python stderr into stdout and print it in the Spring
             * console. This makes worker logs visible during a local demo.
             */
            builder.redirectErrorStream(true);
            builder.redirectOutput(ProcessBuilder.Redirect.INHERIT);

            try {
                Process process = builder.start();
                processes.put(consultationId, process);
                LOGGER.info(
                        "Started transcription worker pid={} consultationId={}",
                        process.pid(),
                        consultationId
                );

                /*
                 * Remove the process from the map after it exits. Otherwise a
                 * dead worker could block a later retry for the same
                 * consultation.
                 */
                process.onExit().thenAccept(completed -> {
                    processes.remove(consultationId, completed);
                    LOGGER.info(
                            "Transcription worker exited pid={} consultationId={} code={}",
                            completed.pid(),
                            consultationId,
                            completed.exitValue()
                    );
                });
            } catch (IOException error) {
                throw new IllegalStateException(
                        "Could not start transcription worker for consultation "
                                + consultationId,
                        error
                );
            }
        }
    }

    /**
     * Fails before ProcessBuilder when the local worker setup is invalid.
     *
     * <p>This gives a clear Spring-side error instead of starting a Python
     * process that immediately dies because the interpreter or directory is
     * wrong.</p>
     */
    private void validateConfiguration() {
       /*
        * A path can never be both a regular file and a directory, so the
        * previous isDirectory check rejected every interpreter and made worker
        * startup fail unconditionally. What actually matters is that the path
        * resolves to a file the JVM is allowed to execute; isRegularFile
        * follows the symlink a virtual environment installs at bin/python, and
        * isExecutable still returns false when that symlink is broken.
        */
       if (!Files.isRegularFile(pythonExecutable)
               || !Files.isExecutable(pythonExecutable)) {
           throw new IllegalStateException(
                   "Transcription Python executable is invalid: " + pythonExecutable
           );
       }

        if (!Files.isDirectory(workingDirectory)) {
            throw new IllegalStateException(
                    "Transcription worker directory is invalid: "
                            + workingDirectory
            );
        }
    }

    /**
     * Stops locally-owned Python workers when Spring is shutting down.
     *
     * <p>{@code destroy()} asks the worker to stop gracefully. If it is still
     * alive after 15 seconds, {@code destroyForcibly()} kills it so Spring does
     * not wait forever.</p>
     */
    @PreDestroy
    public void stopWorkers() {
        processes.values().forEach(process -> {
            if (process.isAlive()) {
                process.destroy();

                try {
                    if (!process.waitFor(15, TimeUnit.SECONDS)) {
                        LOGGER.warn(
                                "Transcription worker pid={} did not stop after SIGTERM",
                                process.pid()
                        );
                        process.destroyForcibly();
                    }
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    LOGGER.warn(
                            "Interrupted while waiting for worker pid={} to stop",
                            process.pid()
                    );
                }
            }
        });

        processes.clear();
    }
}
