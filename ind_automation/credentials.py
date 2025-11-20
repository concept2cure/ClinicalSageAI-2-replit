import json, os, base64, hashlib
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken

ENC_KEY = os.getenv("ESG_ENC_KEY")
if not ENC_KEY:
    raise RuntimeError("Set ESG_ENC_KEY (32‑byte base64) in Secrets.")
try:
    fernet = Fernet(ENC_KEY)
except Exception as e:
    raise RuntimeError("Invalid ESG_ENC_KEY: %s" % e)

STORE = Path("data/esg_creds")
STORE.mkdir(parents=True, exist_ok=True)

# ---------- helpers ----------

def _path(org: str):
    return STORE / f"{org}.json"


def save(org: str, creds: dict):
    """Encrypt & persist creds dict (host, port, user, key_pem)."""
    token = fernet.encrypt(json.dumps(creds).encode())
    _path(org).write_bytes(token)


def load(org: str) -> dict | None:
    try:
        token = _path(org).read_bytes()
        return json.loads(fernet.decrypt(token))
    except (FileNotFoundError, InvalidToken):
        return None


def delete(org: str):
    try:
        _path(org).unlink()
    except FileNotFoundError:
        pass


def fingerprint(pem: str):
    """SHA‑256 fingerprint for display."""
    return hashlib.sha256(pem.encode()).hexdigest()[:16]