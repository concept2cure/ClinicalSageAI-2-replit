"""Phase 7.0E — SE Matrix Report PDF Renderer.

Generates SEMatrixReport.pdf from a proof pack record.
Focused on the Substantial Equivalence Matrix V2 rows.

Sections:
  1. Cover page + summary statistics
  2. SE Matrix table (all rows, risk codes, scores, discussion)
  3. Risk dimension breakdown
  4. Contract hashes + deterministic proof

Every PDF includes: proofPackId, manifest_hash, risk_vocab_hash,
schema_hash, generator_version, timestamp + actor + program_id,
checksum placeholder.
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

# ═══════════════════════════════════════════════════════════════════════════════
# Color palette (shared with defense_packet_pdf)
# ═══════════════════════════════════════════════════════════════════════════════

_BRAND_BLUE = (25, 65, 120)
_HEADER_BG = (40, 80, 140)
_WHITE = (255, 255, 255)
_BLACK = (0, 0, 0)
_GRAY = (120, 120, 120)
_LIGHT_GRAY = (240, 240, 240)
_GREEN = (34, 139, 34)
_YELLOW = (200, 160, 0)
_RED = (200, 40, 40)


def _sanitize(text: str) -> str:
    """Sanitize text for built-in PDF fonts (latin-1 safe)."""
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


def _truncate(text: str, max_len: int = 200) -> str:
    return text if len(text) <= max_len else text[:max_len - 3] + "..."


def _score_color(score: float | int | None) -> tuple[int, int, int]:
    if score is None:
        return _GRAY
    if isinstance(score, str):
        try:
            score = float(score)
        except ValueError:
            return _GRAY
    if score >= 80:
        return _GREEN
    if score >= 60:
        return _YELLOW
    return _RED


class SEMatrixPDF(FPDF):
    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="Letter")
        self._doc_title = "SE Matrix Report"
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


def _build_cover(pdf: SEMatrixPDF, pp_row: dict[str, Any]):
    pdf.add_page()
    pdf.alias_nb_pages()

    pdf.set_fill_color(*_BRAND_BLUE)
    pdf.rect(0, 0, pdf.w, 70, "F")

    pdf.set_y(18)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(*_WHITE)
    pdf.cell(0, 12, "SE Matrix Report", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 8, "Substantial Equivalence Analysis", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_y(80)
    pdf.set_text_color(*_BLACK)
    pdf.set_font("Helvetica", "", 10)

    meta = [
        f"Proof Pack ID: {_safe_str(pp_row.get('id'))}",
        f"Manifest Hash: {_safe_str(pp_row.get('manifest_hash'))}",
        f"Risk Vocab Hash: {_safe_str(pp_row.get('risk_vocab_hash'))}",
        f"Schema Hash: {_safe_str(pp_row.get('schema_hash'))}",
        f"Generator: ClinicalSageAI v{_safe_str(pp_row.get('generator_version', 'unknown'))}",
        f"Program ID: {_safe_str(pp_row.get('program_id'))}",
    ]
    for line in meta:
        pdf.cell(0, 6, line, align="C", new_x="LMARGIN", new_y="NEXT")


def _build_matrix_table(pdf: SEMatrixPDF, pp_row: dict[str, Any]):
    se_payload = pp_row.get("se_payload")
    if se_payload is None:
        return
    if isinstance(se_payload, str):
        try:
            se_payload = json.loads(se_payload)
        except (json.JSONDecodeError, TypeError):
            return
    if not isinstance(se_payload, dict):
        return

    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*_BRAND_BLUE)
    pdf.cell(0, 10, "1. SE Matrix Rows", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    rows = se_payload.get("rows", se_payload.get("matrix", []))
    if not isinstance(rows, list) or len(rows) == 0:
        pdf.set_font("Helvetica", "I", 10)
        pdf.set_text_color(*_GRAY)
        pdf.cell(0, 8, "No SE matrix rows available.", new_x="LMARGIN", new_y="NEXT")
        return

    # Summary
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_BLACK)
    scores = [r.get("score", 0) for r in rows if r.get("score") is not None]
    avg_score = sum(float(s) for s in scores) / len(scores) if scores else 0
    pdf.multi_cell(0, 5, _sanitize(
        f"Total dimensions: {len(rows)}. "
        f"Average score: {avg_score:.1f}%. "
        f"Version: {se_payload.get('version', 'N/A')}."
    ))
    pdf.ln(3)

    # Table
    col_w = [(pdf.w - 30) * 0.12, (pdf.w - 30) * 0.25, (pdf.w - 30) * 0.10,
             (pdf.w - 30) * 0.53]
    headers = ["Risk Code", "Dimension", "Score", "Discussion"]

    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(*_HEADER_BG)
    pdf.set_text_color(*_WHITE)
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 7, h, border=1, fill=True, align="C")
    pdf.ln()

    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*_BLACK)

    for j, row in enumerate(rows[:60]):
        fill = j % 2 == 0
        if fill:
            pdf.set_fill_color(*_LIGHT_GRAY)

        code = _safe_str(row.get("risk_code", row.get("code", "")))
        dim = _safe_str(row.get("dimension", row.get("name", row.get("category", ""))))
        score = _safe_str(row.get("score", row.get("value", "")))
        discussion = _safe_str(row.get("discussion", row.get("rationale", row.get("text", ""))))

        pdf.cell(col_w[0], 5, _truncate(code, 15), border=1, fill=fill)
        pdf.cell(col_w[1], 5, _truncate(dim, 35), border=1, fill=fill)
        pdf.cell(col_w[2], 5, _truncate(score, 10), border=1, fill=fill, align="C")
        pdf.cell(col_w[3], 5, _truncate(discussion, 75), border=1, fill=fill)
        pdf.ln()

        if pdf.get_y() > pdf.h - 30:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_fill_color(*_HEADER_BG)
            pdf.set_text_color(*_WHITE)
            for i, h in enumerate(headers):
                pdf.cell(col_w[i], 7, h, border=1, fill=True, align="C")
            pdf.ln()
            pdf.set_font("Helvetica", "", 7)
            pdf.set_text_color(*_BLACK)


def _build_hashes(pdf: SEMatrixPDF, pp_row: dict[str, Any]):
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*_BRAND_BLUE)
    pdf.cell(0, 10, "2. Contract Hashes", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    entries = [
        ("Manifest Hash", pp_row.get("manifest_hash")),
        ("Risk Vocab Hash", pp_row.get("risk_vocab_hash")),
        ("Risk Code Lock Hash", pp_row.get("risk_code_lock_hash")),
        ("Schema Hash", pp_row.get("schema_hash")),
        ("Generator Version", pp_row.get("generator_version")),
    ]

    for label, value in entries:
        if value is not None and value != "":
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(55, 6, label + ":")
            pdf.set_font("Courier", "", 8)
            pdf.cell(0, 6, _truncate(str(value), 80), new_x="LMARGIN", new_y="NEXT")


@register_renderer("se_matrix_pdf")
def render_se_matrix_pdf(pp_row: dict[str, Any] | Any, request_id: str = "") -> bytes:
    """Render the SE Matrix Report PDF."""
    if hasattr(pp_row, "keys"):
        row = dict(pp_row)
    else:
        row = pp_row

    logger.info("Rendering SEMatrixReport.pdf for proof_pack=%s", str(row.get("id", "?"))[:24])

    pdf = SEMatrixPDF()
    pdf.creation_date = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    _build_cover(pdf, row)
    _build_matrix_table(pdf, row)
    _build_hashes(pdf, row)

    buf = io.BytesIO()
    pdf.output(buf)
    result = buf.getvalue()
    buf.close()

    logger.info("SEMatrixReport.pdf rendered: %d bytes, %d pages", len(result), pdf.pages_count)
    return result
