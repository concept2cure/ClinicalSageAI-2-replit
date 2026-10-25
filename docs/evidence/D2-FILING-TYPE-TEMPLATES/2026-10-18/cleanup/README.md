# D2 · One implementation of CTD authoring: converge the heading copies, delete the dead ones — 2026-10-25

**The founder's order (2026-10-20):** "We must not have any overlapping duplicates. One is all we must ever have!
Clean up the mess … delete old trash too."

**How it is carried out:** under P-47 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, 2026-10-25). A duplicate is folded into
its canonical capability only after each of its functions is shown to exist there, or is carried over first. Each
deletion names its replacement, by path, and the test that proves the replacement reachable.

**Row moved:** D2. **Workstream:** W1.

**Coordination:** the client-journey session (session_01JbQUvBxcGHdBgkgAydQKpx) was told this directory set on
2026-10-25. Its files are not edited here: ProjectHome, ProjectPlan, ProjectStages, PlanAssign, HomeSections,
`IndDocumentLibrary.tsx`, navigation, the surface registry, the client styles. Duplicates in those files are named
below and left to it.

## What already exists (CLAUDE.md Rule 3)

**The canonical ones:**
- **The one ICH M2–M5 record:**
  - `server/services/ind/ctd/authoring-guidance.ts` (the briefs);
  - `server/services/ind/ctd/ich-m4-headings.ts` (the structural headings).
- **Its projection into outlines:** `server/services/market-specs/ctd-component-outlines.ts`.
- **The one outline everything reads:** `getRegistryDocumentTemplate`, in
  `server/services/market-specs/document-template-library.ts`.
- **Module 3 composition:** the CMC lane, `server/services/cmc/*` (P-28).

**The inventory:**
- **Source.** A six-lens, read-only sweep (workflow `wf_0f8a9a31-23c`): content, names, routes, client, AnA, and dead
  code with history. A skeptic checks reachability and P-47 parity for each candidate.
- **So far.** Four lenses returned 171 candidate files: content 58, names 48, routes 43, client 22. The full list
  and the slice plan follow when the run completes.
- **Two existing gates come first** (Rule 3: extend, never add beside):
  - `scripts/ci/check-regulatory-reference-data-single-copy.mjs`. It guards named exports only, which is why ten
    heading copies under other names went unflagged.
  - `scripts/ci/check-unreferenced-modules.mjs` with its baseline. It already lists three CTD files as unreachable:
    `server/api/ectd/routes.ts`, `server/templates/regulatory_templates.js` and `server/utils/templateRegistry.js`.
- **The sweeps' "nothing reaches it" verdicts are not taken on trust.** A direct check found live callers for:
  - `knowledge-base.ts`, `project-sections.ts` and `ctd-onboarding.ts`, all registered in the bootstrap;
  - `indCopilot.js`, used by `routes/ind.ts`;
  - `regional-ctd-templates.ts`, with eight importers;
  - `cmc-module3-compiler.ts`, on the CMC path.

## C1 — converge the IND lane's Module 2/3 projector onto the record

**The duplicate.** `server/services/authoring/ind-template-outlines-m2-m3.ts` (`buildModule2Or3Outline`) was a second
projector of the same record subtree. The 3a review's completeness critic found it.
- It read `services/regulatory/ind-ectd-sections.ts`, a third heading list, plus the guidance half of the record. It
  never read the structural half.
- So the Authoring picker offered "2.7 · Clinical Summary" (IND lane, 7 nodes, no 2.7.4.2 Adverse Events) beside
  "GLOBAL · Clinical Summary" (49 nodes).
- 2.4 pasted the template library's six headings in as `2.4:work:N` rows.
- 3.2.P.2.1.1 was served without its parent heading.

**What the IND list held that the record did not, by comparison** (`ind-vs-record` probe):
- **15 headings:** the QOS subdivisions, 2.3.S.1–7 and 2.3.P.1–8.
- **17 titles that differ from the record's,** e.g. "Stability" where the record has "Stability (Drug Substance)".

**The convergence:**
1. **The record gains the QOS subdivisions:** 2.3.S.1–7, 2.3.P.1–8 and 2.3.A.1–3, recall, numbered by M4Q(R1)'s
   parallel to Module 3. These are headings only; QOS content stays the CMC lane's.
2. **`buildModule2Or3Outline` walks the record (`ctdRecordSubtree`).**
   - Every row's number and title are the record's.
   - A heading the record briefs keeps its full brief.
   - Any other heading takes the IND list's description where it has one, else the projection's own purpose line.
3. **The `:work:` rows for Module 2/3 are deleted** (`localWorkingRows`).
   - 2.4.1–2.4.6 are now real rows.
   - The same outcome, a 2.4 with its six M4S headings, is delivered by the record. `ind-template-outlines-m2-m3.test.ts`
     proves it reachable from the IND library's templates.

**P-47 parity, function by function:**

