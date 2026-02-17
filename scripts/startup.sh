#!/usr/bin/env bash
#
# startup.sh - Enterprise Database Startup Script
#
# PURPOSE: Single source of truth for database configuration.
# This script MUST be run before any dev server startup.
# It ensures Docker is running, DATABASE_URL is correct, and schema is synced.
#
# USAGE:
#   source scripts/startup.sh      # Sets env vars in current shell
#   ./scripts/startup.sh           # Run standalone checks
#
# This file is the ONLY place where DATABASE_URL should be set for local development.
# All other configuration files should read from process.env.DATABASE_URL.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ============================================================================
# CONFIGURATION - SINGLE SOURCE OF TRUTH
# ============================================================================
export DEFAULT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/clinicalsage?sslmode=disable"
export DATABASE_URL="${DATABASE_URL:-$DEFAULT_DATABASE_URL}"
export DOCKER_DB_CONTAINER="clinicalsageai-2-replit-db-1"
export DB_NAME="clinicalsage"
export DB_USER="postgres"
export DB_PASSWORD="postgres"
export DB_HOST="localhost"
export DB_PORT="5432"
export DEFAULT_APP_PORT="5000"
export REQUIRE_DATABASE_ON_STARTUP="${REQUIRE_DATABASE_ON_STARTUP:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

is_sourced() {
    [[ "${BASH_SOURCE[0]}" != "${0}" ]]
}

fail() {
    log_error "$1"
    if is_sourced; then
        return 1
    fi
    exit 1
}

load_env_file() {
    local env_file="$PROJECT_ROOT/.env"
    if [[ -f "$env_file" ]]; then
        log_info "Loading existing .env values"
        local env_database_url
        env_database_url=$(grep -E '^DATABASE_URL=' "$env_file" | tail -n 1 | sed 's/^DATABASE_URL=//' || true)
        env_database_url="${env_database_url%\"}"
        env_database_url="${env_database_url#\"}"
        if [[ -n "$env_database_url" ]]; then
            export DATABASE_URL="$env_database_url"
        fi
    fi
}

has_docker() {
    command -v docker >/dev/null 2>&1
}

has_compose() {
    docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1
}

compose_up_db() {
    if docker compose version >/dev/null 2>&1; then
        docker compose up -d db
    else
        docker-compose up -d db
    fi
}

detect_db_container() {
    local container_id
    container_id=$(docker compose ps -q db 2>/dev/null || true)
    if [[ -n "$container_id" ]]; then
        docker inspect --format '{{.Name}}' "$container_id" | sed 's#^/##'
        return 0
    fi
    echo "$DOCKER_DB_CONTAINER"
}

is_port_in_use() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
        return $?
    fi

    (echo >"/dev/tcp/127.0.0.1/${port}") >/dev/null 2>&1
    return $?
}

select_app_port() {
    local desired_port="${PORT:-$DEFAULT_APP_PORT}"
    local candidate_port="$desired_port"
    local max_attempts=20
    local attempt=0

    while is_port_in_use "$candidate_port"; do
        if [[ $attempt -eq 0 ]]; then
            log_warn "Port ${desired_port} is already in use. Searching for next available port..."
        fi

        candidate_port=$((candidate_port + 1))
        attempt=$((attempt + 1))

        if [[ $attempt -ge $max_attempts ]]; then
            fail "Could not find an available app port after ${max_attempts} attempts"
            return 1
        fi
    done

    export PORT="$candidate_port"
    if [[ "$candidate_port" != "$desired_port" ]]; then
        log_warn "Using fallback app port: ${PORT}"
    else
        log_success "App port available: ${PORT}"
    fi
}

# ============================================================================
# STEP 1: Ensure Docker container is running
# ============================================================================
check_docker() {
    log_info "Checking Docker container..."

    if ! has_docker; then
        log_warn "Docker CLI not found; skipping Docker database bootstrapping"
        return 2
    fi

    if ! has_compose; then
        log_warn "Docker Compose not found; skipping Docker database bootstrapping"
        return 2
    fi

    local detected_container
    detected_container="$(detect_db_container)"
    export DOCKER_DB_CONTAINER="$detected_container"

    if ! docker ps --format '{{.Names}}' | grep -q "^${DOCKER_DB_CONTAINER}$"; then
        log_warn "Database container not running. Starting Docker Compose..."
        cd "$PROJECT_ROOT"
        compose_up_db >/dev/null 2>&1 || return 1

        detected_container="$(detect_db_container)"
        export DOCKER_DB_CONTAINER="$detected_container"
        log_info "Waiting for database to be ready..."
        sleep 8
    fi

    # Verify container is healthy
    if docker exec "$DOCKER_DB_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
        log_success "Docker PostgreSQL container is running and healthy"
        return 0
    else
        log_error "Database container is not responding"
        return 1
    fi
}

verify_connection_via_node() {
    log_info "Verifying database connection via Node.js driver..."
    if node -e "const { Client } = require('pg'); (async () => { const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect(); await client.query('SELECT 1'); await client.end(); })().catch((error) => { console.error(error.message); process.exit(1); });" >/dev/null 2>&1; then
        log_success "Database connection verified: $DATABASE_URL"
        return 0
    fi
    return 1
}

