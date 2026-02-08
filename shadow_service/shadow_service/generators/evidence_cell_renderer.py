"""Evidence Cell DOCX Renderer — Phase 6.6.C.

Renders SE matrix comparison rows into python-docx tables with:
- Green highlight: evidence_ids exist (linked, verified)
- Yellow highlight: missing evidence_ids (needs citation)
- Red markers: SIGNIFICANT / NOT_EQUIVALENT diffs
- Invisible bookmarks: EV_<id> for Defense Packet extraction

Integrates with DOCX Factory render lifecycle.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Color constants (RGB hex for python-docx)
# ─────────────────────────────────────────────────────────────────────────────
COLOR_GREEN = "C6EFCE"   # Evidence present
COLOR_YELLOW = "FFEB9C"  # Missing evidence
COLOR_RED = "FFC7CE"     # Not equivalent / critical
COLOR_WHITE = "FFFFFF"   # Equivalent / no issue
COLOR_LIGHT_GRAY = "F2F2F2"  # Alternating row

# Diff flag display labels
DIFF_LABELS = {
    "EQUIVALENT": "≡ Equivalent",
    "DISCUSSION_REQUIRED": "⚠ Discussion Required",
    "NOT_EQUIVALENT": "✗ Not Equivalent",
    "TOXIC": "☠ Toxic",
    "PENDING": "⏳ Pending",
}


def get_cell_highlight(
    equivalence_status: str,
    has_evidence: bool,
    diff_severity: str = "none",
) -> str:
    """Determine cell background color based on evidence + diff status.

    Returns hex RGB color string.
    """
    if equivalence_status == "NOT_EQUIVALENT":
        return COLOR_RED
    if equivalence_status == "TOXIC":
        return COLOR_RED
    if diff_severity == "critical":
        return COLOR_RED

    if equivalence_status in ("DISCUSSION_REQUIRED",):
        if has_evidence:
            return COLOR_GREEN
        return COLOR_YELLOW

    if equivalence_status == "EQUIVALENT":
        return COLOR_GREEN if has_evidence else COLOR_WHITE

    # PENDING or unknown
    return COLOR_YELLOW if not has_evidence else COLOR_WHITE


def render_se_matrix_table(
    comparison_rows: list[dict[str, Any]],
    subject_device_name: str = "Subject Device",
    predicate_device_name: str = "Predicate Device",
    predicate_k_number: str = "",
) -> dict[str, Any]:
    """Produce a rendering instruction set for the SE matrix table.

    This doesn't depend on python-docx directly — it produces a
    structured "render plan" that the DOCX Factory runner can execute.

    Returns:
        {
            "table_header": [...],
            "table_rows": [...],
            "bookmarks": [...],
            "color_map": {...},
        }
    """
    header = [
        "Characteristic",
        f"Subject: {subject_device_name}",
        f"Predicate: {predicate_device_name} ({predicate_k_number})",
        "Diff Flag",
        "Discussion",
        "Evidence Status",
    ]

    rows: list[dict[str, Any]] = []
    bookmarks: list[dict[str, str]] = []
    color_cells: list[dict[str, Any]] = []

    for idx, row in enumerate(comparison_rows):
        subj_val = row.get("subject_value", {})
        pred_val = row.get("predicate_value", {})

        # Extract values
        subj_text = subj_val.get("value", "N/A") if isinstance(subj_val, dict) else str(subj_val)
        pred_text = pred_val.get("value", "N/A") if isinstance(pred_val, dict) else str(pred_val)

        subj_evidence = subj_val.get("evidence_ids", []) if isinstance(subj_val, dict) else []
        pred_evidence = pred_val.get("evidence_ids", []) if isinstance(pred_val, dict) else []

        subj_has_evidence = bool(subj_evidence)
        pred_has_evidence = bool(pred_evidence)

        eq_status = row.get("equivalence_status", "PENDING")
        diff_sev = row.get("diff_severity", "none")
        discussion = row.get("discussion_text", "")
        requires_citation = row.get("requires_citation", False)

        # Build evidence status text
        if subj_has_evidence and pred_has_evidence:
            evidence_text = "✓ Linked"
        elif subj_has_evidence:
            evidence_text = "⚠ Predicate evidence missing"
        elif pred_has_evidence:
            evidence_text = "⚠ Subject evidence missing"
        else:
            evidence_text = "✗ No evidence linked"

        # Determine colors
        subj_color = get_cell_highlight(eq_status, subj_has_evidence, diff_sev)
        pred_color = get_cell_highlight(eq_status, pred_has_evidence, diff_sev)
        status_color = get_cell_highlight(eq_status, subj_has_evidence and pred_has_evidence, diff_sev)

        table_row = {
            "index": idx,
            "characteristic": row.get("characteristic", ""),
            "category": row.get("category", ""),
            "subject_text": subj_text,
            "predicate_text": pred_text,
            "diff_flag": DIFF_LABELS.get(eq_status, eq_status),
            "discussion": discussion,
            "evidence_status": evidence_text,
        }
        rows.append(table_row)

        # Color map
        color_cells.append({
            "row": idx,
            "subject_bg": subj_color,
            "predicate_bg": pred_color,
            "status_bg": status_color,
            "diff_flag_bg": COLOR_RED if eq_status in ("NOT_EQUIVALENT", "TOXIC") else (
                COLOR_YELLOW if eq_status == "DISCUSSION_REQUIRED" else COLOR_GREEN
            ),
        })

        # Bookmarks for defense packet extraction
        for ev_id in subj_evidence:
            bookmarks.append({
                "name": f"EV_{ev_id}",
                "row": idx,
                "column": "subject",
                "evidence_id": ev_id,
            })
        for ev_id in pred_evidence:
            bookmarks.append({
                "name": f"EV_{ev_id}",
                "row": idx,
                "column": "predicate",
                "evidence_id": ev_id,
            })

    return {
        "table_header": header,
        "table_rows": rows,
        "bookmarks": bookmarks,
        "color_map": color_cells,
        "total_rows": len(rows),
        "equivalent_count": sum(1 for r in comparison_rows if r.get("equivalence_status") == "EQUIVALENT"),
        "discussion_count": sum(1 for r in comparison_rows if r.get("equivalence_status") == "DISCUSSION_REQUIRED"),
        "not_equivalent_count": sum(1 for r in comparison_rows if r.get("equivalence_status") == "NOT_EQUIVALENT"),
    }
