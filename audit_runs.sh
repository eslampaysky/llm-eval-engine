#!/bin/bash
# ============================================================
# AiBreaker — 5 Consecutive Audit Runs (OOM Validation Suite)
# ============================================================
# Usage: chmod +x audit_runs.sh && ./audit_runs.sh
# Requires: curl, python3
# ============================================================

BASE="https://llm-eval-engine-production.up.railway.app"
EMAIL="eslamsamy650@gmail.com"
PASSWORD="123Esl@m321"
API_KEY="client_key"

# ── Colors ───────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $1"; }
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# ── Step 1: Login and get token ───────────────────────────────
log "Logging in as $EMAIL ..."

LOGIN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token') or d.get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  fail "Login failed. Response: $LOGIN"
  exit 1
fi
pass "Token acquired: ${TOKEN:0:20}..."

# ── Helper: start audit and poll until done ───────────────────
run_audit() {
  local NUM=$1
  local URL=$2
  local TIER=$3
  local DESC=$4

  echo ""
  echo "──────────────────────────────────────────────────"
  log "Audit #$NUM — $DESC"
  log "URL: $URL  |  Tier: $TIER"
  echo "──────────────────────────────────────────────────"

  START_TIME=$(date +%s)

  RESPONSE=$(curl -s -X POST "$BASE/agentic-qa/start" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-API-KEY: $API_KEY" \
    -d "{\"url\":\"$URL\",\"tier\":\"$TIER\",\"site_description\":\"$DESC\"}")

  AUDIT_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('audit_id',''))" 2>/dev/null)

  if [ -z "$AUDIT_ID" ]; then
    fail "Could not start audit. Response: $RESPONSE"
    return 1
  fi
  log "Audit ID: $AUDIT_ID — polling..."

  # Poll until done (max 3 minutes)
  for i in $(seq 1 36); do
    sleep 5
    STATUS_RESP=$(curl -s "$BASE/agentic-qa/status/$AUDIT_ID" \
      -H "Authorization: Bearer $TOKEN" \
      -H "X-API-KEY: $API_KEY")

    STATUS=$(echo "$STATUS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)

    if [ "$STATUS" = "done" ]; then
      END_TIME=$(date +%s)
      DURATION=$((END_TIME - START_TIME))

      SCORE=$(echo "$STATUS_RESP"     | python3 -c "import sys,json; print(json.load(sys.stdin).get('score','n/a'))" 2>/dev/null)
      APP_TYPE=$(echo "$STATUS_RESP"  | python3 -c "import sys,json; r=json.load(sys.stdin); tl=r.get('journey_timeline') or []; print(tl[0].get('app_type','n/a') if tl else 'n/a')" 2>/dev/null)
      JOURNEYS=$(echo "$STATUS_RESP"  | python3 -c "
import sys,json
r=json.load(sys.stdin)
tl=r.get('journey_timeline') or []
if not tl: print('none'); exit()
for j in tl:
    st=j.get('status','?')
    nm=j.get('journey','?')
    print(f'  {nm}: {st}')
" 2>/dev/null)
      RECOVERY=$(echo "$STATUS_RESP"  | python3 -c "
import sys,json
r=json.load(sys.stdin)
sr=r.get('step_results') or []
events=[]
for s in sr:
    for ra in (s.get('recovery_attempts') or []):
        if isinstance(ra,dict):
            events.append(ra.get('blocker_type','unknown'))
        else:
            events.append(str(ra))
print(', '.join(events) if events else 'none')
" 2>/dev/null)
      BOT=$(echo "$STATUS_RESP" | python3 -c "
import sys,json
r=json.load(sys.stdin)
sr=r.get('step_results') or []
blocked=[s for s in sr if s.get('failure_type')=='blocked_by_bot_protection']
print('YES — blocked_by_bot_protection' if blocked else 'no')
" 2>/dev/null)
      VIDEO=$(echo "$STATUS_RESP" | python3 -c "import sys,json; print('yes' if json.load(sys.stdin).get('video_url') else 'no')" 2>/dev/null)

      pass "Audit #$NUM DONE in ${DURATION}s"
      echo "  score:     $SCORE"
      echo "  app_type:  $APP_TYPE"
      echo "  video:     $VIDEO"
      echo "  bot block: $BOT"
      echo "  recovery:  $RECOVERY"
      echo "  journeys:"
      echo "$JOURNEYS"
      return 0
    fi

    if [ "$STATUS" = "failed" ]; then
      fail "Audit #$NUM FAILED"
      echo "$STATUS_RESP" | python3 -m json.tool 2>/dev/null | head -30
      return 1
    fi

    # Still running
    echo -n "."
  done

  echo ""
  fail "Audit #$NUM TIMED OUT after 3 minutes"
  return 1
}

# ── Confirm health before starting ───────────────────────────
log "Checking Railway health..."
HEALTH=$(curl -s "$BASE/health")
COMMIT=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('commit','?'))" 2>/dev/null)
pass "Railway is up — commit: $COMMIT"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     Starting 5-Audit OOM Validation Suite        ║"
echo "║     Watch Railway memory graph while this runs   ║"
echo "╚══════════════════════════════════════════════════╝"

# ── Audit #1: SaaS Marketing (linear.app) ────────────────────
# Goal: Clean baseline — marketing_site classification, 3 nav journeys
run_audit 1 \
  "https://linear.app" \
  "deep" \
  "SaaS project management marketing site with pricing and features"

sleep 20

# ── Audit #2: E-commerce (gymshark.com) ──────────────────────
# Goal: Ecommerce classification, add-to-cart attempt
# Expected: cart journey attempted, possible auth_required on checkout
run_audit 2 \
  "https://www.gymshark.com" \
  "deep" \
  "E-commerce fitness apparel store with product catalog and cart"

sleep 20

# ── Audit #3: SaaS with Cookie Banner (notion.so) ────────────
# Goal: Validates dismiss_blockers() fires on cookie consent
# Expected: recovery_attempts contains cookie_consent event
run_audit 3 \
  "https://www.notion.so" \
  "deep" \
  "SaaS productivity and notes platform with marketing landing page"

sleep 20

# ── Audit #4: Heavy JS Site (airbnb.com) ─────────────────────
# Goal: Stress test — heavy JS, delayed hydration, complex DOM
# Expected: marketing_site or generic, long duration, no OOM
run_audit 4 \
  "https://www.airbnb.com" \
  "deep" \
  "Travel accommodation marketplace with search and listings"

sleep 20

# ── Audit #5: Cloudflare-blocked site ────────────────────────
# Goal: Confirms blocked_by_bot_protection surfaces cleanly
# Expected: status=done, failure_type=blocked_by_bot_protection, fast exit
run_audit 5 \
  "https://www.autotrader.co.uk" \
  "deep" \
  "Car listings site — expected to be blocked by Cloudflare bot protection"

# ── Final summary ─────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
echo "  All 5 audits attempted."
echo "  If none crashed Railway — OOM fix is working."
echo "  Check Railway logs for: [Memory] rss=...MB"
echo "  Memory should spike then DROP after each audit."
echo "  A rising staircase = context/browser not closed."
echo "══════════════════════════════════════════════════"
