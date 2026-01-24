# CERv2 — Architecture Overview

## Product intent
CERv2 is a Regulatory Workbench for Medical Device & Diagnostics that turns messy evidence into defensible claims, standards coverage, outcomes substantiation, authored CER content, and audit-ready eCTD exports.

## Core UX shell
- Left rail: program switcher + navigation.
- Main canvas: workflow surface for the active route.
- Right panel: persistent context for evidence, traceability, tasks, approvals.
- Top bar: breadcrumbs, search, command palette, export/preflight status.

## Primary routes
- /medical-device-diagnostics/programs/:programId/overview
- /medical-device-diagnostics/programs/:programId/evidence
- /medical-device-diagnostics/programs/:programId/claims
- /medical-device-diagnostics/programs/:programId/standards
- /medical-device-diagnostics/programs/:programId/outcomes
- /medical-device-diagnostics/programs/:programId/co-author
- /medical-device-diagnostics/programs/:programId/preflight
- /medical-device-diagnostics/programs/:programId/exports
- /medical-device-diagnostics/programs/:programId/audit

## Domain objects (first-class)
- Program
- Evidence (files + metadata + provenance)
- Claim
- Standard + Requirement
- Outcome
- Section (authored CER content)
- Export (eCTD package)
- Regulatory Build Ledger

## Traceability model
- Evidence is the source of truth and must link to claims, standards, outcomes, and sections.
- Every export must include a Regulatory Build Ledger with hashes, provenance, and a traceability map.
- Every mutation emits an audit log event and is tenant-scoped.

## Quality bar (non-negotiables)
- Every feature ships with schema + migration + API validation + audit log entries.
- UI states include loading/error/empty, and deep links work consistently.
- Exports are deterministic and reproducible.
