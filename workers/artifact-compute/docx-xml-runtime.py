"""
docx-xml isolated runtime — surgical OOXML editing.

This is AnA's raw-XML document surgery path: it unpacks a .docx (a ZIP of
XML parts), parses word/document.xml with lxml, locates text anchors at the
run/paragraph level, and surgically inserts new <w:p> paragraph blocks or
replaces placeholder text — preserving the surrounding formatting (fonts,
bold/italic, spacing, justification) by cloning the anchor's paragraph
properties (w:pPr) and run properties (w:rPr). It then repacks every original
ZIP entry and validates the result (well-formed XML for every part + a
python-docx round-trip open).

Unlike the python-docx object API (author_docx_native, insert_document_content),
this operates on the raw OOXML tree, so it can place content at exact
locations and inherit the precise character formatting already in the
document.

Input JSON:
  {
    "source_docx_base64": "<base64 .docx>",
    "operations": [
      { "op": "insert_paragraphs",
        "anchor_text": "10.3 Statistical Methods",
        "match": "contains"|"exact",          # default contains
        "position": "after"|"before",          # default after
        "paragraphs": ["text line 1", "text line 2"],
        "inherit_format": true },              # clone anchor pPr/rPr; default true
      { "op": "replace_text",
        "find": "{{SPONSOR}}",
        "replace": "Concept2Cure, Inc." }      # preserves the run's formatting
    ],
    "file_name": "edited.docx",
    "output_path": "/abs/output.json"
  }

Output JSON: { output_type, file_name, mime_type, content_base64, applied[],
               validation{ ok, parts_checked, malformed_parts[], reopened,
               paragraph_count, errors[] }, network, generated_at }
"""

import base64
import io
import json
import os
import sys
import zipfile
from datetime import datetime

from lxml import etree

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{%s}" % W_NS
NSMAP = {"w": W_NS}


def _network_status() -> str:
    return "disabled" if os.getenv("ARTIFACT_COMPUTE_NO_NETWORK") == "1" else "unknown"


def _para_text(p) -> str:
    """Concatenated visible text of a <w:p> (all <w:t> descendants)."""
    return "".join(t.text or "" for t in p.iter(W + "t"))


def _make_text_run(template_rpr, text):
    """Build a <w:r> with a <w:t> carrying `text`, cloning template_rpr if given."""
    r = etree.Element(W + "r")
    if template_rpr is not None:
        r.append(_clone(template_rpr))
    t = etree.SubElement(r, W + "t")
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    return r


def _clone(el):
    return etree.fromstring(etree.tostring(el))


def _build_paragraph(text, template_p, inherit_format):
    """Create a new <w:p> carrying `text`, inheriting pPr/rPr from template_p."""
    p = etree.Element(W + "p")
    template_ppr = template_p.find(W + "pPr") if (template_p is not None and inherit_format) else None
    if template_ppr is not None:
        p.append(_clone(template_ppr))
    template_rpr = None
    if template_p is not None and inherit_format:
        first_run = template_p.find(W + "r")
        if first_run is not None:
            template_rpr = first_run.find(W + "rPr")
    p.append(_make_text_run(template_rpr, text))
    return p


def _find_anchor_paragraph(body, anchor_text, match):
    for p in body.findall(W + "p"):
        txt = _para_text(p)
        if match == "exact":
            if txt.strip() == anchor_text.strip():
                return p
        else:
            if anchor_text in txt:
                return p
    return None


def _op_insert_paragraphs(body, op):
    anchor_text = op.get("anchor_text", "")
    match = op.get("match", "contains")
    position = op.get("position", "after")
    inherit = op.get("inherit_format", True)
    lines = op.get("paragraphs", []) or []

    anchor = _find_anchor_paragraph(body, anchor_text, match)
    if anchor is None:
        return {"op": "insert_paragraphs", "anchor": anchor_text, "status": "anchor_not_found", "count": 0}

    new_paras = [_build_paragraph(line, anchor, inherit) for line in lines]
    if position == "before":
        idx = list(body).index(anchor)
        for i, np in enumerate(new_paras):
            body.insert(idx + i, np)
    else:  # after — insert in order immediately following the anchor
        cursor = anchor
        for np in new_paras:
            cursor.addnext(np)
            cursor = np
    return {"op": "insert_paragraphs", "anchor": anchor_text, "status": "applied", "count": len(new_paras)}


