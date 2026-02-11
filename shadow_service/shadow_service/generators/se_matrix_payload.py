"""SE Matrix Payload Generator — Phase 6.6.C2 (Manifest + Evidence-Linked).

Generates the SE comparison matrix with:
  - Deterministic diff analysis via config-driven scorer
  - risk_code + triggered_risk_codes per row
  - evidence_task_ids linkage via canonical map
  - Defense readiness scoring
  - RegulatoryIntelManifest (deterministic, hashable)
  - DOCX Factory-ready payload

No LLM generation.  Every diff flag and risk_code comes from explicit
rule maps — reviewable, testable, defensible in regulated environments.

Usage:
    from shadow_service.generators.se_matrix_payload import (
        generate_se_matrix_payload,
        generate_se_matrix_with_manifest,
    )

    payload = generate_se_matrix_payload(...)
    response = generate_se_matrix_with_manifest(...)
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
    RISK_CODE_SEVERITY_DEFAULT,
    RISK_CODE_TO_ARTIFACTS,
    RISK_CODE_TO_CATEGORY,
    get_label_for_risk_code,
    get_severity_for_risk_code,
)
from ..predicate_intel.se_risk_codes import assign_se_row_risks, load_vocab
from ..predicate_intel.manifest import (
    build_manifest,
    canonical_sort,
    extract_top_risks,
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


# ─────────────────────────────────────────────────────────────────────────────
# Stable task_id hash
# ─────────────────────────────────────────────────────────────────────────────

def _stable_task_id(category: str, risk_code: str) -> str:
    """SHA-256[:12] of category + risk_code — deterministic and stable."""
    raw = f"{category}:{risk_code}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


def _hardened_task_id(
    subject_hash: str,
    characteristic: str,
    category: str,
    triggered_risk_codes: list[str],
) -> str:
    """Hardened task_id: sha256(subject_hash|characteristic|category|sorted(codes))[:12].

    Per spec §3: includes subject context for per-device uniqueness.
    """
    sorted_codes = ",".join(sorted(triggered_risk_codes))
    raw = f"{subject_hash}|{characteristic}|{category}|{sorted_codes}"
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
    vocab = load_vocab()
    rows: list[SEMatrixRowV2] = []
    all_triggered_codes: list[str] = []

    for idx, (category_key, char_name) in enumerate(SE_CHARACTERISTICS):
        subj_val = str(subject_device.get(category_key, "N/A"))
        pred_val = str(predicate_record.get(category_key, "N/A"))

        # Deterministic scorer for all rows
        result = assign_se_row_risks(category_key, subj_val, pred_val, vocab)

        risk_code = result["risk_code"]
        triggered_risk_codes: list[str] = result["triggered_risk_codes"]
        diff_flag = result["diff_flag"]
        discussion_text = result["discussion_text"]
        requires_citation = result["requires_citation"]

        # Compute diff_severity from risk_code default severity
        if not risk_code:
            diff_severity = "none" if diff_flag == "EQUIVALENT" else "low"
        else:
            diff_severity = get_severity_for_risk_code(risk_code).lower()

        # Map ALL triggered_risk_codes → evidence_task_ids
        evidence_task_ids: list[str] = []
        for trc in triggered_risk_codes:
            evidence_task_ids.extend(map_risk_code_to_evidence_task_ids(trc))
        # Deduplicate while preserving order
        evidence_task_ids = list(dict.fromkeys(evidence_task_ids))

        all_triggered_codes.extend(triggered_risk_codes)

        # Evidence cell metadata
        subject_evidence_ids: list[str] = []
        if design_control_ids.get(category_key):
            subject_evidence_ids.append(design_control_ids[category_key])

        rows.append(SEMatrixRowV2(
            sort_order=idx + 1,
            characteristic=char_name,
            category=category_key,
            subject_value=subj_val,
            predicate_value=pred_val,
            diff_flag=diff_flag,
            discussion_text=discussion_text,
            risk_code=risk_code,
            triggered_risk_codes=triggered_risk_codes,
            evidence_task_ids=evidence_task_ids,
            requires_citation=requires_citation,
            suggested_tests=_get_suggested_tests(category_key, diff_flag, risk_code),
            diff_severity=diff_severity,
            subject_evidence_ids=subject_evidence_ids,
            predicate_evidence_ids=[f"FDA_510k_{k_number}"],
            subject_confidence=0.95 if subject_evidence_ids else 0.50,
            predicate_confidence=0.90,
        ))

    # Build deduplicated evidence tasks from ALL triggered codes
    evidence_tasks = build_evidence_tasks_from_risk_codes(all_triggered_codes)

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
# Phase 6.6.C2: Manifest-bearing generator
# ─────────────────────────────────────────────────────────────────────────────

def generate_se_matrix_with_manifest(
    *,
    program_id: str,
    product_code: str = "",
    subject_device: dict[str, Any],
    predicate_record: dict[str, Any],
    design_control_ids: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    """Generate SE matrix payload + RegulatoryIntelManifest.

    Returns dict matching SEMatrixPayloadResponse:
        {manifest, payload, evidence_tasks}
    """
    payload = generate_se_matrix_payload(
        program_id=program_id,
        subject_device=subject_device,
        predicate_record=predicate_record,
        product_code=product_code,
        design_control_ids=design_control_ids,
    )

    # Collect all triggered risk codes (dedupe, canonical sort)
    all_triggered: list[str] = []
    for row in payload.comparison_rows:
        all_triggered.extend(row.triggered_risk_codes)
    risk_codes_used = canonical_sort(list(dict.fromkeys(all_triggered)))

    # Compute subject_hash for hardened task IDs (spec §3)
    from ..predicate_intel.manifest import compute_subject_hash
    subject_hash = compute_subject_hash(subject_device)

    # Re-derive evidence task IDs using hardened formula (per-device unique)
    hardened_task_ids: list[str] = []
    for row in payload.comparison_rows:
        if row.triggered_risk_codes:
            htid = _hardened_task_id(
                subject_hash, row.characteristic, row.category,
                row.triggered_risk_codes,
            )
            hardened_task_ids.append(htid)
    # Dedupe while preserving order
    evidence_task_ids = list(dict.fromkeys(hardened_task_ids))

    # Top risks by severity
    top_risks = extract_top_risks(risk_codes_used, RISK_CODE_SEVERITY_DEFAULT)

    # Build manifest
    manifest = build_manifest(
        program_id=program_id,
        product_code=product_code,
        subject_device=subject_device,
        predicate_k_number=payload.predicate_k_number,
        risk_codes_used=risk_codes_used,
        evidence_task_ids=evidence_task_ids,
        defense_readiness_score=payload.defense_readiness_score,
        top_risks=top_risks,
        generated_at=payload.generated_at,
    )

    return {
        "manifest": manifest,
        "payload": payload.model_dump(),
        "evidence_tasks": [t.model_dump() for t in payload.evidence_tasks],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Backward-compatible analyze_diff wrapper
# ─────────────────────────────────────────────────────────────────────────────

def analyze_diff(
    category: str,
    subject: str,
    predicate: str,
) -> tuple[str, str, Optional[str], str]:
    """Deterministic diff analysis for one SE row.

    Backward-compatible wrapper — delegates to assign_se_row_risks().

    Returns:
        (diff_flag, discussion_text, risk_code, diff_severity)
    """
    result = assign_se_row_risks(category, subject, predicate)
    risk_code = result["risk_code"]

    if not risk_code:
        severity = "none" if result["diff_flag"] == "EQUIVALENT" else "low"
    else:
        severity = get_severity_for_risk_code(risk_code).lower()

    return (result["diff_flag"], result["discussion_text"], risk_code, severity)


# ─────────────────────────────────────────────────────────────────────────────
# Risk Code → Evidence Task IDs
# ─────────────────────────────────────────────────────────────────────────────

def map_risk_code_to_evidence_task_ids(risk_code: str) -> list[str]:
    """Produce deterministic task IDs for a risk_code.

    Uses the canonical risk_code → category map to generate
    stable task_ids via hashing.
    """
    categories = RISK_CODE_TO_CATEGORY.get(risk_code, [])
    return [_stable_task_id(cat, risk_code) for cat in categories]


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

            tasks.append(EvidenceTaskV2(
                task_id=_stable_task_id(cat, rc),
                category=cat,
                risk_code=rc,
                severity=severity,
                label=label,
                rationale=f"{label}: evidence required for regulatory review.",
                recommended_artifacts=list(artifacts),
                mapping={
                    "truth_machine_placeholder": True,
                    "se_matrix_linkable": True,
                    "ectd_section": "",
                    "source_risk_code": rc,
                },
            ))

    # Sort: severity DESC (High > Medium > Low), category ASC, risk_code ASC
    _SEV_ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    tasks.sort(key=lambda t: (_SEV_ORDER.get(t.severity, 9), t.category, t.risk_code))
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
