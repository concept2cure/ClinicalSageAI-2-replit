# CSR numerical fidelity: reconstruct the missing repair

Scope: **F1 / W1 / D2**. The previous local patch and commit are unavailable
in this fresh checkout; this is a new reconstruction against canonical source
`f9631c065af8760d8b879232385fb94663d19a24`, with fresh test evidence only.

## What already exists

| Existing path | Behavior and remaining defect |
| --- | --- |
| `server/services/csr/csr-efficacy-table.ts` | Builds efficacy cells from approved SAP output. Its existing `probability` formatter protects posterior extremes, while the p-value cell still uses `toFixed(3)` and prints a small nonzero probability as `0.000`. Reuse that existing formatter. |
| `shared/authoring/csr-scientific-review.ts` | The shared review format, table keys, source shapes, placeholders, design-number exclusions and display boundaries already exist. The display check misses comparator/sign/unit neighbors; markup handling hides entire entities instead of preserving their visible meaning and raw byte span. Extend this shared rule. |
| `client/src/concept2cure/v2/surfaces/csrEvidenceMap.ts` | Finds each literal cell display, retains all possible source cells, and hashes the selected raw section slices. Literal byte search cannot offer an encoded comparator correctly. Preserve all source/study candidates and use the shared raw span matcher. |
| `server/services/authoring/csr-scientific-review-core.ts` | Re-verifies authorization scope, complete saved section set, exact retained source cells, table/source digest, saved-content digest and quote digest. Its span loop measures the unencoded value length and can ignore a sign/entity/unit just outside the mapped quote. Require the entire matched raw span within the quote while leaving identity/hash/review gates intact. |
| `server/services/csr/unsupplied-statistics.ts` | Rejects source-free clinical figures and unsupported outcome claims. `suppliedNumbers` converts unsigned digit strings to JavaScript numbers, losing comparison operators, signs, precision and units, so a supplied threshold or percentage can authorize a different assertion. Extend its existing scanner with the shared numerical identities. |
| `server/services/ana/csr-edited-section.ts` | Rechecks edited text against retained claims; aggregate shape and same-denominator ratio checks already exist. It pools normalized digits across the text and accepts an exact occurrence before examining later conflicts. Scalar and aggregate matching need distinct treatment, and conflicts must precede stated/removed. |
| `server/services/ana/csr-saved-evidence.ts`, `server/services/csr/csr-claim-receipts.ts` | Existing callers carry per-section source claims and source/run hashes into the recheck and filing review. The receipt's existing `population` is the exact column header. `planSection` and `unstatedClaims` currently reduce claims to their values and lose an implicit percent unit; this makes a valid `83.3%` result fail after strict units are enforced. Receipt creation and parsing remain read-only. See the narrow additional scope below. |

Existing five test homes:

- `server/services/csr/__tests__/csr-table-rounding.test.ts`
- `server/services/csr/__tests__/unsupplied-statistics.test.ts`
- `server/services/ana/__tests__/csr-edited-section.test.ts`
- `client/src/concept2cure/v2/surfaces/__tests__/csrEvidenceMap.test.ts`
- `server/services/authoring/__tests__/csr-claim-in-context.test.ts`

Inventory used `rg` for all six paths, `probability`, `pValue`,
`isExactNumericalDisplayAt`, `reportedDisplayAt`, `containsExactNumericalDisplay`,
`findUnclaimedNumbers`, `editedClaimOutcome`, raw/entity span helpers and their
production callers. Shared/source directories contain no existing raw-offset
entity matcher to reuse. Full-history (`--is-shallow-repository=false`)
`git log --all --diff-filter=D -n 30` restricted to these six files found no
deleted alternative. Coordination was searched for the assigned paths; the
existing `csr-saved-evidence.ts` export hold remains untouched.

### Additional private caller scope

After the first compatibility run, the lead authorized only the import and
private `planSection`/`unstatedClaims` callsites in `csr-saved-evidence.ts`.
The coordination hold explicitly covers its exports; those exported functions,
interfaces and signatures stay byte-identical. The existing retained column
header must accompany values through numerical rechecking. Only a clear
percent-only column may supply an implicit percent unit: a confidence-level
header (`95% CI`) or combined count/percent column (`n (%)`) must not do so.
The source/receipt hashes, exact source values, draft/accept routes, receipt
schema and release decisions remain unchanged. This additional inventory was
recorded before editing either private callsite.

## Reconstruction contract

Reuse the existing bounded probability formatting for efficacy p-values.
Keep comparison operators, signs, displayed decimal precision and units as
part of a figure's identity. Check every occurrence and its whole-number
boundaries, including suffixes. Rendered HTML/entity equivalence may identify
a figure, but the review receipt must still hash the exact raw saved bytes
and enclose the complete figure span. Numerical components may support a
legitimate aggregate rewording; a scalar claim is not established merely by
finding its digits inside an aggregate. Existing independent source cells and
studies remain ambiguous until the human chooses them.

