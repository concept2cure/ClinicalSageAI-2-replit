"""Tests for Phase 6.6.C — Deterministic SE Row Risk Code Scorer.

Tests:
  ✅ vocab loading + cache
  ✅ normalization helpers (norm, tokens, is_empty, jaccard)
  ✅ Row 1 — intended_use scoring (IU_MISMATCH / INDICATIONS_EXPANDED / EQUIVALENT)
  ✅ Row 2 — technology scoring (TECH_DIFFERENCE / DESIGN_ARCH_CHANGE)
  ✅ Row 3 — materials scoring (MATERIAL_CHANGE / EQUIVALENT)
  ✅ Row 4 — energy_source scoring (ENERGY_SOURCE_CHANGE)
  ✅ Row 5 — tissue_contact scoring (TISSUE_CONTACT_CHANGE / CONTACT_DURATION_CHANGE / both)
  ✅ Row 6 — sterilization scoring (STERILIZATION_METHOD_CHANGE)
  ✅ Row 7 — software scoring (SOFTWARE_PRESENT_NEW / SOFTWARE_SAFETY_CLASS_DIFF)
  ✅ Row 8 — performance scoring (PERFORMANCE_CLAIM_CHANGE)
  ✅ Row 9 — general scoring (LABELING_IFU_GAP)
  ✅ diff_flag rules (SIGNIFICANT only for 4 specific codes)
  ✅ triggered_risk_codes multi-trigger (tissue contact + duration)
  ✅ discussion templates populated
  ✅ determinism — same input always same output
"""
from __future__ import annotations

import pytest

from shadow_service.predicate_intel.se_risk_codes import (
    assign_se_row_risks,
    clear_vocab_cache,
    is_empty,
    jaccard,
    load_vocab,
    norm,
    tokens,
    _coerce_enum,
    _normalize_materials,
)
from shadow_service.scoring.risk_code_map import (
    SIGNIFICANT_RISK_CODES,
    RISK_CODE_DISCUSSION_TEMPLATE,
)


# Override conftest's async autouse reset_db_pool fixture.
@pytest.fixture(autouse=True)
def reset_db_pool():
    """Sync noop — overrides conftest async fixture for this module."""
    yield


@pytest.fixture(autouse=True)
def _clear_vocab():
    """Clear vocab cache before each test."""
    clear_vocab_cache()
    yield
    clear_vocab_cache()


@pytest.fixture
def vocab():
    """Loaded vocab fixture."""
    return load_vocab()


# ═══════════════════════════════════════════════════════════════════════════════
# Normalization Helper Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestNormalization:

    def test_norm_lowercase_and_trim(self):
        assert norm("  Hello World  ") == "hello world"

    def test_norm_removes_punctuation_except_slash_dash(self):
        assert norm("EO (gamma)") == "eo gamma"
        assert norm("blood/bone") == "blood/bone"
        assert norm("long-term") == "long-term"

    def test_norm_collapses_whitespace(self):
        assert norm("a   b   c") == "a b c"

    def test_tokens_splits_correctly(self):
        result = tokens("Continuous glucose monitoring")
        assert result == {"continuous", "glucose", "monitoring"}

    def test_is_empty_true_cases(self):
        assert is_empty("") is True
        assert is_empty("N/A") is True
        assert is_empty("n/a") is True
        assert is_empty("None") is True
        assert is_empty("  none  ") is True
        assert is_empty("unknown") is True

    def test_is_empty_false_cases(self):
        assert is_empty("Battery") is False
        assert is_empty("Titanium alloy") is False

    def test_jaccard_identical(self):
        assert jaccard({"a", "b"}, {"a", "b"}) == 1.0

    def test_jaccard_disjoint(self):
        assert jaccard({"a", "b"}, {"c", "d"}) == 0.0

    def test_jaccard_partial(self):
        assert jaccard({"a", "b", "c"}, {"b", "c", "d"}) == pytest.approx(0.5)

    def test_jaccard_empty_sets(self):
        assert jaccard(set(), set()) == 1.0


