# Biotech document readiness — product-management assessment (2026-07-30)

## Scope and verdict

This assessment answers a single product question: **can a biotech client take a
program from preclinical data into an IND, through the agency, and all the way to
a BLA or NDA — and does the platform hold the document types and templates for
the FDA, EU, Health Canada, and PMDA to do it?**

**Verdict: the end-to-end drug-development lifecycle spine is now in place and
wired for the four named regions; the platform can build and enhance regulatory
documents today; but "every FDA form" and the full 158-type catalog are not yet
release-grade — official FDA PDF assets and ~137 dedicated dossier blueprints
remain as a bounded, enumerated backlog.**

Nothing in this document is aspirational. Every claim is checked against code at
HEAD and is reproducible with `npm run report:regulatory-coverage` and the tests
in `tests/regulatory/`.

## The lifecycle spine is green (FDA / EU / Canada / Japan)

The core biotech pathway — preclinical/Pre-IND → clinical (IND/CTA/CTN) →
marketing authorization (NDA/BLA/MAA/NDS/Japan approval) — now resolves to a
real, region-specific authoring structure for every named region:

| Phase | US (FDA) | EU (EMA) | Canada (HC) | Japan (PMDA) |
|---|---|---|---|---|
| Preclinical / Pre-IND | Pre-IND briefing package (buildable) | — | — | — |
| Clinical trial entry | IND ● | CTA ● | CTA ● | CTN ● |
| Marketing authorization | NDA ●, BLA ● | MAA ● | NDS ● | Marketing Approval ● |

● = production-ready (dedicated section **and** task blueprints).
Verified by `tests/regulatory/registryCoverage.test.ts` and
`getLifecycleSpineStatus()`.

## Portfolio coverage (the honest numbers)

`buildCoverageReport()` over the 158 active registry entries:

| Readiness tier | Count | Share | Meaning |
|---|---|---|---|
| `production_ready` | 13 | 8% | Dedicated region-specific section **and** task blueprints |
| `buildable` | 8 | 5% | Real (non-generic) section structure; generic task plan |
| `catalog_only` | 137 | 87% | Selectable catalog entry that still resolves to the generic CTD outline |

By region (production-ready / buildable / catalog-only):
FDA 3/7/52 · EMA 2/1/27 · Health Canada 2/0/6 · PMDA 2/0/4 · plus ICH/ISO/IEC
global (0/0/22) and the secondary regions (UK, CN, AU, BR, IN, KR, CH, SG).

Read this correctly: the 158-entry registry is a genuine, well-modelled **catalog**
of every application/document type across 16 agencies. "Catalog-only" does not
mean broken — it means the type is selectable and correctly classified but does
not yet have a bespoke dossier blueprint, so project creation would seed it with
the generic CTD outline. The backlog is fully enumerated by
`getCatalogOnlyGaps()` / `npm run report:regulatory-coverage`.

## What is genuinely in place today

- **Global document registry** — `shared/regulatory/global-document-registry.ts`:
  158 application/document types, 16 agencies, two-axis taxonomy (region/agency ×
  segment/category), legacy-type resolution. This is a strong asset.
- **Submission pyramids** — `services/regulatory/pyramids/*`: detailed, typed task
  graphs for IND, NDA, BLA, MAA, JNDA, 510(k), PMA, De Novo, plus IND
  amendment/annual/safety, each with ICH/CFR references, CTD bindings, risk
  models, and deliverables.
- **AI authoring engine (build)** — `server/services/ana/AnaDocumentDraftingService.ts`
  (Claude Opus, framework-aware, RAG-grounded, streamed, persisted as governed
  drafts with citations), the deterministic M2/M3 composers
  (`server/services/m2-summary-builders.ts`, `module3Composer.ts`),
  `server/services/authoring/*` (section generation, IB, nonclinical), and
  DOCX/PDF/XML rendering (`biotech-artifact-generator.ts`, `server/services/docx/*`).
- **AI enhancement engine (improve)** — `server/services/ai-actions/*`, mounted at
  `/api/ai-actions`: rewrite/summarize/explain/compare selections and a
  validation→refinement loop, gateway-backed, deterministically grounded,
  versioned, and audited. This is real and wired end-to-end.
- **Authored DOCX templates** — `server/services/docx/templateRegistry.ts`: fully
  authored blueprints for IND, 510(k), CSR (ICH E3), and CER (EU MDR).
- **eCTD assembly** — `server/services/ectd/*`: structurally valid backbone + MD5
  + regional M1 assembly with region-aware validation rules (US/EU/JP/CA/CN/KR).
- **FDA forms subsystem** — `server/config/FDAFormsRegistry.ts` +
  `server/services/ind-forms/*`: a canonical form registry, deterministic field
  builders and QC for the seven priority clinical/common forms (1571, 1572, 1574,
  3454, 3455, 356h, 3674), a fail-closed reconciliation gate, and an
  AcroForm-fill path gated on verified official assets.

