# The 2.3 and Module 3 now cite the same records and the same procedures

**Package:** S7 (CMC). **Roadmap:** §11 phase 4, the acceptance clause *"QOS and Module 3 share atoms and method
references"* (`docs/design/ONE_DESIGN_PLAN.md` §11 table). **Date:** 2026-11-08.

## The gap

`ComposedSection` (`server/services/module3Composer.ts:97`) carries both things the clause asks for:

- `lineage: Array<{ sourceObjectId, sourceHashAtCompile }>` — the **atoms**: every CMC source record the section
  composed from, by id and by its hash at the moment of compile;
- `structuredPayload.sourceObjects` — those records themselves, the `method` register rows among them, which is what
  the section's own *Analytical Methods* table is rendered from.

`buildM23QualityOverallSummary` received the sections and dropped both. What it kept was `inputSectionKeys`, which
names **sections**, not records. Two consequences, each visible to a reviewer of the filed dossier:

1. **The same number at two levels of traceability.** A figure in 3.2 can be traced to the record that produced it
   and to that record's hash; the identical figure in 2.3 could not be traced at all. One dossier, one data set, two
   standards of provenance.
2. **A cross-reference that named nothing.** The QOS closed with

   > Cross-references: Full data and analytical methods are provided in Module 3.

   printed whether or not a single analytical procedure was recorded, and naming none of them. ICH M4Q(R1) asks
   2.3.S.4.2 and 2.3.P.5.2 to summarize the analytical procedures. Worse, the QOS takes each section's **first**
   table as its headline, and 3.2.S.4's first table is the acceptance criteria — so the composed *Analytical Methods*
   table reached the 2.3 **by no route at all**, while the sentence above told the reader it was elsewhere.

This is the same class of defect as the Specifications banner fixed earlier the same day
(`docs/evidence/F1/2026-11-08-specification-method-gate/`): a document stating a thing that nothing in the product
backs. A reader takes a printed cross-reference as having been made.

## What already exists (RULE 3)

Searched for a QOS builder, a method-reference reader and a lineage collector before writing anything:

| Path | What it does today | What it did not do |
|---|---|---|
| `server/services/m2-summary-builders.ts` | Builds 2.3 from `ComposedSection[]`, with per-section completeness, gaps and a headline table each | Carried no atoms and no procedures |
| `server/services/module3Composer.ts` | Composes all 17 sections; sets `lineage` and `structuredPayload.sourceObjects`; renders *Analytical Methods* in 3.2.S.4 and 3.2.P.5 | — (unchanged by this slice) |
| `server/services/ana/cmc-quality-summary-tool.ts` | `draft_quality_overall_summary_m2_3`: composes the open program's 2.3 deterministically from its own records | Returned prose, tables, completeness and gaps only |
| `server/services/cmc/analytical-method-source.ts` | `loadProjectAnalyticalMethods` — the method register read, used by the ICH Q2 check and the specification approval gate | **Deliberately not used here**: see below |

**Why not a second read of the register.** `loadProjectAnalyticalMethods` would answer the same question from the
same table, and two reads that agree today are not *sharing* — they are two sources of truth that will disagree the
first time one of them is filtered differently. The atoms and the procedures are therefore **derived from the
sections the builder was already given**, so the 2.3's records are the 3.2's records by construction. Nothing is read
a second time, and no new query exists to drift.

## The change

`server/services/m2-summary-builders.ts`

- `M23Summary extends M2Summary` with required `lineage: SectionAtom[]` and `methodReferences: QosMethodReference[]`.
  A type of its own rather than two optional fields on `M2Summary`: 2.4, 2.5 and 2.7 build from study and CSR fields
  that carry no record identity, so a `lineage: []` on them would assert *"no records"* where the truth is *"no
  record identity to assert"*.
- `qosAtoms` — the union of the summarized sections' lineage, each record **once** however many sections read it (a
  specification feeds 3.2.S.4 and 3.2.P.5 alike), and **only** from sections the 2.3 actually summarizes: 3.2.A.2's
  record belongs to Module 3's lineage, not the 2.3's.
- `methodPayloadsOf` / `methodReferenceOf` / `qosMethodReferences` — the procedures, by name (or code when a record
  has no name), with technique and validation status, under every 2.3 heading that cites them. A field the record
  does not carry reads `not recorded`, never blank: an empty validation status cannot be told from "recorded as
  nothing".
