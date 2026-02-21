"""Phase 7.0E — Proof Pack Summary PDF Renderer.

Generates ProofPackSummary.pdf from a proof pack record.
A one-page (ish) summary showing manifest digest, contracts,
hash chain, drift status, and key metadata.

Sections:
  1. Cover block with proof pack identity
  2. Contract chain table (all hashes)
  3. Drift / lock status indicators
  4. Attached artifacts list
"""

from __future__ import annotations

import io
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fpdf import FPDF

from ..render_runner import register_renderer

logger = logging.getLogger(__name__)

_BRAND_BLUE = (25, 65, 120)
_HEADER_BG = (40, 80, 140)
_WHITE = (255, 255, 255)
_BLACK = (0, 0, 0)
_GRAY = (120, 120, 120)
_LIGHT_GRAY = (240, 240, 240)
_GREEN = (34, 139, 34)
_RED = (200, 40, 40)


def _sanitize(text: str) -> str:
    replacements = {
        "\u2014": "--", "\u2013": "-", "\u2018": "'", "\u2019": "'",
        "\u201c": '"', "\u201d": '"', "\u2026": "...", "\u2022": "*",
        "\u2192": "->", "\u2265": ">=", "\u2264": "<=", "\u00b1": "+/-",
        "\u2260": "!=", "\u221e": "inf", "\u2248": "~",
    }
    for char, repl in replacements.items():
        text = text.replace(char, repl)
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _safe_str(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, (dict, list)):
        return _sanitize(json.dumps(val, ensure_ascii=False, default=str)[:500])
    return _sanitize(str(val)[:500])


def _truncate(text: str, max_len: int = 120) -> str:
    return text if len(text) <= max_len else text[:max_len - 3] + "..."


