# D4 / D2: an export that served invented figures is retired, and the PDF gate sees `require()`

**Row:** D4. The PDF runtime gate had a blind spot. Also D2: Reporting & analytics is a launch app, and per RULE 2
"numbers come from deterministic engines". **Lane:** `…session_01JNRgCKWRqqJxZ1cJCyxoor`. Found while curing the PDF
gate (`docs/evidence/D4/2026-10-01-pdf-runtime/`) and done as the next commit.

## What was wrong

`ci:check-pdf-runtime` matched `import … from 'pdfkit'` and `import('pdfkit')`, never `require('pdfkit')`. Exactly one
file in `server/` reached a PDF library that way: `server/routes/analytics-routes.ts`, `GET /api/analytics/export`.

That route is mounted (`register-project-routes.ts`, `/api/analytics`). No screen calls it, and none ever has: `git log
-S"analytics/export" -- client` is empty, and the repo's own orphan-endpoint report lists it. Nothing records what it
sends. Its `type=predictive` branch answered every tenant with **hard-coded figures presented as computed**. See
`red/C-what-the-live-route-serves.txt`, captured from the live handler as tenant 7:

- "Overall Survival: predicted effect size 0.42, confidence interval 0.35–0.49, reliability High"; "Progression-Free
  Survival: 0.37, 0.29–0.45, Moderate";
- "Based on historical power calculations, we recommend a minimum sample size of 150 participants per arm";
- market trial counts for three indications.

These came as JSON, as CSV, or as a 1,962-byte PDF titled "ClinicalSage Analytics Report" and stamped with the wall
clock. A regulatory customer holding that PDF would hold an effect size, a confidence interval and a sample-size
recommendation that no engine computed. That breaks both "fail closed, never fabricate" and RULE 2.

## What was done

- **The route is deleted.** Its `type=summary` branch read real `csr_reports` aggregates, but those are what
  `GET /api/analytics/dashboard` already serves. That handler stays, and the analytics screen
  (`client/src/concept2cure/v2/surfaces/ReportEngine.tsx`) reads it. A governed export that is recorded, faithful and
  sealed is Reporting's: `GET /api/report-os/runs/:id/export.pdf` (`server/routes/report-os.ts`, held by
  `server/services/report-os/pdf/__tests__/{run-pdf,export-identity}.test.ts`). **No capability a person can reach is
  lost.** The working agreement's history search finds no client that ever called the route.
- **The gate reads `require()` too**, and its built-in probe now includes a `require('pdfkit')` case, so the pattern
  cannot quietly stop matching.
- The tenant-isolation suite's two `/export` cases, which pinned the route's org scoping, are replaced by six:
  `/export` is not served for either type in any format, and no response carries a figure, a PDF or a CSV.

## Proof

| File | |
|---|---|
| `red/A-gate-sees-require-before-retirement.txt` | The gate with `require()` detection, before retirement: names `analytics-routes.ts`, exit 1. |
| `red/B-export-retired-test-before.txt` | The new cases against the live route: 6/6 fail (200, not 404). The two `/dashboard` cases pass. |
| `red/C-what-the-live-route-serves.txt` | The fabricated JSON, the CSV, and the PDF's status and size, from the handler as it stood. |
| `green/A-gate-after.txt` | Exit 0. |
| `green/B-analytics-suites-after.txt` | The three analytics suites (tenant isolation, demo-analysis IND readiness, provenance): 23/23. |

ESLint warnings in `analytics-routes.ts` go from 18 to 16 (two unused names left with the handler), and the test file
has none. The typecheck and full Lint-guardrail sweep results are in the commit message.
