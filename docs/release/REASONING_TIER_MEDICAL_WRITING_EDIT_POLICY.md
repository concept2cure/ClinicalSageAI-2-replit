# Reasoning Tier Medical Writing Edit Policy

**Status:** Active policy  
**Date:** 2026-03-27

This policy defines acceptable edit behavior for Reasoning Tier-assisted medical writing.

---

## Allowed Edit Types

- Clarity edits that preserve source-grounded meaning.
- Structure edits that improve reviewability without changing claim intent.
- Terminology harmonization aligned to `docs/evals/REGULATORY_TERMINOLOGY_GLOSSARY.md`.
- Safety language calibration that reduces overstatement.

## Restricted Edit Types

- Introducing new critical claims without traceable evidence.
- Removing caveats that materially change regulatory risk posture.
- Conflating conflicting evidence into single-direction conclusions.
- Reframing indication scope without explicit reviewer approval.

## Required Review Signals

Each significant edit batch must include:

- rationale for change,
- source traceability anchors,
- reviewer-accept/reject controls,
- explicit notation of unresolved risk language concerns.

## No-Go Triggers

Automatically fail run if any are true:

- critical unsupported claim introduced,
- contraindication language weakened without evidence,
- terminology drift causes ambiguity in regulatory intent.