class ProofPackPDF(FPDF):
    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="Letter")
        self._doc_title = "Proof Pack Summary"
        self.set_auto_page_break(auto=True, margin=20)
        self.set_margins(15, 15, 15)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*_GRAY)
        self.cell(0, 5, self._doc_title, align="L")
        self.cell(0, 5, f"Page {self.page_no()}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.line(15, 22, self.w - 15, 22)
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(*_GRAY)
        self.cell(0, 5, "ClinicalSageAI - Confidential", align="L")
        self.cell(0, 5, f"Page {self.page_no()}/{{nb}}", align="R")


def _build_cover(pdf: ProofPackPDF, pp_row: dict[str, Any]):
    pdf.add_page()
    pdf.alias_nb_pages()

    pdf.set_fill_color(*_BRAND_BLUE)
    pdf.rect(0, 0, pdf.w, 65, "F")

    pdf.set_y(18)
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(*_WHITE)
    pdf.cell(0, 12, "Proof Pack Summary", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, "Manifest + Contract + Hash Chain Overview", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_y(75)
    pdf.set_text_color(*_BLACK)
    pdf.set_font("Helvetica", "", 10)

    pack_id = _safe_str(pp_row.get("id"))
    program_id = _safe_str(pp_row.get("program_id"))
    created = _safe_str(pp_row.get("created_at"))
    version = _safe_str(pp_row.get("generator_version", "unknown"))

    meta_lines = [
        f"Proof Pack ID: {pack_id}",
        f"Program ID: {program_id}",
        f"Generator: ClinicalSageAI v{version}",
        f"Created: {created}",
    ]
    for line in meta_lines:
        pdf.cell(0, 6, line, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)


def _build_contract_chain(pdf: ProofPackPDF, pp_row: dict[str, Any]):
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*_BRAND_BLUE)
    pdf.cell(0, 10, "1. Contract Hash Chain", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    hashes = [
        ("Manifest Hash", pp_row.get("manifest_hash")),
        ("Risk Vocab Hash", pp_row.get("risk_vocab_hash")),
        ("Risk Code Lock Hash", pp_row.get("risk_code_lock_hash")),
        ("Schema Hash", pp_row.get("schema_hash")),
        ("Subject Hash", pp_row.get("subject_hash")),
    ]

    col_label = 50
    col_value = pdf.w - 30 - col_label

    pdf.set_fill_color(*_HEADER_BG)
    pdf.set_text_color(*_WHITE)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(col_label, 7, "Contract", border=1, fill=True)
    pdf.cell(col_value, 7, "SHA-256 Digest", border=1, fill=True)
    pdf.ln()

    pdf.set_text_color(*_BLACK)
    pdf.set_font("Courier", "", 7)

    for i, (label, val) in enumerate(hashes):
        fill = i % 2 == 0
        if fill:
            pdf.set_fill_color(*_LIGHT_GRAY)
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(col_label, 6, label, border=1, fill=fill)
        pdf.set_font("Courier", "", 7)
        pdf.cell(col_value, 6, _truncate(str(val or "N/A"), 70), border=1, fill=fill)
        pdf.ln()

    pdf.ln(4)


def _build_drift_status(pdf: ProofPackPDF, pp_row: dict[str, Any]):
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*_BRAND_BLUE)
    pdf.cell(0, 10, "2. Drift & Lock Status", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # Check contract_snapshot for drift info
    snap = pp_row.get("contract_snapshot")
    if snap and isinstance(snap, str):
        try:
            snap = json.loads(snap)
        except (json.JSONDecodeError, TypeError):
            snap = {}
    if not isinstance(snap, dict):
        snap = {}

    checks = [
        ("risk_vocab_locked", snap.get("risk_vocab_locked")),
        ("schema_locked", snap.get("schema_locked")),
        ("manifest_sealed", snap.get("manifest_sealed")),
        ("codes_locked", snap.get("codes_locked")),
    ]

    pdf.set_font("Helvetica", "", 10)
    for label, val in checks:
        if val is True:
            pdf.set_text_color(*_GREEN)
            status = "PASS"
        elif val is False:
            pdf.set_text_color(*_RED)
            status = "DRIFT"
        else:
            pdf.set_text_color(*_GRAY)
            status = "UNKNOWN"
        pdf.cell(60, 6, f"  [{status}]  {label}")
        pdf.ln()

    pdf.set_text_color(*_BLACK)
    pdf.ln(4)


def _build_artifacts_list(pdf: ProofPackPDF, pp_row: dict[str, Any]):
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*_BRAND_BLUE)
    pdf.cell(0, 10, "3. Attached Artifacts", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    metadata = pp_row.get("metadata")
    if metadata and isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except (json.JSONDecodeError, TypeError):
            metadata = {}
    if not isinstance(metadata, dict):
        metadata = {}

    artifacts = metadata.get("artifacts", metadata.get("files", []))
    if not isinstance(artifacts, list) or len(artifacts) == 0:
        pdf.set_font("Helvetica", "I", 10)
        pdf.set_text_color(*_GRAY)
        pdf.cell(0, 6, "No artifact list available in metadata.", new_x="LMARGIN", new_y="NEXT")
        return

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*_BLACK)
    for art in artifacts[:30]:
        if isinstance(art, dict):
            name = art.get("name", art.get("filename", "Unknown"))
            kind = art.get("type", art.get("artifact_type", ""))
            pdf.cell(0, 5, f"  * {_sanitize(str(name))}  ({_sanitize(str(kind))})",
                     new_x="LMARGIN", new_y="NEXT")
        else:
            pdf.cell(0, 5, f"  * {_sanitize(str(art))}", new_x="LMARGIN", new_y="NEXT")


@register_renderer("proof_pack_summary_pdf")
def render_proof_pack_summary_pdf(pp_row: dict[str, Any] | Any, request_id: str = "") -> bytes:
    """Render the Proof Pack Summary PDF."""
    if hasattr(pp_row, "keys"):
        row = dict(pp_row)
    else:
        row = pp_row

    logger.info("Rendering ProofPackSummary.pdf for proof_pack=%s", str(row.get("id", "?"))[:24])

    pdf = ProofPackPDF()
    pdf.creation_date = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    _build_cover(pdf, row)
    _build_contract_chain(pdf, row)
    _build_drift_status(pdf, row)
    _build_artifacts_list(pdf, row)

    buf = io.BytesIO()
    pdf.output(buf)
    result = buf.getvalue()
    buf.close()

    logger.info("ProofPackSummary.pdf rendered: %d bytes, %d pages", len(result), pdf.pages_count)
    return result