def _op_replace_text(body, op):
    find = op.get("find", "")
    replace = op.get("replace", "")
    if not find:
        return {"op": "replace_text", "find": find, "status": "empty_find", "count": 0}

    replaced = 0
    # Pass 1 — single-run replacement (preserves that run's rPr exactly).
    for t in body.iter(W + "t"):
        if t.text and find in t.text:
            replaced += t.text.count(find)
            t.text = t.text.replace(find, replace)

    # Pass 2 — paragraph-level fallback for tokens that span run boundaries.
    # Collapses the paragraph's runs into the first (keeps the paragraph's
    # primary run formatting); a last resort only used when Pass 1 found nothing.
    if replaced == 0:
        for p in body.findall(W + "p"):
            full = _para_text(p)
            if find in full:
                runs = p.findall(W + "r")
                if runs:
                    first = runs[0]
                    t0 = first.find(W + "t")
                    if t0 is None:
                        t0 = etree.SubElement(first, W + "t")
                    t0.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                    t0.text = full.replace(find, replace)
                    for extra in runs[1:]:
                        p.remove(extra)
                    replaced += full.count(find)
    return {"op": "replace_text", "find": find, "status": "applied" if replaced else "not_found", "count": replaced}


def _validate(docx_bytes):
    """Validate the produced .docx: required parts present, every XML part
    well-formed, and python-docx can re-open it."""
    report = {
        "ok": False,
        "parts_checked": 0,
        "malformed_parts": [],
        "reopened": False,
        "paragraph_count": None,
        "errors": [],
    }
    try:
        zf = zipfile.ZipFile(io.BytesIO(docx_bytes))
    except Exception as exc:  # noqa: BLE001
        report["errors"].append(f"zip open failed: {exc}")
        return report

    names = set(zf.namelist())
    for required in ("[Content_Types].xml", "_rels/.rels", "word/document.xml"):
        if required not in names:
            report["errors"].append(f"missing required part: {required}")

    for name in names:
        if name.endswith(".xml") or name.endswith(".rels"):
            report["parts_checked"] += 1
            try:
                etree.fromstring(zf.read(name))
            except Exception as exc:  # noqa: BLE001
                report["malformed_parts"].append({"part": name, "error": str(exc)})

    try:
        from docx import Document

        doc = Document(io.BytesIO(docx_bytes))
        report["reopened"] = True
        report["paragraph_count"] = len(doc.paragraphs)
    except Exception as exc:  # noqa: BLE001
        report["errors"].append(f"python-docx reopen failed: {exc}")

    report["ok"] = (
        not report["malformed_parts"]
        and not report["errors"]
        and report["reopened"]
    )
    return report


def edit_docx(payload: dict) -> dict:
    src_b64 = payload.get("source_docx_base64")
    if not src_b64:
        raise ValueError("source_docx_base64 is required")
    src = base64.b64decode(src_b64)

    zin = zipfile.ZipFile(io.BytesIO(src))
    doc_xml = zin.read("word/document.xml")
    tree = etree.fromstring(doc_xml)
    body = tree.find(W + "body")
    if body is None:
        raise ValueError("word/document.xml has no <w:body>")

    applied = []
    for op in payload.get("operations", []) or []:
        kind = op.get("op")
        if kind == "insert_paragraphs":
            applied.append(_op_insert_paragraphs(body, op))
        elif kind == "replace_text":
            applied.append(_op_replace_text(body, op))
        else:
            applied.append({"op": kind, "status": "unknown_op", "count": 0})

    new_doc_xml = etree.tostring(tree, xml_declaration=True, encoding="UTF-8", standalone=True)

    # Repack: copy every original entry, swapping word/document.xml.
    out_buf = io.BytesIO()
    with zipfile.ZipFile(out_buf, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = new_doc_xml if item.filename == "word/document.xml" else zin.read(item.filename)
            zout.writestr(item, data)
    docx_bytes = out_buf.getvalue()

    return {
        "output_type": "docx",
        "file_name": payload.get("file_name", "edited.docx"),
        "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content_base64": base64.b64encode(docx_bytes).decode("ascii"),
        "applied": applied,
        "validation": _validate(docx_bytes),
        "network": _network_status(),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


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
    result = edit_docx(payload)
    with open(output_path, "w", encoding="utf-8") as out:
        json.dump(result, out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
