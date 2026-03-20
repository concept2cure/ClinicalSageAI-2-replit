"""Phase 7.0B — Defense Packet PDF Renderer.

Generates DefensePacketReport.pdf from a proof pack record.
Uses fpdf2 (modern fork of fpdf) — deterministic, no network calls, embedded fonts.

Sections:
  1. Cover page (branding + submission summary)
  2. Executive Summary (readiness score, top risks)
  3. Evidence Tasks Table (category, triggers, required artifacts)
  4. SE Matrix V2 (rows, risk codes, discussion text)
  5. Contract Snapshot + Hashes ("proof it's deterministic")
  6. Audit Trail Excerpt (created/downloaded)

Design rules:
  - Strict Letter page size (8.5" x 11")
  - UTF-8 safe (fpdf2 handles it natively)
  - No network calls during render
  - Deterministic: same inputs → same bytes (modulo timestamp in footer)
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
# Color palette
# ═══════════════════════════════════════════════════════════════════════════════

_BRAND_BLUE = (25, 65, 120)
_BRAND_LIGHT = (230, 238, 250)
_HEADER_BG = (40, 80, 140)
_WHITE = (255, 255, 255)
_BLACK = (0, 0, 0)
_GRAY = (120, 120, 120)
_LIGHT_GRAY = (240, 240, 240)
_GREEN = (34, 139, 34)
_YELLOW = (200, 160, 0)
_RED = (200, 40, 40)


def _safe_str(val: Any) -> str:
    """Convert any value to a PDF-safe string (no None, no raw dicts, no problem chars)."""
    if val is None:
        return ""
    if isinstance(val, (dict, list)):
        text = json.dumps(val, ensure_ascii=False, default=str)[:500]
    else:
        text = str(val)[:500]
    return _sanitize_text(text)


def _sanitize_text(text: str) -> str:
    """Replace Unicode characters that break built-in PDF fonts (Helvetica/Courier).

    fpdf2 built-in fonts only support latin-1 / cp1252.
    Replace common Unicode chars with ASCII equivalents.
    """
    replacements = {
        "\u2014": "--",  # em dash
        "\u2013": "-",   # en dash
        "\u2018": "'",   # left single quote
        "\u2019": "'",   # right single quote
        "\u201c": '"',   # left double quote
        "\u201d": '"',   # right double quote
        "\u2026": "...", # ellipsis
        "\u2022": "*",   # bullet
        "\u2192": "->",  # right arrow
        "\u2190": "<-",  # left arrow
        "\u2194": "<->", # bidi arrow
        "\u2265": ">=",  # >=
        "\u2264": "<=",  # <=
        "\u00b1": "+/-", # plus-minus
        "\u00d7": "x",   # multiplication
        "\u00f7": "/",   # division
        "\u2260": "!=",  # not equal
        "\u221e": "inf", # infinity
        "\u2248": "~",   # approx
    }
    for char, repl in replacements.items():
        text = text.replace(char, repl)
    # Strip any remaining non-latin-1 characters
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _truncate(text: str, max_len: int = 200) -> str:
    """Truncate long text with ellipsis."""
    if len(text) <= max_len:
        return text
    return text[:max_len - 3] + "..."


def _severity_color(score: float | int | None) -> tuple[int, int, int]:
    """Color based on readiness score."""
    if score is None:
        return _GRAY
    if score >= 80:
        return _GREEN
    if score >= 60:
        return _YELLOW
    return _RED


# ═══════════════════════════════════════════════════════════════════════════════
# PDF Builder
# ═══════════════════════════════════════════════════════════════════════════════

class DefensePacketPDF(FPDF):
    """Custom PDF class with consistent headers/footers."""

    def __init__(self, title: str = "Defense Packet Report"):
        super().__init__(orientation="P", unit="mm", format="Letter")
        self._doc_title = title
        self.set_auto_page_break(auto=True, margin=20)
        self.set_margins(15, 15, 15)

    def header(self):
        if self.page_no() == 1:
            return  # Cover page has custom header
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
        self.cell(0, 5, "Concept2Cure.RI - Confidential", align="L")
        self.cell(0, 5, "Concept2Cure - Confidential", align="L")
        self.cell(0, 5, f"Page {self.page_no()}/{{nb}}", align="R")

    def section_heading(self, text: str, level: int = 1):
        """Add a section heading with bookmarks."""
        if level == 1:
            self.set_font("Helvetica", "B", 16)
            self.set_text_color(*_BRAND_BLUE)
            self.ln(6)
        elif level == 2:
            self.set_font("Helvetica", "B", 13)
            self.set_text_color(*_BRAND_BLUE)
            self.ln(4)
        else:
            self.set_font("Helvetica", "B", 11)
            self.set_text_color(*_BLACK)
            self.ln(2)

        self.cell(0, 8, text, new_x="LMARGIN", new_y="NEXT")

        if level <= 2:
            y = self.get_y()
            self.set_draw_color(*_BRAND_BLUE)
            self.line(15, y, self.w - 15, y)
            self.ln(3)

        self.set_text_color(*_BLACK)

    def body_text(self, text: str):
        """Add body paragraph text (auto-sanitized for font compatibility)."""
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*_BLACK)
        self.multi_cell(0, 5, _sanitize_text(text))
        self.ln(2)


# ═══════════════════════════════════════════════════════════════════════════════
# Page Builders
# ═══════════════════════════════════════════════════════════════════════════════

def _build_cover_page(pdf: DefensePacketPDF, pp_row: dict[str, Any]):
    """Page 1: Branded cover page."""
    pdf.add_page()
    pdf.alias_nb_pages()

    # Blue banner
    pdf.set_fill_color(*_BRAND_BLUE)
    pdf.rect(0, 0, pdf.w, 80, "F")

    # Title
    pdf.set_y(20)
    pdf.set_font("Helvetica", "B", 28)
    pdf.set_text_color(*_WHITE)
    pdf.cell(0, 12, "Defense Packet Report", align="C", new_x="LMARGIN", new_y="NEXT")

    # Subtitle
    pdf.set_font("Helvetica", "", 14)
    subject = _safe_str(pp_row.get("subject_device"))
    if isinstance(pp_row.get("subject_device"), str):
        try:
            sd = json.loads(pp_row["subject_device"])
            subject = sd.get("device_name", sd.get("name", str(sd)))
        except (json.JSONDecodeError, TypeError):
            pass
    pdf.cell(0, 8, f"510(k) Submission Package", align="C", new_x="LMARGIN", new_y="NEXT")
    if subject:
        pdf.set_font("Helvetica", "I", 11)
        pdf.cell(0, 8, _truncate(subject, 80), align="C", new_x="LMARGIN", new_y="NEXT")

    # Predicate K-number
    k_number = _safe_str(pp_row.get("predicate_k_number"))
    if k_number:
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 8, f"Predicate: {k_number}", align="C", new_x="LMARGIN", new_y="NEXT")

    # Metadata block below banner
    pdf.set_y(90)
    pdf.set_text_color(*_BLACK)
    pdf.set_font("Helvetica", "", 10)

    created = pp_row.get("created_at")
    if isinstance(created, datetime):
        created_str = created.strftime("%B %d, %Y at %H:%M UTC")
    else:
        created_str = str(created) if created else "N/A"

    meta_lines = [
        f"Proof Pack ID: {_safe_str(pp_row.get('id'))}",
        f"Manifest Hash: {_safe_str(pp_row.get('manifest_hash'))}",
        f"Generated: {created_str}",
        f"Generator: Concept2Cure.RI v{_safe_str(pp_row.get('generator_version', 'unknown'))}",
        f"Generator: Concept2Cure v{_safe_str(pp_row.get('generator_version', 'unknown'))}",
    ]

    for line in meta_lines:
        pdf.cell(0, 6, line, align="C", new_x="LMARGIN", new_y="NEXT")

    # Readiness score badge
    score = pp_row.get("defense_readiness_score")
    if score is not None:
        pdf.ln(8)
        color = _severity_color(score)
        pdf.set_font("Helvetica", "B", 20)
        pdf.set_text_color(*color)
        try:
            score_val = float(score)
            pdf.cell(0, 10, f"Readiness Score: {score_val:.0f}%", align="C", new_x="LMARGIN", new_y="NEXT")
        except (ValueError, TypeError):
            pdf.cell(0, 10, f"Readiness Score: {score}", align="C", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(*_BLACK)


def _build_executive_summary(pdf: DefensePacketPDF, pp_row: dict[str, Any]):
    """Section 1: Executive Summary — readiness score + top risks."""
    pdf.add_page()
    pdf.section_heading("1. Executive Summary")

    score = pp_row.get("defense_readiness_score")
    score_text = f"{score}%" if score is not None else "N/A"
    pdf.body_text(
        f"This Defense Packet was generated by Concept2Cure.RI's deterministic "
        f"This Defense Packet was generated by Concept2Cure's deterministic "
        f"scoring engine (SE Matrix V2). The overall regulatory readiness score "
        f"is {score_text}."
    )

    # Top risks table
    top_risks = pp_row.get("top_risks")
    if top_risks:
        if isinstance(top_risks, str):
            try:
                top_risks = json.loads(top_risks)
            except (json.JSONDecodeError, TypeError):
                top_risks = []

        if isinstance(top_risks, list) and len(top_risks) > 0:
            pdf.section_heading("Top Risks", level=2)
            pdf.set_font("Helvetica", "B", 9)

            col_w = [(pdf.w - 30) * 0.50, (pdf.w - 30) * 0.15, (pdf.w - 30) * 0.35]
            headers = ["Risk", "Severity", "Mitigation"]

            pdf.set_fill_color(*_HEADER_BG)
            pdf.set_text_color(*_WHITE)
            for i, h in enumerate(headers):
                pdf.cell(col_w[i], 7, h, border=1, fill=True, align="C")
            pdf.ln()

            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*_BLACK)
            for j, risk in enumerate(top_risks[:10]):
                fill = j % 2 == 0
                if fill:
                    pdf.set_fill_color(*_LIGHT_GRAY)

                risk_text = _safe_str(risk.get("risk", risk.get("description", risk.get("name", str(risk)))))
                severity = _safe_str(risk.get("severity", risk.get("level", "")))
                mitigation = _safe_str(risk.get("mitigation", risk.get("recommendation", "")))

                pdf.cell(col_w[0], 6, _truncate(risk_text, 70), border=1, fill=fill)
                pdf.cell(col_w[1], 6, _truncate(severity, 15), border=1, fill=fill, align="C")
                pdf.cell(col_w[2], 6, _truncate(mitigation, 50), border=1, fill=fill)
                pdf.ln()

    # Risk codes used
    risk_codes = pp_row.get("risk_codes_used")
    if risk_codes:
        if isinstance(risk_codes, str):
            try:
                risk_codes = json.loads(risk_codes)
            except (json.JSONDecodeError, TypeError):
                risk_codes = []

        if isinstance(risk_codes, list) and len(risk_codes) > 0:
            pdf.ln(4)
            pdf.section_heading("Risk Codes Applied", level=2)
            pdf.set_font("Helvetica", "", 9)
            codes_text = ", ".join(str(c) for c in risk_codes[:30])
            pdf.body_text(f"Active risk codes ({len(risk_codes)}): {codes_text}")


def _build_evidence_tasks(pdf: DefensePacketPDF, pp_row: dict[str, Any]):
    """Section 2: Evidence Tasks Table."""
    tasks = pp_row.get("tasks")
    if tasks is None:
        return

    if isinstance(tasks, str):
        try:
            tasks = json.loads(tasks)
        except (json.JSONDecodeError, TypeError):
            return

    if not isinstance(tasks, list) or len(tasks) == 0:
        return

    pdf.add_page()
    pdf.section_heading("2. Evidence Tasks")
    pdf.body_text(
        f"The defense packet includes {len(tasks)} evidence tasks generated from "
        f"the SE Matrix V2 risk analysis. Each task maps to a specific regulatory "
        f"requirement."
    )

    # Table
    col_w = [(pdf.w - 30) * 0.08, (pdf.w - 30) * 0.25, (pdf.w - 30) * 0.15,
             (pdf.w - 30) * 0.22, (pdf.w - 30) * 0.30]
    headers = ["#", "Category", "Severity", "Trigger", "Required Artifact"]

    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(*_HEADER_BG)
    pdf.set_text_color(*_WHITE)
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 7, h, border=1, fill=True, align="C")
    pdf.ln()

    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*_BLACK)

    for j, task in enumerate(tasks[:50]):  # Cap at 50 rows
        fill = j % 2 == 0
        if fill:
            pdf.set_fill_color(*_LIGHT_GRAY)

        num = str(j + 1)
        category = _safe_str(task.get("category", task.get("risk_code", "")))
        severity = _safe_str(task.get("severity", ""))
        trigger = _safe_str(task.get("trigger", task.get("description", "")))
        artifact = _safe_str(task.get("required_artifact", task.get("artifact", "")))

        pdf.cell(col_w[0], 5, num, border=1, fill=fill, align="C")
        pdf.cell(col_w[1], 5, _truncate(category, 30), border=1, fill=fill)
        pdf.cell(col_w[2], 5, _truncate(severity, 15), border=1, fill=fill, align="C")
        pdf.cell(col_w[3], 5, _truncate(trigger, 30), border=1, fill=fill)
        pdf.cell(col_w[4], 5, _truncate(artifact, 40), border=1, fill=fill)
        pdf.ln()

        # New page if we're near the bottom
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

    if len(tasks) > 50:
        pdf.ln(3)
        pdf.set_font("Helvetica", "I", 8)
        pdf.body_text(f"... and {len(tasks) - 50} more evidence tasks (truncated for readability).")


def _build_se_matrix(pdf: DefensePacketPDF, pp_row: dict[str, Any]):
    """Section 3: SE Matrix V2 — risk code rows with discussion."""
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
    pdf.section_heading("3. SE Matrix V2")

    version = se_payload.get("version", "")
    pdf.body_text(
        f"Substantial Equivalence Matrix (V2{f' - {version}' if version else ''}). "
        f"Each row represents a risk dimension with a deterministic score."
    )

    rows = se_payload.get("rows", se_payload.get("matrix", []))
    if isinstance(rows, list) and len(rows) > 0:
        col_w = [(pdf.w - 30) * 0.15, (pdf.w - 30) * 0.30, (pdf.w - 30) * 0.12,
                 (pdf.w - 30) * 0.43]
        headers = ["Risk Code", "Dimension", "Score", "Discussion"]

        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(*_HEADER_BG)
        pdf.set_text_color(*_WHITE)
        for i, h in enumerate(headers):
            pdf.cell(col_w[i], 7, h, border=1, fill=True, align="C")
        pdf.ln()

        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(*_BLACK)

        for j, row in enumerate(rows[:40]):
            fill = j % 2 == 0
            if fill:
                pdf.set_fill_color(*_LIGHT_GRAY)

            code = _safe_str(row.get("risk_code", row.get("code", "")))
            dim = _safe_str(row.get("dimension", row.get("name", row.get("category", ""))))
            score = _safe_str(row.get("score", row.get("value", "")))
            discussion = _safe_str(row.get("discussion", row.get("rationale", row.get("text", ""))))

            pdf.cell(col_w[0], 5, _truncate(code, 18), border=1, fill=fill)
            pdf.cell(col_w[1], 5, _truncate(dim, 40), border=1, fill=fill)
            pdf.cell(col_w[2], 5, _truncate(score, 12), border=1, fill=fill, align="C")
            pdf.cell(col_w[3], 5, _truncate(discussion, 60), border=1, fill=fill)
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


def _build_contract_snapshot(pdf: DefensePacketPDF, pp_row: dict[str, Any]):
    """Section 4: Contract Snapshot + Hashes — deterministic proof."""
    pdf.add_page()
    pdf.section_heading("4. Contract Snapshot & Hashes")
    pdf.body_text(
        "This section documents the exact contract state at the time of proof pack generation. "
        "All hashes are SHA-256 and can be independently verified."
    )

    entries = [
        ("Manifest Hash", pp_row.get("manifest_hash")),
        ("Risk Vocab Hash", pp_row.get("risk_vocab_hash")),
        ("Risk Code Lock Hash", pp_row.get("risk_code_lock_hash")),
        ("Schema Hash", pp_row.get("schema_hash")),
        ("Generator Version", pp_row.get("generator_version")),
        ("ZIP Manifest Hash", pp_row.get("zip_manifest_hash")),
        ("ZIP Hash", pp_row.get("zip_hash")),
        ("Drift Severity", pp_row.get("drift_severity")),
        ("Block Download", pp_row.get("block_download")),
    ]

    pdf.set_font("Courier", "", 8)
    for label, value in entries:
        if value is not None and value != "":
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(55, 6, label + ":")
            pdf.set_font("Courier", "", 8)
            pdf.cell(0, 6, _truncate(str(value), 80), new_x="LMARGIN", new_y="NEXT")

    # Manifest JSON summary
    manifest = pp_row.get("manifest_json")
    if manifest:
        if isinstance(manifest, str):
            try:
                manifest = json.loads(manifest)
            except (json.JSONDecodeError, TypeError):
                manifest = None

        if isinstance(manifest, dict):
            pdf.ln(4)
            pdf.section_heading("Manifest Summary", level=3)
            pdf.set_font("Courier", "", 7)
            summary_text = json.dumps(manifest, indent=2, default=str, ensure_ascii=False)
            # Truncate to avoid massive pages
            if len(summary_text) > 2000:
                summary_text = summary_text[:2000] + "\n... (truncated)"
            pdf.multi_cell(0, 4, summary_text)


def _build_audit_trail(pdf: DefensePacketPDF, pp_row: dict[str, Any]):
    """Section 5: Audit Trail Excerpt."""
    pdf.add_page()
    pdf.section_heading("5. Audit Trail")
    pdf.body_text(
        "Record of proof pack lifecycle events. Full audit trail is available in the "
        "Concept2Cure.RI platform (Part 11-compliant event log)."
        "Concept2Cure platform (Part 11-compliant event log)."
    )

    entries = [
        ("Created At", pp_row.get("created_at")),
        ("Created By", pp_row.get("created_by")),
        ("Updated At", pp_row.get("updated_at")),
        ("Downloads", pp_row.get("downloaded_count")),
        ("Status", pp_row.get("status")),
        ("Proof Pack ID", pp_row.get("id")),
        ("Program ID", pp_row.get("program_id")),
        ("Defense Packet ID", pp_row.get("defense_packet_id")),
    ]

    pdf.set_font("Helvetica", "", 9)
    for label, value in entries:
        if value is not None:
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(50, 6, label + ":")
            pdf.set_font("Helvetica", "", 9)
            val_str = value.strftime("%Y-%m-%d %H:%M:%S UTC") if isinstance(value, datetime) else str(value)
            pdf.cell(0, 6, _truncate(val_str, 80), new_x="LMARGIN", new_y="NEXT")

    # Disclaimer
    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*_GRAY)
    pdf.multi_cell(0, 4,
        "This report was generated deterministically from the proof pack manifest and "
        "contract snapshot. The same inputs will produce the same report content. "
        "This document is not a substitute for formal regulatory filing -- it is a "
        "decision-support artifact."
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Main Renderer (registered with render_runner)
# ═══════════════════════════════════════════════════════════════════════════════

@register_renderer("defense_packet_pdf")
def render_defense_packet_pdf(pp_row: dict[str, Any] | Any, request_id: str = "") -> bytes:
    """Render the complete Defense Packet Report PDF.

    Args:
        pp_row: Database row from proof_pack_exports JOIN defense_packets
                (asyncpg Record or dict-like).
        request_id: Traceability request ID (logged, not rendered).

    Returns:
        PDF bytes (ready for download or ZIP embedding).
    """
    # Convert Record to dict if needed
    if hasattr(pp_row, "keys"):
        row = dict(pp_row)
    else:
        row = pp_row

    logger.info(
        "Rendering DefensePacketReport.pdf for proof_pack=%s",
        str(row.get("id", "unknown"))[:24],
    )

    pdf = DefensePacketPDF(title="Defense Packet Report")
    # Fix creation date for deterministic output (same inputs → same bytes)
    pdf.creation_date = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    _build_cover_page(pdf, row)
    _build_executive_summary(pdf, row)
    _build_evidence_tasks(pdf, row)
    _build_se_matrix(pdf, row)
    _build_contract_snapshot(pdf, row)
    _build_audit_trail(pdf, row)

    # Output to bytes
    buf = io.BytesIO()
    pdf.output(buf)
    result = buf.getvalue()
    buf.close()

    logger.info(
        "DefensePacketReport.pdf rendered: %d bytes, %d pages",
        len(result), pdf.pages_count,
    )
    return result
