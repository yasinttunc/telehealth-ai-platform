"""Run evaluation stages in the correct and safe order."""
import argparse
import os
import subprocess
import sys
from pathlib import Path

from config import (
    EXPECTED_UNIQUE_DIALOGUES,
    PREDICTIONS_DIR,
    PROVIDERS,
    REPEATABILITY_DIALOGUES,
    RESULTS_DIR,
    prompt_suffix,
)


EVALUATION_DIR = Path(__file__).resolve().parents[1]
SOURCE_DIR = EVALUATION_DIR / "src"
TESTS_DIR = EVALUATION_DIR / "tests"

# Child scripts must be able to import modules from evaluation/src.
PROCESS_ENV = {
    **os.environ,
    "PYTHONPATH": str(SOURCE_DIR),
}


def run_python(filename, *arguments):
    """Run one Python file and stop if it fails."""
    command = [
        sys.executable,
        str(SOURCE_DIR / filename),
        *arguments,
    ]

    print()
    print("$", " ".join(command))

    subprocess.run(
        command,
        cwd=EVALUATION_DIR,
        env=PROCESS_ENV,
        check=True,
    )


def run_tests():
    """Run the focused evaluation unit tests."""
    if not TESTS_DIR.exists():
        raise FileNotFoundError(
            "The tests directory does not exist."
        )

    command = [
        sys.executable,
        "-m",
        "pytest",
        "tests",
        "-q",
    ]

    print()
    print("$", " ".join(command))

    subprocess.run(
        command,
        cwd=EVALUATION_DIR,
        env=PROCESS_ENV,
        check=True,
    )


def predictions_are_ready(suffix=""):
    """Check that every provider prediction file exists."""
    for provider in PROVIDERS:
        path = PREDICTIONS_DIR / f"{provider}{suffix}.json"
        if not path.exists():
            return False

    return True


def local_validation():
    """Run every free stage without contacting providers."""
    run_tests()
    run_python("corpus.py")

    if not (RESULTS_DIR / "gold.json").exists():
        raise FileNotFoundError(
            "corpus.py did not produce results/gold.json"
        )

    # This uses the 18 duplicate annotations and makes no provider calls.
    run_python("reliability.py")

    print()
    print("Local validation passed.")
    print("No provider calls were made.")


def collect_predictions(prompt_version):
    """Collect results from every configured provider."""
    for provider in PROVIDERS:
        run_python(
            "providers.py",
            "--provider",
            provider,
            "--confirm-paid-calls",
            "--prompt-version",
            prompt_version,
        )


def score_existing_predictions(prompt_version):
    """Calculate metrics and generate the report."""
    suffix = prompt_suffix(prompt_version)

    if not predictions_are_ready(suffix):
        raise FileNotFoundError(
            "All three prediction files are required before scoring. "
            f"Expected files ending in \"{suffix}.json\"."
        )

    run_python("evaluate.py", "--prompt-version", prompt_version)
    run_python("report.py", "--prompt-version", prompt_version)


def main():
    """Choose between validation, collection and score-only modes."""
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--confirm-paid-calls",
        action="store_true",
        help="Allow calls to OpenAI, Anthropic and Ollama.",
    )
    parser.add_argument(
        "--score-only",
        action="store_true",
        help="Reuse existing predictions without provider calls.",
    )
    parser.add_argument(
        "--prompt-version",
        default="v1",
        choices=("v1", "v2"),
        help="v1 is the frozen primary prompt. v2 is the post-hoc "
             "experiment and uses its own prediction and result files.",
    )

    arguments = parser.parse_args()

    # Tests and corpus validation always run first.
    local_validation()

    if arguments.score_only:
        score_existing_predictions(arguments.prompt_version)
        return

    if not arguments.confirm_paid_calls:
        print()
        print("To start provider collection, run:")
        print(
            "python src/run_all.py --confirm-paid-calls "
            f"--prompt-version {arguments.prompt_version}"
        )
        return

    print()
    planned_calls = len(PROVIDERS) * (
        EXPECTED_UNIQUE_DIALOGUES + REPEATABILITY_DIALOGUES
    )
    print(f"WARNING: this will run {planned_calls} provider calls.")
    print(f"Prompt version: {arguments.prompt_version}")
    print("Existing completed rows will be reused.")

    collect_predictions(arguments.prompt_version)
    score_existing_predictions(arguments.prompt_version)

    suffix = prompt_suffix(arguments.prompt_version)

    print()
    print("Evaluation completed.")
    print(f"Open results/report{suffix}.md")


if __name__ == "__main__":
    main()