## What changed in this cycle

All changes are additive, tested, and typechecked; none touch regulated artifact
tables or weaken a governance gate.

1. **Wired the orphaned region blueprints (the coverage-cliff fix).** The
   per-region section and task blueprints for the EU, Canada, Japan, China,
   Brazil, India, and Australia, and the US NDA/BLA, were authored but imported
   nowhere (a documented orphaning: `getTaskBlueprint` had zero call sites; the
   `sectionBlueprint` exports were consumed nowhere). They now resolve through a
   new `sectionBlueprintCatalog` (mirroring the existing `taskBlueprintCatalog`)
   in `projectBootstrapFromRegistry` and the bootstrap preview. This moved ~11
   types — including the named regions Canada and Japan — from the generic CTD
   fallback to their real bespoke structures.
2. **Completed the Canada and Japan lifecycle entry points.** Added dedicated
   Canada CTA (`canadaCtaBlueprint`) and Japan CTN (`japanCtnBlueprint`)
   blueprints, and a Health Canada regional Module 1 in the CTD normalizer, and a
   US Pre-IND briefing-package blueprint. The full spine above is the result.
3. **Made readiness machine-verifiable.** New `registryCoverage.ts` computes
   per-type and portfolio coverage; `tests/regulatory/registryCoverage.test.ts`
   locks the lifecycle spine so a core type cannot silently regress to
   catalog-only; `npm run report:regulatory-coverage` prints the operator report.
4. **Added Canada and Japan eCTD backbone references.** `templates/ectd/hc_template.xml`
   and `pmda_template.xml` join the existing FDA/EMA reference backbones
   (the set previously covered US and EU only).
5. **Built the FDA form-acquisition job.** `scripts/fetch-fda-forms.ts` +
   `server/config/fdaFormsCatalogSnapshot.ts` reconcile the registry against a
   candidate catalog and download/hash/manifest official PDFs into
   `templates/forms/acroforms/`. It is fail-closed: it fabricates no checksum and
   no asset, and in this GxP environment it reports the blocked FDA host rather
   than routing around the egress boundary.

## Go-to-market blockers (honest, prioritized)

1. **Official FDA PDF assets are not installed** (audit F-02). Form rendering
   falls back to conspicuous watermarked drafts and must not pass approval,
   signature, export, or submission gates. Unblock: run
   `scripts/fetch-fda-forms.ts` from an environment whose egress policy permits
   `fda.gov` (this session's does not), then a reviewer completes each manifest's
   `fieldMap` and sign-off. Mechanism is built; execution is blocked on network +
   human review.
2. **The FDA catalog is not live-verified** (audit F-01). The candidate snapshot
   aligns with the registry at the form-number level but is marked
   `reviewed: false`; currency and completeness require a network-enabled reviewed
   ingestion.
3. **137 document types are catalog-only.** Prioritized backlog: the
   highest-value near-term targets are the cross-cutting clinical documents
   (ICH CSR, Protocol, IB, DSUR, PSUR) and the US post-approval lifecycle
   (supplements, annual reports, REMS) — several of these already have authored
   DOCX templates or prompt-hint seeds even though they lack a bootstrap section
   blueprint, so the gap is smaller than the raw count suggests.
4. **The in-canvas authoring UI is the weakest layer.** Per
   `PRODUCT_READINESS_ASSESSMENT.md`, the rich-text editor's section-save to the
   audited backend is tracked, not wired; the CRDT collaboration server has no
   client consumer; `DocumentStudioPane` is preview-only. This is a frontend
   workstream, not a document-coverage gap.
5. **eCTD archival fidelity is partial.** Leaf rendering is text-fidelity (PDF/A
   is a separate LibreOffice path) and the LORENZ eValidator adapter is not yet
   implemented.

## How to verify

```
npm run report:regulatory-coverage        # portfolio readiness + lifecycle spine + backlog
npm run report:regulatory-coverage -- --json
npm run fetch:fda-forms -- --reconcile-only   # registry ↔ FDA catalog reconciliation
npx vitest run tests/regulatory/registryCoverage.test.ts \
               tests/regulatory/projectBootstrapFromRegistry.test.ts \
               tests/routes/concept2cure-regulatory-catalog.test.ts
```

## Bottom line for biotech clients

A client can start a program in any of the four named regions and get a real,
region-correct dossier structure and task plan from Pre-IND through
NDA/BLA/MAA/NDS/Japan approval, draft and enhance the content with the AI engine,
and assemble a structurally valid eCTD. The remaining work to call the product
"every document, every form, submission-grade" is bounded and enumerated: install
and verify the official FDA form assets (mechanism shipped, network + review
pending), work the 137-type dossier-blueprint backlog in priority order, and wire
the in-canvas editor's audited save path.
