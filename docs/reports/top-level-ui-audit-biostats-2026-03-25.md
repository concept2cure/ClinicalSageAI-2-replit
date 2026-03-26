# Top-Level UI Audit — AnA Biostats Experience

_Date: 2026-03-25_

## Goal
Ensure a human user can discover, enter, configure, and generate Biostats/SAP outputs from the main AnA workspace with minimal friction.

## Entry/Discovery Audit

- [x] Left sidebar Workflow group opens by default.
- [x] Biostats appears as a first-class nav item in Workflow.
- [x] Workspace suggested actions include **Open AnA Biostats** when not already present.

## In-Panel Usability Audit

- [x] One-click SME templates available for common scenarios.
- [x] Core SAP strategy controls visible (multiplicity, estimand, missing-data, comparator, endpoint count).
- [x] Governance controls visible (project bind, review thread, dossier auto-attach).
- [x] Full SAP package mode available and deterministic.
- [x] Explicit assumption-to-document traceability preview shown before compute.

## Output/Generation Audit

- [x] Multi-document generation flow available.
- [x] Full package and selected-doc modes are both represented in UX text.
- [x] Error handling surfaces package-generation failures.

## Remaining UX Recommendations

1. Add “last generated package” timeline panel with direct links to artifacts.
2. Add quick filter chips for regulator families (US/EU/APAC).
3. Add lightweight first-run guide tooltips for non-statistician users.
