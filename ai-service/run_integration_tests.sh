#!/usr/bin/env bash
#
# Optional integration test runner.
#
# Run it with: cd ai-service && ./run_integration_tests.sh
#
# It runs two layers:
#   OFFLINE  - pure worker logic, no network, no cost
#   LIVE     - real Deepgram, real OpenAI, real Spring (skipped if unreachable)

set -uo pipefail

cd "$(dirname "$0")"

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; OFF=$'\033[0m'

step() { printf "\n%s==> %s%s\n" "$BOLD" "$1" "$OFF"; }
ok()   { printf "%s  PASS%s %s\n" "$GREEN" "$OFF" "$1"; }
bad()  { printf "%s  FAIL%s %s\n" "$RED" "$OFF" "$1"; }
warn() { printf "%s  WARN%s %s\n" "$YELLOW" "$OFF" "$1"; }

# ---------------------------------------------------------------------------
step "0. Environment"
# ---------------------------------------------------------------------------

# The project venv is Python 3.9. deepgram-sdk needs 3.10+, so the streaming
# test uses the `websockets` library instead and works on either interpreter.
PY="${PY:-.venv/bin/python3}"
if [ ! -x "$PY" ]; then
  PY="$(command -v python3)"
  warn "ai-service/.venv not found, falling back to $PY"
fi

echo "  interpreter: $("$PY" --version 2>&1)  ($PY)"

if [ ! -f .env ]; then
  bad ".env is missing. Copy .env.example and fill it in."
  exit 1
fi

# Report which credentials are present WITHOUT printing their values.
for key in DEEPGRAM_API_KEY OPENAI_API_KEY OPENAI_MODEL INTERNAL_SERVICE_KEY \
           SPRING_INTERNAL_BASE_URL DEEPGRAM_MODEL; do
  value="$(grep -E "^${key}=" .env | cut -d= -f2- || true)"
  if [ -z "$value" ]; then
    bad "$key is empty in .env"
  elif [[ "$key" == *KEY* ]]; then
    ok "$key is set (${#value} chars)"
  else
    ok "$key = $value"
  fi
done

# The worker talks to whatever SPRING_INTERNAL_BASE_URL says. Comparing that
# against the default in application.properties reported a mismatch even when
# Spring had been started correctly with SERVER_PORT from .env, so ask the
# running server instead of guessing from a file.
spring_base="$(grep -E '^SPRING_INTERNAL_BASE_URL=' .env | cut -d= -f2- || true)"
if [ -n "$spring_base" ]; then
  if curl -s -m 3 -o /dev/null "${spring_base}/error" 2>/dev/null; then
    ok "Spring answers on ${spring_base}"
  else
    warn "Nothing answers on ${spring_base}"
    warn "  Start it with: ./scripts/run-spring-local.sh   (reads SERVER_PORT from .env)"
  fi
fi

# ---------------------------------------------------------------------------
step "1. Test dependencies"
# ---------------------------------------------------------------------------

"$PY" - <<'PYCODE'
import importlib.util, sys
missing = [m for m in ("pytest", "httpx", "dotenv") if not importlib.util.find_spec(m)]
optional = [m for m in ("websockets",) if not importlib.util.find_spec(m)]
if missing:
    print(f"  MISSING (required): {', '.join(missing)}")
    sys.exit(1)
if optional:
    print(f"  MISSING (optional): {', '.join(optional)} "
          f"-> streaming tests will be skipped")
print("  required packages present")
PYCODE

if [ $? -ne 0 ]; then
  bad "Install them:  $PY -m pip install pytest httpx python-dotenv websockets"
  exit 1
fi

# ---------------------------------------------------------------------------
step "2. OFFLINE — worker logic (no network, no cost)"
# ---------------------------------------------------------------------------

"$PY" -m pytest tests/test_transcription_worker.py -v --no-header -p no:cacheprovider
offline_status=$?

# ---------------------------------------------------------------------------
step "3. Service reachability"
# ---------------------------------------------------------------------------

spring_url="$(grep -E '^SPRING_INTERNAL_BASE_URL=' .env | cut -d= -f2- || echo '')"
ai_url="${AI_SERVICE_URL:-http://localhost:8000}"

probe() {
  if curl -s -m 3 -o /dev/null "$1" 2>/dev/null; then ok "$2 reachable ($1)"; return 0
  else warn "$2 NOT reachable ($1) - its tests will be skipped"; return 1; fi
}

probe "$ai_url/health" "FastAPI"
probe "$spring_url/error" "Spring"

# ---------------------------------------------------------------------------
step "4. LIVE — Deepgram, GPT, and the full Spring pipeline"
# ---------------------------------------------------------------------------

warn "This step makes billable Deepgram and OpenAI calls."
"$PY" -m pytest tests/live -v -s --no-header -p no:cacheprovider
live_status=$?

# ---------------------------------------------------------------------------
step "Summary"
# ---------------------------------------------------------------------------

[ $offline_status -eq 0 ] && ok "offline suite" || bad "offline suite"
[ $live_status   -eq 0 ] && ok "live suite"    || bad "live suite (see failures above)"

exit $(( offline_status != 0 || live_status != 0 ))
