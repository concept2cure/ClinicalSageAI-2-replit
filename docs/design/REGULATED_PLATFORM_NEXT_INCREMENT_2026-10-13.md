# Regulated platform: next implementation increment

Read-only audit of the current `concept2cure-v2` checkout, 2026-10-13. This moves
W1 / D2 and informs D7. The baseline HEAD at inspection was
`e198f24a5758accf206fb2bf5f784fb5636b328c`; the current workflow bridge is also
present in the shared working tree. No production file changed in this audit.
Tests below are existing coverage, not a claim that every named suite was rerun.
The independent native bridge run separately passed 19/19 as the restricted
runtime role. A small pure-function execution reproduced the readiness defect
described below; no model, agency call or heavy test workload was used.

## What the platform actually has

| Need | Existing working architecture | Boundary still owed |
| --- | --- | --- |
| Protocols | `server/services/protocol-development/protocol-development-service.ts` persists clinical, IRB, IACUC and IBC documents, sections, objectives, eligibility, visits and versions. The SoA, reviews, signing and export services are real. The new bridge copies stored structure into canonical governed Authoring. | `finalizeProtocolTx` uses the structural completeness gate; `protocol-rule-pack.ts` explicitly says that gate does not establish compliance with all cited standards. Its richer findings include attention and not-assessed states. Finalized authoring is not universal legal/scientific acceptance. |
| CSR / Module 5 | `server/services/csr-builder.ts` and the durable job runner retain section output and provenance, reject unresolved placeholders as completion, and support ICH E3 structure. `csr/load-csr-inputs-for-project.ts` reads the latest completed generation per study; the bridge permits genuine assigned review and holds retained unqualified machine prose. | Study data are not yet ingested through an authoritative ADaM/SDTM extractor for CSR tabulation. A completed build does not establish computed results, source approval or scientific qualification. |
| CTD Modules 2–5 | `m2-summary-builders.ts`, `authoring/nonclinical-study-report-builder.ts`, the M2/M4/M5 QC services, CMC composition, submission leaves, package assembly, signing and dispatch checks all exist. | These are composition/QC/filing components. A seeded outline or a valid ZIP does not prove a complete, approved full dossier. The standalone CTD report currently overclaims partial supplied QC. |
| BLA / biologics | `server/routes/biopharma/bla-workbench.ts` runs and retains analytical similarity, comparability, immunogenicity and filing-risk assessments with sign-off. Manual governed Authoring and Vault are available. | `server/services/cmc/composition-scope.ts` intentionally refuses biologic/ATMP and marketing-application Module 3 composition. Q6B, Q5A(R2), Q5C, cell-bank and marketing specification models are not supplied by the small-molecule US IND composer. An assessment workbench is not a BLA dossier. |
| Global regional filing | Canonical market support, filing identity, regional report engines and package status distinguish authoring, outlines, assembly and transport. | `ectd/regional-backbone-readiness.ts` says FDA alone has a structure-reporting builder, evaluated per actual build. EMA/PMDA/Canada are flat; eight other region builders reuse an EMA placeholder. New PMDA applications require v4 while current market support refuses that claim for the v3.2.2 builder. |

Relevant existing coverage includes:

- `server/services/protocol-development/__tests__/protocol-rule-pack.test.ts`,
  `protocol-signature.pglite.integration.test.ts`,
  `server/services/protocol-reviews/__tests__/reviewer-name-binding.pglite.integration.test.ts`
  and the protocol export tests.
- `server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts`,
  `unsupplied-statistics.test.ts`, `csr-latest-completed-generation.pglite.test.ts`,
  and `tests/db/workflow-import-governance.dbtest.ts`.
- `server/services/authoring/__tests__/m2-summary-qc.test.ts`,
  `m4-nonclinical-qc.test.ts`, `m5-clinical-qc.test.ts`,
  `server/services/ectd/__tests__/required-sections.test.ts`,
  `assess-dispatch-readiness.gates.test.ts` and regional-backbone tests.
- `server/services/cmc/__tests__/composition-scope.test.ts`,
  `composition-scope.pglite.test.ts`,
  `server/routes/biopharma/__tests__/bla-workbench-read.test.ts`,
  and `server/services/regulatory/__tests__/market-support.test.ts`.

## Priorities after the current bridge and project-parent access work

**P0 — remove the remaining false full-CTD readiness claim.**
`server/routes/authoring-pdf.routes.ts:134` accepts `m1/m2/m4/m5` QC verdicts
straight from the request body. It performs no program, application, market,
current content or source lookup. It is reachable: bootstrap mounts
`/api/authoring-pdf` behind authentication, then the route requires
`regulatory-author`. No client caller was found. JSON and `?format=pdf` are both
supported; the PDF is described as an attachable inspector report.

`aggregateCtdAuthoringReadiness` counts absent modules as warnings, omits M3
entirely, and requires only one supplied module to regard the request as assessed.
The existing test at `authoring/__tests__/ctd-authoring-readiness.test.ts:61`
explicitly expects M2 alone to be ready. `ctd-readiness-renderer.ts:24` turns that
into `READY — no blocking findings`.

