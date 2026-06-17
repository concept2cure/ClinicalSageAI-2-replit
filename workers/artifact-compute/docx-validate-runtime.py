"""
docx-validate isolated runtime.

Validates a .docx (OOXML ZIP) without modifying it: confirms the required
parts are present, every XML/rels part is well-formed, the relationship
targets resolve to real parts, and python-docx can re-open the document.
Used to gate any document AnA produced or received before it ships.

Input JSON:  { "source_docx_base64": "<base64>", "output_path": "/abs/out.json" }
Output JSON: { ok, parts_checked, malformed_parts[], missing_parts[],
               dangling_rels[], reopened, paragraph_count, errors[],
               network, generated_at }
"""

import base64
import io
import json
import os
import posixpath
import sys
import zipfile
from datetime import datetime

from lxml import etree

RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def _network_status() -> str:
    return "disabled" if os.getenv("ARTIFACT_COMPUTE_NO_NETWORK") == "1" else "unknown"


def validate(payload: dict) -> dict:
    report = {
        "ok": False,
        "parts_checked": 0,
        "malformed_parts": [],
        "missing_parts": [],
        "dangling_rels": [],
        "reopened": False,
        "paragraph_count": None,
        "errors": [],
        "network": _network_status(),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }

    src_b64 = payload.get("source_docx_base64")
    if not src_b64:
        report["errors"].append("source_docx_base64 is required")
        return report

    try:
        zf = zipfile.ZipFile(io.BytesIO(base64.b64decode(src_b64)))
    except Exception as exc:  # noqa: BLE001
        report["errors"].append(f"zip open failed: {exc}")
        return report

    names = set(zf.namelist())
    for required in ("[Content_Types].xml", "_rels/.rels", "word/document.xml"):
        if required not in names:
            report["missing_parts"].append(required)

    # Well-formedness of every XML / rels part.
    for name in names:
        if name.endswith(".xml") or name.endswith(".rels"):
            report["parts_checked"] += 1
            try:
                etree.fromstring(zf.read(name))
            except Exception as exc:  # noqa: BLE001
                report["malformed_parts"].append({"part": name, "error": str(exc)})

    # Relationship targets resolve to real parts (internal targets only).
    for name in names:
        if not name.endswith(".rels"):
            continue
        try:
            rels = etree.fromstring(zf.read(name))
        except Exception:  # noqa: BLE001
            continue  # already reported as malformed
        base_dir = posixpath.dirname(posixpath.dirname(name))  # strip _rels/
        for rel in rels.findall("{%s}Relationship" % RELS_NS):
            if rel.get("TargetMode") == "External":
                continue
            target = rel.get("Target", "")
            resolved = posixpath.normpath(posixpath.join(base_dir, target)).lstrip("/")
            if resolved not in names:
                report["dangling_rels"].append({"rels": name, "target": target})

    try:
        from docx import Document

        doc = Document(io.BytesIO(base64.b64decode(src_b64)))
        report["reopened"] = True
        report["paragraph_count"] = len(doc.paragraphs)
    except Exception as exc:  # noqa: BLE001
        report["errors"].append(f"python-docx reopen failed: {exc}")

    report["ok"] = (
        not report["malformed_parts"]
        and not report["missing_parts"]
        and not report["dangling_rels"]
        and not report["errors"]
        and report["reopened"]
    )
    return report


def main() -> int:
    if len(sys.argv) < 2:
        print("missing input path", file=sys.stderr)
        return 2
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        payload = json.load(f)
    output_path = payload.get("output_path")
    if not output_path:
        print("missing output path", file=sys.stderr)
        return 2
    with open(output_path, "w", encoding="utf-8") as out:
        json.dump(validate(payload), out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