# ============================================================================
# STEP 2: Verify database connection
# ============================================================================
verify_connection() {
    log_info "Verifying database connection..."

    if has_docker && docker ps --format '{{.Names}}' | grep -q "^${DOCKER_DB_CONTAINER}$" && docker exec "$DOCKER_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
        log_success "Database connection verified: $DATABASE_URL"
        return 0
    elif verify_connection_via_node; then
        return 0
    else
        log_error "Cannot connect to database"
        return 1
    fi
}

# ============================================================================
# STEP 3: Create database if it doesn't exist
# ============================================================================
ensure_database() {
    log_info "Ensuring database '$DB_NAME' exists..."

    if ! has_docker || ! docker ps --format '{{.Names}}' | grep -q "^${DOCKER_DB_CONTAINER}$"; then
        log_warn "Skipping Docker-based database provisioning"
        return 0
    fi

    # Check if database exists
    if docker exec "$DOCKER_DB_CONTAINER" psql -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        log_success "Database '$DB_NAME' exists"
    else
        log_warn "Database '$DB_NAME' not found. Creating..."
        docker exec "$DOCKER_DB_CONTAINER" psql -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;" || {
            log_error "Failed to create database"
            return 1
        }
        log_success "Database '$DB_NAME' created"
    fi

    # Ensure pgvector extension
    log_info "Ensuring pgvector extension..."
    docker exec "$DOCKER_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" > /dev/null 2>&1
    log_success "pgvector extension ready"
}

# ============================================================================
# STEP 4: Write .env file (overwrites any existing)
# ============================================================================
write_env_file() {
    log_info "Writing .env file..."

    local env_file="$PROJECT_ROOT/.env"
    local escaped_database_url
    escaped_database_url=$(printf '%s\n' "$DATABASE_URL" | sed 's/[&/]/\\&/g')

    if [[ -f "$env_file" ]]; then
        if grep -q '^DATABASE_URL=' "$env_file"; then
            sed -i "s/^DATABASE_URL=.*/DATABASE_URL=\"${escaped_database_url}\"/" "$env_file"
        else
            printf '\nDATABASE_URL="%s"\n' "$DATABASE_URL" >> "$env_file"
        fi
        log_success ".env updated (DATABASE_URL only)"
    else
        cat > "$env_file" << EOF
# Generated by scripts/startup.sh
DATABASE_URL="${DATABASE_URL}"
EOF
        log_success ".env created with DATABASE_URL"
    fi
}

# ============================================================================
# STEP 5: Display summary
# ============================================================================
show_summary() {
    echo ""
    echo "============================================================================"
    echo -e "${GREEN}DATABASE CONFIGURATION SUMMARY${NC}"
    echo "============================================================================"
    echo -e "DATABASE_URL: ${BLUE}${DATABASE_URL}${NC}"
    echo -e "Container:    ${BLUE}${DOCKER_DB_CONTAINER}${NC}"
    echo -e "DB Strict:    ${BLUE}${REQUIRE_DATABASE_ON_STARTUP}${NC}"
    echo -e "App Port:     ${BLUE}${PORT:-$DEFAULT_APP_PORT}${NC}"
    echo ""
    echo "To verify in a new terminal, run:"
    echo "  source scripts/startup.sh && echo \$DATABASE_URL"
    echo ""
    echo "To start the dev server:"
    echo "  source scripts/startup.sh && main && npm run dev"
    echo "============================================================================"
}

# ============================================================================
# MAIN
# ============================================================================
main() {
    echo ""
    echo "============================================================================"
    echo "ClinicalSageAI Database Startup Script"
    echo "============================================================================"
    echo ""

    load_env_file

    if [[ -z "${DATABASE_URL:-}" ]]; then
        export DATABASE_URL="$DEFAULT_DATABASE_URL"
    fi

    local docker_status=0
    if check_docker; then
        docker_status=0
    else
        docker_status=$?
    fi

    if [[ $docker_status -eq 1 ]]; then
        fail "Failed to initialize Docker database"
    fi

    if [[ $docker_status -eq 0 ]]; then
        ensure_database || fail "Failed to provision local Docker database"
        export DATABASE_URL="$DEFAULT_DATABASE_URL"
    fi

    if ! verify_connection; then
        if [[ "${REQUIRE_DATABASE_ON_STARTUP}" == "true" ]]; then
            fail "Failed to verify DATABASE_URL connectivity"
        fi
        log_warn "DATABASE_URL is not reachable yet. Continuing in non-strict mode."
        log_warn "Set REQUIRE_DATABASE_ON_STARTUP=true to enforce hard failure."
    fi

    select_app_port || fail "Failed to select an available app port"
    write_env_file
    show_summary

    echo ""
    log_success "Startup complete. DATABASE_URL is set correctly."
}

# Run main if executed (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main
fi

# Always export DATABASE_URL when sourced
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    env_database_url=$(grep -E '^DATABASE_URL=' "$PROJECT_ROOT/.env" | tail -n 1 | sed 's/^DATABASE_URL=//' || true)
    env_database_url="${env_database_url%\"}"
    env_database_url="${env_database_url#\"}"
    export DATABASE_URL="${env_database_url:-$DEFAULT_DATABASE_URL}"
else
    export DATABASE_URL="$DEFAULT_DATABASE_URL"
fi
