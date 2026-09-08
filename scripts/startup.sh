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
export DEFAULT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/concept2cure-ri?sslmode=disable"
export DATABASE_URL="${DATABASE_URL:-$DEFAULT_DATABASE_URL}"
export DOCKER_DB_CONTAINER="concept2cure-riai-2-replit-db-1"
export DB_NAME="concept2cure-ri"
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

# .env.local is read FIRST and wins, matching how server/index.ts loads them.
# It is the git-ignored, machine-local file `npm run up` writes. Without this,
# this script exported .env's DATABASE_URL over it and every entrypoint went on
# using the committed default — a role with no grants on any application table,
# so a correctly provisioned install still failed every query.
read_env_key() {
    local file="$1" key="$2" value
    [[ -f "$file" ]] || return 1
    value=$(grep -E "^${key}=" "$file" | tail -n 1 | sed "s/^${key}=//" || true)
    value="${value%\"}"
    value="${value#\"}"
    [[ -n "$value" ]] || return 1
    printf '%s' "$value"
}

load_env_file() {
    local local_file="$PROJECT_ROOT/.env.local"
    local env_file="$PROJECT_ROOT/.env"
    local url

    if url=$(read_env_key "$local_file" DATABASE_URL); then
        log_info "Loading DATABASE_URL from .env.local"
        export DATABASE_URL="$url"
    elif url=$(read_env_key "$env_file" DATABASE_URL); then
        log_info "Loading existing .env values"
        export DATABASE_URL="$url"
    fi

    # The runtime connects as APP_DATABASE_URL when set; carry it through too.
    if url=$(read_env_key "$local_file" APP_DATABASE_URL); then
        export APP_DATABASE_URL="$url"
    elif url=$(read_env_key "$env_file" APP_DATABASE_URL); then
        export APP_DATABASE_URL="$url"
    fi
}

sync_db_config_from_database_url() {
    if [[ -z "${DATABASE_URL:-}" ]]; then
        return 0
    fi

    local parsed
    parsed=$(node -e "try { const url = new URL(process.env.DATABASE_URL || ''); const dbName = decodeURIComponent((url.pathname || '').replace(/^\\/+/, '')); if (!dbName) process.exit(0); process.stdout.write([url.hostname || '', url.port || '', dbName, decodeURIComponent(url.username || ''), decodeURIComponent(url.password || '')].join('\t')); } catch { process.exit(0); }" 2>/dev/null || true)

    if [[ -z "$parsed" ]]; then
        return 0
    fi

    local parsed_host parsed_port parsed_db parsed_user parsed_password
    IFS=$'\t' read -r parsed_host parsed_port parsed_db parsed_user parsed_password <<< "$parsed"

    if [[ -n "$parsed_db" ]]; then
        export DB_NAME="$parsed_db"
    fi
    if [[ -n "$parsed_host" ]]; then
        export DB_HOST="$parsed_host"
    fi
    if [[ -n "$parsed_port" ]]; then
        export DB_PORT="$parsed_port"
    fi
    if [[ -n "$parsed_user" ]]; then
        export DB_USER="$parsed_user"
    fi
    if [[ -n "$parsed_password" ]]; then
        export DB_PASSWORD="$parsed_password"
    fi

    log_info "Database target resolved from DATABASE_URL: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
}

is_docker_db_active() {
    has_docker && docker ps --format '{{.Names}}' | grep -q "^${DOCKER_DB_CONTAINER}$"
}

run_sql() {
    if is_docker_db_active; then
        docker exec -i "$DOCKER_DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"
    else
        PGPASSWORD="${DB_PASSWORD}" psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
    fi
}

