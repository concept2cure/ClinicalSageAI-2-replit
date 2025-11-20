import asyncio
from ind_automation import pii_filter, rules_store, users
import json, os
DATA_DIR = "data/projects"

def _path(pid: str): return f"{DATA_DIR}/{pid}.json"

def load(pid: str) -> dict | None:
    try:
        with open(_path(pid)) as f: return json.load(f)
    except FileNotFoundError:
        return None

def save(pid: str, record: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(_path(pid), "w") as f: json.dump(record, f, indent=2)

def list_projects() -> list[dict]:
    os.makedirs(DATA_DIR, exist_ok=True)
    out=[]
    for fn in os.listdir(DATA_DIR):
        if fn.endswith(".json"):
            with open(f"{DATA_DIR}/{fn}") as f: out.append(json.load(f))
    return out

# ---------- History helpers ----------
def append_history(org,record):
    clean,match=pii_filter.redact(json.dumps(record))
    record=json.loads(clean)
    hist=_load_org(org)
    hist.append(record)
    _save_org(org,hist)
    if match: 
        asyncio.create_task(redis.publish("alerts",json.dumps({"msg":"Redaction applied","timestamp":record["timestamp"]})))default("history", []).append(entry)
    save(pid, rec)
    
def get_history(pid: str):
    rec = load(pid) or {}
    return rec.get("history", [])