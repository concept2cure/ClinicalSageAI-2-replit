import base64
import hashlib
import hmac
import json
import time

import pytest

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from lumen_cortex.enterprise.api_bridge import decode_token, get_current_user, settings


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def _make_token(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _b64url(json.dumps(header).encode())
    payload_b64 = _b64url(json.dumps(payload).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode()
    sig = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url(sig)}"


def test_decode_token_accepts_valid_hs256_jwt(monkeypatch):
    monkeypatch.setenv("LUMEN_API_BRIDGE_JWT_SECRET", "test-secret")
    payload = {
        "sub": "ana-service",
        "role": "admin",
        "iss": settings.jwt.issuer,
        "aud": settings.jwt.audience,
        "exp": int(time.time()) + 300,
    }
    token = _make_token(payload, "test-secret")
    decoded = decode_token(token)
    assert decoded["sub"] == "ana-service"
    assert decoded["role"] == "admin"


def test_decode_token_rejects_bad_signature(monkeypatch):
    monkeypatch.setenv("LUMEN_API_BRIDGE_JWT_SECRET", "expected-secret")
    payload = {
        "sub": "ana-service",
        "role": "admin",
        "iss": settings.jwt.issuer,
        "aud": settings.jwt.audience,
        "exp": int(time.time()) + 300,
    }
    token = _make_token(payload, "wrong-secret")
    with pytest.raises(HTTPException):
        decode_token(token)


@pytest.mark.asyncio
async def test_get_current_user_accepts_static_token_only_when_enabled(monkeypatch):
    monkeypatch.setenv("LUMEN_API_BRIDGE_ALLOW_STATIC_TOKEN", "true")
    monkeypatch.setenv("LUMEN_CORTEX_ENTERPRISE_BRIDGE_TOKEN", "bridge-static")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bridge-static")
    user = await get_current_user(creds)
    assert user["sub"] == "ana-control-plane"
    assert user["role"] == "analyst"


@pytest.mark.asyncio
async def test_get_current_user_static_role_is_configurable(monkeypatch):
    monkeypatch.setenv("LUMEN_API_BRIDGE_ALLOW_STATIC_TOKEN", "true")
    monkeypatch.setenv("LUMEN_CORTEX_ENTERPRISE_BRIDGE_TOKEN", "bridge-static")
    monkeypatch.setenv("LUMEN_API_BRIDGE_STATIC_ROLE", "admin")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bridge-static")
    user = await get_current_user(creds)
    assert user["role"] == "admin"


@pytest.mark.asyncio
async def test_get_current_user_rejects_static_token_when_fallback_disabled(monkeypatch):
    monkeypatch.setenv("LUMEN_API_BRIDGE_ALLOW_STATIC_TOKEN", "false")
    monkeypatch.setenv("LUMEN_CORTEX_ENTERPRISE_BRIDGE_TOKEN", "bridge-static")
    monkeypatch.setenv("LUMEN_API_BRIDGE_JWT_SECRET", "jwt-secret")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bridge-static")
    with pytest.raises(HTTPException):
        await get_current_user(creds)
