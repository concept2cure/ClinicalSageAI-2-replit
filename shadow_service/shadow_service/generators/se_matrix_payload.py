"""SE Matrix Payload Generator — Phase 6.6.C (Evidence-Linked).

Generates the SE comparison matrix with:
  - Deterministic diff analysis → risk_code assignment
  - risk_code → evidence_task_ids linkage via canonical map
  - Defense readiness scoring
  - DOCX Factory-ready payload

No LLM generation.  Every diff flag and risk_code comes from explicit
rule maps — reviewable, testable, defensible in regulated environments.

Usage:
    from shadow_service.generators.se_matrix_payload import generate_se_matrix_payload

    payload = generate_se_matrix_payload(
        program_id="...",
        subject_device={...},
        predicate_record={...},
    )
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from ..models_se_matrix import (
    EvidenceTaskV2,
    SEMatrixPayloadV2,
    SEMatrixRowV2,
)
from ..scoring.risk_code_map import (
    ALL_RISK_CODES,
    RISK_CODE_MAP_VERSION,
    RISK_CODE_TO_ARTIFACTS,
    RISK_CODE_TO_CATEGORY,
    SE_CATEGORY_RISK_CODE_MAP,
    get_label_for_risk_code,
    get_severity_for_risk_code,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

# SE comparison characteristics — the canonical 9 rows
SE_CHARACTERISTICS: list[tuple[str, str]] = [
    ("intended_use", "Intended Use"),
    ("technology", "Technological Characteristics"),
    ("materials", "Materials of Construction"),
    ("energy_source", "Energy Source"),
    ("performance", "Performance Characteristics"),
    ("biocompatibility", "Biocompatibility"),
    ("sterilization", "Sterilization Method"),
    ("software", "Software/Firmware"),
    ("general", "Labeling / General"),
]

# Significant material changes (regulatory-relevant material families)
SIGNIFICANT_MATERIAL_CHANGES = frozenset({
    "titanium", "stainless steel", "cobalt chromium", "nitinol",
    "silicone", "polyethylene", "peek", "ptfe", "latex",
    "ceramic", "hydroxyapatite", "pyrolytic carbon",
})

# ISO standards for auto-generated discussion text
ISO_STANDARDS: dict[str, str] = {
    "materials": "ISO 10993-1 (Biological evaluation of medical devices)",
    "biocompatibility": "ISO 10993-5 (Cytotoxicity), ISO 10993-10 (Sensitization)",
    "sterilization": "ISO 11135 (EO), ISO 11137 (Radiation), ISO 17665 (Steam)",
    "software": "IEC 62304 (Medical device software life cycle)",
    "energy_source": "IEC 60601-1 (Electrical safety), IEC 60601-1-2 (EMC)",
    "intended_use": "21 CFR 807.87(f) (Substantial Equivalence Determination)",
    "technology": "FDA Guidance: The 510(k) Program",
    "performance": "ISO 14155 (Clinical investigation), device-specific guidance",
}


# ─────────────────────────────────────────────────────────────────────────────
# Stable task_id hash
# ─────────────────────────────────────────────────────────────────────────────

def _stable_task_id(category: str, risk_code: str) -> str:
    """SHA-256[:12] of category + risk_code — deterministic and stable."""
    raw = f"{category}:{risk_code}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def generate_se_matrix_payload(
    *,
    program_id: str,
    subject_device: dict[str, Any],
    predicate_record: dict[str, Any],
    product_code: Optional[str] = None,
    design_control_ids: Optional[dict[str, str]] = None,
    defense_packet_seed: Optional[dict[str, Any]] = None,
) -> SEMatrixPayloadV2:
    """Generate deterministic SE matrix payload with evidence linkage.

    Args:
        program_id: The regulatory program ID.
        subject_device: dict with keys matching SE category values.
        predicate_record: dict from fda_510k_clearances row or candidate.
        product_code: Optional product code for additional context.
        design_control_ids: Optional map of category → evidence_id.
        defense_packet_seed: Optional existing defense packet for linkage.

    Returns:
        SEMatrixPayloadV2 with comparison_rows[] and evidence_tasks[].
    """
    design_control_ids = design_control_ids or {}
    k_number = predicate_record.get("k_number", "UNKNOWN")
    rows: list[SEMatrixRowV2] = []
    all_risk_codes_found: list[str] = []

    for idx, (category_key, char_name) in enumerate(SE_CHARACTERISTICS):
        subj_val = str(subject_device.get(category_key, "N/A"))
        pred_val = str(predicate_record.get(category_key, "N/A"))

        # Deterministic diff analysis
        diff_flag, discussion, risk_code, severity = analyze_diff(
            category_key, subj_val, pred_val,
        )

        # Map risk_code → evidence_task_ids
        evidence_task_ids: list[str] = []
        if risk_code:
            all_risk_codes_found.append(risk_code)
            evidence_task_ids = map_risk_code_to_evidence_task_ids(risk_code)

        # Evidence cell metadata
        subject_evidence_ids = []
        if design_control_ids.get(category_key):
            subject_evidence_ids.append(design_control_ids[category_key])

        rows.append(SEMatrixRowV2(
            sort_order=idx + 1,
            characteristic=char_name,
            category=category_key,
            subject_value=subj_val,
            predicate_value=pred_val,
            diff_flag=diff_flag,
            discussion_text=discussion,
            risk_code=risk_code,
            evidence_task_ids=evidence_task_ids,
            requires_citation=diff_flag != "EQUIVALENT",
            suggested_tests=_get_suggested_tests(category_key, diff_flag, risk_code),
            diff_severity=severity,
            subject_evidence_ids=subject_evidence_ids,
            predicate_evidence_ids=[f"FDA_510k_{k_number}"],
            subject_confidence=0.95 if subject_evidence_ids else 0.50,
            predicate_confidence=0.90,
        ))

    # Build deduplicated evidence tasks from all risk codes
    evidence_tasks = build_evidence_tasks_from_risk_codes(all_risk_codes_found)

    # Calculate defense readiness score
    readiness = calculate_defense_readiness(rows)

    return SEMatrixPayloadV2(
        device_name=subject_device.get("device_name", "Subject Device"),
        predicate_k_number=k_number,
        predicate_device_name=predicate_record.get("device_name", ""),
        comparison_rows=rows,
        evidence_tasks=evidence_tasks,
        defense_readiness_score=readiness,
        generated_at=datetime.now(timezone.utc).isoformat(),
        risk_code_map_version=RISK_CODE_MAP_VERSION,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Diff Analysis (deterministic, no LLM)
# ─────────────────────────────────────────────────────────────────────────────

def analyze_diff(
    category: str,
    subject: str,
    predicate: str,
) -> tuple[str, str, Optional[str], str]:
    """Deterministic diff analysis for one SE row.

    Returns:
        (diff_flag, discussion_text, risk_code, severity)

    Rules (v1):
        - Identical text → EQUIVALENT
        - Material mismatch → DISCUSSION_REQUIRED, MATERIAL_CHANGE
        - Energy source mismatch → SIGNIFICANT, ENERGY_SOURCE_CHANGE
        - Tissue contact/duration mismatch → DISCUSSION_REQUIRED, BIOCONTACT_CHANGE
        - Sterilization mismatch → DISCUSSION_REQUIRED, STERILIZATION_CHANGE
        - Intended use mismatch → SIGNIFICANT (if low overlap), DISCUSSION_REQUIRED otherwise
        - Software mismatch → SIGNIFICANT (if new), DISCUSSION_REQUIRED otherwise
    """
    subj_norm = subject.strip().lower()
    pred_norm = predicate.strip().lower()

    # Identical = Equivalent
    if subj_norm == pred_norm:
        return "EQUIVALENT", "Identical characteristics — no discussion required.", None, "none"

    # N/A on both sides
    if subj_norm in ("n/a", "", "none") and pred_norm in ("n/a", "", "none"):
        return "EQUIVALENT", "Not applicable for both devices.", None, "none"

    # Category-specific analysis
    if category == "intended_use":
        return _analyze_intended_use(subject, predicate)
    if category in ("materials", "material"):
        return _analyze_materials(subject, predicate)
    if category in ("energy_source", "energy"):
        return _analyze_energy(subject, predicate)
    if category == "sterilization":
        return _analyze_sterilization(subject, predicate)
    if category == "software":
        return _analyze_software(subject, predicate)
    if category == "biocompatibility":
        return _analyze_biocompatibility(subject, predicate)
    if category == "technology":
        return _analyze_technology(subject, predicate)
    if category == "performance":
        return _analyze_performance(subject, predicate)

    # Default: discussion required with category-mapped risk_code
    risk_code = SE_CATEGORY_RISK_CODE_MAP.get(category)
    return (
        "DISCUSSION_REQUIRED",
        f"Differences noted between subject ({subject}) and predicate ({predicate}). "
        "Discussion provided below.",
        risk_code,
        "low",
    )


def _analyze_intended_use(subj: str, pred: str) -> tuple[str, str, Optional[str], str]:
    """Intended use: word overlap determines severity."""
    subj_words = set(subj.lower().split())
    pred_words = set(pred.lower().split())
    total = max(len(subj_words | pred_words), 1)
    overlap = len(subj_words & pred_words) / total

    if overlap > 0.8:
        return (
            "EQUIVALENT",
            "Intended use is substantially similar. Minor wording differences "
            "do not affect equivalence.",
            None,
            "none",
        )
    if overlap > 0.5:
        return (
            "DISCUSSION_REQUIRED",
            "Intended use overlap is moderate. Discussion addresses differences "
            f"in scope and patient population. Ref: {ISO_STANDARDS['intended_use']}.",
            "IU_MISMATCH",
            "medium",
        )
    return (
        "SIGNIFICANT",
        "Significant difference in intended use. FDA may not accept this "
        f"predicate for SE comparison. Ref: {ISO_STANDARDS['intended_use']}.",
        "IU_MISMATCH",
        "critical",
    )


def _analyze_materials(subj: str, pred: str) -> tuple[str, str, Optional[str], str]:
    """Material changes are always discussion-required at minimum."""
    subj_mats = {w.strip().lower() for w in subj.replace(",", " ").split()}
    pred_mats = {w.strip().lower() for w in pred.replace(",", " ").split()}

    significant = bool(
        (subj_mats - pred_mats) & SIGNIFICANT_MATERIAL_CHANGES
        or (pred_mats - subj_mats) & SIGNIFICANT_MATERIAL_CHANGES
    )

    if significant:
        return (
            "DISCUSSION_REQUIRED",
            f"Change from {pred} to {subj} requires biocompatibility assessment "
            f"per {ISO_STANDARDS['materials']}. See biocompatibility evaluation report.",
            "MATERIAL_CHANGE",
            "high",
        )
    return (
        "DISCUSSION_REQUIRED",
        f"Material difference noted ({pred} → {subj}). Materials are within "
        "the same family — biocompatibility data supports equivalence.",
        "MATERIAL_CHANGE",
        "medium",
    )


def _analyze_energy(subj: str, pred: str) -> tuple[str, str, Optional[str], str]:
    """Energy source changes are significant."""
    if subj.strip().lower() in ("n/a", "none", "") and pred.strip().lower() in ("n/a", "none", ""):
        return "EQUIVALENT", "Neither device uses external energy source.", None, "none"

    return (
        "SIGNIFICANT",
        f"Different energy source ({pred} → {subj}). May affect safety profile "
        f"per {ISO_STANDARDS['energy_source']}. Requires bench testing verification.",
        "ENERGY_SOURCE_CHANGE",
        "high",
    )


def _analyze_sterilization(subj: str, pred: str) -> tuple[str, str, Optional[str], str]:
    """Sterilization method changes."""
    return (
        "DISCUSSION_REQUIRED",
        f"Sterilization method differs ({pred} → {subj}). Validation required "
        f"per {ISO_STANDARDS['sterilization']}.",
        "STERILIZATION_METHOD_CHANGE",
        "medium",
    )


def _analyze_software(subj: str, pred: str) -> tuple[str, str, Optional[str], str]:
    """Software/firmware: new software is significant."""
    subj_has_sw = subj.strip().lower() not in ("n/a", "none", "")
    pred_has_sw = pred.strip().lower() not in ("n/a", "none", "")

    if subj_has_sw and not pred_has_sw:
        return (
            "SIGNIFICANT",
            "Subject device includes software not present in predicate. "
            f"Requires documentation per {ISO_STANDARDS['software']}. "
            "FDA may request additional software review.",
            "SOFTWARE_PRESENT_NEW",
            "critical",
        )
    return (
        "DISCUSSION_REQUIRED",
        f"Software differences noted ({pred} → {subj}). "
        f"Review per {ISO_STANDARDS['software']}.",
        "SOFTWARE_SAFETY_CLASS_DIFF",
        "medium",
    )


def _analyze_biocompatibility(subj: str, pred: str) -> tuple[str, str, Optional[str], str]:
    """Biocompatibility / tissue contact differences."""
    return (
        "DISCUSSION_REQUIRED",
        f"Biocompatibility characteristics differ ({pred} → {subj}). "
        f"Assessment per {ISO_STANDARDS['biocompatibility']} required.",
        "TISSUE_CONTACT_CHANGE",
        "high",
    )


def _analyze_technology(subj: str, pred: str) -> tuple[str, str, Optional[str], str]:
    """Technology characteristic differences."""
    subj_words = set(subj.lower().split())
    pred_words = set(pred.lower().split())
    total = max(len(subj_words | pred_words), 1)
    overlap = len(subj_words & pred_words) / total

    if overlap > 0.7:
        return (
            "DISCUSSION_REQUIRED",
            f"Technology mostly aligned with minor differences. "
            f"Ref: {ISO_STANDARDS['technology']}.",
            "TECH_DIFFERENCE",
            "low",
        )
    return (
        "SIGNIFICANT",
        f"Core technology differs ({pred} → {subj}). "
        f"May require additional bench testing. Ref: {ISO_STANDARDS['technology']}.",
        "TECH_DIFFERENCE",
        "high",
    )


def _analyze_performance(subj: str, pred: str) -> tuple[str, str, Optional[str], str]:
    """Performance characteristic differences."""
    return (
        "DISCUSSION_REQUIRED",
        f"Performance characteristics differ ({pred} → {subj}). "
        f"Ref: {ISO_STANDARDS['performance']}.",
        "PERFORMANCE_CLAIM_CHANGE",
        "medium",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Risk Code → Evidence Task IDs
# ─────────────────────────────────────────────────────────────────────────────

def map_risk_code_to_evidence_task_ids(risk_code: str) -> list[str]:
    """Produce deterministic task IDs for a risk_code.

    Uses the canonical risk_code → category map to generate
    stable task_ids via hashing.
    """
    categories = RISK_CODE_TO_CATEGORY.get(risk_code, [])
    task_ids = []
    for cat in categories:
        tid = _stable_task_id(cat, risk_code)
        task_ids.append(tid)
    return task_ids


def build_evidence_tasks_from_risk_codes(
    risk_codes: list[str],
) -> list[EvidenceTaskV2]:
    """Build deduped + sorted evidence tasks from a list of risk_codes.

    This is the core 'fix list' for the SE matrix — deterministic, no LLM.
    """
    tasks: list[EvidenceTaskV2] = []
    seen: set[str] = set()

    for rc in risk_codes:
        if rc not in ALL_RISK_CODES:
            logger.warning("Unknown risk_code: %s — skipping", rc)
            continue

        categories = RISK_CODE_TO_CATEGORY.get(rc, [])
        artifacts = RISK_CODE_TO_ARTIFACTS.get(rc, [])
        severity = get_severity_for_risk_code(rc)
        label = get_label_for_risk_code(rc)

        for cat in categories:
            key = f"{cat}:{rc}"
            if key in seen:
                continue
            seen.add(key)

            # Filter artifacts to those relevant to this category
            cat_artifacts = [a for a in artifacts]  # all artifacts for the risk_code

            tasks.append(EvidenceTaskV2(
                task_id=_stable_task_id(cat, rc),
                category=cat,
                risk_code=rc,
                severity=severity,
                label=label,
                rationale=f"{label}: evidence required for regulatory review.",
                recommended_artifacts=cat_artifacts,
                mapping={
                    "truth_machine_placeholder": True,
                    "se_matrix_linkable": True,
                    "ectd_leaf_target": None,
                    "source_risk_code": rc,
                },
            ))

    # Sort: HIGH first, then MEDIUM, then LOW
    _SEV_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    tasks.sort(key=lambda t: _SEV_ORDER.get(t.severity, 9))
    return tasks


# ─────────────────────────────────────────────────────────────────────────────
# Defense Readiness Score
# ─────────────────────────────────────────────────────────────────────────────

def calculate_defense_readiness(rows: list[SEMatrixRowV2]) -> int:
    """Defense Readiness Score (0–100) from SE matrix rows.

    Components:
        - 30 pts: No SIGNIFICANT rows
        - 25 pts: Evidence coverage (% of rows with evidence_task_ids resolved)
        - 20 pts: No critical severity diffs
        - 15 pts: All non-EQUIVALENT rows have discussion_text
        - 10 pts: No empty subject values
    """
    if not rows:
        return 0

    total = len(rows)
    score = 0.0

    # 30 pts: no SIGNIFICANT rows
    significant_count = sum(1 for r in rows if r.diff_flag == "SIGNIFICANT")
    if significant_count == 0:
        score += 30.0
    else:
        score += max(0, 30.0 - (significant_count * 15.0))

    # 25 pts: evidence coverage
    with_evidence = sum(1 for r in rows if r.subject_evidence_ids)
    score += 25.0 * (with_evidence / total)

    # 20 pts: no critical diffs
    critical_count = sum(1 for r in rows if r.diff_severity == "critical")
    if critical_count == 0:
        score += 20.0
    else:
        score += max(0, 20.0 - (critical_count * 10.0))

    # 15 pts: discussion text completeness
    needs_discussion = [r for r in rows if r.diff_flag != "EQUIVALENT"]
    if needs_discussion:
        with_text = sum(1 for r in needs_discussion if r.discussion_text)
        score += 15.0 * (with_text / len(needs_discussion))
    else:
        score += 15.0

    # 10 pts: no empty subject values
    empty_count = sum(1 for r in rows if r.subject_value in ("N/A", "n/a", ""))
    if empty_count == 0:
        score += 10.0
    else:
        score += max(0, 10.0 - (empty_count * 2.0))

    return round(min(max(score, 0), 100))


# ─────────────────────────────────────────────────────────────────────────────
# Suggested Tests Helper
# ─────────────────────────────────────────────────────────────────────────────

def _get_suggested_tests(
    category: str,
    diff_flag: str,
    risk_code: Optional[str],
) -> list[str]:
    """Get suggested tests based on risk_code from canonical artifact list."""
    if diff_flag == "EQUIVALENT" or not risk_code:
        return []
    return RISK_CODE_TO_ARTIFACTS.get(risk_code, [])
