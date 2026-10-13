# The E6(R3) gate had two holes, and fourteen wrong citations behind them (2026-10-12)

**Row:** D2 (AnA document intelligence). **Workstream:** the regulatory record.

## The gate that already existed

`tests/regulatory/ich-e6r3-citations.test.ts` (2026-10-08) holds one rule:

> "E6(R2)" appears only where the text says it is superseded or historical, never as the guideline
> in force; and every "E6(R3)" citation that names a section names one in
> `shared/regulatory/ich-e6r3.ts`.

It reported the platform clean. It was scanning:

```ts
const SCAN = ['server', 'shared', 'client/src'];
…
else if (/\.(ts|tsx)$/.test(name) && …) out.push(p);
```

Two holes, found while fixing one citation on an unrelated row:

1. **A whole top-level source tree was missing.** The repository's root-level `services/` directory
   — the submission pyramids, the risk-factor tables, the protocol analyser — was not in `SCAN`.
2. **Only `.ts` and `.tsx` were read.** `server/api/validation/index.js` is a `.js` file inside a
   scanned directory and was skipped for four citations; `scripts/` is all `.mjs`.

A gate that misses a whole source tree, and a gate that an extension defeats, are documentation
with a warning label — the phrase CLAUDE.md Rule 0 uses for exactly this failure.

## The fourteen citations behind them

ICH E6(R3) reached Step 4 on **2025-01-06** and supersedes E6(R2) (currency fact
`ich-e6r3-gcp-step4`). Its numbering is not R2's: the Investigator's Brochure (R2 §7), the protocol
(R2 §6) and essential documents (R2 §8) became **Appendices A, B and C**; the investigator (R2 §4)
and sponsor (R2 §5) sections became **Annex 1 §2 and §3**; data governance is a new **§4**. An R2
section number given to a sponsor as the guideline in force is **wrong, not merely dated**.

| File | Said | Now |
|---|---|---|
| `services/regulatory/pyramids/ind-pyramid.ts` (2) | ICH E6(R2) | ICH E6(R3) |
| `services/regulatory/pyramids/ind-amendment-pyramid.ts` | ICH E6(R2) **Section 7** | `e6r3Ref({appendix A})` |
| `services/regulatory/pyramids/ind-amendment-pyramid.ts` | ICH E6(R2) **Section 4.8** | `e6r3Ref({annex1 §2.8})` — Informed Consent of Trial Participants |
| `services/regulatory/pyramids/ind-amendment-pyramid.ts` | ICH E6(R2) | ICH E6(R3) |
| `services/regulatory/pyramids/ind-safety-supplement-pyramid.ts` | ICH E2F, ICH E6(R2) | ICH E2F, ICH E6(R3) |
| `services/ai/detectors/ProtocolDesignAnalyzer.ts` | ICH E6(R2) - GCP | ICH E6(R3) - GCP |
| `services/ai/risk-factors/ind-risks.ts` | Complete IB per ICH E6(R2) | …per ICH E6(R3) Appendix A (Investigator's Brochure) |
| `server/api/validation/index.js` (3 of 4) | ICH E6(R2) Section 6; Section 6.1; "as defined in ICH E6(R2)" | ICH E6(R3) **Appendix B** (Clinical Trial Protocol and Protocol Amendment(s)) |
| `server/api/validation/index.js` | FDA Guidance for Industry **E6(R2)** | FDA Guidance for Industry — ICH **E6(R3)** Good Clinical Practice |
| `scripts/audits/generate-evidence-pack.mjs` | ICH E6(R2) §5.5.3 | ICH E6(R3) **Annex 1 §4.3** (Computerised Systems) — `r3ForR2('5.5.3')` |
| `scripts/seed/ga-demo.d/124-investigator-brochure.mjs` | ICH E6(R2) §7 | ICH E6(R3) **Appendix A** |
| `scripts/demo/launch-demo/packs/biotech-content.mjs` | ICH E6(R3) **§5** | ICH E6(R3) **§3.16** (Data and Records) |

The last one is not a superseded citation — it is a **section that does not exist**. E6(R3) Annex 1
ends at §4. It was written beside 21 CFR Part 11 and 312.57, so the content is records and data:
§3.16. Only the extension widening made it visible.

`generate-evidence-pack.mjs` writes into a **client-facing evidence pack**, so its wrong citation
was not an internal comment.

Where a section is named, the citation now comes from `e6r3Ref()` rather than a string, so it
cannot drift from the record. Where none is named, it is the plain guideline name.

## Verified by making the check fail

The gate **is** the test, so the red is the gate itself, widened:

```
× never cites E6(R2) as the guideline in force
  services/ai/detectors/ProtocolDesignAnalyzer.ts (1)
  services/ai/risk-factors/ind-risks.ts (1)
  services/regulatory/pyramids/ind-amendment-pyramid.ts (3)
  services/regulatory/pyramids/ind-pyramid.ts (2)
  services/regulatory/pyramids/ind-safety-supplement-pyramid.ts (1)
```

then, with the extension filter widened as well:

```
× never cites E6(R2) as the guideline in force
  server/api/validation/index.js (4)
  scripts/audits/generate-evidence-pack.mjs (1)
  scripts/seed/ga-demo.d/124-investigator-brochure.mjs (1)
× every E6(R3) citation that names a section names one that exists
  scripts/demo/launch-demo/packs/biotech-content.mjs: "E6(R3) §5"
```

Both widenings were run red **before** any citation was changed, and each named every file. The
qualified comments this session wrote in `ind-pyramid.ts` ("E6(R2) §7 is the superseded numbering
for this content") passed both runs, which is the rule working: a citation that says it is
superseded is not a citation of a superseded guideline.

## What this does not do

- The scan still stops at `SCAN`'s five directories. `workers/`, `ingestion/`, `config/`,
  `database/`, `db/`, `schemas/`, `skills/` and `templates/` were measured at **zero** E6 citations
  of either revision, so widening further would add scan time for nothing today. The honest
  statement is that they are unscanned, not that they are clean in perpetuity.
- The record's own basis is unchanged: every E6(R3) entry is `recall` and says so, because ich.org
  is unreachable from the build environment. Reading the Step 4 text would raise it to
  `regulator-text`. That is the record's own note, not this step's.
