# Competitive gap analysis: Weave Bio and Veeva Vault Basics against what already exists

**Row:** D2 (the launch catalog). **Requested by the founder**, 2026-10-30: "offer
everything weave.bio does and much more, plus what Veeva basics offers biotechs."
**Status:** analysis only. Nothing is built from this until the founder answers the
catalog decisions at the end (RULE 2); every item names what already exists (RULE 3).

## Sources and their limits

The vendors' sites (www.weave.bio, www.veeva.com) are outside this environment's
network policy and could not be read. The capability lists below come from web
search, mostly third-party comparisons, and are **not verified against the vendors'
own pages**:

- Weave Bio: [weave.bio](https://www.weave.bio/), [Submission Builder](https://www.weave.bio/platform/submission-builder/),
  [Business Wire, 2024-05](https://www.businesswire.com/news/home/20240530329583/en/Weave-Bio-Announces-$10M-in-New-Funding-and-Launch-of-Its-AI-Powered-Platform-to-Streamline-Drafting-Reviewing-Submitting-Regulatory-Documents-in-Drug-Development),
  [IntuitionLabs comparison](https://intuitionlabs.ai/articles/peer-ai-weave-bio-regulatory-tools-analysis),
  [Excedr](https://www.excedr.com/blog/weave-bio-ai-powered-regulatory-automation-for-drug-development).
- Veeva Vault Basics: [Veeva announcement](https://www.veeva.com/resources/veeva-introduces-vault-basics-for-biotechs/),
  [IntuitionLabs: Basics vs full Vault](https://intuitionlabs.ai/articles/veeva-vault-basics-vs-full-vault),
  [Clarkston](https://clarkstonconsulting.com/insights/veeva-vault-basics-for-biotech/),
  [Kivo QMS comparison](https://kivo.io/news/qms-software-for-clinical-stage-biotech-5-platforms-compared),
  [Assyro](https://www.assyro.com/blog/veeva-qualitydocs-alternatives).

**Weave Bio (as reported):** AutoIND drafts IND sections from the company's data,
public information and guidance, with source traceability; covers CTD Modules 1, 2,
3 and 5; a Submission Builder for eCTD content across the lifecycle; AI review and
verification; a health-authority questions (HAQ) manager; CMC sections regenerated
when new data (e.g. stability) arrives; NDA support announced April 2026.

**Veeva Vault Basics (as reported):** a pre-configured, pre-validated bundle with no
implementation cost: eTMF, QualityDocs, Training, Submissions; sources disagree on
whether QMS (CAPA etc.) is in it; LIMS listed separately; RIM is not in the bundle.

## What already exists

Mapped by a read-only code search of `concept2cure-v2` at `8659f315` (shallow
clone: older deletions are known only from code comments, mainly
`server/bootstrap/register-document-routes.ts:192-271`).

| # | Capability (who offers it) | Status here | Where it is | What it does not do |
|---|---|---|---|---|
| 1 | AI IND first draft, traced to source (Weave) | **Partial, in catalog** | `AuthoringAiDraft.tsx` in `document-authoring` (`authoring.router.ts:3562`, span lineage); deterministic M2 builders `m2-summary-builders.ts`, `preclinical/m26-nonclinical-summaries.ts` reached only through the package run | No one-step "draft 2.4/2.6/2.7 from our study data" in the editor; the builders' output is not opened as editable drafts. `nonclinical`, `batch-draft`, `investigator-brochure` surfaces are outside the catalog |
| 2 | CMC drafting, regenerated on new data (Weave) | **In catalog (narrow)** | `cmc` surface; `cmc/module3-compile.ts`; staleness by source hash `cmc/section-drift.ts` blocks approve/export | Small-molecule US IND only (`composition-scope.ts`, decision P-28); recompile is manual |
| 3 | AI review / QC / verification (Weave) | **Partial, in catalog** | Figure and claim checks in Authoring (`draft-figure-check.ts`, `section-claims-check.ts`, `document-figure-consistency.ts`); `SubmissionConsistency.tsx`, `SubmissionModule2Qc.tsx`, shadow review | Checks are mostly numeric; no whole-document read-through. M4/M5 QC routes have no caller |
| 4 | eCTD submission builder (Weave, Veeva Submissions) | **In catalog** | Submission Center (Planner, Builder, Validation, Dispatch, Sequences), `ectd-compile`, `gateway-transmittals`, `ind-checklist` | No content-plan / owner-matrix object (the content-plan API was retired 2026-09-22) |
| 5 | Health-authority questions manager (Weave) | **In catalog** | Communication Center: `AgencyInbox`, `AgencyResponses`, `LetterQuestionProposals`, commitments, `HaMeetings`; signed approval | No AI response drafter; `launch-scope.ts:157` comment calling agency questions locked is stale |
| 6 | NDA/BLA support (Weave) | **Partial, mostly outside** | Application types in Submission Center; `nda-cockpit`, `maa-cockpit`, `labeling-pi/-smpc` outside the catalog | CMC refuses marketing-application Module 3 (P-28 boundary) |
| 7 | Controlled documents / QualityDocs (Veeva) | **In catalog** | `quality` surface; `services/qms/*` (revisions, in-force release, Part 11 approval, periodic review, controlled copies) | No scheduled future effective dating |
| 8 | Training (Veeva) | **In catalog (SOP training)** | `quality/PersonalTrainingReader.tsx`, `TrainingCoverage.tsx`, `qms/training-assignment.ts` | No curricula, no non-SOP training |
| 9 | QMS processes (Veeva) | **Partial, in catalog** | Change control, CAPA, deviations, NC, suppliers, audits, management review in Quality | Complaints (`routes/capa-mdr.ts`) and inspections/483 (`routes/inspections.ts`) have no Quality surface |
| 10 | eTMF (Veeva) | **Exists, outside catalog** | `etmf` surface; `routes/etmf*.ts`, `services/etmf/*` (reference model, filing, completeness, inspection package) | Not in a launch app; no QC status or filing timeliness |
| 11 | RIM registrations (Veeva full Vault, not Basics) | **Exists (lite), outside catalog** | `registrations` surface; `routes/rim.ts`, `rim_lite` tables | No event/renewal/variation tracking across markets |
| 12 | LIMS (Veeva, separate) | **Missing** | — (CMC batch and stability data only) | Everything |
| 13 | Study start-up (Veeva) | **Partial, scattered** | Form 1572, IRB package in `protocol-dev`; `clinical-ops` outside catalog | No site activation tracker |

## The work, named for what it is

Inside the catalog — no founder decision needed, each is a completion:

1. **Complete** IND Module 2 drafting: open the deterministic 2.4/2.6/2.7 builders'
   output as editable, source-traced drafts in Authoring (items 1, 3).
2. **Reach** complaints and inspections (483) from the Quality surface; their routes
   exist (item 9).
3. **Complete** an AI draft for agency responses in Communication Center, over the
   existing response records and signed approval (item 5).
4. **Complete** CMC recompile on new stability data (trigger, not just a stale flag)
   within P-28's boundary (item 2).
5. **Fix** the stale `launch-scope.ts:157` comment.

## Decisions for the founder (catalog widening, RULE 2)

Each would be recorded in `shared/constants/launch-scope.ts` as a dated decision, as
P-28 recorded CMC. The code exists for all but LIMS.

| Decision | What it admits | Existing code | Why it matters competitively |
|---|---|---|---|
| A | **eTMF** as a launch app (or inside Projects) | `etmf` surface + `routes/etmf*` | Core of Veeva Basics |
| B | **Registrations (RIM lite)** | `registrations` surface + `routes/rim.ts` | Veeva full Vault, not Basics: beyond Basics |
| C | **NDA/BLA cockpit** and widening CMC's P-28 boundary to marketing applications | `nda-cockpit`, `maa-cockpit`; `cmc/composition-scope.ts` | Weave announced NDA support (April 2026) |
| D | **Nonclinical / Investigator's Brochure** authoring surfaces | `nonclinical`, `investigator-brochure` | Weave's AutoIND covers these |
| E | **LIMS** | none | Veeva lists it separately; new build, the largest |
| F | **Study start-up / clinical ops** | `clinical-ops` (partial) | Veeva Study Startup; not in Basics as reported |

Recommendation: A and D first (code exists, closest to what both competitors sell
to the same small biotechs); B next; C after D7 (one real sequence) is green; defer
E and F.
