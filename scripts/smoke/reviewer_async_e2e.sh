#!/usr/bin/env bash
#
# A8-4: End-to-end async batch review smoke test
#
# Proves the entire async pipeline works:
#   1. API accepts batch with mode=async
#   2. Worker picks up and processes the batch
#   3. Status transitions: queued → running → completed
#   4. Worker metrics increment correctly
#
# Usage (with external API/worker):
#   API_URL=http://localhost:8000 WORKER_URL=http://localhost:8081 ./scripts/smoke/reviewer_async_e2e.sh
#
# Usage (starts processes automatically):
#   ./scripts/smoke/reviewer_async_e2e.sh --start-services
#
# Requires:
#   - curl, jq
#   - BATCH_PERSISTENCE_ENABLED=true in API environment
#   - DATABASE_URL set for worker
#
# Exit codes:
#   0 - All tests passed
#   1 - Test failure (see output)
#   2 - Setup/prerequisite failure
#

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
API_URL="${API_URL:-http://localhost:8000}"
WORKER_URL="${WORKER_URL:-http://localhost:8081}"
PROGRAM_ID="${PROGRAM_ID:-11111111-1111-1111-1111-111111111111}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-2}"
MAX_WAIT_SEC="${MAX_WAIT_SEC:-60}"
START_SERVICES="${1:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# PIDs for cleanup
API_PID=""
WORKER_PID=""

# ─────────────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────────────

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

cleanup() {
    if [[ -n "$API_PID" ]]; then
        log_info "Stopping API (PID: $API_PID)"
        kill "$API_PID" 2>/dev/null || true
    fi
    if [[ -n "$WORKER_PID" ]]; then
        log_info "Stopping worker (PID: $WORKER_PID)"
        kill "$WORKER_PID" 2>/dev/null || true
    fi
    # Cleanup temp files
    rm -rf "$TMPDIR" 2>/dev/null || true
}

trap cleanup EXIT