Source/study identity, access, stored hashes and independent review requirements
remain enforced. No old table/envelope digest, source version, review receipt
or evidence baseline is rewritten to fit newly rendered results. No new
production file, service, route, table or dependency is introduced.

## Implemented behavior and source anchors

| Source | Change |
| --- | --- |
| `server/services/csr/csr-efficacy-table.ts:22` | The p-value cell now reuses `probability`: a nonzero value below 0.001 displays `<0.001`, and a value below 1 but above 0.999 displays `>0.999`. Exact 0 and 1 remain exact endpoints. |
| `shared/authoring/csr-scientific-review.ts:119,160,211` | Numerical boundaries retain comparator, sign, precision, exponent and explicit unit. The HTML/entity projection records raw start/end offsets, ignores quoted tag attributes, preserves encoded comparison/sign meaning, and refuses unsupported entity/suffix fragments. Encoded input and already-rendered text have explicit modes. |
| `shared/authoring/csr-scientific-review.ts:246,285,302` | One raw-span matcher supplies both screen and server. Unit inference requires a clear unit heading. `95% CI`, `n (%)`, and count/percent columns cannot turn a bare value into a percentage. The claim-display helper adds only equivalent displays actually found for that exact source value/header; identifiers and row/column indexes never become supplied results. |
| `client/src/concept2cure/v2/surfaces/csrEvidenceMap.ts:69` | Every matching raw occurrence remains available, including encoded operators/units, with every exact candidate source/study retained. The canonical HTML/plain-text discriminator selects the representation. The chosen quote still hashes the original raw saved slice. |
| `server/services/authoring/csr-scientific-review-core.ts:146,195` | A quote must enclose the whole matched raw display; clipping an entity, sign or implicit unit fails even when the clipped quote hash is internally correct. Retained cell, source, table, saved-content, reviewer and complete-section checks remain in place. |
| `server/services/csr/unsupplied-statistics.ts:83,113,164,331` | Admission compares full numerical identities and checks every occurrence. Drafting gets implicit unit context only from the exact already-reconciled retained table column. Existing observed-outcome, planned-metadata and death-count rules remain enforced. |
| `server/services/ana/csr-edited-section.ts:44,55,66,93` | Conflicting shapes, ratios and numerical meanings are checked before exact-stated/removed outcomes. Scalars need a whole matching display. Aggregate rewordings keep component identity, order, multiplicity, a bounded passage and their n/N relationship. Independently claimed source figures remain distinct. |
| `server/services/ana/csr-saved-evidence.ts:27,106,188` | Only the added import and the two approved private callsites carry retained header context forward and mark accepted text as already rendered. All 14 exported declarations, bodies, signatures and leading comments are byte-identical to the starting source. |

## Fresh verification

| Run | Observed result | Evidence |
| --- | --- | --- |
| Initial five-suite regression run before repair | 31 failed, 71 passed | `red.log` |
| First implementation pass | 100 passed, two fresh quote fixtures still excluded the percent sign | `green-first.log` |
| Header-context regression before the private caller repair | 14 failed, 115 passed in four suites | `header-context-red.log` |
| Complete focused and adjacent run before lint refactor | **210 passed in 14 files**, exit 0; 139 focused cases and 71 adjacent cases | `final-validation.log` |
| Publication lint cleanup | **Zero lint warnings or errors** across the four assigned files, exit 0 with `--max-warnings=0` | `lint-cleanup.log` |
| Exact-source recheck after lint refactor | **229 passed in 15 files**, exit 0; the same 210 CSR cases plus 19 atomic-mutation cases | `lint-recheck.log` |
| Entity/projection regressions before repair | 12 failed, 132 passed in four files | `entity-red.log` |
| Concentration regressions before the bounded `ng` addition | 4 failed, 148 passed in four files; all four failures admitted a bare count as `ng/mL` | `concentration-red.log` |
| CSR recheck after entity/unit review | **233 passed in 14 files**, exit 0; all prior 210 plus 23 added controls | `entity-unit-green.log` |
| Lint comparison on the ten entity/unit files | No errors and no additional warnings versus `f9631c0`; four existing warnings remain in two unchanged warning categories | `entity-unit-lint.json` |
| Generic composite-unit controls before correction | 8 failed, 153 passed in four files; both `pg/mL` and `copies/mL` were admitted as bare counts | `composite-unit-red.log` |
| Final exact-source CSR recheck | **241 passed in 14 files**, exit 0; all prior 210 plus 31 added controls | `composite-unit-green.log` |
| Final composite-unit lint | Zero warnings/errors in the shared matcher and four affected test homes, exit 0 with `--max-warnings=0` | `composite-unit-lint.log` |
| Export hold check | All 14 exported declarations and their full text identical to `f9631c0` | `saved-evidence-export-check.txt` |
| Scoped whitespace/error check | `git diff --check` exited 0 | Command below |

