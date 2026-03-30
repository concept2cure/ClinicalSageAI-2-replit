import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest
from fastapi import HTTPException


MODULE_NAME = "security_dependencies_under_test"
MODULE_PATH = Path(__file__).resolve().parents[1] / "dependencies.py"


def _reload_dependencies():
    if MODULE_NAME in sys.modules:
        del sys.modules[MODULE_NAME]
    spec = spec_from_file_location(MODULE_NAME, MODULE_PATH)
    module = module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    sys.modules[MODULE_NAME] = module
    return module


def test_startup_fails_without_jwt_secret(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        _reload_dependencies()


@pytest.mark.asyncio
async def test_requires_bearer_token(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "unit-test-secret-32-characters-long-123")
    deps = _reload_dependencies()

    with pytest.raises(HTTPException) as exc:
        await deps.get_current_user(None)
    assert exc.value.status_code == 401

    with pytest.raises(HTTPException) as exc:
        await deps.get_current_user("TS_1")
    assert exc.value.status_code == 401
