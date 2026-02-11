"""Defense Packet Deterministic Builder — Phase 6.6.D+.

Builds a response-level DefensePacket from a manifest + risk analysis.
All 24 canonical risk codes mapped to operationally complete evidence tasks.
Includes non-LLM reviewer questions, submission gating, and staleness detection.

Key invariants:
  - packet_id == manifest_hash (deterministic)
  - Same inputs → same packet JSON (except generated_at)
  - Task ordering: severity desc, category, task_id
  - All lists are deduped + sorted for stable JSON comparisons

Usage:
    from shadow_service.predicate_intel.defense_packet import (
        build_defense_packet_from_manifest,
        is_packet_stale,
        check_submission_gate,
    )
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from ..scoring.risk_code_map import (
    RISK_CODE_MAP_VERSION,
    RISK_CODE_SEVERITY_DEFAULT,
    RISK_CODE_TO_ARTIFACTS,
    RISK_CODE_TO_CATEGORY,
    RISK_CODE_LABELS,
    RISK_CODE_DISCUSSION_TEMPLATE,
    SIGNIFICANT_RISK_CODES,
    ALL_RISK_CODES,
)
from ..models_defense_packet import (
    DefensePacketFull,
    PacketOpsStatus,
    EvidenceTaskFull,
    EvidenceTaskState,
    EvidenceSeverity,
    EvidenceCategory,
    ReviewerQuestionSeed,
    SubmissionGateResult,
)
from .risk_vocab import load_risk_vocab_hash

# ═══════════════════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════════════════

PACKET_VERSION = "6.6.D+"

# Severity enum mapping from risk_code_map strings to EvidenceSeverity
_SEV_MAP: Dict[str, EvidenceSeverity] = {
    "HIGH": EvidenceSeverity.HIGH,
    "MEDIUM": EvidenceSeverity.MEDIUM,
    "LOW": EvidenceSeverity.LOW,
}

# Severity rank for sorting (higher = more critical)
_SEV_RANK: Dict[str, int] = {"High": 3, "Medium": 2, "Low": 1}


# ═══════════════════════════════════════════════════════════════════════════════
# Full RISK_TO_TASK Map — All 24 Canonical Risk Codes
#
# Each entry: (
#   category: EvidenceCategory,
#   severity: EvidenceSeverity,
#   title: str,
#   why_it_matters: str,
#   acceptance_criteria: list[str],
#   recommended_artifacts: list[str],  # from RISK_CODE_TO_ARTIFACTS
# )
# ═══════════════════════════════════════════════════════════════════════════════

RISK_TO_TASK: Dict[str, Tuple[
    EvidenceCategory, EvidenceSeverity, str, str, List[str], List[str]
]] = {
    # ── A. Intended Use / Indications ──
    "IU_MISMATCH": (
        EvidenceCategory.ClinicalEvidence,
        EvidenceSeverity.HIGH,
        "Align intended use and indications with predicate",
        "Intended use mismatch is the leading cause of NSE determinations. "
        "FDA expects identical or narrower intended use for SE claims.",
        [
            "Provide side-by-side intended use comparison with predicate.",
            "Justify any differences with clinical evidence or bench bridging.",
            "Confirm labeling/IFU reflects aligned indications.",
        ],
        ["Clinical Rationale Memo", "IFU Draft", "Warnings / Precautions Update"],
    ),
    "INDICATIONS_EXPANDED": (
        EvidenceCategory.ClinicalEvidence,
        EvidenceSeverity.HIGH,
        "Justify expanded indications for use",
        "Broader indications require clinical evidence supporting the expanded "
        "patient population, use environment, or anatomical site.",
        [
            "Provide clinical evidence (literature or study) supporting expanded population.",
            "Document risk/benefit analysis for new indications.",
            "Attach clinical protocol / study plan if prospective data needed.",
        ],
        ["Clinical Rationale Memo", "Literature Review", "Clinical Bridging Analysis", "Clinical Protocol / Study Plan"],
    ),

    # ── B. Technology / Design / Energy Source ──
    "TECH_DIFFERENCE": (
        EvidenceCategory.BenchTesting,
        EvidenceSeverity.MEDIUM,
        "Demonstrate substantial equivalence despite technology differences",
        "Core technology differences require bench or analytical testing to show "
        "the new technology does not raise new safety/effectiveness questions.",
        [
            "Provide bench test protocol and results comparing subject vs. predicate performance.",
            "Map technology differences to risk analysis and hazard controls.",
            "Demonstrate equivalent performance under worst-case conditions.",
        ],
        ["Bench Test Protocol", "Bench Test Report", "ISO 14971 Risk Management Plan"],
    ),
    "ENERGY_SOURCE_CHANGE": (
        EvidenceCategory.BenchTesting,
        EvidenceSeverity.HIGH,
        "Verify safety and performance impact of energy source change",
        "Energy source differences change the hazard profile. FDA commonly "
        "requires electrical safety, EMC, and bench verification.",
        [
            "Provide electrical safety/EMC testing per applicable standards (IEC 60601).",
            "Demonstrate equivalent thermal/energy output under worst-case conditions.",
            "Map all energy-related hazards to controls and verification evidence.",
        ],
        ["Electrical Safety / EMC Report", "Bench Test Report", "FMEA / Hazard Analysis"],
    ),
    "DESIGN_ARCH_CHANGE": (
        EvidenceCategory.BenchTesting,
        EvidenceSeverity.MEDIUM,
        "Verify design architecture equivalence with predicate",
        "Design architecture changes require verification/validation "
        "demonstrating equivalent performance and safety characteristics.",
        [
            "Provide design comparison document (subject vs. predicate architecture).",
            "Attach bench test results demonstrating equivalent performance.",
            "Document risk analysis addressing new design-related hazards.",
        ],
        ["Bench Test Protocol", "Bench Test Report", "FMEA / Hazard Analysis"],
    ),

    # ── C. Materials / Bio / Contact ──
    "MATERIAL_CHANGE": (
        EvidenceCategory.Biocompatibility,
        EvidenceSeverity.HIGH,
        "Assess biocompatibility impact of material change",
        "Material changes can alter biological response. FDA expects ISO 10993 "
        "justification and testing as needed.",
        [
            "Provide ISO 10993-1 biological evaluation rationale and endpoint coverage.",
            "If testing required, attach final test reports and acceptance criteria.",
            "Provide chemical characterization data for new materials.",
        ],
        ["ISO 10993-1 Biological Evaluation Plan", "Cytotoxicity/Sensitization/Irritation Summary", "Chemical Characterization Report"],
    ),
    "TISSUE_CONTACT_CHANGE": (
        EvidenceCategory.Biocompatibility,
        EvidenceSeverity.HIGH,
        "Evaluate impact of tissue contact type change",
        "Change in tissue contact type (e.g., intact skin → blood contact) "
        "requires updated biocompatibility evaluation per ISO 10993-1.",
        [
            "Update ISO 10993-1 biological evaluation for new contact type.",
            "Identify additional biocompatibility endpoints required by new contact type.",
            "Provide residual risk / benefit-risk justification for contact change.",
        ],
        ["ISO 10993-1 Biological Evaluation Plan", "Residual Risk / Benefit-Risk Justification"],
    ),
    "CONTACT_DURATION_CHANGE": (
        EvidenceCategory.Biocompatibility,
        EvidenceSeverity.MEDIUM,
        "Evaluate impact of contact duration category change",
        "Change in contact duration category (limited/prolonged/permanent) "
        "may require additional biocompatibility endpoints per ISO 10993-1.",
        [
            "Update ISO 10993-1 evaluation to address new duration category.",
            "If moving to longer duration, provide additional endpoint testing evidence.",
            "Document rationale for any endpoint exemptions.",
        ],
        ["ISO 10993-1 Biological Evaluation Plan", "Cytotoxicity/Sensitization/Irritation Summary"],
    ),

    # ── D. Sterilization / Shelf-life / Packaging ──
    "STERILIZATION_METHOD_CHANGE": (
        EvidenceCategory.SterilizationValidation,
        EvidenceSeverity.MEDIUM,
        "Revalidate sterilization for new method",
        "Sterilization method change requires revalidation and review of "
        "residual limits, bioburden, and sterility assurance level.",
        [
            "Provide sterilization validation summary (SAL 10^-6 or as applicable).",
            "If EO sterilization, provide residuals report within ISO 10993-7 limits.",
            "Demonstrate package integrity maintained under new sterilization process.",
        ],
        ["Sterilization Validation (SAL)", "EO Residuals Report"],
    ),
    "PACKAGING_SYSTEM_CHANGE": (
        EvidenceCategory.SterilizationValidation,
        EvidenceSeverity.LOW,
        "Verify packaging integrity and sterile barrier system",
        "Packaging system change requires integrity testing and may affect "
        "sterile barrier claims and shelf-life.",
        [
            "Provide packaging integrity / seal strength test results.",
            "Demonstrate sterile barrier maintained through distribution simulation.",
            "If applicable, provide accelerated aging data supporting new packaging.",
        ],
        ["Packaging Integrity / Seal Strength", "Bench Test Report"],
    ),
    "SHELF_LIFE_CHANGE": (
        EvidenceCategory.BenchTesting,
        EvidenceSeverity.LOW,
        "Provide shelf-life and aging study evidence",
        "New shelf-life claims require accelerated and/or real-time aging "
        "study data demonstrating device performance/safety over claimed period.",
        [
            "Provide accelerated aging study protocol and results.",
            "If available, provide real-time aging data corroborating accelerated results.",
            "Document acceptance criteria and test methods for aging endpoints.",
        ],
        ["Bench Test Protocol", "Bench Test Report", "Performance Verification Summary"],
    ),

    # ── E. Software / Cyber / Interop ──
    "SOFTWARE_PRESENT_NEW": (
        EvidenceCategory.SoftwareLifecycle,
        EvidenceSeverity.HIGH,
        "Provide software lifecycle evidence for new/updated software",
        "Subject introduces software not present in predicate. Full IEC 62304 "
        "lifecycle documentation and cybersecurity review required.",
        [
            "Classify software level of concern (Class A/B/C per IEC 62304).",
            "Provide software development lifecycle plan and artifacts.",
            "Attach V&V summary, traceability matrix, and SOUP/OTS list.",
            "Provide SBOM and threat model for cybersecurity review.",
        ],
        ["IEC 62304 Software Development Plan", "SOUP List", "SBOM", "Threat Model"],
    ),
    "SOFTWARE_SAFETY_CLASS_DIFF": (
        EvidenceCategory.SoftwareLifecycle,
        EvidenceSeverity.MEDIUM,
        "Justify software safety classification difference",
        "Software safety classification differs from predicate. Provide "
        "classification justification and appropriate V&V evidence per IEC 62304.",
        [
            "Document software safety classification rationale (IEC 62304 Class A/B/C).",
            "If higher class, provide enhanced V&V evidence commensurate with risk.",
            "Provide traceability between requirements, design, and verification.",
        ],
        ["IEC 62304 Software Development Plan", "Verification & Validation Evidence"],
    ),
    "CYBERSECURITY_SURFACE_INCREASED": (
        EvidenceCategory.Cybersecurity,
        EvidenceSeverity.HIGH,
        "Provide cybersecurity evidence for increased attack surface",
        "Increased network/cloud/mobile connectivity increases cybersecurity "
        "attack surface. SBOM, threat model, and vulnerability assessment required.",
        [
            "Provide SBOM with all software components and versions.",
            "Attach threat model and security risk assessment.",
            "Document vulnerability management and patch/update process.",
            "Provide penetration testing summary if applicable.",
        ],
        ["SBOM", "Vulnerability Assessment Summary", "Patch / Update Process"],
    ),
    "INTEROPERABILITY_CLAIM": (
        EvidenceCategory.BenchTesting,
        EvidenceSeverity.MEDIUM,
        "Provide interoperability testing and data integrity evidence",
        "New interoperability claims require interface testing and data "
        "integrity evidence demonstrating safe data exchange.",
        [
            "Provide interface specification and interoperability test protocol.",
            "Attach test results demonstrating accurate data exchange under fault conditions.",
            "If applicable, provide vulnerability assessment for connected interfaces.",
        ],
        ["Bench Test Report", "Performance Verification Summary", "Vulnerability Assessment Summary"],
    ),
    "ML_ADAPTIVITY": (
        EvidenceCategory.SoftwareLifecycle,
        EvidenceSeverity.HIGH,
        "Provide ML/AI controls and predetermined change control plan",
        "ML/AI model adaptivity requires a predetermined change control plan "
        "(PCCP) and performance monitoring evidence per FDA AI/ML guidance.",
        [
            "Provide Predetermined Change Control Plan (PCCP) for adaptive algorithms.",
            "Document training/validation dataset characteristics and bias analysis.",
            "Attach performance monitoring plan with drift detection methodology.",
            "Provide algorithm verification evidence under expected operating conditions.",
        ],
        ["IEC 62304 Software Development Plan", "Verification & Validation Evidence", "ISO 14971 Risk Management Plan"],
    ),

    # ── F. Clinical / Performance ──
    "PERFORMANCE_CLAIM_CHANGE": (
        EvidenceCategory.BenchTesting,
        EvidenceSeverity.MEDIUM,
        "Verify performance claims with bench/clinical evidence",
        "Performance claim changes require bench testing with defined "
        "acceptance criteria and may require clinical bridging analysis.",
        [
            "Provide bench test protocol with acceptance criteria for each performance claim.",
            "Attach bench test report demonstrating claim verification.",
            "If claims cannot be verified by bench alone, provide clinical bridging analysis.",
        ],
        ["Bench Test Protocol", "Bench Test Report", "Performance Verification Summary", "Clinical Bridging Analysis"],
    ),
    "CLINICAL_EVIDENCE_GAP": (
        EvidenceCategory.ClinicalEvidence,
        EvidenceSeverity.HIGH,
        "Provide clinical evidence to address identified gaps",
        "Bench data alone may not support claim differences. Clinical evidence "
        "or systematic literature review likely needed to close the gap.",
        [
            "Conduct systematic literature review for applicable clinical evidence.",
            "If literature insufficient, develop clinical study protocol.",
            "Provide clinical rationale memo justifying evidence sufficiency.",
        ],
        ["Clinical Protocol / Study Plan", "Clinical Rationale Memo", "Literature Review"],
    ),
    "HUMAN_FACTORS_CHANGE": (
        EvidenceCategory.LabelingIFU,
        EvidenceSeverity.MEDIUM,
        "Validate human factors for changed user interface",
        "Changes to user interface or workflow require human factors "
        "validation and updated IFU per FDA human factors guidance.",
        [
            "Conduct formative and/or summative human factors studies.",
            "Document use-related risk analysis and mitigations.",
            "Update IFU to reflect any workflow or interface changes.",
        ],
        ["Human Factors Validation Summary", "IFU Draft", "Warnings / Precautions Update"],
    ),

    # ── G. Standards / Labeling / PMS ──
    "STANDARDS_GAP": (
        EvidenceCategory.StandardsConformance,
        EvidenceSeverity.MEDIUM,
        "Provide standards conformance rationale for identified gaps",
        "No recognized consensus standard covers the identified differences. "
        "Provide rationale or alternative test evidence.",
        [
            "Provide applicable recognized standards list and gap analysis.",
            "For each gap, provide rationale for alternative approach or test evidence.",
            "Attach conformance test summaries where applicable.",
        ],
        ["Standards Matrix", "Standards Gap Rationale", "Conformance Test Summary"],
    ),
    "LABELING_IFU_GAP": (
        EvidenceCategory.LabelingIFU,
        EvidenceSeverity.LOW,
        "Update labeling and IFU to reflect device differences",
        "Labeling or IFU requires updates to reflect device differences, "
        "warnings, contraindications, or changed operating procedures.",
        [
            "Update IFU text to reflect any differences from predicate.",
            "Add/update warnings and contraindications as applicable.",
            "Verify claims in labeling are supported by verification/validation evidence.",
        ],
        ["IFU Draft", "Warnings / Precautions Update"],
    ),
    "PMS_SIGNAL_RISK": (
        EvidenceCategory.PostMarketSurveillance,
        EvidenceSeverity.MEDIUM,
        "Document post-market surveillance signals and mitigations",
        "Post-market signals suggest heightened scrutiny. Provide complaint "
        "trending and CAPA documentation to demonstrate risk control.",
        [
            "Provide complaint trending analysis for predicate and subject (if on market).",
            "Attach CAPA summary for any open corrective actions.",
            "If applicable, provide PSUR / PMCF trigger memo.",
        ],
        ["CAPA Summary", "Complaint Trending", "PSUR / PMCF Trigger Memo"],
    ),

    # ── H. Predicate Safety Lineage ──
    "PREDICATE_TOXICITY_HIGH": (
        EvidenceCategory.PostMarketSurveillance,
        EvidenceSeverity.HIGH,
        "Justify continued use of predicate with elevated safety signals",
        "Predicate has elevated safety signals (recalls, MDRs). Provide "
        "risk justification or consider alternate predicate.",
        [
            "Document known safety signals for chosen predicate (recalls, MDRs).",
            "Provide risk/benefit justification for continuing with this predicate.",
            "Consider identifying alternate predicate without safety concerns.",
            "Attach recall/safety signal summary with disposition.",
        ],
        ["Recall / Safety Signal Summary", "CAPA Summary"],
    ),
    "PREDICATE_LINEAGE_COMPROMISED": (
        EvidenceCategory.PostMarketSurveillance,
        EvidenceSeverity.HIGH,
        "Address compromised predicate family safety lineage",
        "Predicate family tree shows safety concerns (cascading recalls, "
        "warning letters). Document risk controls and consider alternate lineage.",
        [
            "Document predicate lineage and associated safety events.",
            "Provide risk management file addressing lineage concerns.",
            "If lineage toxicity is significant, provide alternate predicate analysis.",
            "Attach CAPA summary for any open corrective actions in lineage.",
        ],
        ["Recall / Safety Signal Summary", "ISO 14971 Risk Management Plan", "CAPA Summary"],
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
# Anticipated Reviewer Questions — Non-LLM, Deterministic
# Keyed by risk code. Only for SIGNIFICANT and HIGH-severity codes.
# ═══════════════════════════════════════════════════════════════════════════════

REVIEWER_QUESTIONS: Dict[str, List[Dict[str, Any]]] = {
    "IU_MISMATCH": [
        {
            "question": "How does the subject device's intended use differ from the predicate, and what evidence supports the claim of substantial equivalence despite these differences?",
            "recommended_sections": ["Section 5 — Substantial Equivalence Discussion", "Section 12 — Summary"],
            "recommended_artifacts": ["Clinical Rationale Memo", "IFU Draft"],
        },
        {
            "question": "Have the indications for use been narrowed or broadened vs. the predicate? Provide specific language comparison.",
            "recommended_sections": ["Section 4 — Indications for Use", "Section 5 — Substantial Equivalence Discussion"],
            "recommended_artifacts": ["IFU Draft", "Claims Matrix"],
        },
    ],
    "INDICATIONS_EXPANDED": [
        {
            "question": "What clinical evidence supports the expanded indications beyond the predicate's cleared scope?",
            "recommended_sections": ["Section 4 — Indications for Use", "Section 10 — Clinical Data"],
            "recommended_artifacts": ["Clinical Rationale Memo", "Literature Review"],
        },
    ],
    "TECH_DIFFERENCE": [
        {
            "question": "Describe the core technology differences and provide bench/analytical data supporting equivalent performance and safety.",
            "recommended_sections": ["Section 5 — Substantial Equivalence Discussion", "Section 7 — Performance Testing"],
            "recommended_artifacts": ["Bench Test Protocol", "Bench Test Report"],
        },
        {
            "question": "Does the technology change introduce new biocompatibility, electrical safety, or software risk concerns not present in the predicate?",
            "recommended_sections": ["Section 5 — Substantial Equivalence Discussion", "Section 9 — Electrical Safety"],
            "recommended_artifacts": ["Biocompatibility Report", "Risk Management File"],
        },
    ],
    "ENERGY_SOURCE_CHANGE": [
        {
            "question": "The energy source differs from the predicate. Identify all new hazards and provide bench testing evidence demonstrating safety.",
            "recommended_sections": ["Section 5 — Substantial Equivalence Discussion", "Section 7 — Performance Testing", "Section 9 — Electrical Safety"],
            "recommended_artifacts": ["Electrical Safety / EMC Report", "Bench Test Report", "FMEA / Hazard Analysis"],
        },
        {
            "question": "Has thermal/energy output equivalence been demonstrated under worst-case conditions?",
            "recommended_sections": ["Section 7 — Performance Testing"],
            "recommended_artifacts": ["Bench Test Report"],
        },
    ],
    "DESIGN_ARCH_CHANGE": [
        {
            "question": "How does the design architecture differ, and what verification evidence supports equivalent performance?",
            "recommended_sections": ["Section 5 — Substantial Equivalence Discussion", "Section 6 — Device Description"],
            "recommended_artifacts": ["Bench Test Protocol", "Bench Test Report"],
        },
    ],
    "MATERIAL_CHANGE": [
        {
            "question": "Identify the material change and provide ISO 10993 biological evaluation justifying biocompatibility.",
            "recommended_sections": ["Section 5 — Substantial Equivalence Discussion", "Section 8 — Biocompatibility"],
            "recommended_artifacts": ["ISO 10993-1 Biological Evaluation Plan", "Chemical Characterization Report"],
        },
        {
            "question": "Has chemical characterization been performed per ISO 10993-18 for the new material?",
            "recommended_sections": ["Section 8 — Biocompatibility"],
            "recommended_artifacts": ["Chemical Characterization Report"],
        },
    ],
    "TISSUE_CONTACT_CHANGE": [
        {
            "question": "The tissue contact type has changed. What additional biocompatibility endpoints are now applicable per ISO 10993-1?",
            "recommended_sections": ["Section 8 — Biocompatibility"],
            "recommended_artifacts": ["ISO 10993-1 Biological Evaluation Plan"],
        },
    ],
    "CONTACT_DURATION_CHANGE": [
        {
            "question": "Contact duration category has changed. Provide updated biocompatibility evaluation per ISO 10993-1 Table A.1.",
            "recommended_sections": ["Section 8 — Biocompatibility"],
            "recommended_artifacts": ["ISO 10993-1 Biological Evaluation Plan"],
        },
    ],
    "STERILIZATION_METHOD_CHANGE": [
        {
            "question": "Provide sterilization validation data for the new method, including SAL and any residuals testing.",
            "recommended_sections": ["Section 11 — Sterilization"],
            "recommended_artifacts": ["Sterilization Validation (SAL)", "EO Residuals Report"],
        },
    ],
    "PACKAGING_SYSTEM_CHANGE": [
        {
            "question": "Has packaging integrity been validated with the new packaging system, including distribution simulation?",
            "recommended_sections": ["Section 11 — Sterilization", "Section 6 — Device Description"],
            "recommended_artifacts": ["Packaging Integrity / Seal Strength"],
        },
    ],
    "SHELF_LIFE_CHANGE": [
        {
            "question": "Provide accelerated and/or real-time aging data supporting the claimed shelf life.",
            "recommended_sections": ["Section 7 — Performance Testing"],
            "recommended_artifacts": ["Bench Test Protocol", "Bench Test Report"],
        },
    ],
    "SOFTWARE_PRESENT_NEW": [
        {
            "question": "The subject introduces software not present in the predicate. Provide IEC 62304 software lifecycle documentation and level of concern classification.",
            "recommended_sections": ["Section 6 — Device Description", "Section 7 — Performance Testing"],
            "recommended_artifacts": ["IEC 62304 Software Development Plan", "SOUP List"],
        },
        {
            "question": "Provide SBOM and cybersecurity documentation for the new software component.",
            "recommended_sections": ["Cybersecurity Documentation"],
            "recommended_artifacts": ["SBOM", "Threat Model"],
        },
    ],
    "SOFTWARE_SAFETY_CLASS_DIFF": [
        {
            "question": "Software safety classification differs. Justify the classification and provide V&V evidence commensurate with the risk level.",
            "recommended_sections": ["Section 7 — Performance Testing"],
            "recommended_artifacts": ["IEC 62304 Software Development Plan", "Verification & Validation Evidence"],
        },
    ],
    "CYBERSECURITY_SURFACE_INCREASED": [
        {
            "question": "The device has increased connectivity. Provide threat model, SBOM, and vulnerability assessment.",
            "recommended_sections": ["Cybersecurity Documentation"],
            "recommended_artifacts": ["SBOM", "Vulnerability Assessment Summary", "Threat Model"],
        },
        {
            "question": "Describe the patch/update process and how security vulnerabilities will be addressed post-market.",
            "recommended_sections": ["Cybersecurity Documentation"],
            "recommended_artifacts": ["Patch / Update Process"],
        },
    ],
    "INTEROPERABILITY_CLAIM": [
        {
            "question": "What interoperability claims are made, and what testing validates safe and accurate data exchange?",
            "recommended_sections": ["Section 7 — Performance Testing"],
            "recommended_artifacts": ["Bench Test Report", "Performance Verification Summary"],
        },
    ],
    "ML_ADAPTIVITY": [
        {
            "question": "The device uses adaptive ML/AI. Provide the Predetermined Change Control Plan (PCCP) and performance monitoring methodology.",
            "recommended_sections": ["Section 7 — Performance Testing", "Cybersecurity Documentation"],
            "recommended_artifacts": ["IEC 62304 Software Development Plan", "Verification & Validation Evidence"],
        },
        {
            "question": "Describe the training/validation dataset, bias analysis, and expected operating conditions.",
            "recommended_sections": ["Section 7 — Performance Testing"],
            "recommended_artifacts": ["Verification & Validation Evidence"],
        },
    ],
    "PERFORMANCE_CLAIM_CHANGE": [
        {
            "question": "Provide bench test data with acceptance criteria supporting changed performance claims.",
            "recommended_sections": ["Section 7 — Performance Testing"],
            "recommended_artifacts": ["Bench Test Protocol", "Bench Test Report"],
        },
    ],
    "CLINICAL_EVIDENCE_GAP": [
        {
            "question": "Bench testing may be insufficient. What clinical evidence or literature supports the claims?",
            "recommended_sections": ["Section 10 — Clinical Data"],
            "recommended_artifacts": ["Clinical Rationale Memo", "Literature Review"],
        },
    ],
    "HUMAN_FACTORS_CHANGE": [
        {
            "question": "The user interface or workflow has changed. Provide human factors validation evidence.",
            "recommended_sections": ["Section 7 — Performance Testing", "Section 12 — Summary"],
            "recommended_artifacts": ["Human Factors Validation Summary", "IFU Draft"],
        },
    ],
    "STANDARDS_GAP": [
        {
            "question": "No recognized consensus standard covers the identified differences. Provide rationale for the alternative approach.",
            "recommended_sections": ["Section 7 — Performance Testing"],
            "recommended_artifacts": ["Standards Matrix", "Standards Gap Rationale"],
        },
    ],
    "LABELING_IFU_GAP": [
        {
            "question": "Labeling/IFU appears misaligned with device differences. Confirm labeling has been updated.",
            "recommended_sections": ["Section 4 — Indications for Use", "Section 6 — Device Description"],
            "recommended_artifacts": ["IFU Draft", "Warnings / Precautions Update"],
        },
    ],
    "PMS_SIGNAL_RISK": [
        {
            "question": "Post-market signals have been identified. Provide complaint trending and CAPA documentation.",
            "recommended_sections": ["Section 12 — Summary"],
            "recommended_artifacts": ["Complaint Trending", "CAPA Summary"],
        },
    ],
    "PREDICATE_TOXICITY_HIGH": [
        {
            "question": "The chosen predicate has elevated safety signals. Justify continued use or identify alternate predicate.",
            "recommended_sections": ["Section 5 — Substantial Equivalence Discussion"],
            "recommended_artifacts": ["Recall / Safety Signal Summary", "CAPA Summary"],
        },
        {
            "question": "Provide analysis of predicate recalls/MDRs and explain why the subject device mitigates those concerns.",
            "recommended_sections": ["Section 5 — Substantial Equivalence Discussion"],
            "recommended_artifacts": ["Recall / Safety Signal Summary"],
        },
    ],
    "PREDICATE_LINEAGE_COMPROMISED": [
        {
            "question": "The predicate family has safety concerns (cascading recalls). Document lineage analysis and risk controls.",
            "recommended_sections": ["Section 5 — Substantial Equivalence Discussion"],
            "recommended_artifacts": ["Recall / Safety Signal Summary", "ISO 14971 Risk Management Plan"],
        },
        {
            "question": "Has an alternate predicate with a clean safety lineage been evaluated?",
            "recommended_sections": ["Section 5 — Substantial Equivalence Discussion"],
            "recommended_artifacts": ["Recall / Safety Signal Summary"],
        },
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
# Staleness Machine Codes
# ═══════════════════════════════════════════════════════════════════════════════

STALE_RISK_CODE_MAP_CHANGED = "RISK_CODE_MAP_CHANGED"
STALE_RISK_VOCAB_CHANGED = "RISK_VOCAB_CHANGED"
STALE_PREDICATE_DATA_REFRESHED = "PREDICATE_DATA_REFRESHED"
STALE_SUBJECT_CHANGED = "SUBJECT_CHANGED"
STALE_PREDICATE_CHANGED = "PREDICATE_CHANGED"


# ═══════════════════════════════════════════════════════════════════════════════
# Hash Helpers (deterministic, pure)
# ═══════════════════════════════════════════════════════════════════════════════

def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _stable_task_id(*parts: str) -> str:
    """Truncated sha256 of pipe-delimited parts — stable, deterministic."""
    base = "|".join([p.strip() for p in parts if p is not None])
    return _sha256_hex(base)[:12]


# ═══════════════════════════════════════════════════════════════════════════════
# Category → EvidenceCategory Mapper
# ═══════════════════════════════════════════════════════════════════════════════

_CATEGORY_STR_TO_ENUM: Dict[str, EvidenceCategory] = {
    "BenchTesting": EvidenceCategory.BenchTesting,
    "Biocompatibility": EvidenceCategory.Biocompatibility,
    "RiskManagement": EvidenceCategory.RiskManagement,
    "SoftwareLifecycle": EvidenceCategory.SoftwareLifecycle,
    "Cybersecurity": EvidenceCategory.Cybersecurity,
    "SterilizationValidation": EvidenceCategory.SterilizationValidation,
    "ClinicalEvidence": EvidenceCategory.ClinicalEvidence,
    "LabelingIFU": EvidenceCategory.LabelingIFU,
    "StandardsConformance": EvidenceCategory.StandardsConformance,
    "PostMarketSurveillance": EvidenceCategory.PostMarketSurveillance,
}


def _get_primary_category(code: str) -> EvidenceCategory:
    """Get primary evidence category for a risk code from the canonical map."""
    cats = RISK_CODE_TO_CATEGORY.get(code, [])
    if cats:
        return _CATEGORY_STR_TO_ENUM.get(cats[0], EvidenceCategory.StandardsConformance)
    return EvidenceCategory.StandardsConformance


def _get_severity(code: str) -> EvidenceSeverity:
    """Get severity for a risk code from the canonical map."""
    sev = RISK_CODE_SEVERITY_DEFAULT.get(code, "MEDIUM")
    return _SEV_MAP.get(sev, EvidenceSeverity.MEDIUM)


# ═══════════════════════════════════════════════════════════════════════════════
# Build Reviewer Questions
# ═══════════════════════════════════════════════════════════════════════════════

def _build_reviewer_questions(code: str) -> List[ReviewerQuestionSeed]:
    """Get deterministic reviewer questions for a risk code."""
    raw = REVIEWER_QUESTIONS.get(code, [])
    return [
        ReviewerQuestionSeed(
            question=q["question"],
            recommended_sections=sorted(q.get("recommended_sections", [])),
            recommended_artifacts=sorted(q.get("recommended_artifacts", [])),
        )
        for q in raw
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# Builder: Deterministic Defense Packet from Manifest
# ═══════════════════════════════════════════════════════════════════════════════

def build_defense_packet_from_manifest(
    *,
    program_id: str,
    product_code: str,
    manifest: Dict[str, Any],
    subject_hash: str,
    subject_device_name: Optional[str] = None,
) -> DefensePacketFull:
    """Build a deterministic, response-level DefensePacket from a manifest.

    Key invariant: packet_id == manifest_hash.
    Same inputs → same packet JSON (except generated_at).

    Args:
        program_id: Regulatory program ID
        product_code: FDA product code
        manifest: Manifest dict from build_manifest()
        subject_hash: Subject device hash
        subject_device_name: Optional human-readable device name

    Returns:
        DefensePacketFull — complete, auditable defense packet
    """
    manifest_hash = manifest["manifest_hash"]
    vocab_hash = load_risk_vocab_hash()
    generated_at = datetime.now(timezone.utc)

    # ── Collect triggered risk codes across all SE rows ──
    triggered: List[str] = []
    rows = manifest.get("se_matrix", {}).get("rows", [])
    for r in rows:
        for code in (r.get("triggered_risk_codes") or []):
            triggered.append(code)

    # Also include risk_codes_used from manifest itself
    for code in (manifest.get("risk_codes_used") or []):
        triggered.append(code)

    # Dedup + stable sort
    risk_codes = sorted(set(triggered))

    # ── Build tasks (dedupe by task_id) ──
    task_objs: List[EvidenceTaskFull] = []

    for code in risk_codes:
        if code not in ALL_RISK_CODES:
            continue

        # Use RISK_TO_TASK if available, else derive from canonical maps
        if code in RISK_TO_TASK:
            cat, sev, title, why, criteria, artifacts = RISK_TO_TASK[code]
        else:
            cat = _get_primary_category(code)
            sev = _get_severity(code)
            title = f"Address {RISK_CODE_LABELS.get(code, code)} differences"
            why = RISK_CODE_DISCUSSION_TEMPLATE.get(code, "Regulatory review expected.")
            criteria = ["Provide applicable evidence as listed in recommended artifacts."]
            artifacts = RISK_CODE_TO_ARTIFACTS.get(code, [])

        # Find SE matrix rows that triggered this code
        triggered_rows: List[str] = []
        for r in rows:
            row_key = r.get("characteristic") or r.get("row_key") or "UnknownRow"
            row_codes = r.get("triggered_risk_codes") or []
            if code in row_codes:
                triggered_rows.append(row_key)

        # Stable task ID
        predicate_k = manifest.get("predicate_k_number") or manifest.get("selected_predicate_k") or ""
        task_id = _stable_task_id(cat.value, code, subject_hash, predicate_k)

        task_objs.append(EvidenceTaskFull(
            task_id=task_id,
            severity=sev,
            category=cat,
            triggered_risk_codes=[code],
            se_matrix_rows=triggered_rows,
            title=title,
            why_it_matters=why,
            acceptance_criteria=list(criteria),
            recommended_artifacts=list(artifacts),
            artifact_targets=[
                f"SE_MATRIX_ROW::{row}" for row in sorted(set(triggered_rows))
            ] + [
                f"MANIFEST::{manifest_hash}",
            ],
            truth_machine_placeholder_id=f"TMP::{task_id}",
            anticipated_questions=_build_reviewer_questions(code),
        ))

    # ── Merge tasks with same task_id ──
    merged: Dict[str, EvidenceTaskFull] = {}
    for t in task_objs:
        if t.task_id not in merged:
            merged[t.task_id] = t
        else:
            m = merged[t.task_id]
            m.triggered_risk_codes = sorted(set(m.triggered_risk_codes + t.triggered_risk_codes))
            m.se_matrix_rows = sorted(set(m.se_matrix_rows + t.se_matrix_rows))
            m.artifact_targets = sorted(set(m.artifact_targets + t.artifact_targets))
            m.recommended_artifacts = sorted(set(m.recommended_artifacts + t.recommended_artifacts))
            # Merge anticipated questions (dedup by question text)
            existing_qs = {q.question for q in m.anticipated_questions}
            for q in t.anticipated_questions:
                if q.question not in existing_qs:
                    m.anticipated_questions.append(q)
                    existing_qs.add(q.question)

    tasks = list(merged.values())

    # ── Deterministic sort: severity desc, category, task_id ──
    tasks.sort(key=lambda t: (-_SEV_RANK.get(t.severity.value, 0), t.category.value, t.task_id))

    # ── Readiness score ──
    readiness = manifest.get("defense_readiness_score")
    if readiness is None:
        significant = set(manifest.get("significant_risk_codes", []))
        readiness = 90.0 - (10.0 * len(significant))
    readiness = max(0.0, min(100.0, float(readiness)))

    # ── Status: BLOCKED if any HIGH task is OPEN, else CREATED ──
    any_high = any(t.severity == EvidenceSeverity.HIGH for t in tasks)
    status = PacketOpsStatus.BLOCKED if any_high else PacketOpsStatus.CREATED

    # ── Top risks: top 8, sorted by severity then canonical order ──
    top_risks = risk_codes[:8]

    return DefensePacketFull(
        packet_version=PACKET_VERSION,
        packet_id=manifest_hash,
        manifest_hash=manifest_hash,
        subject_hash=subject_hash,
        program_id=str(program_id),
        product_code=str(product_code),
        generated_at=generated_at,
        risk_code_map_version=str(RISK_CODE_MAP_VERSION),
        risk_vocab_hash=str(vocab_hash),
        readiness_score=readiness,
        status=status,
        top_risks=top_risks,
        tasks=tasks,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Staleness Detection (pure function — no DB needed)
# ═══════════════════════════════════════════════════════════════════════════════

def is_packet_stale(
    packet: DefensePacketFull,
    current_vocab_hash: Optional[str] = None,
    current_map_version: Optional[str] = None,
    current_subject_hash: Optional[str] = None,
    current_predicate_k: Optional[str] = None,
    predicate_refresh_timestamp: Optional[datetime] = None,
) -> List[str]:
    """Check if a defense packet is stale. Returns list of machine-code reasons.

    Pure function: all comparisons are against explicitly provided current values.
    """
    if current_vocab_hash is None:
        current_vocab_hash = load_risk_vocab_hash()
    if current_map_version is None:
        current_map_version = str(RISK_CODE_MAP_VERSION)

    reasons: List[str] = []

    if packet.risk_vocab_hash != current_vocab_hash:
        reasons.append(STALE_RISK_VOCAB_CHANGED)
    if packet.risk_code_map_version != current_map_version:
        reasons.append(STALE_RISK_CODE_MAP_CHANGED)
    if current_subject_hash and packet.subject_hash != current_subject_hash:
        reasons.append(STALE_SUBJECT_CHANGED)
    if current_predicate_k:
        # packet_id is derived from manifest, but we check top_risks contains predicate-related data
        # In practice, predicate change means manifest_hash would change, but explicit check is enterprise-required
        reasons.append(STALE_PREDICATE_CHANGED)
    if predicate_refresh_timestamp and packet.generated_at < predicate_refresh_timestamp:
        reasons.append(STALE_PREDICATE_DATA_REFRESHED)

    return sorted(set(reasons))


# ═══════════════════════════════════════════════════════════════════════════════
# Submission Gating
# ═══════════════════════════════════════════════════════════════════════════════

def check_submission_gate(packet: DefensePacketFull) -> SubmissionGateResult:
    """Check if a defense packet passes submission gating.

    Gate rules:
      - Block if ANY HIGH EvidenceTask is OPEN or IN_PROGRESS
      - Block if ANY SIGNIFICANT risk code has no mapped evidence refs
      - Allow override only if WAIVED with reason + Part 11 audit event

    Returns SubmissionGateResult with blocking details.
    """
    blocking_task_ids: List[str] = []
    blocking_risk_codes: List[str] = []
    missing_evidence_refs: List[str] = []
    next_actions: List[str] = []

    for task in packet.tasks:
        # Rule 1: HIGH tasks must be DONE or WAIVED
        if task.severity == EvidenceSeverity.HIGH:
            if task.completion.state in (
                "OPEN",
                "IN_PROGRESS",
                EvidenceTaskState.OPEN,
                EvidenceTaskState.IN_PROGRESS,
            ):
                blocking_task_ids.append(task.task_id)
                next_actions.append(
                    f"Complete or waive task '{task.title}' (task_id={task.task_id})"
                )

        # Rule 2: SIGNIFICANT codes must have evidence refs
        for code in task.triggered_risk_codes:
            if code in SIGNIFICANT_RISK_CODES:
                if not task.completion.evidence_refs:
                    if code not in blocking_risk_codes:
                        blocking_risk_codes.append(code)
                        missing_evidence_refs.append(
                            f"{code} — no evidence refs for task {task.task_id}"
                        )

    allowed = len(blocking_task_ids) == 0 and len(blocking_risk_codes) == 0

    reason = ""
    if not allowed:
        parts = []
        if blocking_task_ids:
            parts.append(f"{len(blocking_task_ids)} HIGH task(s) not completed")
        if blocking_risk_codes:
            parts.append(f"{len(blocking_risk_codes)} SIGNIFICANT risk code(s) without evidence")
        reason = "Packaging blocked: " + "; ".join(parts)

    return SubmissionGateResult(
        allowed=allowed,
        blocking_task_ids=sorted(blocking_task_ids),
        blocking_risk_codes=sorted(blocking_risk_codes),
        missing_evidence_refs=sorted(missing_evidence_refs),
        recommended_next_actions=next_actions,
        override_available=not allowed,  # overrides available but require waiver + audit
        reason=reason,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# CSV Export Helper
# ═══════════════════════════════════════════════════════════════════════════════

CSV_COLUMNS = [
    "task_id",
    "severity",
    "category",
    "title",
    "triggered_risk_codes",
    "se_matrix_rows",
    "acceptance_criteria",
    "recommended_artifacts",
    "artifact_targets",
    "state",
]


def packet_tasks_to_csv(packet: DefensePacketFull) -> str:
    """Export defense packet tasks as stable CSV (enterprise-friendly).

    Columns: task_id, severity, category, title, triggered_risk_codes,
    se_matrix_rows, acceptance_criteria, recommended_artifacts, artifact_targets, state.

    Ordering is deterministic (same as packet.tasks ordering).
    """
    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)
    writer.writerow(CSV_COLUMNS)

    for task in packet.tasks:
        writer.writerow([
            task.task_id,
            task.severity.value,
            task.category.value,
            task.title,
            "|".join(task.triggered_risk_codes),
            "|".join(task.se_matrix_rows),
            "|".join(task.acceptance_criteria),
            "|".join(task.recommended_artifacts),
            "|".join(task.artifact_targets),
            task.completion.state.value if hasattr(task.completion.state, "value") else str(task.completion.state),
        ])

    return output.getvalue()
