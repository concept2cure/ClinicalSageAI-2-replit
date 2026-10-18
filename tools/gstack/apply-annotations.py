"""Restore local comment annotations without copying upstream credential fixtures."""
import hashlib
import json
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
for record in json.loads(Path(__file__).with_name("local-annotations.json").read_text()):
    path = repo / ".claude/skills/gstack" / record["path"]
    text = path.read_text()
    digest = hashlib.sha256(text.encode()).hexdigest()
    if digest == record["after"]:
        continue
    if digest != record["before"]:
        raise RuntimeError(f"Unexpected upstream content: {record['path']}")
    for start, end, inserted in reversed(record["edits"]):
        text = text[:start] + inserted + text[end:]
    assert hashlib.sha256(text.encode()).hexdigest() == record["after"]
    path.write_text(text)
print("Local annotations verified.")