# ═══════════════════════════════════════════════════════════════════════════════
# Coercion Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestCoercers:

    def test_coerce_enum_direct_match(self, vocab):
        emap = vocab["energy_enum_map"]
        assert _coerce_enum("battery", emap) == "battery"

    def test_coerce_enum_token_fallback(self, vocab):
        emap = vocab["energy_enum_map"]
        assert _coerce_enum("Battery (lithium)", emap) == "battery"

    def test_coerce_enum_unknown(self, vocab):
        emap = vocab["energy_enum_map"]
        assert _coerce_enum("plutonium reactor", emap) == "unknown"

    def test_normalize_materials_alias(self, vocab):
        aliases = vocab["material_aliases"]
        result = _normalize_materials("Ti, SS", aliases)
        assert result == {"titanium", "stainless steel"}

    def test_normalize_materials_passthrough(self, vocab):
        aliases = vocab["material_aliases"]
        result = _normalize_materials("Silicone rubber", aliases)
        assert result == {"silicone rubber"}


# ═══════════════════════════════════════════════════════════════════════════════
# Row 1 — Intended Use Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestIntendedUse:

    def test_identical_returns_equivalent(self, vocab):
        r = assign_se_row_risks(
            "intended_use",
            "Continuous glucose monitoring in adult patients",
            "Continuous glucose monitoring in adult patients",
            vocab,
        )
        assert r["diff_flag"] == "EQUIVALENT"
        assert r["risk_code"] is None

    def test_empty_subject_returns_equivalent(self, vocab):
        r = assign_se_row_risks("intended_use", "N/A", "Blood glucose monitoring", vocab)
        assert r["diff_flag"] == "EQUIVALENT"
        assert r["risk_code"] is None

    def test_low_overlap_returns_iu_mismatch(self, vocab):
        r = assign_se_row_risks(
            "intended_use",
            "Cardiac ablation for ventricular tachycardia",
            "Blood glucose monitoring for diabetes management",
            vocab,
        )
        assert r["risk_code"] == "IU_MISMATCH"
        assert r["diff_flag"] == "SIGNIFICANT"
        assert r["triggered_risk_codes"] == ["IU_MISMATCH"]

    def test_moderate_overlap_with_expansion_returns_expanded(self, vocab):
        r = assign_se_row_risks(
            "intended_use",
            "Glucose monitoring for pediatric patients in hospital use",
            "Glucose monitoring for adult patients in hospital use",
            vocab,
        )
        assert r["risk_code"] == "INDICATIONS_EXPANDED"
        assert r["triggered_risk_codes"] == ["INDICATIONS_EXPANDED"]

    def test_moderate_overlap_without_expansion_returns_mismatch(self, vocab):
        r = assign_se_row_risks(
            "intended_use",
            "Blood pressure monitoring in clinical setting",
            "Heart rate monitoring in clinical research",
            vocab,
        )
        assert r["risk_code"] == "IU_MISMATCH"


# ═══════════════════════════════════════════════════════════════════════════════
# Row 2 — Technology Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestTechnology:

    def test_identical_returns_equivalent(self, vocab):
        r = assign_se_row_risks("technology", "Electrochemical sensor", "Electrochemical sensor", vocab)
        assert r["diff_flag"] == "EQUIVALENT"

    def test_tech_family_difference(self, vocab):
        r = assign_se_row_risks("technology", "RF ablation probe", "Laser ablation probe", vocab)
        assert r["risk_code"] == "TECH_DIFFERENCE"
        assert r["diff_flag"] == "SIGNIFICANT"

    def test_arch_token_difference(self, vocab):
        r = assign_se_row_risks("technology", "Robotic arm system", "Handheld system", vocab)
        assert r["risk_code"] == "DESIGN_ARCH_CHANGE"
        assert r["diff_flag"] == "DISCUSSION_REQUIRED"

    def test_no_family_no_arch_difference(self, vocab):
        r = assign_se_row_risks("technology", "Type A sensor", "Type B sensor", vocab)
        assert r["diff_flag"] == "DISCUSSION_REQUIRED"
        assert r["risk_code"] is None


# ═══════════════════════════════════════════════════════════════════════════════
# Row 3 — Materials Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestMaterials:

    def test_same_material_returns_equivalent(self, vocab):
        r = assign_se_row_risks("materials", "Titanium alloy", "Titanium alloy", vocab)
        assert r["diff_flag"] == "EQUIVALENT"

    def test_different_material_returns_change(self, vocab):
        r = assign_se_row_risks("materials", "Titanium alloy", "Stainless steel", vocab)
        assert r["risk_code"] == "MATERIAL_CHANGE"
        assert r["diff_flag"] == "DISCUSSION_REQUIRED"

    def test_alias_normalization(self, vocab):
        r = assign_se_row_risks("materials", "Ti", "Titanium", vocab)
        # Both normalize to "titanium"
        assert r["diff_flag"] == "EQUIVALENT"

    def test_empty_returns_equivalent(self, vocab):
        r = assign_se_row_risks("materials", "N/A", "N/A", vocab)
        assert r["diff_flag"] == "EQUIVALENT"


