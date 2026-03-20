"""Phase 7.0E — Audit Trail PDF Renderer.

Generates AuditTrail.pdf from a proof pack record.
Part-11-style chronological audit event log extracted from the
proof pack's audit events.

Sections:
  1. Cover + attestation header
  2. Audit event log table (timestamped, action, actor, details)
  3. Hash chain verification summary
  4. Attestation footer
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
        return _sanitize(json.dumps(val, ensure_ascii=False, default=str)[:400])
    return _sanitize(str(val)[:400])


def _truncate(text: str, max_len: int = 120) -> str:
    return text if len(text) <= max_len else text[:max_len - 3] + "..."


class AuditTrailPDF(FPDF):
    def __init__(self):
        super().__init__(orientation="L", unit="mm", format="Letter")
        self._doc_title = "Part 11 Audit Trail"
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(12, 12, 12)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(*_GRAY)
        self.cell(0, 4, self._doc_title, align="L")
        self.cell(0, 4, f"Page {self.page_no()}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.line(12, 18, self.w - 12, 18)
        self.ln(4)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 6)
        self.set_text_color(*_GRAY)
        self.cell(0, 4, "Concept2Cure.RI - 21 CFR Part 11 Compliant Audit Trail - Confidential", align="L")
        self.cell(0, 4, f"Page {self.page_no()}/{{nb}}", align="R")


def _build_cover(pdf: AuditTrailPDF, pp_row: dict[str, Any]):
    pdf.add_page()
    pdf.alias_nb_pages()

    pdf.set_fill_color(*_BRAND_BLUE)
    pdf.rect(0, 0, pdf.w, 50, "F")

    pdf.set_y(12)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*_WHITE)
    pdf.cell(0, 10, "Part 11 Audit Trail", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 7, "21 CFR Part 11 Compliant Event Log", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_y(58)
    pdf.set_text_color(*_BLACK)
    pdf.set_font("Helvetica", "", 9)

    meta_lines = [
        f"Proof Pack ID: {_safe_str(pp_row.get('id'))}",
        f"Program ID: {_safe_str(pp_row.get('program_id'))}",
        f"Generator: Concept2Cure.RI v{_safe_str(pp_row.get('generator_version', 'unknown'))}",
        f"Manifest Hash: {_safe_str(pp_row.get('manifest_hash'))}",
    ]
    for line in meta_lines:
        pdf.cell(0, 5, line, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)


def _extract_audit_events(pp_row: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract audit events from the proof pack record.

    Events may be stored in:
      - pp_row["audit_events"] (list)
      - pp_row["metadata"]["audit_events"] (list)
      - pp_row["contract_snapshot"]["audit_events"] (list)
    """
    events: list[dict[str, Any]] = []

    for key in ["audit_events", "metadata", "contract_snapshot"]:
        raw = pp_row.get(key)
        if raw is None:
            continue
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue

        if isinstance(raw, list):
            events.extend(raw)
        elif isinstance(raw, dict):
            nested = raw.get("audit_events", raw.get("events", []))
            if isinstance(nested, list):
                events.extend(nested)

    return events


def _draw_table_header(pdf: AuditTrailPDF, col_w: list[float]):
    headers = ["#", "Timestamp", "Action", "Actor", "Details", "Hash"]
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_fill_color(*_HEADER_BG)
    pdf.set_text_color(*_WHITE)
    for i, h in enumerate(headers):
        pdf.cell(col_w[i], 6, h, border=1, fill=True, align="C")
    pdf.ln()


