# D2-CSR — five CSR-lane tests red on trunk (2026-10-30)

Launch row **D2**, trunk green. Base: `3435c04e0f` on `concept2cure-v2`.

Files in this folder:

- `red.txt` — the five test files on trunk before any change: 5 files failed, 6 tests failed, 77 passed.
- `green.txt` — the same five files after the change: 5 files passed, 83 tests passed.
- `mutations.txt` — each changed assertion shown failing on the defect it exists to catch (the source was restored after each run).
- `builtin-snapshot-delta.txt` — the per-object builtin template snapshot delta, commit by commit, from the recorded 392-object freeze to today's 446.
- `builtin-snapshot-bisect.txt` — the bisection that pins the last 7 changed objects to `a2a91a87db`, with the script and projection used.

## What already exists

Every failure is in a test that pins an existing projection. No capability was built. The code each test reads:

| Test | Code it pins | What that code does today |
|---|---|---|
| `tests/regulatory/csr-e3-overlay.test.ts`, `tests/regulatory/template-library-truth.test.ts` | `server/services/market-specs/document-template-library.ts` (`clinical_study_report`, `sections: ICH_E3_GUIDANCE.map(e3TemplateSection)`) | Projects all 119 nodes of the canonical E3 tree (`server/services/ind/ctd/csr-e3-guidance.ts`) as the market-specs CSR spine, with a summary, required flag and `drafting_mode` for each. |
| `server/services/ana/__tests__/document-template-description.test.ts` | `server/services/ana/submission-center-tool-defs.ts` (`GET_DOCUMENT_TEMPLATE.description`) | Names every outline by id. The order is rule, inputs, record-derived, blueprint, then hand-kept. The OpenAI trim (`ai-gateway/gateway.ts`, 1024) can therefore cut only hand-kept ids. |
| `tests/unit/csr-jobs-routes.test.ts` | `server/routes/csr-jobs.ts` `GET /:jobId/sections` | Returns each section with `review: effectiveReviewState(section)` (`server/services/csr/csr-section-review.ts`). |
| `server/services/authoring/__tests__/cross-sector-builtin-authoring-templates.test.ts` | `server/services/authoring/builtin-authoring-templates.ts` | A freeze of every builtin editor template (count plus a sha256 of every snapshot) outside the four RI planning rows. |

Searches run: `git log -p` / `git log -S` on `e3TopLevel().map(e3TemplateSection)`, `effectiveReviewState`, `EXISTING_BIOTECH_COMPONENT_OUTLINES` and `us-biotech-lifecycle-templates`, plus the history of each test file and of each file it reads.

## Root causes and decisions

None of the five failures is a code defect. In each case a later commit changed the product on purpose, said so in its commit or design, and did not update the test that pinned the old shape. Each expectation now asserts the new behaviour exactly.

### 1–2. csr-e3-overlay and template-library-truth: "market-specs spine 119 vs 16"

- **Red:** `expected [ Array(119) ] to deeply equal [ '1 Title Page', '2 Synopsis', …(14) ]` (both files).
- **Cause:** commit `13bafc62ff` (2026-10-26, "Complete full CSR and saved-study CRF authoring") changed `e3TopLevel().map(e3TemplateSection)` to `ICH_E3_GUIDANCE.map(e3TemplateSection)`. Its design, `docs/design/EDITOR_CSR_CRF_COMPLETION_2026-10-26.md` §"What already exists", says the library "projects only its 16 top-level nodes … Complete the general projection from the same record". The change was intentional and reads from the one record, so it is correct. The tests still asserted §1–§16 only.
- **Fix (tests only):**
  - The spine now equals every `ICH_E3_GUIDANCE` node in order, with an exact length of `ICH_E3_GUIDANCE.length` (119).
  - Each node's summary and required flag is checked against the tree.
  - `template-library-truth` also checks that the top-level subset is still exactly `e3TopLevel()`.
- **Shown failing:** a mutation that projects only the top-level nodes again makes all three CSR assertions fail (`mutations.txt`).

### 3. document-template-description (two tests)

- **(a) Red:** the CSR record proof had the same 119-vs-16 cause. It now compares against `ICH_E3_GUIDANCE`.
- **(b) Red:** `fits under the 1024-character trim: expected 2070 to be less than or equal to 1024`.
  - **Cause:** `13bafc62ff` added `blank_crf` and `crf_annotation_worksheet`. `14b27100d9` and `42bbb941e2` added 29 `us_lifecycle_*` outlines plus `us_prescribing_information` and `nonclinical_study_report`. All of them are correctly named, in the hand-kept clause.
  - The hand-kept ids alone are about 1,260 characters, so "every id is named" (a separate test, still green) and "the whole description is at most 1024" cannot both hold.
  - The test already stated what the cap protects: *"Should the library outgrow the cap, the trim must still cut only hand-kept ids."*
- **Fix (test):** the length assertion is replaced by the property it protected, stated exactly. The index just past `Kept by hand: ` must be at most `head.length` (1023), and the head must contain the whole blueprint clause. The existing assertions are kept: rule, inputs and record clause in the head, and the order rule < record < blueprint < hand-kept, with hand-kept last.
- **Shown failing:** 240 characters of padding at the head pushes the hand-kept mark to 1051 and fails `the trim falls inside the hand-kept list: expected 1051 to be less than or equal to 1023`.

