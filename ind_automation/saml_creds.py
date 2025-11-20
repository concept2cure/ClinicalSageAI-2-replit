import os, json
from pathlib import Path
from cryptography.fernet import Fernet

ENC_KEY = os.getenv("SAML_ENC_KEY")
if not ENC_KEY:
    raise RuntimeError("Set SAML_ENC_KEY in Secrets (32‑byte base64)")
fernet = Fernet(ENC_KEY)
STORE = Path("data/saml_creds")
STORE.mkdir(parents=True, exist_ok=True)


def _file(org): return STORE / f"{org}.json"

def save(org: str, data: dict):
    """Encrypt and save SAML credentials for an organization"""
    token = fernet.encrypt(json.dumps(data).encode())
    _file(org).write_bytes(token)

def load(org: str) -> dict | None:
    """Load and decrypt SAML credentials for an organization"""
    try:
        return json.loads(fernet.decrypt(_file(org).read_bytes()))
    except Exception:
        return None

def delete(org: str):
    """Delete SAML credentials for an organization"""
    try: 
        _file(org).unlink()
    except FileNotFoundError: 
        pass