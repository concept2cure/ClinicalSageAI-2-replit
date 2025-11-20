import json, os
from pathlib import Path

THRESH_DEFAULTS = {
  'ACK_MISSING_H':24,'MODULE3_STALE_D':180,'MODULE1_STALE_D':90,
  'ESG_WARN_D':330,'ESG_CRIT_D':365,'SAML_EXPIRE_D':30
}

DEFAULTS = {
  "ACK_MISSING":True,"FORMS_MISSING":True,"SERIAL_DUP":True,"META_INCOMPLETE":True,
  "MODULE3_STALE":True,"MODULE1_STALE":True,"ESG_ROTATE":True,"SAML_EXPIRE":True,"IDP_MISMATCH":True,
  **THRESH_DEFAULTS
}

DIR = Path("data/rules"); DIR.mkdir(parents=True,exist_ok=True)
def _file(org): return DIR/f"{org}.json"
def load(org):
    try: return {**DEFAULTS, **json.load(_file(org).open())}
    except: return DEFAULTS.copy()
def save(org,data): _file(org).write_text(json.dumps(data,indent=2))
