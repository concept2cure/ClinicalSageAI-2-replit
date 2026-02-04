"""
Pytest configuration for Lumen Cortex tests.

Ensures deterministic test execution with PYTHONHASHSEED=0.
"""

import os
import sys

import pytest


def pytest_configure(config):
    """Verify determinism settings at test startup."""
    hash_seed = os.environ.get("PYTHONHASHSEED", "")

    if hash_seed != "0":
        print(
            "\n⚠️  WARNING: PYTHONHASHSEED is not set to 0.\n"
            "   For deterministic tests, run with:\n"
            "   PYTHONHASHSEED=0 pytest lumen_cortex/tests -v\n",
            file=sys.stderr,
        )


@pytest.fixture(scope="session")
def ensure_determinism():
    """Session-scoped fixture to verify determinism environment."""
    hash_seed = os.environ.get("PYTHONHASHSEED", "")
    if hash_seed != "0":
        pytest.skip("Determinism tests require PYTHONHASHSEED=0")
    return True
