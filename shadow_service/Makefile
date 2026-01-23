# =============================================================================
# Shadow Service Makefile
# =============================================================================
# Enterprise GA-grade development automation
# =============================================================================

.PHONY: help doctor migrate verify seed test up lint fmt clean install check-db dbshell

# Default target
help:
	@echo "Shadow Service - Available Commands"
	@echo "===================================="
	@echo ""
	@echo "Setup & Development:"
	@echo "  make install    - Install Python dependencies"
	@echo "  make up         - Full dev setup (migrate + verify + seed + start)"
	@echo "  make run        - Start the API server only"
	@echo ""
	@echo "Database:"
	@echo "  make migrate    - Run pending database migrations"
	@echo "  make verify     - Verify database compliance"
	@echo "  make seed       - Seed demo data"
	@echo "  make check-db   - Check database connectivity"
	@echo "  make dbshell    - Open safe psql shell (no pager issues)"
	@echo ""
	@echo "Quality:"
	@echo "  make test       - Run all tests"
	@echo "  make lint       - Run linter (ruff)"
	@echo "  make format     - Format code (ruff)"
	@echo "  make typecheck  - Run type checker (mypy)"
	@echo "  make check      - Run all quality checks"
	@echo ""
	@echo "Diagnostics:"
	@echo "  make doctor     - Full health check + compliance status"
	@echo "  make status     - Show implementation status"
	@echo ""
	@echo "Background Jobs:"
	@echo "  make sweep-dry  - Retention sweep (dry run)"
	@echo "  make sweep      - Retention sweep (execute)"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean      - Remove build artifacts"

# =============================================================================
# Environment
# =============================================================================

# Ensure .env is loaded
ifneq (,$(wildcard .env))
    include .env
    export
endif

# =============================================================================
# Setup & Development
# =============================================================================

install:
	pip install -e .

dev:
	pip install -e ".[dev]"

up: install migrate verify seed run

run:
	uvicorn shadow_service.main:app --reload --host 0.0.0.0 --port 8001

# =============================================================================
# Database Operations
# =============================================================================

# Terminal safety settings for psql
export PAGER := cat
export LESS := -FRSX
export PSQL_PAGER := cat

check-db:
	@echo "Checking database connectivity..."
	@if [ -z "$(DATABASE_URL)" ]; then \
		echo "✗ DATABASE_URL not set"; \
		exit 1; \
	fi
	@PAGER=cat psql -X --no-psqlrc "$(DATABASE_URL)" -c "SELECT 1 AS connected;" > /dev/null 2>&1 && \
		echo "✓ Database connected" || \
		echo "✗ Database connection failed"

dbshell:
	@echo "Opening safe psql shell..."
	@if [ -n "$(DATABASE_URL_DIRECT)" ]; then \
		PAGER=cat psql -X --no-psqlrc "$(DATABASE_URL_DIRECT)"; \
	elif [ -n "$(DATABASE_URL)" ]; then \
		PAGER=cat psql -X --no-psqlrc "$(DATABASE_URL)"; \
	else \
		echo "✗ DATABASE_URL not set"; \
		exit 1; \
	fi

migrate:
	@echo "Running migrations..."
	@chmod +x scripts/db_migrate.sh
	@./scripts/db_migrate.sh

migrate-dry:
	@echo "Dry run migrations..."
	@chmod +x scripts/db_migrate.sh
	@./scripts/db_migrate.sh --dry-run

verify:
	@echo "Verifying database compliance..."
	@PAGER=cat psql -X --no-psqlrc "$(DATABASE_URL)" -f scripts/db_verify.sql

seed:
	@echo "Seeding demo data..."
	python scripts/seed_demo.py

# =============================================================================
# Testing
# =============================================================================

test:
	pytest -v

test-cov:
	pytest --cov=shadow_service --cov-report=html --cov-report=term

test-db:
	pytest -v -m db_required

test-unit:
	pytest -v -m "not integration and not db_required"

test-integration:
	pytest -v -m "integration"

# =============================================================================
# Code Quality
# =============================================================================

lint:
	ruff check shadow_service tests

format:
	ruff format shadow_service tests

typecheck:
	mypy shadow_service

check: lint typecheck test

# =============================================================================
# Diagnostics
# =============================================================================

doctor:
	@echo ""
	@echo "╔═══════════════════════════════════════════════════════════╗"
	@echo "║            Shadow Service Health Check                     ║"
	@echo "╚═══════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "1. Environment"
	@echo "   ─────────────────────────────────────"
	@echo -n "   Python: " && python3 --version 2>/dev/null || echo "NOT FOUND"
	@echo -n "   DATABASE_URL: " && ([ -n "$(DATABASE_URL)" ] && echo "SET ✓" || echo "NOT SET ✗")
	@echo ""
	@echo "2. Database Connectivity"
	@echo "   ─────────────────────────────────────"
	@make check-db 2>/dev/null || true
	@echo ""
	@echo "3. Applied Migrations"
	@echo "   ─────────────────────────────────────"
	@psql "$(DATABASE_URL)" -t -c "SELECT COUNT(*) || ' migrations applied' FROM core.schema_migrations;" 2>/dev/null || echo "   Cannot query migrations"
	@echo ""
	@echo "4. Compliance Invariants"
	@echo "   ─────────────────────────────────────"
	@psql "$(DATABASE_URL)" -t -c "SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.triggers WHERE trigger_name='trg_no_update_delete_concomitant_audit_logs') THEN '   ✓ Audit immutability trigger' ELSE '   ✗ MISSING audit immutability' END;" 2>/dev/null || echo "   Cannot check"
	@psql "$(DATABASE_URL)" -t -c "SELECT CASE WHEN EXISTS(SELECT 1 FROM core.programs WHERE program_code='GLOBAL') THEN '   ✓ GLOBAL program exists' ELSE '   ✗ MISSING GLOBAL program' END;" 2>/dev/null || echo "   Cannot check"
	@echo ""
	@echo "5. Unimplemented Routers"
	@echo "   ─────────────────────────────────────"
	@grep -l "501" shadow_service/router_*.py 2>/dev/null | while read f; do echo "   ⚠ $$f has 501 stubs"; done || echo "   ✓ No stub routers"
	@echo ""
	@echo "══════════════════════════════════════════════════════════════"

status:
	@cat IMPLEMENTATION_STATUS.md 2>/dev/null || echo "IMPLEMENTATION_STATUS.md not found"

# =============================================================================
# Background Jobs
# =============================================================================

sweep-dry:
	@echo "Running retention sweep (dry run)..."
	python -m shadow_service.jobs.retention_sweep --dry-run

sweep:
	@echo "Running retention sweep..."
	python -m shadow_service.jobs.retention_sweep

# =============================================================================
# Cleanup
# =============================================================================

clean:
	rm -rf build dist *.egg-info .pytest_cache .coverage htmlcov .mypy_cache .ruff_cache
	find . -type d -name __pycache__ -exec rm -rf {} +

# =============================================================================
# CI Helpers
# =============================================================================

ci-lint:
	ruff check --output-format=github shadow_service tests

ci-test:
	pytest -v --tb=short --junitxml=test-results.xml

ci-compliance:
	@psql "$(DATABASE_URL)" -f scripts/db_verify.sql