### 4. csr-jobs-routes — sections reply shape

- **Red:** the received rows carry `review: { state: 'draft', staleApproval: false }`, and the expected rows did not.
- **Cause:** `7b209818ac` (CSR slice 3) made the route return `review: effectiveReviewState(section)`, so that an approval of since-redrafted text reads as a draft. The change was intentional and the test was not updated.
- **Fix (test):** the expected reply now carries the exact review state per row. Two fixture rows were added so the test proves that the route applies `effectiveReviewState` and does not stamp a constant:
  - a stale approval (`approved`, hash h2 ≠ reviewed h1) gives `{draft, staleApproval: true}`;
  - a current approval gives `{approved, false}`.
- **Shown failing:** a mutation that hard-codes `{ state: 'draft', staleApproval: false }` in the route fails the test.

### 5. cross-sector-builtin-authoring-templates — 446 vs 392

- **Red:** `expected [...] to have a length of 392 but got 446`.
- **Cause:** the freeze was last recorded at `4626be1f9a`. I rebuilt the projection from a `git archive` of each later commit (`builtin-snapshot-delta.txt`):
  - `13bafc62ff~1`: 392 objects with the recorded hash `dcebcbec…acf3c`, which confirms the baseline.
  - `13bafc62ff`: +2 (CRF components), and 8 CSR readers changed (E3 full depth).
  - `14b27100d9`: +19 (12 US lifecycle components, `nonclinical_study_report`, `us_prescribing_information`, 5 CTD module registry rows). 56 changed, which matches that commit's explicit `drafting_mode` policy (two inspected in full: `phase3.drug_substance:subtask:stability` gains `drafting_mode: manual`; `component:protocol` moves from preparation worksheet to narrative with per-section `drafting_mode`).
  - `42bbb941e2`: +33 (the 16-identity US biotech contract: 17 lifecycle components, 16 registry rows), and 4 changed.
  - `a2a91a87db` (CSR slice 4, E3 summaries): 7 CSR readers changed (`component:clinical_study_report`, `module:M5`, `registry:ICH_CSR`, `section:m5.3.5`, `.1`, `.2`, `.3`). This was first inferred from the `42bbb941e2 → HEAD` delta alone. It is now measured (`builtin-snapshot-bisect.txt`): `a2a91a87db~1` (= `8cf9bd399c`, CSR slice 2) still has the `42bbb941e2` hash `9ee3f36b…`, `a2a91a87db` has the HEAD hash `0ddcbd2f…`, and `dc5c1c59b6`, `0a2ee31fe1`, `58b27d0227`, `5ab138ed3e` and `d6aedbecc0`, each with its parent, have the HEAD hash too. No other commit in the range moves any of the 7.
  - HEAD equals the working tree: 446 objects.
  - Across the whole range, 0 objects were removed and every change is in an outline a named commit changed.
- **Fix (test):** the freeze is re-recorded to exactly 446 and `0ddcbd2fd6cd3aee7faddacede59654e4108bf58ddea535f927541c69ed7971a`. The in-file note follows the existing practice: it says what changed, by which commits, and the previous hash.
- **Shown failing:** a mutation that drops one lifecycle outline gives `expected … length of 446 but got 445`.

## Checks

- `npx vitest run` on the five files is green: 83/83 (`green.txt`).
- `npx eslint` on the five changed test files reports no warnings and no errors.
- Full `tsc --noEmit -p .`: see the session report.

## Open item: needs sign-off from the lead or the AnA owner (not decided by this session)

The description test no longer asserts `description.length <= 1024`; it asserts that everything before the first hand-kept id fits inside the trim. That keeps what the old bound protected (the trim cuts only hand-kept ids) but it also means the test now **accepts** the loss described below. This session did not decide that the loss is acceptable for the product, and the lead or the AnA owner should either accept it here, by name, or open a follow-up to shorten the hand-kept clause (for example by grouping the `us_lifecycle_*` and CRF ids by prefix in a form the `entryFor()` check can still verify). **Decision (CPO, 2026-10-30, under the founder's delegation): accepted.** The served path sends the whole description, so every id is named there. Only an OpenAI-compatible fallback trims it at 1024, and that fallback can still list each template through `family` and `coverage`; the trim understates and never misnames. Naming every id inside 1024 characters is impossible at today's catalog size, and the old bound would have frozen the catalog to fit one provider's limit. The test's new form keeps what the bound protected: only hand-kept ids can be cut. Follow-up, not blocking: shorten the hand-kept clause by prefix group if the fallback becomes a served path for template selection.

On an OpenAI-compatible fallback (gpt-4o), the trimmed `get_document_template` description leaves out 33 of the 43 hand-kept ids, from `crf_annotation_worksheet` onward. That provider can still find them through `family`/`coverage`, and the trim only ever understates. Naming every id inside 1024 characters is not possible at today's catalog size. Whether to shorten the description (for example, list lifecycle outlines through `family`) is for the AnA owner to decide.
