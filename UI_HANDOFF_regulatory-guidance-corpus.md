# UI handoff — Regulatory Guidance Corpus (for Claude Design)

The feature previously branded **"Snow Globe"** should be presented to clients as
the **Regulatory Guidance Corpus** — a single, unified regulatory-readiness
assessment rather than six separate "engines". The backend now exposes a merged
view to support this; the rename and single-view layout are the design system's
to build.

## Decision

- **Rebrand** the surface to "Regulatory Guidance Corpus" (drop the "Snow Globe"
  name in all client-facing copy).
- **Merge** the six per-dimension results into one assessment in the UI.
- Backend route paths (`/api/snowglobe/...`) and stored records are intentionally
  **unchanged** (no breaking changes / no data migration); only the client-facing
  presentation changes.

## Backend support (shipped)

A consolidated, read-only view merges a completed run's six dimensions into one:

- `GET /api/snowglobe/runs/:runId/guidance-corpus`
- `GET /api/snowglobe/programs/:programId/guidance-corpus` — the program's most
  recent completed run (returns `{ corpus: null, message }` when none).

Response `data`:
```json
{
  "title": "Regulatory Guidance Corpus",
  "runId": 123, "programId": 45, "status": "completed",
  "posture": {
    "overall": 72,                         // mean of available dimension scores, or null
    "riskLevel": "low",                    // low | moderate | high | insufficient_data
    "dimensions": [
      { "engine": "agency_screen", "dimension": "Pre-Technical Rejection",
        "score": 80, "summary": "...", "findingCount": 2, "insufficientData": false }
      // ... the six dimensions
    ],
    "compositeScores": { "submissionSurvival": 74, "traceabilityIntegrity": 68 }
  },
  "summary": "Assessed 6 regulatory dimensions: overall readiness 72/100 (low risk). 5 findings (1 critical, 2 high).",
  "findings": {
    "total": 5,
    "bySeverity": { "critical": [...], "high": [...], "medium": [...], "low": [...] },
    "all": [ /* FindingCluster[] */ ]
  },
  "remediationPlan": { "actions": [ /* prioritized */ ] },
  "generatedAt": "2026-05-25T..."
}
```

## What to build (UI)

1. A single **Regulatory Guidance Corpus** panel that renders `posture` (one
   overall readiness score + risk level), the six `dimensions` as contributing
   facets of the one assessment (not six standalone tools), and the consolidated
   `findings.bySeverity` with the `remediationPlan`.
2. Honest empty/insufficient states (carried over from the prior handoff): when
   `posture.overall` is `null` / `riskLevel` is `insufficient_data`, show an
   "add program content to generate guidance" empty state — never a fabricated
   score. Individual `dimensions[].insufficientData === true` should render as
   "not assessed", not zero.
3. Use the program-level endpoint for the default/landing view; the run-level
   endpoint for a specific historical run.

## Notes

- The per-dimension engines are real (they analyze the program's authored
  sections/documents via the AI client). The corpus view only consolidates them.
- Existing granular endpoints (`/results`, `/scores`, `/top-findings`,
  `/remediation-plan`) remain available if a detailed drill-down is wanted.