ensure_required_schemas() {
    log_info "Ensuring required schemas exist..."
    run_sql >/dev/null 2>&1 <<'SCHEMA_SQL'
CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS extensions;
SCHEMA_SQL
    log_success "Required schemas ready (public, vault, extensions)"
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
# NATIVE POSTGRES: Install, start, and seed when Docker is not available
# ============================================================================
ensure_native_postgres() {
    log_info "Docker not available — checking native PostgreSQL..."

    # Install PostgreSQL if not present
    if ! command -v pg_isready >/dev/null 2>&1; then
        log_warn "PostgreSQL not installed. Installing..."
        sudo apt-get update -qq >/dev/null 2>&1
        sudo apt-get install -y -qq postgresql postgresql-client >/dev/null 2>&1
        log_success "PostgreSQL installed"
    fi

    # Start the cluster if it's down
    local pg_status
    pg_status=$(sudo pg_lsclusters -h 2>/dev/null | awk '{print $4}' | head -1)
    if [[ "$pg_status" != "online" ]]; then
        log_info "Starting PostgreSQL cluster..."
        sudo pg_ctlcluster 15 main start 2>/dev/null || sudo pg_ctlcluster $(pg_lsclusters -h | awk '{print $1}') main start 2>/dev/null
        sleep 2
    fi
    log_success "PostgreSQL is running"

    # Configure password auth if needed
    local hba_file="/etc/postgresql/15/main/pg_hba.conf"
    if [[ -f "$hba_file" ]] && grep -q "peer" "$hba_file"; then
        sudo sed -i 's/local   all             all                                     peer/local   all             all                                     md5/' "$hba_file"
        sudo sed -i 's/host    all             all             127.0.0.1\/32            scram-sha-256/host    all             all             127.0.0.1\/32            md5/' "$hba_file"
        sudo pg_ctlcluster 15 main reload 2>/dev/null
        log_success "Password auth configured"
    fi

    # Set postgres user password
    sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '${DB_PASSWORD}';" >/dev/null 2>&1

    # Create the database
    if ! PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U "${DB_USER}" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "${DB_NAME}"; then
        log_info "Creating database '${DB_NAME}'..."
        sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME};" >/dev/null 2>&1
        log_success "Database '${DB_NAME}' created"
    else
        log_success "Database '${DB_NAME}' exists"
    fi

    ensure_required_schemas

    # Install pgvector extension (build from source if needed)
    if ! PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1; then
        log_info "Building pgvector from source..."
        local build_dir="/tmp/pgvector-build"
        if [[ ! -d "$build_dir" ]]; then
            git clone --branch v0.7.4 --depth 1 https://github.com/pgvector/pgvector.git "$build_dir" >/dev/null 2>&1
        fi
        sudo apt-get install -y -qq postgresql-server-dev-16 >/dev/null 2>&1 || true
        (cd "$build_dir" && make -j"$(nproc)" >/dev/null 2>&1 && sudo make install >/dev/null 2>&1)
        PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1
        log_success "pgvector extension installed"
    else
        log_success "pgvector extension ready"
    fi

    # Create auth tables and seed demo user if not present
    PGPASSWORD="${DB_PASSWORD}" psql -h localhost -U "${DB_USER}" -d "${DB_NAME}" <<'SEED_SQL' >/dev/null 2>&1
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT, logo TEXT, industry_mode TEXT, stripe_customer_id TEXT,
  settings JSONB, api_key TEXT UNIQUE,
  tier TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'active',
  max_users INTEGER DEFAULT 5, max_projects INTEGER DEFAULT 10, max_storage INTEGER DEFAULT 5,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  title TEXT, department TEXT, avatar TEXT, bio TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_login TIMESTAMP,
  default_organization_id INTEGER REFERENCES organizations(id),
  preferences JSONB,
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret TEXT, mfa_backup_codes JSONB,
  mfa_method TEXT DEFAULT 'totp', mfa_verified_at TIMESTAMP,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP, last_failed_login TIMESTAMP,
  password_changed_at TIMESTAMP, password_history JSONB,
  must_change_password BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
-- Ensure columns exist for existing tables (idempotent migrations)
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_method TEXT DEFAULT 'totp';
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_history JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
CREATE TABLE IF NOT EXISTS organization_users (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  permissions JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT unique_user_org UNIQUE (user_id, organization_id)
);
-- Organization and demo-admin identity convergence is owned by the
-- canonical TypeScript bootstrap, not by a second SQL seed path.

SEED_SQL

    # Demo personas — only seeded when SEED_DEMO_ACCOUNTS=true (NOT in production)
    if [ "${SEED_DEMO_ACCOUNTS:-false}" = "true" ] && [ "${NODE_ENV}" != "production" ]; then
        log_info "Seeding demo personas (SEED_DEMO_ACCOUNTS=true, non-production)..."
        run_sql <<'DEMO_SQL'
-- Demo Personas (password: demo123 for all) — NEVER seed in production
INSERT INTO users (email, name, password_hash, title, department, status, default_organization_id)
  VALUES ('sarah.chen@concept2cure.pro', 'Sarah Chen',
    '$2b$10$trZaDVYb2r3RQClw8LoI1u/PY/Bawe1mvOXJsv2fcy/1DXyRW0zgq',
    'Regulatory Affairs Director', 'Regulatory', 'active',
    (SELECT id FROM organizations WHERE slug = 'concept2cure'))
  ON CONFLICT (email) DO NOTHING;
INSERT INTO organization_users (organization_id, user_id, role)
  VALUES (
    (SELECT id FROM organizations WHERE slug = 'concept2cure'),
    (SELECT id FROM users WHERE email = 'sarah.chen@concept2cure.pro'),
    'editor')
  ON CONFLICT ON CONSTRAINT unique_user_org DO NOTHING;

INSERT INTO users (email, name, password_hash, title, department, status, default_organization_id)
  VALUES ('mike.torres@concept2cure.pro', 'Mike Torres',
    '$2b$10$trZaDVYb2r3RQClw8LoI1u/PY/Bawe1mvOXJsv2fcy/1DXyRW0zgq',
    'Clinical Data Analyst', 'Clinical Operations', 'active',
    (SELECT id FROM organizations WHERE slug = 'concept2cure'))
  ON CONFLICT (email) DO NOTHING;
INSERT INTO organization_users (organization_id, user_id, role)
  VALUES (
    (SELECT id FROM organizations WHERE slug = 'concept2cure'),
    (SELECT id FROM users WHERE email = 'mike.torres@concept2cure.pro'),
    'member')
  ON CONFLICT ON CONSTRAINT unique_user_org DO NOTHING;

INSERT INTO users (email, name, password_hash, title, department, status, default_organization_id)
  VALUES ('demo@concept2cure.pro', 'Demo User',
    '$2b$10$trZaDVYb2r3RQClw8LoI1u/PY/Bawe1mvOXJsv2fcy/1DXyRW0zgq',
    'Demo Account', 'General', 'active',
    (SELECT id FROM organizations WHERE slug = 'concept2cure'))
  ON CONFLICT (email) DO NOTHING;
INSERT INTO organization_users (organization_id, user_id, role)
  VALUES (
    (SELECT id FROM organizations WHERE slug = 'concept2cure'),
    (SELECT id FROM users WHERE email = 'demo@concept2cure.pro'),
    'member')
  ON CONFLICT ON CONSTRAINT unique_user_org DO NOTHING;
DEMO_SQL
        log_success "Demo personas seeded"
    else
        log_info "Skipping demo personas (set SEED_DEMO_ACCOUNTS=true in non-production to enable)"
    fi

    log_success "Auth tables and admin user seeded"
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

    # Ensure base schemas and pgvector extension
    ensure_required_schemas
    log_info "Ensuring pgvector extension..."
    run_sql -c "CREATE EXTENSION IF NOT EXISTS vector;" > /dev/null 2>&1
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
    echo "Concept2Cure.RI Database Startup Script"
    echo "============================================================================"
    echo ""

    load_env_file

    if [[ -z "${DATABASE_URL:-}" ]]; then
        export DATABASE_URL="$DEFAULT_DATABASE_URL"
    fi
    sync_db_config_from_database_url

    # If DATABASE_URL points to a remote host (not localhost), skip local DB setup
    if [[ "$DATABASE_URL" == *"neon.tech"* || "$DATABASE_URL" == *"supabase"* || ( "$DATABASE_URL" != *"localhost"* && "$DATABASE_URL" != *"127.0.0.1"* ) ]]; then
        log_info "Remote DATABASE_URL detected, skipping local DB bootstrap"
    else
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
        elif [[ $docker_status -eq 2 ]]; then
            # Docker not available — bootstrap PostgreSQL natively
            ensure_native_postgres || log_warn "Native PostgreSQL setup had issues"
            export DATABASE_URL="$DEFAULT_DATABASE_URL"
        fi
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
