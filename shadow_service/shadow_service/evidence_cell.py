"""Phase 6.6 — Evidence Cell: Smart DOCX rendering primitive.

Every cell in a regulatory table is an evidence object—not a string.
Links display values bidirectionally to the Truth Machine evidence pool.

EvidenceCell provides:
  - Visible value for humans
  - Hidden XML metadata (evidence IDs, audit trail) for defense packet extraction
  - Confidence-based color coding:
      red/yellow = unverified, needs human review
      green = evidence-backed and locked
  - SHA-256 cell hash for tamper detection

Usage:
    cell = EvidenceCell(
        value="Titanium alloy (Ti-6Al-4V)",
        evidence_ids=["DC-001", "MAT-003"],
        confidence=0.95,
    )
    sdt = cell.to_docx_sdt(paragraph)   # Word Content Control
    manifest_entry = cell.to_manifest()  # Defense packet JSON
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from docx.enum.text import WD_COLOR_INDEX

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from docx.oxml.xmlchemy import BaseOxmlElement


# ═══════════════════════════════════════════════════════════════════════════════
# Confidence thresholds
# ═══════════════════════════════════════════════════════════════════════════════

CONFIDENCE_HIGH = 0.8      # Green highlight — evidence-backed
CONFIDENCE_MEDIUM = 0.5    # No highlight — partially verified
CONFIDENCE_LOW = 0.3       # Yellow highlight — needs citation
# Below LOW = Red highlight — AI-generated, requires human review


@dataclass
class AuditEntry:
    """Single audit log entry for an evidence cell."""
    timestamp: str
    user: str
    action: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    reason: str = ""


@dataclass
class EvidenceCell:
    """A typed cell that links a display value to evidence sources + confidence.

    This is the atomic unit of "Compliant by Construction" — every value
    in a regulatory document carries provenance metadata.
    """
    value: str
    evidence_ids: list[str] = field(default_factory=list)
    confidence: float = 0.0
    audit_log: list[AuditEntry] = field(default_factory=list)
    _cell_hash: str = field(default="", init=False, repr=False)

    def __post_init__(self):
        self._cell_hash = self._compute_hash()

    @property
    def cell_hash(self) -> str:
        return self._cell_hash

    @property
    def is_evidence_backed(self) -> bool:
        return len(self.evidence_ids) > 0 and self.confidence >= CONFIDENCE_HIGH

    @property
    def needs_review(self) -> bool:
        return self.confidence < CONFIDENCE_MEDIUM

    @property
    def needs_citation(self) -> bool:
        return len(self.evidence_ids) == 0 and self.confidence < CONFIDENCE_LOW

    @property
    def highlight_color(self) -> Optional[str]:
        """Determine highlight color based on confidence + evidence status."""
        if self.confidence >= CONFIDENCE_HIGH and self.evidence_ids:
            return "green"
        elif self.confidence >= CONFIDENCE_MEDIUM:
            return None  # No highlight
        elif self.confidence >= CONFIDENCE_LOW:
            return "yellow"
        else:
            return "red"

    # ─── DOCX Rendering ───────────────────────────────────────────────────

    def to_docx_sdt(self, paragraph: Paragraph) -> "BaseOxmlElement":
        """Create a Word Structured Document Tag (Content Control).

        The SDT contains:
          - Visible text run with appropriate highlighting
          - Hidden custom XML properties for evidence tracking
          - Cell hash for tamper detection

        This makes every table cell a "smart cell" that can be:
          1. Read by humans in Word
          2. Machine-parsed for defense packet extraction
          3. Audited for evidence completeness
        """
        # Create SDT element
        sdt = OxmlElement("w:sdt")

        # SDT Properties
        sdt_pr = OxmlElement("w:sdtPr")
        sdt.append(sdt_pr)

        # Alias (human-readable tag name)
        alias = OxmlElement("w:alias")
        alias.set(qn("w:val"), "EvidenceCell")
        sdt_pr.append(alias)

        # Tag with cell hash for identification
        tag = OxmlElement("w:tag")
        tag.set(qn("w:val"), f"ec:{self._cell_hash[:16]}")
        sdt_pr.append(tag)

        # Custom XML data store reference (evidence metadata)
        data_binding = OxmlElement("w:dataBinding")
        data_binding.set(qn("w:xpath"), f"/evidence[@hash='{self._cell_hash[:16]}']")
        sdt_pr.append(data_binding)

        # SDT Content
        sdt_content = OxmlElement("w:sdtContent")
        sdt.append(sdt_content)

        # Create run with value text
        run = OxmlElement("w:r")

        # Run properties (highlighting)
        rpr = OxmlElement("w:rPr")
        highlight = self.highlight_color
        if highlight:
            hl = OxmlElement("w:highlight")
            color_map = {
                "green": "green",
                "yellow": "yellow",
                "red": "red",
            }
            hl.set(qn("w:val"), color_map.get(highlight, "yellow"))
            rpr.append(hl)
        run.append(rpr)

        # Text
        text = OxmlElement("w:t")
        text.set(qn("xml:space"), "preserve")
        text.text = self.value
        run.append(text)

        sdt_content.append(run)

        # Append to paragraph
        paragraph._element.append(sdt)

        return sdt

    def apply_to_cell_text(self, paragraph: Paragraph) -> None:
        """Simpler approach: add text with highlighting to an existing paragraph.

        Use this when full SDT is overkill — still applies confidence coloring.
        """
        run = paragraph.add_run(self.value)
        highlight = self.highlight_color
        if highlight == "green":
            run.font.highlight_color = WD_COLOR_INDEX.BRIGHT_GREEN
        elif highlight == "yellow":
            run.font.highlight_color = WD_COLOR_INDEX.YELLOW
        elif highlight == "red":
            run.font.highlight_color = WD_COLOR_INDEX.RED

    # ─── Defense Packet / Manifest ─────────────────────────────────────────

    def to_manifest(self) -> dict[str, Any]:
        """Export cell metadata for the evidence manifest (defense packet JSON).

        The manifest is included in the ZIP export alongside the DOCX,
        linking every cell to its source evidence for FDA challenge defense.
        """
        return {
            "cell_hash": self._cell_hash,
            "value": self.value,
            "evidence_ids": self.evidence_ids,
            "confidence": self.confidence,
            "highlight": self.highlight_color,
            "is_evidence_backed": self.is_evidence_backed,
            "needs_review": self.needs_review,
            "audit_entries": len(self.audit_log),
        }

    def to_full_audit(self) -> dict[str, Any]:
        """Full audit export including change history."""
        base = self.to_manifest()
        base["audit_log"] = [
            {
                "timestamp": entry.timestamp,
                "user": entry.user,
                "action": entry.action,
                "old_value": entry.old_value,
                "new_value": entry.new_value,
                "reason": entry.reason,
            }
            for entry in self.audit_log
        ]
        return base

    # ─── Mutation ──────────────────────────────────────────────────────────

    def update_value(self, new_value: str, user: str, reason: str = "") -> None:
        """Update cell value with audit trail."""
        old_value = self.value
        self.audit_log.append(AuditEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            user=user,
            action="update_value",
            old_value=old_value,
            new_value=new_value,
            reason=reason,
        ))
        self.value = new_value
        self._cell_hash = self._compute_hash()

    def add_evidence(self, evidence_id: str, user: str, reason: str = "") -> None:
        """Link additional evidence to this cell."""
        if evidence_id not in self.evidence_ids:
            self.evidence_ids.append(evidence_id)
            self.audit_log.append(AuditEntry(
                timestamp=datetime.now(timezone.utc).isoformat(),
                user=user,
                action="add_evidence",
                new_value=evidence_id,
                reason=reason,
            ))

    def set_confidence(
        self, confidence: float, user: str, reason: str = ""
    ) -> None:
        """Update confidence level with audit trail."""
        old_conf = self.confidence
        self.confidence = max(0.0, min(1.0, confidence))
        self.audit_log.append(AuditEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            user=user,
            action="set_confidence",
            old_value=str(old_conf),
            new_value=str(self.confidence),
            reason=reason,
        ))

    # ─── Internal ──────────────────────────────────────────────────────────

    def _compute_hash(self) -> str:
        """SHA-256 hash of cell value for tamper detection."""
        return hashlib.sha256(self.value.encode("utf-8")).hexdigest()

    def __repr__(self) -> str:
        conf_pct = f"{self.confidence * 100:.0f}%"
        refs = len(self.evidence_ids)
        return f"EvidenceCell({self.value!r}, conf={conf_pct}, refs={refs})"