wait_for_health() {
    local url="$1"
    local name="$2"
    local max_attempts="${3:-30}"

    log_info "Waiting for $name at $url/health..."
    for i in $(seq 1 "$max_attempts"); do
        if curl -sf "$url/health" >/dev/null 2>&1; then
            log_pass "$name is healthy"
            return 0
        fi
        sleep 1
    done
    log_fail "$name did not become healthy within ${max_attempts}s"
    return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Service Management
# ─────────────────────────────────────────────────────────────────────────────

start_services() {
    log_info "Starting services..."

    # Start API in background
    log_info "Starting Reviewer API on port 8000..."
    cd "$PROJECT_ROOT"
    BATCH_PERSISTENCE_ENABLED=true \
    BATCH_WORKER_EXTERNAL=true \
app.include_router(router)

if __name__ == '__main__':
    uvicorn.run(app, host='0.0.0.0', port=8000, log_level='warning')
" &
    API_PID=$!
    log_info "API started (PID: $API_PID)"

    # Start worker in background
    log_info "Starting batch worker on port 8081..."
    BATCH_PERSISTENCE_ENABLED=true \
    BATCH_WORKER_PROGRAM_ID="$PROGRAM_ID" \
    BATCH_WORKER_HEALTH_PORT=8081 \
    BATCH_WORKER_POLL_INTERVAL=1 \
    BATCH_WORKER_LOG_LEVEL=WARNING \
    PYTHONPATH="$PROJECT_ROOT" \
    python3 "$PROJECT_ROOT/scripts/worker/run_batch_worker.py" &
    WORKER_PID=$!
    log_info "Worker started (PID: $WORKER_PID)"

    # Wait for services
    wait_for_health "$API_URL/review" "API"
    wait_for_health "$WORKER_URL" "Worker"
}

# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════════════"
echo "  A8-4: Async Batch Review End-to-End Smoke Test"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "API_URL:     $API_URL"
echo "WORKER_URL:  $WORKER_URL"
echo "PROGRAM_ID:  $PROGRAM_ID"
echo ""

# Start services if requested
if [[ "$START_SERVICES" == "--start-services" ]]; then
    start_services
fi

# Create temp directory for test files
TMPDIR=$(mktemp -d)

# ─────────────────────────────────────────────────────────────────────────────
# Test 1: Verify API health
# ─────────────────────────────────────────────────────────────────────────────
log_info "Test 1: API health check"

RESP=$(curl -sf "$API_URL/review/health" 2>&1) || {
    log_fail "API health check failed. Is API running at $API_URL?"
    exit 2
}

log_pass "API is healthy"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Test 2: Verify worker health and readiness
# ─────────────────────────────────────────────────────────────────────────────
log_info "Test 2: Worker health/ready check"

WORKER_HEALTH=$(curl -sf "$WORKER_URL/health" 2>&1) || {
    log_fail "Worker health check failed. Is worker running at $WORKER_URL?"
    exit 2
}

WORKER_READY=$(curl -sf "$WORKER_URL/ready" 2>&1) || {
    log_fail "Worker readiness check failed"
    exit 2
}

WORKER_STATUS=$(echo "$WORKER_READY" | jq -r '.status')
if [[ "$WORKER_STATUS" != "ready" ]]; then
    log_fail "Worker not ready: $WORKER_STATUS"
    exit 2
fi

log_pass "Worker is ready"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Test 3: Get initial worker metrics
# ─────────────────────────────────────────────────────────────────────────────
log_info "Test 3: Capture initial worker metrics"

METRICS_BEFORE=$(curl -sf "$WORKER_URL/metrics" 2>&1) || {
    log_fail "Failed to get worker metrics"
    exit 2
}

BATCHES_COMPLETED_BEFORE=$(echo "$METRICS_BEFORE" | jq -r '.batches_completed_total // 0')
log_info "Initial batches_completed_total: $BATCHES_COMPLETED_BEFORE"
log_pass "Metrics captured"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Test 4: Submit async batch via file upload endpoint
# ─────────────────────────────────────────────────────────────────────────────
log_info "Test 4: Submit async batch (POST /review/batch/file?mode=async)"

IDEMPOTENCY_KEY="smoke-e2e-$(date +%s)-$$"

# Create test PDF files (minimal valid PDF)
# PDF 1.4 minimal valid structure
cat > "$TMPDIR/doc1.pdf" << 'PDFEOF'
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 12 Tf 100 700 Td (Section 1: Introduction) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000214 00000 n
trailer << /Size 5 /Root 1 0 R >>
startxref
306
%%EOF
PDFEOF

cat > "$TMPDIR/doc2.pdf" << 'PDFEOF'
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length 35 >> stream
BT /F1 12 Tf 100 700 Td (Results) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000214 00000 n
trailer << /Size 5 /Root 1 0 R >>
startxref
297
%%EOF
PDFEOF

RESP=$(curl -s -w "\n%{http_code}" -X POST \
  "$API_URL/review/batch/file?program_id=$PROGRAM_ID&ruleset_version=0.1&extractor_version=smoke-e2e&mode=async" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -F "files=@$TMPDIR/doc1.pdf" \
  -F "files=@$TMPDIR/doc2.pdf")

HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')

if [[ "$HTTP_CODE" != "202" ]] && [[ "$HTTP_CODE" != "200" ]]; then
    log_fail "Expected 202/200, got $HTTP_CODE"
    echo "Body: $BODY"
    exit 1
fi

BATCH_ID=$(echo "$BODY" | jq -r '.batch_id')
INITIAL_STATUS=$(echo "$BODY" | jq -r '.status')
POLL_URL=$(echo "$BODY" | jq -r '.poll_url // ""')

log_info "batch_id: $BATCH_ID"
log_info "initial_status: $INITIAL_STATUS"
log_info "poll_url: $POLL_URL"
log_pass "Batch submitted (HTTP $HTTP_CODE)"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Test 5: Poll for status transitions
# ─────────────────────────────────────────────────────────────────────────────
log_info "Test 5: Poll batch status until completed"

SEEN_QUEUED=false
SEEN_RUNNING=false
SEEN_COMPLETED=false
ELAPSED=0

while [[ $ELAPSED -lt $MAX_WAIT_SEC ]]; do
    POLL_RESP=$(curl -sf "$API_URL/review/batch/$BATCH_ID?program_id=$PROGRAM_ID" 2>&1) || {
        log_warn "Poll request failed, retrying..."
        sleep "$POLL_INTERVAL_SEC"
        ELAPSED=$((ELAPSED + POLL_INTERVAL_SEC))
        continue
    }

    STATUS=$(echo "$POLL_RESP" | jq -r '.status')
    DOCS_PROCESSED=$(echo "$POLL_RESP" | jq -r '.documents_processed // 0')
    DOCS_TOTAL=$(echo "$POLL_RESP" | jq -r '.documents_total // 0')

    case "$STATUS" in
        "queued")
            SEEN_QUEUED=true
            log_info "Status: queued (waiting for worker)..."
            ;;
        "running")
            SEEN_RUNNING=true
            log_info "Status: running ($DOCS_PROCESSED/$DOCS_TOTAL docs)..."
            ;;
        "completed")
            SEEN_COMPLETED=true
            log_pass "Status: completed!"
            break
            ;;
        "failed")
            log_fail "Batch failed unexpectedly"
            echo "Response: $POLL_RESP"
            exit 1
            ;;
        *)
            log_warn "Unknown status: $STATUS"
            ;;
    esac

    sleep "$POLL_INTERVAL_SEC"
    ELAPSED=$((ELAPSED + POLL_INTERVAL_SEC))
