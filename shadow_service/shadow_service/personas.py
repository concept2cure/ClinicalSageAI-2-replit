"""
Multi-Persona Configuration for Shadow Agent

Each persona represents a different regulatory reviewer perspective:
- FDA_STATS: Statistical reviewer (sensitive to multiplicity, estimands)
- FDA_CLINICAL: Clinical reviewer (endpoints, missing data)
- FDA_SAFETY: Safety reviewer (AE signals, exposure)
- CMC_QUALITY: CMC/Quality reviewer (manufacturing consistency)

Personas have different:
- Failure mode focus areas
- Sensitivity thresholds (drift_red, IR similarity)
- Agency filters
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, Sequence, Dict

@dataclass(frozen=True)
class PersonaConfig:
    """Configuration for a regulatory reviewer persona."""
    
    # Unique persona identifier
    code: str
    
    # Human-readable name
    display_name: str
    
    # Agency filter (e.g., "FDA", "EMA", "PMDA", None for all)
    agency_filter: Optional[str]
    
    # Failure modes this persona focuses on
    failure_modes: Sequence[str] = field(default_factory=tuple)
    
    # Number of precedents to retrieve
    top_k: int = 6
    
    # Threshold for DATA_DRIFT (red) classification
    drift_red_threshold: float = 0.20
    
    # Threshold for IR_PREDICTED (amber) classification
    ir_similarity_threshold: float = 0.78
    
    # Optional system prompt modifier
    system_prompt_suffix: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "code": self.code,
            "display_name": self.display_name,
            "agency_filter": self.agency_filter,
            "failure_modes": list(self.failure_modes),
            "top_k": self.top_k,
            "drift_red_threshold": self.drift_red_threshold,
            "ir_similarity_threshold": self.ir_similarity_threshold,
        }


# =============================================================================
# Standard Persona Definitions
# =============================================================================

PERSONAS: Dict[str, PersonaConfig] = {
    # FDA Statistical Reviewer - more sensitive to statistical issues
    "FDA_STATS": PersonaConfig(
        code="FDA_STATS",
        display_name="FDA Statistical Reviewer",
        agency_filter="FDA",
        failure_modes=(
            "Statistical Plan Gap",
            "Multiplicity",
            "Estimand",
            "Sample Size Justification",
            "Interim Analysis",
            "Missing Data Handling",
            "Sensitivity Analysis",
        ),
        top_k=8,
        drift_red_threshold=0.18,  # More sensitive
        ir_similarity_threshold=0.72,  # Lower threshold = more IR predictions
        system_prompt_suffix="Focus on statistical methodology, multiplicity control, and estimand framework alignment.",
    ),
    
    # FDA Clinical Reviewer
    "FDA_CLINICAL": PersonaConfig(
        code="FDA_CLINICAL",
        display_name="FDA Clinical Reviewer",
        agency_filter="FDA",
        failure_modes=(
            "Clinical Gap",
            "Endpoint Justification",
            "Missing Data",
            "Patient Population",
            "Concomitant Medications",
            "Rescue Therapy",
            "Protocol Deviations",
        ),
        top_k=6,
        drift_red_threshold=0.20,
        ir_similarity_threshold=0.78,
        system_prompt_suffix="Focus on clinical relevance, endpoint selection, and patient population appropriateness.",
    ),
    
    # FDA Safety Reviewer
    "FDA_SAFETY": PersonaConfig(
        code="FDA_SAFETY",
        display_name="FDA Safety Reviewer",
        agency_filter="FDA",
        failure_modes=(
            "Safety Signal",
            "Exposure",
            "AE Imbalance",
            "Serious Adverse Events",
            "Deaths",
            "Discontinuations Due to AE",
            "Laboratory Abnormalities",
            "Hepatotoxicity",
            "Cardiovascular Safety",
        ),
        top_k=6,
        drift_red_threshold=0.20,
        ir_similarity_threshold=0.78,
        system_prompt_suffix="Focus on safety signals, adverse event patterns, and exposure-response relationships.",
    ),
    
    # CMC/Quality Reviewer (non-clinical)
    "CMC_QUALITY": PersonaConfig(
        code="CMC_QUALITY",
        display_name="CMC/Quality Reviewer",
        agency_filter=None,  # Applies to all agencies
        failure_modes=(
            "CMC Inconsistency",
            "Method Validation",
            "Comparability",
            "Specification Justification",
            "Stability Data",
            "Manufacturing Process Control",
            "Container Closure",
        ),
        top_k=6,
        drift_red_threshold=0.20,
        ir_similarity_threshold=0.78,
        system_prompt_suffix="Focus on manufacturing consistency, analytical method validation, and CMC data integrity.",
    ),
    
    # EMA Assessor (European perspective)
    "EMA_ASSESSOR": PersonaConfig(
        code="EMA_ASSESSOR",
        display_name="EMA Scientific Assessor",
        agency_filter="EMA",
        failure_modes=(
            "Benefit-Risk Assessment",
            "CHMP Objection",
            "Day 80 Issue",
            "Day 120 Issue",
            "Major Objection",
            "GCP Compliance",
            "Pediatric Investigation Plan",
        ),
        top_k=6,
        drift_red_threshold=0.20,
        ir_similarity_threshold=0.78,
        system_prompt_suffix="Focus on European regulatory requirements, benefit-risk balance, and EMA-specific concerns.",
    ),
    
    # PMDA Reviewer (Japanese perspective)
    "PMDA_REVIEWER": PersonaConfig(
        code="PMDA_REVIEWER",
        display_name="PMDA Reviewer",
        agency_filter="PMDA",
        failure_modes=(
            "Ethnic Sensitivity",
            "Japanese Subgroup",
            "Bridging Study",
            "Dosing in Japanese Population",
            "J-NDA Requirements",
        ),
        top_k=6,
        drift_red_threshold=0.20,
        ir_similarity_threshold=0.78,
        system_prompt_suffix="Focus on Japanese regulatory requirements, ethnic factors, and bridging study adequacy.",
    ),
}

# Default persona when none specified
DEFAULT_PERSONA = "FDA_CLINICAL"


def get_persona(code: str) -> PersonaConfig:
    """Get persona configuration by code, falling back to default."""
    return PERSONAS.get(code, PERSONAS[DEFAULT_PERSONA])


def get_all_personas() -> Dict[str, PersonaConfig]:
    """Get all available personas."""
    return PERSONAS.copy()


def get_personas_for_agency(agency: str) -> Dict[str, PersonaConfig]:
    """Get personas applicable to a specific agency."""
    return {
        code: persona
        for code, persona in PERSONAS.items()
        if persona.agency_filter is None or persona.agency_filter == agency
    }


def validate_persona_codes(codes: Sequence[str]) -> list[str]:
    """Validate persona codes, returning list of valid codes."""
    valid = []
    for code in codes:
        if code in PERSONAS:
            valid.append(code)
    return valid if valid else [DEFAULT_PERSONA]