The two fresh test fixtures adjusted after the first implementation pass now
quote the whole percentage display (`83.3%` instead of `83.3`). These fixtures
construct new synthetic review submissions. No retained receipt, stored hash,
table/envelope digest baseline or old source bytes were changed.

The final adjacent group covers saved CSR rechecking in PGlite; source and
claim substitution; legitimate n/N aggregate rewording; existing pinned table
and ADaM envelope digests; Bayesian result handling; narrative store, opening
and section hashes; placeholder refusal; and map-to-server compatibility.

Exact CSR command, from the repository root (now 241 cases):

```sh
PATH=/workspace/scratch/3002d574f952/node22-runtime/node_modules/node/bin:$PATH \
node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  server/services/csr/__tests__/csr-table-rounding.test.ts \
  server/services/csr/__tests__/unsupplied-statistics.test.ts \
  server/services/ana/__tests__/csr-edited-section.test.ts \
  client/src/concept2cure/v2/surfaces/__tests__/csrEvidenceMap.test.ts \
  server/services/authoring/__tests__/csr-claim-in-context.test.ts \
  server/services/ana/__tests__/saved-csr-evidence.pglite.test.ts \
  server/services/ana/__tests__/csr-claim-reconciliation.test.ts \
  server/services/csr/__tests__/csr-results-claim-provenance.test.ts \
  server/services/csr/__tests__/csr-bayesian-result.test.ts \
  server/services/csr/__tests__/csr-table-byte-identity.test.ts \
  server/services/authoring/__tests__/csr-scientific-review-placeholder.test.ts \
  server/services/csr/__tests__/csr-assembly-review.test.ts \
  server/services/csr/__tests__/csr-narrative-reference-consistency.test.ts \
  client/src/concept2cure/v2/surfaces/__tests__/csrEvidenceVitals.test.ts
```

The initial red command used the first five paths in that command. The
header-context red command used those same paths except table rounding. Both
used the same Node/Vitest/config invocation. Before the entity/unit additions,
the post-lint recheck used the entire command plus
`server/routes/__tests__/authoring-atomic-mutations.test.ts` and passed 229 cases.
The latest CSR run is the 241-case command above, against the refreshed manifest.

```sh
git diff --check -- \
  server/services/csr/csr-efficacy-table.ts \
  shared/authoring/csr-scientific-review.ts \
  server/services/csr/unsupplied-statistics.ts \
  server/services/ana/csr-edited-section.ts \
  server/services/ana/csr-saved-evidence.ts \
  client/src/concept2cure/v2/surfaces/csrEvidenceMap.ts \
  server/services/authoring/csr-scientific-review-core.ts \
  server/services/csr/__tests__/csr-table-rounding.test.ts \
  server/services/csr/__tests__/unsupplied-statistics.test.ts \
  server/services/ana/__tests__/csr-edited-section.test.ts \
  client/src/concept2cure/v2/surfaces/__tests__/csrEvidenceMap.test.ts \
  server/services/authoring/__tests__/csr-claim-in-context.test.ts \
  server/routes/__tests__/authoring-atomic-mutations.test.ts \
  tests/db/authoring-section-concurrency.dbtest.ts \
  docs/evidence/F1/2026-11-08-csr-fidelity
```

### Adjacent unchanged release-order failure

The first 10-file adjacent run produced 75 passes and one failure
(`adjacent-green.log`, despite that initial filename). The failing test is
`csr-scientific-release-order.test.ts:68`, which expects a 503 identity-check
error but receives 409 `INDEPENDENT_CHECK_REQUIRED`. The existing release
wrapper performs the independent check before reaching CSR identity.

A temporary read-only Vite loader substituted original `f9631c0` bytes for
all six repaired source paths, while preserving the working files. The same
test then failed identically: four passes, one failure. Loaded source overlays
and the exact assertion are in `release-order-baseline.log`. This baseline run
preceded the additional private saved-evidence callsite edits. No release gate
or release-order test was edited. The final 14-file passing command deliberately
excludes that separately documented unchanged failure; it is not a claim that
the whole repository test suite passes.

### Publication lint cleanup

The lead's warning ratchet found nine new warnings in this lane: five in the
shared matcher, two in the edited-claim matcher, and one oversized callback
in each editor test file. The repair keeps behavior and test assertions intact:

- Suffix boundaries, scalar aggregate boundaries, visible-offset search and
  raw-span projection now have named private helpers in the existing shared file.
- Aggregate rewording recognition has a private helper in `csr-edited-section.ts`.
- The editor's mock read fixture has a named setup function; the native suite's
  six cases remain in order, divided into two sequential `describe` groups.