# ═══════════════════════════════════════════════════════════════════════════════
# Row 4 — Energy Source Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestEnergySource:

    def test_same_energy_returns_equivalent(self, vocab):
        r = assign_se_row_risks("energy_source", "Battery", "Battery", vocab)
        assert r["diff_flag"] == "EQUIVALENT"

    def test_different_energy_returns_change(self, vocab):
        r = assign_se_row_risks("energy_source", "Battery", "AC Power", vocab)
        assert r["risk_code"] == "ENERGY_SOURCE_CHANGE"
        assert r["diff_flag"] == "SIGNIFICANT"

    def test_both_empty_returns_equivalent(self, vocab):
        r = assign_se_row_risks("energy_source", "N/A", "None", vocab)
        assert r["diff_flag"] == "EQUIVALENT"


# ═══════════════════════════════════════════════════════════════════════════════
# Row 5 — Tissue Contact Tests (dual trigger)
# ═══════════════════════════════════════════════════════════════════════════════

class TestTissueContact:

    def test_same_contact_returns_equivalent(self, vocab):
        r = assign_se_row_risks("biocompatibility", "Skin contact", "Skin contact", vocab)
        assert r["diff_flag"] == "EQUIVALENT"

    def test_contact_type_change(self, vocab):
        r = assign_se_row_risks("biocompatibility", "Blood contact", "Skin contact", vocab)
        assert r["risk_code"] == "TISSUE_CONTACT_CHANGE"
        assert "TISSUE_CONTACT_CHANGE" in r["triggered_risk_codes"]

    def test_duration_change_only(self, vocab):
        r = assign_se_row_risks("biocompatibility", "Skin, permanent", "Skin, limited", vocab)
        assert r["risk_code"] in ("CONTACT_DURATION_CHANGE", "TISSUE_CONTACT_CHANGE")
        assert len(r["triggered_risk_codes"]) >= 1

    def test_dual_trigger_contact_and_duration(self, vocab):
        """Both contact type AND duration differ → both in triggered_risk_codes."""
        r = assign_se_row_risks("biocompatibility", "Blood path, permanent", "Skin contact, limited", vocab)
        # Should include both triggers
        assert r["risk_code"] == "TISSUE_CONTACT_CHANGE"  # higher priority
        assert "TISSUE_CONTACT_CHANGE" in r["triggered_risk_codes"]
        assert "CONTACT_DURATION_CHANGE" in r["triggered_risk_codes"]
        assert len(r["triggered_risk_codes"]) == 2

    def test_requires_citation_when_triggered(self, vocab):
        r = assign_se_row_risks("biocompatibility", "Blood contact", "Skin contact", vocab)
        assert r["requires_citation"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# Row 6 — Sterilization Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestSterilization:

    def test_same_method_returns_equivalent(self, vocab):
        r = assign_se_row_risks("sterilization", "EO sterilization", "EO sterilization", vocab)
        assert r["diff_flag"] == "EQUIVALENT"

    def test_different_method_returns_change(self, vocab):
        r = assign_se_row_risks("sterilization", "Gamma radiation", "EO sterilization", vocab)
        assert r["risk_code"] == "STERILIZATION_METHOD_CHANGE"
        assert r["diff_flag"] == "DISCUSSION_REQUIRED"

    def test_eo_aliases(self, vocab):
        r = assign_se_row_risks("sterilization", "Ethylene oxide", "EO", vocab)
        assert r["diff_flag"] == "EQUIVALENT"


# ═══════════════════════════════════════════════════════════════════════════════
# Row 7–9 — Non-core Row Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestNonCoreRows:

    def test_software_new(self, vocab):
        r = assign_se_row_risks("software", "Firmware v2.0", "N/A", vocab)
        assert r["risk_code"] == "SOFTWARE_PRESENT_NEW"
        assert r["diff_flag"] == "DISCUSSION_REQUIRED"  # Not SIGNIFICANT per spec

    def test_software_class_diff(self, vocab):
        r = assign_se_row_risks("software", "Firmware v2.0", "Firmware v1.0", vocab)
        assert r["risk_code"] == "SOFTWARE_SAFETY_CLASS_DIFF"

    def test_performance_change(self, vocab):
        r = assign_se_row_risks("performance", "±5% accuracy", "±10% accuracy", vocab)
        assert r["risk_code"] == "PERFORMANCE_CLAIM_CHANGE"

    def test_general_labeling_gap(self, vocab):
        r = assign_se_row_risks("general", "Rx only", "OTC", vocab)
        assert r["risk_code"] == "LABELING_IFU_GAP"


# ═══════════════════════════════════════════════════════════════════════════════
# Diff Flag Rules Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestDiffFlagRules:

    def test_significant_only_for_specified_codes(self, vocab):
        """SIGNIFICANT flag only for ENERGY_SOURCE_CHANGE, IU_MISMATCH,
        TECH_DIFFERENCE, PREDICATE_TOXICITY_HIGH."""
        # These SHOULD be SIGNIFICANT
        r = assign_se_row_risks("energy_source", "Battery", "AC Power", vocab)
        assert r["diff_flag"] == "SIGNIFICANT"

        # These should NOT be SIGNIFICANT
        r = assign_se_row_risks("materials", "Titanium", "Steel", vocab)
        assert r["diff_flag"] == "DISCUSSION_REQUIRED"

        r = assign_se_row_risks("software", "Embedded FW", "N/A", vocab)
        assert r["diff_flag"] == "DISCUSSION_REQUIRED"

        r = assign_se_row_risks("sterilization", "Gamma", "EO", vocab)
        assert r["diff_flag"] == "DISCUSSION_REQUIRED"

    def test_no_risk_code_different_text_is_discussion(self, vocab):
        """If texts differ but no scorer rule triggers → DISCUSSION_REQUIRED."""
        r = assign_se_row_risks("technology", "Sensor type A", "Sensor type B", vocab)
        assert r["diff_flag"] == "DISCUSSION_REQUIRED"

    def test_equivalent_no_risk_code(self, vocab):
        r = assign_se_row_risks("materials", "Titanium", "Titanium", vocab)
        assert r["diff_flag"] == "EQUIVALENT"
        assert r["risk_code"] is None
        assert r["requires_citation"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# Discussion Template Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestDiscussionTemplates:

    def test_material_change_template(self, vocab):
        r = assign_se_row_risks("materials", "Titanium", "Steel", vocab)
        assert "biocompatibility" in r["discussion_text"].lower()
        assert "ISO 10993-1" in r["discussion_text"]

    def test_energy_source_template(self, vocab):
        r = assign_se_row_risks("energy_source", "Battery", "AC Power", vocab)
        assert "safety profile" in r["discussion_text"].lower()

    def test_iu_mismatch_template(self, vocab):
        r = assign_se_row_risks(
            "intended_use",
            "Cardiac ablation for ventricular tachycardia",
            "Blood glucose monitoring for diabetes management",
            vocab,
        )
        assert "regulatory risk" in r["discussion_text"].lower()

    def test_every_risk_code_has_template(self):
        """All 24 risk codes have discussion templates."""
        from shadow_service.scoring.risk_code_map import ALL_RISK_CODES
        for rc in ALL_RISK_CODES:
            template = RISK_CODE_DISCUSSION_TEMPLATE.get(rc)
            assert template is not None, f"No discussion template for {rc}"
            assert len(template) > 20, f"Template too short for {rc}"


# ═══════════════════════════════════════════════════════════════════════════════
# Determinism Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestDeterminism:

    def test_same_input_same_output(self, vocab):
        """Calling scorer twice with same input produces identical result."""
        for _ in range(3):
            r = assign_se_row_risks("materials", "Titanium", "Steel", vocab)
            assert r["risk_code"] == "MATERIAL_CHANGE"
            assert r["diff_flag"] == "DISCUSSION_REQUIRED"
            assert r["triggered_risk_codes"] == ["MATERIAL_CHANGE"]

    def test_all_core_rows_deterministic(self, vocab):
        """All 6 core rows produce stable output."""
        cases = [
            ("intended_use", "Glucose monitoring", "Cardiac monitoring"),
            ("technology", "Laser probe", "RF probe"),
            ("materials", "Titanium", "Steel"),
            ("energy_source", "Battery", "AC Power"),
            ("biocompatibility", "Blood contact", "Skin contact"),
            ("sterilization", "Gamma", "EO"),
        ]
        for row_type, subj, pred in cases:
            r1 = assign_se_row_risks(row_type, subj, pred, vocab)
            r2 = assign_se_row_risks(row_type, subj, pred, vocab)
            assert r1 == r2, f"Non-deterministic for {row_type}"
