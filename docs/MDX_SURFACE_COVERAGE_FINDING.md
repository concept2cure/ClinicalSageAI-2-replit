# Nine MDX capabilities are AnA-reachable but have no screen

**Status:** measurement, not a fix. Recorded so the surfacing work can be
scoped and prioritised rather than discovered one panel at a time.

**Date:** 2026-07-26 · **Measured at:** `d641e9d`

## What was measured

For every `server/routes/mdx-*.ts`, the actual first declared route path (not
the filename), grepped against `client/src` for a consumer, and against
`AnaToolExecutor.ts` for a registered tool handler.

Filename-to-path guessing is unreliable here — `mdx-risk-management` serves
`/api/mdx/risk-items`, `mdx-analytics` serves `/api/mdx/analytics/portfolio` —
so a naive slug match badly overstates the gap. The numbers below come from
declared paths.

## Result

Nine route modules had **no client consumer anywhere** in `client/src` when
this was first measured. The status column tracks what has since been surfaced.

| Route | Domain | Status |
| --- | --- | --- |
| `/api/mdx/cdx` | companion diagnostics pairing | **surfaced** — CDx panel on the IVD workbench |
| `/api/mdx/clia` | CLIA complexity categorisation | **surfaced** — CLIA panel on the IVD workbench |
| `/api/mdx/software` | IEC 62304 software lifecycle | **surfaced** — "Software lifecycle" surface (SBOM/SRS/etc.) |
| `/api/mdx/ldt` | LDT inventory | screenless; engine retired, `legalStatus` returned |
| `/api/mdx/clinical-studies` | device clinical studies | **surfaced** — "Clinical studies" surface |
| `/api/mdx/rbm-board` | risk-based monitoring board | screenless |
| `/api/mdx/notifications` | notifications | **surfaced** — notifications bell |
| `/api/mdx/search` | cross-surface search | **surfaced** — ⌘K palette |
| `/api/mdx/ana-drafts` | AnA draft persistence | screenless |

The remaining screenless routes (`ldt`, `rbm-board`, `ana-drafts`) are
reachable **conversationally through AnA** but not by clicking. `qms` (a tenth,
consumed only by the separate `quality/*` app) now also has an MDX-shell
readiness view.

Placement note for the surfaced ones: each went to the surface the platform
review named for it — CDx and CLIA into the IVD programme workspace, software
lifecycle and clinical studies onto their own surfaces, search into the ⌘K
palette, notifications into the shell bell. `rbm-board` and `ana-drafts` do not
have an obvious single home, so their placement is left as a product decision
rather than an engineering guess.

Separately, `/api/mdx/qms` *is* consumed — but by `client/src/concept2cure/
quality/*`, a different module from the MDX device shell. A device team working
a submission in MDX cannot see whether its suppliers are qualified, whether
required training is current, or which audit findings threaten readiness,
without leaving for another app.

## Why this matters more than it looks

Three of these are the capabilities the platform review singles out as
differentiators against the closest competitor: companion diagnostics, CLIA,
and IEC 62304 software lifecycle. They are built, tenant-scoped, and invisible.

It also explains how the vacated FDA LDT phase-out survived so long. The LDT
compliance engine had no screen, so nobody looking at the product would notice
it was enforcing a rule struck down in March 2025 and rescinded that September.
Backends without surfaces do not get looked at, and regulatory content that is
not looked at goes stale silently. (The `legalStatus` correction is in
`server/routes/mdx-ldt.ts`; it still matters, because AnA can query the route.)

## What this is *not*

It is not "18 of 26 routes are dead". The first pass of this measurement said
something like that and was wrong — an artefact of matching filenames to paths.
Most MDX routes are wired. The deficit is concentrated in nine, and it is a
surfacing deficit, not a missing-backend one.

## Implication

This is the platform review's central thesis, measured: the backend scope of a
regulatory operating system, with a customer experience that reaches only part
of it. The remedy is not more backend. For each row above the question is
narrow — which existing surface should carry it, or does it warrant its own —
and the answer wants product input rather than a unilateral engineering call.

`/api/mdx/qms` is the clearest single win: the data is already being served and
already has a client shape in `quality/`; what is missing is a submission-facing
view of it inside MDX.