Executed red proof, using only synthetic supplied QC:

```ts
const result = aggregateCtdAuthoringReadiness({
  m2: { ready: true, counts: { errors: 0, warnings: 0 }, findings: [] } as never,
});
// Observed: ready=true, assessed=true; M1/M4/M5 present=false; no M3 row.
readinessVerdict(result); // "READY — no blocking findings"
```

This is distinct from the current regional reporting engine. In
`server/services/report-os/regional/filing-readiness.ts:328`,
`module_completeness` explicitly means **Module 1 only**, with Modules 2–5
unexamined. Its narrowed dependency declaration should be preserved.

**P1 — connect real locked study data to CSR results.**
`server/routes/submission-orchestrator.ts:297` explicitly records that
`clinicalStudyData` has no loader and accepts its values from the body in both
project and inline modes. `csr-tabulation-builders.ts` then tabulates typed
inputs, including already supplied efficacy values, confidence intervals and
p-values. It is not an ADaM analysis engine. The CSR reader deliberately uses a
pointer to §11.4 instead of treating drafted prose as a computed primary result.
The next data increment should admit exact retained dataset bytes/version/hash,
study identity, analysis population, SAP version and recorded database-lock
state; preserve a calculation manifest; validate one explicitly supported
tabulation before widening coverage. `cdisc/cdisc-package-readiness.ts` currently
checks declared metadata, reads no XPT/Define-XML bytes and does not assess SEND.

**P1 — make protocol finalization evidence and concurrency explicit.**
The original protocol service's `completenessInputFor` reads through the global
pool, even when `finalizeProtocolTx` has a transaction and parent lock. Child
writers' `requireProtocolForWriteTx` checks editable status without reserving
that parent. This is a static concurrency risk requiring a native FIFO proof;
it is not claimed as a reproduced violation here. Use the caller's transaction
for the full signed structure and exercise original-protocol section/SoA writes
against finalization. Keep structural completion separate from regulatory
findings, evidence review and jurisdiction-specific applicability; a status flag
or section title cannot establish substantive compliance.

**P1 — implement biologic/marketing quality support as a separate bounded
composition scope.** Preserve the present typed refusals. Start with one declared
product modality and filing type, its required source registers, validated
biologic specifications/viral safety/cell-bank content and a governed release
path. Do not enable BLA by removing the US IND small-molecule gate. The current
manual path remains available while that evidence is built.

**P1 — qualify one real market package and transport before claiming global
dispatch.** `submission-gateways/ectd-structural-validator.ts` explicitly offers
internal validation, not agency conformance. `ectd/ectd-regional-rules.ts:505`
records only minimum generic checks for UK/AU/CH/BR/IN/SG.
`submission-gateways/transport-refusals.ts` records unproven FDA ESG signing/test
acceptance, refused PMDA protocol and unsourced regional adapters.
Real agency artifacts, validator evidence and a sponsor test acknowledgement
chain remain delivery dependencies. Production deployment secrets, audit-chain
verification, model qualification and restore/security evidence are also not
certified by the local bridge tests.

## Recommended next bounded implementation

First close P0 within the existing QC/reporting path. Production ownership is
`authoring-pdf.routes.ts`, `ctd-authoring-readiness.ts` and
`ctd-readiness-renderer.ts`, with their two existing tests and a focused HTTP
route regression. No migration, new application or parallel readiness service is
needed for this first correction.

1. Treat supplied verdicts as **supplied-module QC**, with explicit scope,
   supplied/unverified basis, assessed and omitted modules, and limitations in
   both JSON and PDF. A clean supplied QC result can say its assessed inputs had
   no blocking QC findings; it cannot say the dossier or regulator is ready.
   Preserve useful partial QC for an early IND without fabricating an absent
   phase-3 CSR requirement.
2. Represent full dossier readiness as not assessed for this endpoint. Neither
   adding four `ready:true` objects nor passing a client application/market
   string upgrades supplied QC to verified readiness. Include the unassessed M3
   boundary explicitly. Preserve zero-input honest behavior and feed-forward
   findings.
3. Add red-to-green JSON/PDF tests for one-module clean input, forged all-module
   verdicts, omitted M3, absent context, contradictory counts and claimed origin.
   Preserve legitimate subsection QC and its exact scope.

Then extend the **existing canonical dispatch assessor**, not this request-body
QC report, for full dossier coverage. `ectd/assess-dispatch-readiness.ts` already
loads stored sequence identity, current leaves, pinned content, approvals and
server-computed findings. Bind its application type, market, original/continuing
sequence and effective-date context to authoritative rows; reuse
`ectd/required-sections.ts`, the governed rule pack and market support. A missing
or unreadable authoritative profile is unverified, not a fallback readiness
pass. Required applicability, scientific review, approved current source
versions, packaging conformance and accepted transport must remain separate
verdicts. This gives clients a useful whole-dossier gap inventory while preserving
the actual limits of each check.
