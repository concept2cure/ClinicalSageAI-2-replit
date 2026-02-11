"""Canonical Risk Code Map — Phase 6.6.C (Source of Truth).

24 risk_code enums with their EvidenceCategory, recommended artifacts,
display labels, default severity, and canned discussion templates.

This is the ONE source of truth for risk-code-to-evidence mapping.
UI mirrors labels only — never invents categories.

Compliance:
  - Stable strings: never change once shipped
  - Deterministic: no LLM generation
  - Versioned: bump RISK_CODE_MAP_VERSION on any change

Usage:
    from shadow_service.scoring.risk_code_map import (
        RISK_CODE_TO_CATEGORY,
        RISK_CODE_TO_ARTIFACTS,
        RISK_CODE_LABELS,
        RISK_CODE_SEVERITY_DEFAULT,
        RISK_CODE_DISCUSSION_TEMPLATE,
        ALL_RISK_CODES,
        CANONICAL_ARTIFACTS,
    )
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from ..models_predicate import EvidenceCategory

# Map version — bump on any change to the map
RISK_CODE_MAP_VERSION = "2.0.0"


# ═══════════════════════════════════════════════════════════════════════════════
# Canonical Risk Codes (24 total — treat as enum, never change once shipped)
# ═══════════════════════════════════════════════════════════════════════════════

class RiskCode(str, Enum):
    """Canonical risk code enums for SE Matrix diff analysis."""

    # ── A. Intended Use / Indications ──
    IU_MISMATCH = "IU_MISMATCH"
    INDICATIONS_EXPANDED = "INDICATIONS_EXPANDED"

    # ── B. Technology / Design / Energy Source ──
    TECH_DIFFERENCE = "TECH_DIFFERENCE"
    ENERGY_SOURCE_CHANGE = "ENERGY_SOURCE_CHANGE"
    DESIGN_ARCH_CHANGE = "DESIGN_ARCH_CHANGE"

    # ── C. Materials / Bio / Contact ──
    MATERIAL_CHANGE = "MATERIAL_CHANGE"
    TISSUE_CONTACT_CHANGE = "TISSUE_CONTACT_CHANGE"
    CONTACT_DURATION_CHANGE = "CONTACT_DURATION_CHANGE"

    # ── D. Sterilization / Shelf-life / Packaging ──
    STERILIZATION_METHOD_CHANGE = "STERILIZATION_METHOD_CHANGE"
    PACKAGING_SYSTEM_CHANGE = "PACKAGING_SYSTEM_CHANGE"
    SHELF_LIFE_CHANGE = "SHELF_LIFE_CHANGE"

    # ── E. Software / Cyber / Interop ──
    SOFTWARE_PRESENT_NEW = "SOFTWARE_PRESENT_NEW"
    SOFTWARE_SAFETY_CLASS_DIFF = "SOFTWARE_SAFETY_CLASS_DIFF"
    CYBERSECURITY_SURFACE_INCREASED = "CYBERSECURITY_SURFACE_INCREASED"
    INTEROPERABILITY_CLAIM = "INTEROPERABILITY_CLAIM"
    ML_ADAPTIVITY = "ML_ADAPTIVITY"

    # ── F. Clinical / Performance ──
    PERFORMANCE_CLAIM_CHANGE = "PERFORMANCE_CLAIM_CHANGE"
    CLINICAL_EVIDENCE_GAP = "CLINICAL_EVIDENCE_GAP"
    HUMAN_FACTORS_CHANGE = "HUMAN_FACTORS_CHANGE"

    # ── G. Standards / Labeling / PMS ──
    STANDARDS_GAP = "STANDARDS_GAP"
    LABELING_IFU_GAP = "LABELING_IFU_GAP"
    PMS_SIGNAL_RISK = "PMS_SIGNAL_RISK"

    # ── H. Predicate Safety Lineage (from 6.6.A/6.6.B) ──
    PREDICATE_TOXICITY_HIGH = "PREDICATE_TOXICITY_HIGH"
    PREDICATE_LINEAGE_COMPROMISED = "PREDICATE_LINEAGE_COMPROMISED"


# Convenience set for validation
ALL_RISK_CODES: frozenset[str] = frozenset(rc.value for rc in RiskCode)


# ═══════════════════════════════════════════════════════════════════════════════
# Severity enum (locked)
# ═══════════════════════════════════════════════════════════════════════════════

class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


# ═══════════════════════════════════════════════════════════════════════════════
# Risk Code → Primary + Secondary EvidenceCategory (truth table §3)
# ═══════════════════════════════════════════════════════════════════════════════

RISK_CODE_TO_CATEGORY: dict[str, list[str]] = {
    # A. Intended Use / Indications
    RiskCode.IU_MISMATCH.value: [
        EvidenceCategory.CLINICAL_EVIDENCE.value,
        EvidenceCategory.LABELING_IFU.value,
    ],
    RiskCode.INDICATIONS_EXPANDED.value: [
        EvidenceCategory.CLINICAL_EVIDENCE.value,
    ],

    # B. Technology / Design / Energy Source
    RiskCode.TECH_DIFFERENCE.value: [
        EvidenceCategory.BENCH_TESTING.value,
        EvidenceCategory.RISK_MANAGEMENT.value,
    ],
    RiskCode.ENERGY_SOURCE_CHANGE.value: [
        EvidenceCategory.BENCH_TESTING.value,
        EvidenceCategory.RISK_MANAGEMENT.value,
    ],
    RiskCode.DESIGN_ARCH_CHANGE.value: [
        EvidenceCategory.BENCH_TESTING.value,
        EvidenceCategory.RISK_MANAGEMENT.value,
    ],

    # C. Materials / Bio / Contact
    RiskCode.MATERIAL_CHANGE.value: [
        EvidenceCategory.BIOCOMPATIBILITY.value,
    ],
    RiskCode.TISSUE_CONTACT_CHANGE.value: [
        EvidenceCategory.BIOCOMPATIBILITY.value,
        EvidenceCategory.RISK_MANAGEMENT.value,
    ],
    RiskCode.CONTACT_DURATION_CHANGE.value: [
        EvidenceCategory.BIOCOMPATIBILITY.value,
    ],

    # D. Sterilization / Shelf-life / Packaging
    RiskCode.STERILIZATION_METHOD_CHANGE.value: [
        EvidenceCategory.STERILIZATION_VALIDATION.value,
    ],
    RiskCode.PACKAGING_SYSTEM_CHANGE.value: [
        EvidenceCategory.STERILIZATION_VALIDATION.value,
        EvidenceCategory.BENCH_TESTING.value,
    ],
    RiskCode.SHELF_LIFE_CHANGE.value: [
        EvidenceCategory.BENCH_TESTING.value,
    ],

    # E. Software / Cyber / Interop
    RiskCode.SOFTWARE_PRESENT_NEW.value: [
        EvidenceCategory.SOFTWARE_LIFECYCLE.value,
        EvidenceCategory.CYBERSECURITY.value,
    ],
    RiskCode.SOFTWARE_SAFETY_CLASS_DIFF.value: [
        EvidenceCategory.SOFTWARE_LIFECYCLE.value,
    ],
    RiskCode.CYBERSECURITY_SURFACE_INCREASED.value: [
        EvidenceCategory.CYBERSECURITY.value,
    ],
    RiskCode.INTEROPERABILITY_CLAIM.value: [
        EvidenceCategory.BENCH_TESTING.value,
        EvidenceCategory.CYBERSECURITY.value,
    ],
    RiskCode.ML_ADAPTIVITY.value: [
        EvidenceCategory.SOFTWARE_LIFECYCLE.value,
        EvidenceCategory.RISK_MANAGEMENT.value,
    ],

    # F. Clinical / Performance
    RiskCode.PERFORMANCE_CLAIM_CHANGE.value: [
        EvidenceCategory.BENCH_TESTING.value,
        EvidenceCategory.CLINICAL_EVIDENCE.value,
    ],
    RiskCode.CLINICAL_EVIDENCE_GAP.value: [
        EvidenceCategory.CLINICAL_EVIDENCE.value,
    ],
    RiskCode.HUMAN_FACTORS_CHANGE.value: [
        EvidenceCategory.LABELING_IFU.value,
        EvidenceCategory.BENCH_TESTING.value,
    ],

    # G. Standards / Labeling / PMS
    RiskCode.STANDARDS_GAP.value: [
        EvidenceCategory.STANDARDS_CONFORMANCE.value,
    ],
    RiskCode.LABELING_IFU_GAP.value: [
        EvidenceCategory.LABELING_IFU.value,
    ],
    RiskCode.PMS_SIGNAL_RISK.value: [
        EvidenceCategory.POST_MARKET_SURVEILLANCE.value,
    ],

    # H. Predicate Safety Lineage
    RiskCode.PREDICATE_TOXICITY_HIGH.value: [
        EvidenceCategory.POST_MARKET_SURVEILLANCE.value,
    ],
    RiskCode.PREDICATE_LINEAGE_COMPROMISED.value: [
        EvidenceCategory.POST_MARKET_SURVEILLANCE.value,
        EvidenceCategory.RISK_MANAGEMENT.value,
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
# Risk Code → Recommended Artifacts (canonical list only — §3 truth table)
# ═══════════════════════════════════════════════════════════════════════════════

RISK_CODE_TO_ARTIFACTS: dict[str, list[str]] = {
    # A. Intended Use / Indications
    RiskCode.IU_MISMATCH.value: [
        "Clinical Rationale Memo",
        "IFU Draft",
        "Warnings / Precautions Update",
    ],
    RiskCode.INDICATIONS_EXPANDED.value: [
        "Clinical Rationale Memo",
        "Literature Review",
        "Clinical Bridging Analysis",
        "Clinical Protocol / Study Plan",
    ],

    # B. Technology / Design / Energy Source
    RiskCode.TECH_DIFFERENCE.value: [
        "Bench Test Protocol",
        "Bench Test Report",
        "ISO 14971 Risk Management Plan",
    ],
    RiskCode.ENERGY_SOURCE_CHANGE.value: [
        "Electrical Safety / EMC Report",
        "Bench Test Report",
        "FMEA / Hazard Analysis",
    ],
    RiskCode.DESIGN_ARCH_CHANGE.value: [
        "Bench Test Protocol",
        "Bench Test Report",
        "FMEA / Hazard Analysis",
    ],

    # C. Materials / Bio / Contact
    RiskCode.MATERIAL_CHANGE.value: [
        "ISO 10993-1 Biological Evaluation Plan",
        "Cytotoxicity/Sensitization/Irritation Summary",
        "Chemical Characterization Report",
    ],
    RiskCode.TISSUE_CONTACT_CHANGE.value: [
        "ISO 10993-1 Biological Evaluation Plan",
        "Residual Risk / Benefit-Risk Justification",
    ],
    RiskCode.CONTACT_DURATION_CHANGE.value: [
        "ISO 10993-1 Biological Evaluation Plan",
        "Cytotoxicity/Sensitization/Irritation Summary",
    ],

    # D. Sterilization / Shelf-life / Packaging
    RiskCode.STERILIZATION_METHOD_CHANGE.value: [
        "Sterilization Validation (SAL)",
        "EO Residuals Report",
    ],
    RiskCode.PACKAGING_SYSTEM_CHANGE.value: [
        "Packaging Integrity / Seal Strength",
        "Bench Test Report",
    ],
    RiskCode.SHELF_LIFE_CHANGE.value: [
        "Bench Test Protocol",
        "Bench Test Report",
        "Performance Verification Summary",
    ],

    # E. Software / Cyber / Interop
    RiskCode.SOFTWARE_PRESENT_NEW.value: [
        "IEC 62304 Software Development Plan",
        "SOUP List",
        "SBOM",
        "Threat Model",
    ],
    RiskCode.SOFTWARE_SAFETY_CLASS_DIFF.value: [
        "IEC 62304 Software Development Plan",
        "Verification & Validation Evidence",
    ],
    RiskCode.CYBERSECURITY_SURFACE_INCREASED.value: [
        "SBOM",
        "Vulnerability Assessment Summary",
        "Patch / Update Process",
    ],
    RiskCode.INTEROPERABILITY_CLAIM.value: [
        "Bench Test Report",
        "Performance Verification Summary",
        "Vulnerability Assessment Summary",
    ],
    RiskCode.ML_ADAPTIVITY.value: [
        "IEC 62304 Software Development Plan",
        "Verification & Validation Evidence",
        "ISO 14971 Risk Management Plan",
    ],

    # F. Clinical / Performance
    RiskCode.PERFORMANCE_CLAIM_CHANGE.value: [
        "Bench Test Protocol",
        "Bench Test Report",
        "Performance Verification Summary",
        "Clinical Bridging Analysis",
    ],
    RiskCode.CLINICAL_EVIDENCE_GAP.value: [
        "Clinical Protocol / Study Plan",
        "Clinical Rationale Memo",
        "Literature Review",
    ],
    RiskCode.HUMAN_FACTORS_CHANGE.value: [
        "Human Factors Validation Summary",
        "IFU Draft",
        "Warnings / Precautions Update",
    ],

    # G. Standards / Labeling / PMS
    RiskCode.STANDARDS_GAP.value: [
        "Standards Matrix",
        "Standards Gap Rationale",
        "Conformance Test Summary",
    ],
    RiskCode.LABELING_IFU_GAP.value: [
        "IFU Draft",
        "Warnings / Precautions Update",
    ],
    RiskCode.PMS_SIGNAL_RISK.value: [
        "CAPA Summary",
        "Complaint Trending",
        "PSUR / PMCF Trigger Memo",
    ],

    # H. Predicate Safety Lineage
    RiskCode.PREDICATE_TOXICITY_HIGH.value: [
        "Recall / Safety Signal Summary",
        "CAPA Summary",
    ],
    RiskCode.PREDICATE_LINEAGE_COMPROMISED.value: [
        "Recall / Safety Signal Summary",
        "ISO 14971 Risk Management Plan",
        "CAPA Summary",
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
# Risk Code → Human-Readable Labels (for UI display)
# ═══════════════════════════════════════════════════════════════════════════════

RISK_CODE_LABELS: dict[str, str] = {
    RiskCode.IU_MISMATCH.value: "Intended Use Mismatch",
    RiskCode.INDICATIONS_EXPANDED.value: "Expanded Indications",
    RiskCode.TECH_DIFFERENCE.value: "Technology Difference",
    RiskCode.ENERGY_SOURCE_CHANGE.value: "Energy Source Change",
    RiskCode.DESIGN_ARCH_CHANGE.value: "Design Architecture Change",
    RiskCode.MATERIAL_CHANGE.value: "Material Change",
    RiskCode.TISSUE_CONTACT_CHANGE.value: "Tissue Contact Change",
    RiskCode.CONTACT_DURATION_CHANGE.value: "Contact Duration Change",
    RiskCode.STERILIZATION_METHOD_CHANGE.value: "Sterilization Method Change",
    RiskCode.PACKAGING_SYSTEM_CHANGE.value: "Packaging System Change",
    RiskCode.SHELF_LIFE_CHANGE.value: "Shelf Life Change",
    RiskCode.SOFTWARE_PRESENT_NEW.value: "New Software Component",
    RiskCode.SOFTWARE_SAFETY_CLASS_DIFF.value: "Software Safety Class Difference",
    RiskCode.CYBERSECURITY_SURFACE_INCREASED.value: "Increased Cybersecurity Surface",
    RiskCode.INTEROPERABILITY_CLAIM.value: "New Interoperability Claim",
    RiskCode.ML_ADAPTIVITY.value: "ML/AI Adaptivity",
    RiskCode.PERFORMANCE_CLAIM_CHANGE.value: "Performance Claim Change",
    RiskCode.CLINICAL_EVIDENCE_GAP.value: "Clinical Evidence Gap",
    RiskCode.HUMAN_FACTORS_CHANGE.value: "Human Factors Change",
    RiskCode.STANDARDS_GAP.value: "Standards Conformance Gap",
    RiskCode.LABELING_IFU_GAP.value: "Labeling / IFU Gap",
    RiskCode.PMS_SIGNAL_RISK.value: "Post-Market Signal Risk",
    RiskCode.PREDICATE_TOXICITY_HIGH.value: "High Predicate Toxicity",
    RiskCode.PREDICATE_LINEAGE_COMPROMISED.value: "Compromised Predicate Lineage",
}


# ═══════════════════════════════════════════════════════════════════════════════
# Risk Code → Default Severity
# ═══════════════════════════════════════════════════════════════════════════════

RISK_CODE_SEVERITY_DEFAULT: dict[str, str] = {
    # A. Intended Use / Indications
    RiskCode.IU_MISMATCH.value: Severity.HIGH.value,
    RiskCode.INDICATIONS_EXPANDED.value: Severity.HIGH.value,

    # B. Technology / Design / Energy Source
    RiskCode.TECH_DIFFERENCE.value: Severity.MEDIUM.value,
    RiskCode.ENERGY_SOURCE_CHANGE.value: Severity.HIGH.value,
    RiskCode.DESIGN_ARCH_CHANGE.value: Severity.MEDIUM.value,

    # C. Materials / Bio / Contact
    RiskCode.MATERIAL_CHANGE.value: Severity.HIGH.value,
    RiskCode.TISSUE_CONTACT_CHANGE.value: Severity.HIGH.value,
    RiskCode.CONTACT_DURATION_CHANGE.value: Severity.MEDIUM.value,

    # D. Sterilization / Shelf-life / Packaging
    RiskCode.STERILIZATION_METHOD_CHANGE.value: Severity.MEDIUM.value,
    RiskCode.PACKAGING_SYSTEM_CHANGE.value: Severity.LOW.value,
    RiskCode.SHELF_LIFE_CHANGE.value: Severity.LOW.value,

    # E. Software / Cyber / Interop
    RiskCode.SOFTWARE_PRESENT_NEW.value: Severity.HIGH.value,
    RiskCode.SOFTWARE_SAFETY_CLASS_DIFF.value: Severity.MEDIUM.value,
    RiskCode.CYBERSECURITY_SURFACE_INCREASED.value: Severity.HIGH.value,
    RiskCode.INTEROPERABILITY_CLAIM.value: Severity.MEDIUM.value,
    RiskCode.ML_ADAPTIVITY.value: Severity.HIGH.value,

    # F. Clinical / Performance
    RiskCode.PERFORMANCE_CLAIM_CHANGE.value: Severity.MEDIUM.value,
    RiskCode.CLINICAL_EVIDENCE_GAP.value: Severity.HIGH.value,
    RiskCode.HUMAN_FACTORS_CHANGE.value: Severity.MEDIUM.value,

    # G. Standards / Labeling / PMS
    RiskCode.STANDARDS_GAP.value: Severity.MEDIUM.value,
    RiskCode.LABELING_IFU_GAP.value: Severity.LOW.value,
    RiskCode.PMS_SIGNAL_RISK.value: Severity.MEDIUM.value,

    # H. Predicate Safety Lineage
    RiskCode.PREDICATE_TOXICITY_HIGH.value: Severity.HIGH.value,
    RiskCode.PREDICATE_LINEAGE_COMPROMISED.value: Severity.HIGH.value,
}


# ═══════════════════════════════════════════════════════════════════════════════
# Risk Code → Canned Discussion Template (no LLM — per risk_code)
# ═══════════════════════════════════════════════════════════════════════════════

RISK_CODE_DISCUSSION_TEMPLATE: dict[str, str] = {
    RiskCode.IU_MISMATCH.value: (
        "Intended use misalignment increases regulatory risk; "
        "consider alternate predicate or clinical/bench bridging rationale."
    ),
    RiskCode.INDICATIONS_EXPANDED.value: (
        "Broader indications require clinical evidence supporting "
        "expanded patient population or use environment."
    ),
    RiskCode.TECH_DIFFERENCE.value: (
        "Core technology difference requires bench testing and risk analysis "
        "to demonstrate substantial equivalence."
    ),
    RiskCode.ENERGY_SOURCE_CHANGE.value: (
        "Energy source difference may change safety profile; provide "
        "verification/validation evidence and applicable standards testing."
    ),
    RiskCode.DESIGN_ARCH_CHANGE.value: (
        "Design architecture change requires verification/validation "
        "demonstrating equivalent performance and safety."
    ),
    RiskCode.MATERIAL_CHANGE.value: (
        "Material difference requires biocompatibility assessment per "
        "ISO 10993-1 and justification of equivalence."
    ),
    RiskCode.TISSUE_CONTACT_CHANGE.value: (
        "Change in tissue contact type requires updated biocompatibility "
        "evaluation per ISO 10993-1."
    ),
    RiskCode.CONTACT_DURATION_CHANGE.value: (
        "Change in contact duration category may require additional "
        "biocompatibility endpoints per ISO 10993-1."
    ),
    RiskCode.STERILIZATION_METHOD_CHANGE.value: (
        "Sterilization method change requires revalidation and review "
        "of residual/bioburden limits."
    ),
    RiskCode.PACKAGING_SYSTEM_CHANGE.value: (
        "Packaging system change requires integrity testing and "
        "may affect sterile barrier claims."
    ),
    RiskCode.SHELF_LIFE_CHANGE.value: (
        "New shelf-life claim requires accelerated and/or real-time "
        "aging study data."
    ),
    RiskCode.SOFTWARE_PRESENT_NEW.value: (
        "Subject introduces software not present in predicate; "
        "full IEC 62304 lifecycle documentation and cybersecurity review required."
    ),
    RiskCode.SOFTWARE_SAFETY_CLASS_DIFF.value: (
        "Software safety classification differs; provide classification "
        "justification and appropriate V&V evidence per IEC 62304."
    ),
    RiskCode.CYBERSECURITY_SURFACE_INCREASED.value: (
        "Increased network/cloud/mobile connectivity increases cybersecurity "
        "attack surface; provide SBOM, threat model, and vulnerability assessment."
    ),
    RiskCode.INTEROPERABILITY_CLAIM.value: (
        "New interoperability claims require interface testing "
        "and data integrity evidence."
    ),
    RiskCode.ML_ADAPTIVITY.value: (
        "ML/AI model adaptivity requires predetermined change control plan "
        "(PCCP) and performance monitoring evidence."
    ),
    RiskCode.PERFORMANCE_CLAIM_CHANGE.value: (
        "Performance claim changes require bench testing with defined "
        "acceptance criteria and may require clinical bridging."
    ),
    RiskCode.CLINICAL_EVIDENCE_GAP.value: (
        "Bench data alone may not support claim differences; clinical "
        "evidence or literature review likely needed."
    ),
    RiskCode.HUMAN_FACTORS_CHANGE.value: (
        "Changes to user interface or workflow require human factors "
        "validation and updated IFU."
    ),
    RiskCode.STANDARDS_GAP.value: (
        "No recognized consensus standard covers the identified differences; "
        "provide rationale or alternative test evidence."
    ),
    RiskCode.LABELING_IFU_GAP.value: (
        "Labeling or IFU requires updates to reflect device differences, "
        "warnings, or contraindications."
    ),
    RiskCode.PMS_SIGNAL_RISK.value: (
        "Post-market signals suggest heightened scrutiny; provide "
        "complaint trending and CAPA documentation."
    ),
    RiskCode.PREDICATE_TOXICITY_HIGH.value: (
        "Predicate has elevated safety signals; provide risk justification "
        "or consider alternate predicate."
    ),
    RiskCode.PREDICATE_LINEAGE_COMPROMISED.value: (
        "Predicate family tree shows safety concerns; document risk controls "
        "and consider alternate lineage."
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
# Diff flag upgrade set — these risk_codes can produce SIGNIFICANT flag
# Per spec: "Upgrade to SIGNIFICANT only for these codes"
# ═══════════════════════════════════════════════════════════════════════════════

SIGNIFICANT_RISK_CODES: frozenset[str] = frozenset({
    RiskCode.ENERGY_SOURCE_CHANGE.value,
    RiskCode.IU_MISMATCH.value,
    RiskCode.TECH_DIFFERENCE.value,
    RiskCode.PREDICATE_TOXICITY_HIGH.value,
})


# ═══════════════════════════════════════════════════════════════════════════════
# Canonical Artifacts List (finite — §4, don't add casually, version changes)
# ═══════════════════════════════════════════════════════════════════════════════

CANONICAL_ARTIFACTS: dict[str, list[str]] = {
    EvidenceCategory.BENCH_TESTING.value: [
        "Bench Test Protocol",
        "Bench Test Report",
        "Electrical Safety / EMC Report",
        "Performance Verification Summary",
    ],
    EvidenceCategory.BIOCOMPATIBILITY.value: [
        "ISO 10993-1 Biological Evaluation Plan",
        "Chemical Characterization Report",
        "Cytotoxicity/Sensitization/Irritation Summary",
    ],
    EvidenceCategory.RISK_MANAGEMENT.value: [
        "ISO 14971 Risk Management Plan",
        "FMEA / Hazard Analysis",
        "Residual Risk / Benefit-Risk Justification",
    ],
    EvidenceCategory.SOFTWARE_LIFECYCLE.value: [
        "IEC 62304 Software Development Plan",
        "SOUP List",
        "Verification & Validation Evidence",
    ],
    EvidenceCategory.CYBERSECURITY.value: [
        "SBOM",
        "Threat Model",
        "Vulnerability Assessment Summary",
        "Patch / Update Process",
    ],
    EvidenceCategory.STERILIZATION_VALIDATION.value: [
        "Sterilization Validation (SAL)",
        "EO Residuals Report",
        "Packaging Integrity / Seal Strength",
    ],
    EvidenceCategory.CLINICAL_EVIDENCE.value: [
        "Clinical Rationale Memo",
        "Literature Review",
        "Clinical Bridging Analysis",
        "Clinical Protocol / Study Plan",
    ],
    EvidenceCategory.LABELING_IFU.value: [
        "IFU Draft",
        "Warnings / Precautions Update",
        "Human Factors Validation Summary",
    ],
    EvidenceCategory.STANDARDS_CONFORMANCE.value: [
        "Standards Matrix",
        "Standards Gap Rationale",
        "Conformance Test Summary",
    ],
    EvidenceCategory.POST_MARKET_SURVEILLANCE.value: [
        "Recall / Safety Signal Summary",
        "Complaint Trending",
        "CAPA Summary",
        "PSUR / PMCF Trigger Memo",
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
# SE category → risk code mapping (for the 9 default SE rows)
# ═══════════════════════════════════════════════════════════════════════════════

SE_CATEGORY_RISK_CODE_MAP: dict[str, str] = {
    "intended_use": RiskCode.IU_MISMATCH.value,
    "technology": RiskCode.TECH_DIFFERENCE.value,
    "materials": RiskCode.MATERIAL_CHANGE.value,
    "material": RiskCode.MATERIAL_CHANGE.value,
    "energy_source": RiskCode.ENERGY_SOURCE_CHANGE.value,
    "energy": RiskCode.ENERGY_SOURCE_CHANGE.value,
    "biocompatibility": RiskCode.TISSUE_CONTACT_CHANGE.value,
    "sterilization": RiskCode.STERILIZATION_METHOD_CHANGE.value,
    "software": RiskCode.SOFTWARE_PRESENT_NEW.value,
    "performance": RiskCode.PERFORMANCE_CLAIM_CHANGE.value,
    "general": RiskCode.LABELING_IFU_GAP.value,
    "design": RiskCode.DESIGN_ARCH_CHANGE.value,
}


# ═══════════════════════════════════════════════════════════════════════════════
# Validation helpers
# ═══════════════════════════════════════════════════════════════════════════════

def validate_risk_code(code: str) -> bool:
    """Check if a risk_code is in the canonical set."""
    return code in ALL_RISK_CODES


def get_categories_for_risk_code(code: str) -> list[str]:
    """Get the EvidenceCategory list for a given risk_code."""
    return RISK_CODE_TO_CATEGORY.get(code, [])


def get_artifacts_for_risk_code(code: str) -> list[str]:
    """Get the recommended artifacts list for a given risk_code."""
    return RISK_CODE_TO_ARTIFACTS.get(code, [])


def get_severity_for_risk_code(code: str) -> str:
    """Get the default severity for a given risk_code."""
    return RISK_CODE_SEVERITY_DEFAULT.get(code, Severity.MEDIUM.value)


def get_label_for_risk_code(code: str) -> str:
    """Get the human-readable label for a risk_code."""
    return RISK_CODE_LABELS.get(code, code)


def get_discussion_template(code: str) -> str:
    """Get the canned discussion template for a risk_code."""
    return RISK_CODE_DISCUSSION_TEMPLATE.get(code, "")