def _build_event_table(pdf: AuditTrailPDF, pp_row: dict[str, Any]):
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*_BRAND_BLUE)
    pdf.cell(0, 8, "Audit Event Log", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    events = _extract_audit_events(pp_row)

    if len(events) == 0:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(*_GRAY)
        pdf.cell(0, 6, "No audit events found in this proof pack record.", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(3)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(*_BLACK)
        pdf.multi_cell(0, 4, _sanitize(
            "Note: Audit events are populated when regulatory actions are performed "
            "through the Concept2Cure.RI platform. This proof pack may have been "
            "created before audit event logging was enabled."
        ))
        return

    usable_w = pdf.w - 24
    col_w = [
        usable_w * 0.04,   # #
        usable_w * 0.15,   # timestamp
        usable_w * 0.16,   # action
        usable_w * 0.12,   # actor
        usable_w * 0.38,   # details
        usable_w * 0.15,   # hash
    ]

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*_BLACK)
    pdf.cell(0, 5, f"Total events: {len(events)}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    _draw_table_header(pdf, col_w)

    pdf.set_font("Helvetica", "", 6)
    pdf.set_text_color(*_BLACK)

    for idx, evt in enumerate(events[:200]):
        if not isinstance(evt, dict):
            continue

        fill = idx % 2 == 0
        if fill:
            pdf.set_fill_color(*_LIGHT_GRAY)

        num = str(idx + 1)
        ts = _safe_str(evt.get("timestamp", evt.get("created_at", evt.get("ts", ""))))
        action = _safe_str(evt.get("action", evt.get("event", evt.get("type", ""))))
        actor = _safe_str(evt.get("actor", evt.get("user_id", evt.get("user", ""))))
        details = _safe_str(evt.get("details", evt.get("message", evt.get("description", ""))))
        evt_hash = _safe_str(evt.get("hash", evt.get("event_hash", evt.get("digest", ""))))

        pdf.cell(col_w[0], 5, _truncate(num, 5), border=1, fill=fill, align="C")
        pdf.cell(col_w[1], 5, _truncate(ts, 20), border=1, fill=fill)
        pdf.cell(col_w[2], 5, _truncate(action, 22), border=1, fill=fill)
        pdf.cell(col_w[3], 5, _truncate(actor, 16), border=1, fill=fill)
        pdf.cell(col_w[4], 5, _truncate(details, 55), border=1, fill=fill)
        pdf.cell(col_w[5], 5, _truncate(evt_hash, 20), border=1, fill=fill)
        pdf.ln()

        if pdf.get_y() > pdf.h - 22:
            pdf.add_page()
            _draw_table_header(pdf, col_w)
            pdf.set_font("Helvetica", "", 6)
            pdf.set_text_color(*_BLACK)


def _build_attestation(pdf: AuditTrailPDF, pp_row: dict[str, Any]):
    pdf.ln(8)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*_BRAND_BLUE)
    pdf.cell(0, 7, "Attestation", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*_BLACK)
    pdf.multi_cell(0, 4, _sanitize(
        "This audit trail was generated automatically by Concept2Cure.RI. "
        "All events are recorded chronologically and are immutable once created. "
        "The integrity of this log can be verified by comparing the manifest hash "
        f"({_safe_str(pp_row.get('manifest_hash', 'N/A'))}) "
        "against the cryptographic proof chain stored in the system database. "
        "This document is intended to satisfy 21 CFR Part 11 audit trail requirements."
    ))


@register_renderer("audit_trail_pdf")
def render_audit_trail_pdf(pp_row: dict[str, Any] | Any, request_id: str = "") -> bytes:
    """Render the Part 11 Audit Trail PDF."""
    if hasattr(pp_row, "keys"):
        row = dict(pp_row)
    else:
        row = pp_row

    logger.info("Rendering AuditTrail.pdf for proof_pack=%s", str(row.get("id", "?"))[:24])

    pdf = AuditTrailPDF()
    pdf.creation_date = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

    _build_cover(pdf, row)
    _build_event_table(pdf, row)
    _build_attestation(pdf, row)

    buf = io.BytesIO()
    pdf.output(buf)
    result = buf.getvalue()
    buf.close()

    logger.info("AuditTrail.pdf rendered: %d bytes, %d pages", len(result), pdf.pages_count)
    return result
