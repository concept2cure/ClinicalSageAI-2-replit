# D4 — AnA's tools do not report work they did not do, or a regulatory fact nothing established

Row **D4** (validation package; "a tool that asks a model for a figure is a defect").
AnA local-safe-AI plan **WS4** (honest tools, tools half) and **WS7** (`check_consistency`
on engines). Session `…01SuVLo2`, 2026-09-30 → 2026-10-01. Lane row in
`docs/work-orders/README.md`.

Every defect below was measured at `9639c5f4` before the lane was claimed, fixed
failing-first, then reviewed adversarially by agents that ran each tool on realistic
inputs; every review finding taken was pinned red first as well.

## What each tool did, and does now

| Tool | Before | Now | Commits |
|---|---|---|---|
| `lookup_fda_guidance` | A three-entry map: unverified docket numbers, requirements from memory ("software level of concern", replaced 2023; 21 CFR 820.30(g), superseded by the QMSR), a fixed CFR list for any other topic | The dated US facts the verified currency registry holds for the topic, each with source and verification age; says no FDA guidance index is connected | `fa596a0a` |
| `fetch_fda_guidance_list` | Queried openFDA's **substance** endpoint and returned each chemical as an FDA guidance, the caller's status echoed into every record | `unavailable`, no request (plan open decision 11: which index) | `fa596a0a` |
| `check_guidance_freshness` | A citation it could not find was `current: true`; E6(R2) read current; "ICH E9(R1)" dated as E6(R3); a 510(k) guidance dated by the eSTAR mandate; "IVD" read as the void LDT rule | Identified only by ICH code, a superseded revision, an alias a document cites the fact by, or its id; anything else `unverified` (`current: null`); every verdict names its registry entry and source | `fa596a0a`, `901dbefa` |
| `fetch_ich_guideline_updates` | A static list labelled `source: 'ich.org'`, pedigree `external_api_live`; M11, Q12, Q14 misdated; an unsourced "M4(R4), Step 2, 2025-06" | `curated_registry`, `deterministic_registry`; dates corrected; the M4(R4) entry removed | `fa596a0a`, `901dbefa` |
| registry topic search | Substring: "training" matched the EU AI Act's "AI" | Whole words, plurals included ("laboratory developed tests" finds the void LDT rule) | `fa596a0a`, `901dbefa` |
| `generate_citation` | A template per type: a journal article was `[Author(s)]. "[Title]." [Journal]` | Journal: PubMed/Crossref record formatted (Vancouver/AMA), or no citation; PMID before DOI so a retraction is seen; Crossref says retraction not checked. ICH: corpus title. Others: from the identifier, labelled `not_verified` | `00b361e7`, `901dbefa` |
| `validate_cross_references` | Read nothing; every reference `unverified` | The tenant's document and project outlines: found here / in another document (named) / `outline_only` (an empty template heading) / `parent_only` / `not_found`; tables, figures, appendices `not_assessed` | `00b361e7`, `901dbefa` |
| `rasterize_page` | `success: true` and a shell command it never ran, for any path | Confined input; DOCX via the one pipeline; a PNG that exists, with size, dpi and SHA-256; a 40 Mpx cap; uploads read by their bytes; says the image is not shown to anyone | `fe749b1a`, `577edd73` |
| `pdf_overlay` | Overlays "queued", stamps and signatures included; nothing written | `unavailable`; out of the governed-write gate until an engine exists (plan WS13; founder decision 8) | `fe749b1a`, `577edd73` |
| PMDA / NMPA connectors | Every search answered with the query as a scored result; ranked beside real hits; "primary authority" in deep research; catalog promised translation | Search and fetch refuse with where to look by hand; `available: false`, never configured, never preselected; repository search lists no failed connector as searched | `00a54b60`, `577edd73` |
| `check_consistency` | A model labelled each pair match/conflict; its JSON persisted as findings, audited as `AI_GENERATE` | Labelled figures compared by the reconciliation engine: one value per side, bounds as bounds, coarser precision, no verdict for arm counts or sidedness; every figure without a verdict returned with why; `CONSISTENCY_CHECK` | `e2c37f32`, `48479333` |

## Red and green

| Slice | Red | Green |
|---|---|---|
| Guidance tools | `red/guidance-tools.txt`: 17 of 29 fail at `4240ae0e`, tests only | `green/guidance-tools.txt`: 994 |
| Citations, cross-references | `red/citation-and-xref.txt`: 20 of 20 at `c026894b` | `green/citation-and-xref.txt`: 20 |
| Page tools | `red/page-tools.txt`: 8 of 8 at `00b361e7` with trunk handlers | `green/page-tools.txt`: 962 |
| PMDA / NMPA | `red/pmda-nmpa.txt`: 10 of 10 at `fe749b1a` | `green/pmda-nmpa.txt`: 49 |
| Review round 1 (guidance, citations, xref) | `red/review-round-1.txt`: 27 of 92 | `green/review-round-1.txt`: 121 |
| Review round 2 (page tools, connectors) | `red/review-round-2.txt`: 10 of 31 | `green/review-round-2.txt`: 1,009 |
| Consistency | `red/consistency.txt`: 4 of 4 at `0f029d44` (the check calls the model) | `green/consistency.txt`: 174 |
| Review round 3 (consistency) | `red/review-round-3.txt`: 9 of 10 against `e2c37f32`'s comparison | `green/review-round-3.txt`: 179 |

The green files of the first slices predate the review rounds that changed the same
code; the review-round greens are the current state. Wide run before the second push:
282 test files, 4,019 tests across `server/services/ana`, the path-scope contract,
lumen-context, regulatory-currency, connectors and truth-engine, all passing. Typecheck
gate 0 at every push; the pre-push hook passed each push (`c026894b`, `0f029d44`, and
this lane's release).

The push gate also caught one of this lane's own defects: the connectors' `search` /
`fetch` had dropped their parameters, and the four test calls that passed a query failed
the typecheck (`577edd73` restores them).

## Not done here, and where it goes

- **Four more ICH lists disagree** (`ana-ri/ich-guideline-corpus.ts`,
  `global-ri/ich-guideline-catalog.ts`, `shared/constants/domain/mappings/ich-guideline-registry.ts`,
  `server/data/ich-guidelines-comprehensive.json`) — zero duplication, a lane of its own.
- **Deep Research shows an errored connector as "done, 0 hits"**
  (`deep-research-board.routes.ts`, `DeepResearch.tsx`); PMDA/NMPA no longer reach it,
  other errors still do.
- **The DOCX→PDF pipeline has no timeout** (`docx-pdf-pipeline.ts`).
- **No browser client calls `POST /api/submissions/:id/consistency`**; if one is added,
  `X-Consistency-Not-Compared` goes on the CORS expose list with it.
- **Founder decisions** this lane did not take: the FDA guidance index (open decision 11);
  keep or remove `pdf_overlay` until the bind engine, and the PMDA/NMPA connectors (8).
- **The sandbox and image stack** halves of WS4 (`run_python_script` attestation, the
  production Python packages) — their own rows.