- The closing line now **states the procedures** — `Analytical procedures: HPLC-UV assay (HPLC, validated) under
  2.3.S.4; …` — or says `No analytical procedure is recorded in the Module 3 sections this summary covers.` The
  open-items line is now independent of it, so a summary can have both.
- The *Analytical Methods* table is carried beside each section's headline table, identity-deduped for a section
  whose headline already is that table.

`server/services/ana/cmc-quality-summary-tool.ts`

- The draft returns `lineage` and `methodReferences`, so the 2.3 reaches the one editor with the records behind it.
- Its instruction now names `methodReferences` and says not to describe a procedure as validated when its recorded
  status says otherwise — the one sentence a model will otherwise write because it fits the prose.

## Verified by making each check fail

Every file in this folder is the recorded output of the mutation named.

| File | Mutation | What it reported |
|---|---|---|
| `mutation-1-atoms-over-every-section.txt` | the atoms are taken over every section handed in, not the summarized ones | *"expected [ 'so-3.2.S.1', 'adventitious-1' ] to deeply equal [ 'so-3.2.S.1' ]"* |
| `mutation-2-record-cited-once-per-section.txt` | dedupe by record **and** section, so one record is cited twice | *"expected [ …(2) ] to deeply equal [ { sourceObjectId: 'spec-1', …(1) } ]"* |
| `mutation-3-unrecorded-status-not-said.txt` | an unrecorded validation status is printed as blank | *"expected { methodName: 'HPLC-UV assay', …(3) } to deeply equal { … }"* |
| `mutation-4-the-shipped-crossreference-promise.txt` | the closing line is the shipped promise again — **the defect exactly as it was** | both narrative cases red: *"expected '…' to contain 'Analytical procedures: HPLC-UV assay …'"* and *"… to contain 'No analytical procedure is recorded i…'"* |
| `mutation-5-procedures-table-dropped.txt` | each section's headline table only — **the shipped table rule** | *"expected [ Array(1) ] to deeply equal [ …(2) ]"* |
| `mutation-6-draft-drops-atoms-and-methods.txt` | the AnA draft returns neither — **the shipped tool** | three cases red: *"TypeError: Cannot read properties of undefined (reading 'map')"*, *"expected undefined to deeply equal [ { …(4) } ]"*, *"TypeError: out.lineage is not iterable"* |

`green.txt` is the same two suites passing after the mutations were reverted.

Tests: `server/services/__tests__/m2-qos-shares-module3-atoms-and-methods.test.ts` (new, 14 cases) and
`server/services/ana/__tests__/cmc-quality-summary-tool-carries-atoms-and-methods.test.ts` (new, 4 cases). The last
case of the first file runs the **real composer** rather than a fixture of it, so a change to what Module 3 puts in
`lineage` or `structuredPayload.sourceObjects` fails here instead of passing a fixture that no longer matches.

## Gates

`tsc --noEmit` 0 errors. ESLint: no file gained a warning — `m2-summary-builders.ts` stayed at its baseline 7
(deriving the procedures in one function reached complexity 16, so it is three: `methodPayloadsOf`,
`methodReferenceOf`, `qosMethodReferences`). CMC, M2 and AnA-CMC suites: **1,957 tests across 104 files.**

## Where phase 4 stands after this

| Acceptance clause | State |
|---|---|
| Fixture batch/stability tables match expected cells | **Not yet recorded as phase-4 evidence.** The tables are composed and unit-tested (`module3Composer`, `recorded-stability.ts`, `stability-trending.ts`); what phase 4 asks for is a named fixture program whose expected cells are asserted end to end. Next in this lane. |
| OOS is explicitly flagged | Implemented in `stability-trending.ts`, `recorded-capability.ts`, `ich-compliance-rules.ts` and the registers' client forms; to be exercised against the same fixture rather than only in unit tests. |
| QOS and Module 3 share atoms and method references | **This slice.** |
| US small-molecule IND composition boundary stays enforced | Unchanged. `services/cmc/composition-scope.ts` still refuses a biologic, a marketing application and a non-US clinical-trial application by name; no file in this slice touches it, and the AnA tool still relays its refusal verbatim. |