- Redundant regular-expression escapes were removed. No rule, baseline,
  configuration, suppression, public saved-evidence export or release gate changed.

Exact targeted lint command:

```sh
PATH=/workspace/scratch/3002d574f952/node22-runtime/node_modules/node/bin:$PATH \
node node_modules/eslint/bin/eslint.js \
  shared/authoring/csr-scientific-review.ts \
  server/services/ana/csr-edited-section.ts \
  server/routes/__tests__/authoring-atomic-mutations.test.ts \
  tests/db/authoring-section-concurrency.dbtest.ts \
  --max-warnings=0
```

The native PostgreSQL six-case rerun belongs to the lead; the non-native
229-case command does not include that database suite.

### Entity decoding, caller representation and concentration review

The review found two concrete interpretation defects. `ENTITIES` inherited
`Object.prototype`, so `&constructor;` and `&toString;` could resolve to
functions and throw. The mapping now has a null prototype; unknown names keep
the existing refusal behavior. Separately, rendered text was sometimes passed
through the entity decoder again, turning a visible literal `&lt;0.001` into
an actual `<0.001` threshold. Numerical scans now distinguish `encoded` input
from `text` and reuse their prepared view.

The choice follows the existing callers, not a guess about the string:

| Caller | Existing input contract | Handling |
| --- | --- | --- |
| `saved-document-critique.ts:81–86` and `authoring.router.ts:3596–3597` | `s.text` comes from `acceptedSectionText(renderSection(content))`; entities in HTML are already decoded, and unaccepted insertions are excluded. | The two approved private saved-evidence callsites create a `text` view. Neither the exports nor held draft/accept route changes. |
| `csr-builder.ts:449` | The original split model prose is passed to `acceptEvidenceBoundDraft`. | Interpret encoded prose once; subsequent scans use text mode. |
| Review map and server quote verification | The original stored `content`, which can be HTML or canonical plain text. | Reuse `looksLikeHtml`, the editor/export discriminator; plain and tag-free Markdown remain literal. Both projections retain offsets into the original content used for quote hashing. |

The entity controls include double encoding, prototype property names,
tag-free literal entity text, an actual renderer-to-saved-evidence path and
a correctly encoded threshold as a positive control. Literal entity text
adjacent to a figure is not silently discarded as punctuation.

The concentration review reproduced a separate omission: `5 ng/mL` was treated
as the count `5`. Adding `ng` to the standalone grammar addressed that spelling;
subsequent true-red controls showed the same gap for `pg/mL` and `copies/mL`.
The complete-token boundary now also recognizes a clearly formed,
whitespace-separated `unit/unit` suffix, retaining its full structural token
without needing a vocabulary entry for each unit name. This reuses the suffix
identity rule and supports denominator chains; layout spacing and a terminal
sentence period do not change the unit identity.

Negative controls distinguish bare counts from `5 ng/mL`, `5 µg/mL`, `5 pg/mL`
and `5 copies/mL`. Positive controls preserve each exact composite source
display and the ordinary count `5 subjects`. A composite unit written only
in the header cannot authorize a bare cell as that concentration. No unit
conversion, inferred concentration or generic clinical-language interpretation
was added. Unknown standalone unit names are not guessed by this structural rule.

The intermediate `entity-lint.log` identified one new decoder complexity
warning; extracting the decoder removed it. The final per-file lint comparison
in `entity-unit-lint.json` records zero increases and zero errors for all ten
affected files. The saved-evidence export comparison was rerun after this repair
and still finds all 14 exported declarations byte-identical.

## Limits and handoff

This is deterministic numerical-display and source-binding verification,
using synthetic fixtures. It does not establish clinical validity, a correct
estimand, a qualified model, regulatory acceptability or completed human
scientific review. Unknown entity spellings and ambiguous unit headings fail
closed instead of being guessed. Raw saved content, old receipt hashes and
source identities are preserved. No live browser or real-study review was
performed in this lane. Full compiler, build, repository gates, integration
and publication remain with the lead.

`source-sha256.txt` was refreshed after the final 241-case composite-unit test run. It records
the seven production files, five CSR test files and two editor test files,
including the native test whose execution is separately owned by the lead.
It is a verification manifest, not a replacement for any stored scientific
evidence hash.

The lead's later compiler diagnostic found a missing required numeric value in
the imported p-value fixture. It now supplies `value: 12`, matching the existing
`display: '12'`; all six p-value boundaries and their assertions remain. The
table suite and the affected QMS fixture pass 39 cases together in
`../2026-11-08-cross-module-data-flow/final-fixture-regressions.log`, with clean
scoped lint. The manifest is refreshed for this fixture correction; production
CSR source is unchanged from the 241-case run.