| Function | Where it is now |
|---|---|
| Each IND Module 2/3 section opens as a working outline. | Same function, same API (`IndTemplateOutlineSection[]`). |
| Root first, then descendants. | Unchanged. |
| A brief's full guidance, checklist and pitfalls. | Unchanged: the test that every brief is retained passes. |
| 21 CFR references and descriptions from the IND list. | Kept, as the regulatory references and the text for the headings the record holds no brief for. |
| The six 2.4 working headings. | Now the record's own 2.4.1–2.4.6, with the outline's purposes. |

Nothing the old projector offered is lost. No client file changed: `IndDocumentLibrary.tsx` reads the same fields.

**Red first:** `c1-ind-projector-red.txt`: 43 of 63 red on trunk `91dbdb9a4`, 63/63 after.

**Pins moved on purpose:**
- **`ind-template-outlines-m2-m3.test.ts`:**
  - root titles and every row title are the record's;
  - 2.4 is 2.4.1–2.4.6, not `:work:`;
  - 2.5 and 2.7 carry the record to its depth;
  - 3.2.P.2.1 and 3.2.P.2.2 precede their leaves. Their absence was pinned before, and that absence was the bug.
- **`ctd-registry-consistency.test.ts`:** the QOS subdivisions are now modelled, so 2.3.S.1 is checked and agrees,
  and only 3.2.A.1 is unchecked.
- **`ind-pharmacology-leaf-drafting.test.ts`:** the 18 QOS rows join the reviewed structural additions, and the
  counts move (146 rows, 280 codes, 228 leaves).
- **`cross-sector-builtin-authoring-templates.test.ts`:** the digest is re-recorded. `c1-builtin-snapshot-delta.txt`
  shows 61 changed, every one an IND-lane Module 2/3 template built through this projector, and none added or
  removed.

**Not done here, left for coordination:** the picker still lists the IND-lane and GLOBAL entries for the same CTD
component, two catalogue entries for one document, though they now carry one outline. Merging them changes template
ids that saved documents carry, and it touches `IndDocumentLibrary.tsx`, so it goes to the client-journey session.

## D1 — delete six CTD template files nothing can reach

Each file was proven dead by its full path, its bare name and its directory, since a loader might read a whole
folder. The sweep's "none" was not taken on trust: it had also proposed `server/templates/m3/p-5-specs-dp.json`, and
`authoring.router.ts` (`templatesDir()`) reads that directory, so it stays and moves to the converge list.

| Deleted | What it was | Proof that nothing reaches it | What does the job (P-47) |
|---|---|---|---|
| `server/api/ectd/routes.ts` (314 lines) | An unmounted eCTD module-structure and "seeder" router. | Listed by `ci:unreferenced-modules`. `/api/ectd` is mounted from `preflightRouter` and `createEctdV4Router`, not this file. | Live eCTD structure: `server/services/ectd/*` and the v4 router. CTD headings: the ICH M2–M5 record. |
| `server/templates/regulatory_templates.js` (535) | "FDA and ICH Regulatory Document Templates": hand-kept section lists. | Listed by `ci:unreferenced-modules`. No importer. | `getRegistryDocumentTemplate` (`document-template-library.ts`), read from the record. |
| `server/utils/templateRegistry.js` (334) | "Mock IND Templates Data … to simulate the 588+ templates": generated, fabricated template data. | Listed by `ci:unreferenced-modules`. No importer. | The IND lane's real templates, `server/services/authoring/ind-authoring-templates.ts`. Removing it also serves "never fabricate". |
| `client/src/services/templates/ctdTemplates.json` (35) | A Module 2 field-form copy (2.1…). | No reference in client, server or shared code; named only in `reports/phase0/code_inventory.txt`. | The Authoring picker's templates, from the record. |
| `sql/cmc_blueprints.sql` (381) | A "TrialSage AI-CMC Blueprint Generator" schema: 7 tables. | On no applier. None of its 7 tables is named by the schema, the server, or any migration. `ci:orm-reachability` is unchanged (7, baseline 7). | Module 3: the CMC lane (`server/services/cmc/*`). |
| `templates/ectd/fda_pyramid_templates.xml` (582) | An "FDA eCTD Pyramid Templates" XML copy of the CTD structure. | No reader. The sibling `fda_template.xml` is read by `fda-module1-numbering.test.ts` and stays. | The ICH M2–M5 record, and the eCTD backbone checks. |

**Gates.** Before and after are in `d1-unreferenced-before.txt`.
- **`ci:unreferenced-modules`:** 78 before. After the deletions it reported 75 and named the three as gone. The
  baseline was regenerated: 75, exactly those three removed.
- **`ci:sql-interpolation`:** it required its baseline lowered for `server/api/ectd/routes.ts` (3 → 0). Lowered,
  and it passes.
- **`ci:orm-reachability`, `ci:reg-reference-single-copy`, `check-image-runtime-assets` and the typecheck:** pass
  (typecheck: 0 errors).
