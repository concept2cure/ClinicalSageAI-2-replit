#!/usr/bin/env bash
#
# A8-6: Ops Control Plane smoke test
#
# Proves the ops control plane works:
#   1. Submit async batch (queued)
#   2. Cancel immediately (while queued)
#   3. Verify status = cancelled
#   4. Requeue the cancelled batch
#   5. Verify status = queued
#   6. Let worker process to completion
#   7. Verify batch list endpoint works
#
# Usage (with external API/worker):
#   API_URL=http://localhost:8000 WORKER_URL=http://localhost:8081 ./scripts/smoke/reviewer_ops_smoke.sh
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

fail() {
    log_fail "$@"
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Prerequisites Check
# ─────────────────────────────────────────────────────────────────────────────

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check for required commands
    for cmd in curl jq; do
        if ! command -v "$cmd" &>/dev/null; then
            fail "Required command not found: $cmd"
        fi
    done

    # Check API health
    if ! curl -sf "$API_URL/review/health" >/dev/null 2>&1; then
        fail "API not healthy at $API_URL/review/health"
    fi
    log_pass "API is healthy"

    # Worker is optional for this test (we test cancel before worker picks up)
    if curl -sf "$WORKER_URL/health" >/dev/null 2>&1; then
        log_pass "Worker is healthy"
    else
        log_warn "Worker not available at $WORKER_URL - some tests may be skipped"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Test 1: Submit batch and cancel while queued
# ─────────────────────────────────────────────────────────────────────────────

test_cancel_queued_batch() {
    log_info "=== Test 1: Cancel queued batch ==="

    # Submit a batch (should stay queued if worker is slow/absent)
    log_info "Submitting async batch..."
    local submit_response
    submit_response=$(curl -sf -X POST "$API_URL/review/batch" \
        -H "Content-Type: application/json" \
        -d '{
            "program_id": "'"$PROGRAM_ID"'",
            "mode": "async",
            "documents": [
                {
                    "text": {
                        "content": "This is test content for cancel test.",
                        "source_type": "docx"
                    }
                }
            ],
            "ruleset_version": "0.1",
            "extractor_version": "test-v1",
            "response_mode": "summary"
        }')

    BATCH_ID=$(echo "$submit_response" | jq -r '.batch_id')
    if [[ -z "$BATCH_ID" || "$BATCH_ID" == "null" ]]; then
        fail "Failed to extract batch_id from response: $submit_response"
    fi
    log_pass "Batch submitted: $BATCH_ID"

    # Immediately cancel
    log_info "Cancelling batch immediately..."
    local cancel_response
    cancel_response=$(curl -sf -X POST "$API_URL/review/batch/$BATCH_ID/cancel?program_id=$PROGRAM_ID" \
        -H "Content-Type: application/json" \
        -d '{
            "reason": "Smoke test - cancel queued batch",
            "requested_by": "smoke-test"
        }')

    local cancel_status
    cancel_status=$(echo "$cancel_response" | jq -r '.status')
    if [[ "$cancel_status" != "cancelled" ]]; then
        fail "Expected status 'cancelled' but got '$cancel_status'"
    fi
    log_pass "Batch cancelled immediately (was queued)"

    # Verify via admin endpoint
    local admin_response
    admin_response=$(curl -sf "$API_URL/review/batch/$BATCH_ID/admin?program_id=$PROGRAM_ID")
    local admin_status
    admin_status=$(echo "$admin_response" | jq -r '.status')
    if [[ "$admin_status" != "cancelled" ]]; then
        fail "Admin endpoint shows status '$admin_status', expected 'cancelled'"
    fi

    local cancel_reason
    cancel_reason=$(echo "$admin_response" | jq -r '.cancel_reason')
    if [[ "$cancel_reason" != "Smoke test - cancel queued batch" ]]; then
        fail "Cancel reason not preserved"
    fi
    log_pass "Cancel fields verified via admin endpoint"

    echo "$BATCH_ID"
}

# ─────────────────────────────────────────────────────────────────────────────
# Test 2: Requeue cancelled batch
# ─────────────────────────────────────────────────────────────────────────────

test_requeue_cancelled_batch() {
    local batch_id="$1"
    log_info "=== Test 2: Requeue cancelled batch ==="

    # Requeue the batch
    log_info "Requeuing batch $batch_id..."
    local requeue_response
    requeue_response=$(curl -sf -X POST "$API_URL/review/batch/$batch_id/requeue?program_id=$PROGRAM_ID" \
        -H "Content-Type: application/json" \
        -d '{
            "reset_attempts": true
        }')

    local new_status
    new_status=$(echo "$requeue_response" | jq -r '.new_status')
    if [[ "$new_status" != "queued" ]]; then
        fail "Expected new_status 'queued' but got '$new_status'"
    fi
    log_pass "Batch requeued successfully"

    # Verify via admin endpoint that cancel fields are cleared
    local admin_response
    admin_response=$(curl -sf "$API_URL/review/batch/$batch_id/admin?program_id=$PROGRAM_ID")

    local admin_status
    admin_status=$(echo "$admin_response" | jq -r '.status')
    if [[ "$admin_status" != "queued" ]]; then
        fail "Admin endpoint shows status '$admin_status', expected 'queued'"
    fi

    local cancel_requested_at
    cancel_requested_at=$(echo "$admin_response" | jq -r '.cancel_requested_at')
    if [[ "$cancel_requested_at" != "null" ]]; then
        fail "cancel_requested_at should be null after requeue, got '$cancel_requested_at'"
    fi

    local attempts
    attempts=$(echo "$admin_response" | jq -r '.attempts')
    if [[ "$attempts" != "0" ]]; then
        fail "attempts should be 0 after reset_attempts=true, got '$attempts'"
    fi
    log_pass "Requeue cleared cancel fields and reset attempts"
}

# ─────────────────────────────────────────────────────────────────────────────
# Test 3: Wait for batch to complete (if worker available)
# ─────────────────────────────────────────────────────────────────────────────

test_batch_completes() {
    local batch_id="$1"
    log_info "=== Test 3: Wait for batch completion ==="

    # Check if worker is available
    if ! curl -sf "$WORKER_URL/health" >/dev/null 2>&1; then
        log_warn "Worker not available - skipping completion test"
        return 0
    fi

    log_info "Waiting for batch to complete (max ${MAX_WAIT_SEC}s)..."
    local elapsed=0
    while [[ $elapsed -lt $MAX_WAIT_SEC ]]; do
        local status_response
        status_response=$(curl -sf "$API_URL/review/batch/$batch_id/admin?program_id=$PROGRAM_ID")
        local status
        status=$(echo "$status_response" | jq -r '.status')

        if [[ "$status" == "completed" ]]; then
            log_pass "Batch completed after ${elapsed}s"
            return 0
        elif [[ "$status" == "failed" ]]; then
            local error
            error=$(echo "$status_response" | jq -r '.last_error')
            fail "Batch failed unexpectedly: $error"
        fi

        sleep "$POLL_INTERVAL_SEC"
        elapsed=$((elapsed + POLL_INTERVAL_SEC))
    done

    fail "Batch did not complete within ${MAX_WAIT_SEC}s"
}

# ─────────────────────────────────────────────────────────────────────────────
# Test 4: Batch list endpoint
# ─────────────────────────────────────────────────────────────────────────────

test_batch_list() {
    log_info "=== Test 4: Batch list endpoint ==="

    # List all batches
    local list_response
    list_response=$(curl -sf "$API_URL/review/batches?program_id=$PROGRAM_ID&limit=10")

    local count
    count=$(echo "$list_response" | jq -r '.count')
    if [[ "$count" -lt 1 ]]; then
        fail "Expected at least 1 batch in list, got $count"
    fi
    log_pass "Batch list returned $count batches"

    # Test status filter
    local completed_response
    completed_response=$(curl -sf "$API_URL/review/batches?program_id=$PROGRAM_ID&status=completed&limit=10")
    local completed_count
    completed_count=$(echo "$completed_response" | jq -r '.count')
    log_info "Found $completed_count completed batches"

    # Verify filter works
    local status_filter
    status_filter=$(echo "$completed_response" | jq -r '.status_filter')
    if [[ "$status_filter" != "completed" ]]; then
        fail "Status filter not applied correctly"
    fi
    log_pass "Status filter works correctly"
}

# ─────────────────────────────────────────────────────────────────────────────
# Test 5: Invalid cancel operations
# ─────────────────────────────────────────────────────────────────────────────

test_invalid_operations() {
    log_info "=== Test 5: Invalid operations ==="

    # Try to cancel a completed batch (should fail)
    # First need a completed batch - use list to find one
    local list_response
    list_response=$(curl -sf "$API_URL/review/batches?program_id=$PROGRAM_ID&status=completed&limit=1")
    local completed_batch_id
    completed_batch_id=$(echo "$list_response" | jq -r '.batches[0].batch_id // empty')

    if [[ -n "$completed_batch_id" ]]; then
        log_info "Testing cancel on completed batch $completed_batch_id"
        local cancel_code
        cancel_code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST \
            "$API_URL/review/batch/$completed_batch_id/cancel?program_id=$PROGRAM_ID" \
            -H "Content-Type: application/json" \
            -d '{"reason": "test", "requested_by": "test"}')

        if [[ "$cancel_code" != "400" ]]; then
            fail "Cancel on completed batch should return 400, got $cancel_code"
        fi
        log_pass "Cancel on completed batch correctly rejected (400)"
    fi

    # Try to requeue a running batch without force (should fail if we have one)
    local running_response
    running_response=$(curl -sf "$API_URL/review/batches?program_id=$PROGRAM_ID&status=running&limit=1")
    local running_batch_id
    running_batch_id=$(echo "$running_response" | jq -r '.batches[0].batch_id // empty')

    if [[ -n "$running_batch_id" ]]; then
        log_info "Testing requeue on running batch $running_batch_id without force"
        local requeue_code
        requeue_code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST \
            "$API_URL/review/batch/$running_batch_id/requeue?program_id=$PROGRAM_ID" \
            -H "Content-Type: application/json" \
            -d '{"reset_attempts": false, "force": false}')

        if [[ "$requeue_code" != "400" ]]; then
            fail "Requeue on running batch without force should return 400, got $requeue_code"
        fi
        log_pass "Requeue on running batch without force correctly rejected (400)"
    fi

    log_pass "Invalid operations correctly rejected"
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    echo "║           A8-6: Ops Control Plane Smoke Test                        ║"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
    echo ""

    check_prerequisites

    # Run tests
    local batch_id
    batch_id=$(test_cancel_queued_batch)

    test_requeue_cancelled_batch "$batch_id"
    test_batch_completes "$batch_id"
    test_batch_list
    test_invalid_operations

    echo ""
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    echo "║                    ALL TESTS PASSED ✓                               ║"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
    echo ""
}

main "$@"