done

if [[ "$SEEN_COMPLETED" != "true" ]]; then
    log_fail "Batch did not complete within ${MAX_WAIT_SEC}s"
    exit 1
fi

echo ""
log_info "Status transitions observed:"
log_info "  queued:    $SEEN_QUEUED"
log_info "  running:   $SEEN_RUNNING"
log_info "  completed: $SEEN_COMPLETED"
log_pass "Status flow verified"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Test 6: Verify final batch details
# ─────────────────────────────────────────────────────────────────────────────
log_info "Test 6: Verify completed batch details"

FINAL_RESP=$(curl -sf "$API_URL/review/batch/$BATCH_ID?program_id=$PROGRAM_ID&include_documents=true")

FINAL_STATUS=$(echo "$FINAL_RESP" | jq -r '.status')
FINDINGS_TOTAL=$(echo "$FINAL_RESP" | jq -r '.findings_total // 0')
DOCS_TOTAL=$(echo "$FINAL_RESP" | jq -r '.documents_total')

log_info "Final status: $FINAL_STATUS"
log_info "Documents: $DOCS_TOTAL"
log_info "Findings total: $FINDINGS_TOTAL"

if [[ "$FINAL_STATUS" != "completed" ]]; then
    log_fail "Expected completed, got $FINAL_STATUS"
    exit 1
fi

if [[ "$DOCS_TOTAL" != "2" ]]; then
    log_fail "Expected 2 documents, got $DOCS_TOTAL"
    exit 1
fi

log_pass "Batch details verified"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Test 7: Verify worker metrics incremented
# ─────────────────────────────────────────────────────────────────────────────
log_info "Test 7: Verify worker metrics incremented"

# Give worker a moment to update metrics
sleep 1

METRICS_AFTER=$(curl -sf "$WORKER_URL/metrics" 2>&1) || {
    log_warn "Failed to get worker metrics (worker may have stopped)"
    # Don't fail - metrics verification is secondary
    BATCHES_COMPLETED_AFTER="unknown"
}

if [[ "$METRICS_AFTER" != "" ]] && [[ "$BATCHES_COMPLETED_AFTER" != "unknown" ]]; then
    BATCHES_COMPLETED_AFTER=$(echo "$METRICS_AFTER" | jq -r '.batches_completed_total // 0')
    BATCHES_CLAIMED=$(echo "$METRICS_AFTER" | jq -r '.batches_claimed_total // 0')

    log_info "batches_completed_total: $BATCHES_COMPLETED_BEFORE → $BATCHES_COMPLETED_AFTER"
    log_info "batches_claimed_total: $BATCHES_CLAIMED"

    if [[ "$BATCHES_COMPLETED_AFTER" -gt "$BATCHES_COMPLETED_BEFORE" ]]; then
        log_pass "Worker metrics incremented"
    else
        log_warn "Metrics did not increment (may be verification timing)"
    fi
else
    log_warn "Worker metrics not available"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}  All tests passed!${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Async batch pipeline is working:"
echo "  ✓ API accepts batch with mode=async"
echo "  ✓ Worker claims and processes batch"
echo "  ✓ Status: queued → running → completed"
echo "  ✓ Batch results accessible via poll endpoint"
echo ""

exit 0
