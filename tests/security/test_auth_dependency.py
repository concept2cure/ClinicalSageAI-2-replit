import importlib.util
from pathlib import Path


def _load_dependencies_module(monkeypatch, env=None):
    env = env or {}
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("ALLOW_DEV_AUTH_BYPASS", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    module_path = Path(__file__).resolve().parents[2] / "backend" / "dependencies.py"
    spec = importlib.util.spec_from_file_location("test_backend_dependencies", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_allow_dev_auth_bypass_requires_opt_in(monkeypatch):
    deps = _load_dependencies_module(monkeypatch, {"ENVIRONMENT": "development"})
    assert deps._allow_dev_auth_bypass() is False


def test_allow_dev_auth_bypass_enabled_only_in_dev(monkeypatch):
    deps = _load_dependencies_module(
        monkeypatch,
        {"ENVIRONMENT": "development", "ALLOW_DEV_AUTH_BYPASS": "true"},
    )
    assert deps._allow_dev_auth_bypass() is True


def test_allow_dev_auth_bypass_disabled_in_production(monkeypatch):
    deps = _load_dependencies_module(
        monkeypatch,
        {"ENVIRONMENT": "production", "ALLOW_DEV_AUTH_BYPASS": "true"},
    )
    assert deps._allow_dev_auth_bypass() is False
