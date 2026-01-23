.PHONY: install dev test lint format run clean

# Install dependencies
install:
	pip install -e .

# Install with dev dependencies
dev:
	pip install -e ".[dev]"

# Run tests
test:
	pytest -v

# Run tests with coverage
test-cov:
	pytest --cov=shadow_service --cov-report=html --cov-report=term

# Run tests requiring database
test-db:
	pytest -v -m db_required

# Lint code
lint:
	ruff check shadow_service tests

# Format code
format:
	ruff format shadow_service tests

# Type check
typecheck:
	mypy shadow_service

# Run development server
run:
	uvicorn shadow_service.main:app --reload --host 0.0.0.0 --port 8001

# Clean build artifacts
clean:
	rm -rf build dist *.egg-info .pytest_cache .coverage htmlcov .mypy_cache .ruff_cache
	find . -type d -name __pycache__ -exec rm -rf {} +

# Full check
check: lint typecheck test
