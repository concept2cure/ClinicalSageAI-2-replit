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

Nine route modules have **no client consumer anywhere** in `client/src`:

| Route | Domain | AnA tool handlers |
| --- | --- | --- |
| `/api/mdx/cdx` | companion diagnostics pairing | `design_cdx_codevelopment`, `pair_companion_diagnostic` |
| `/api/mdx/clia` | CLIA complexity categorisation | `categorize_clia_complexity` |
| `/api/mdx/software` | IEC 62304 software lifecycle | `create_software_lifecycle_item` |
| `/api/mdx/ldt` | LDT inventory | `register_ldt` |
| `/api/mdx/clinical-studies` | device clinical studies | 3 |
| `/api/mdx/rbm-board` | risk-based monitoring board | 6 |
| `/api/mdx/notifications` | notifications | 1 |
| `/api/mdx/search` | cross-surface search | 30 |
| `/api/mdx/ana-drafts` | AnA draft persistence | — |

Every one of them is reachable **conversationally through AnA**. None of them
is reachable by clicking.

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
