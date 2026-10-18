# D2 / W2 — editor draft termination

Baseline: `aad0eb124bab4e2b9bd80e3186fedfd319ab0471`.
[Contract](CONTRACT.md) committed as `66d998497` before test/production edits.

The actual Authoring draft route parsed nonempty gateway output and parked a
usable candidate without checking why generation ended. A valid-looking JSON
envelope, malformed JSON fallback or plain prose could all be cut off. Candidate
acceptance also dropped stored finish metadata and trusted none of it when
saving the section and its governed filing.

## Delivered behavior

- Record the genuine served response once, then refuse canonical known cutoffs
  (`max_tokens`, `length`, `chunk_timeout`, including surrounding whitespace)
  before parsing, successful draft-turn filing or candidate construction.
  Return nested `422 / DRAFT_TRUNCATED` with shorten/split/regenerate advice,
  no usable draft, ID or partial prose. Retain the raw served answer and
  provider/model/request in one failed turn, without successful draft outputs.
- Viable candidates retain the exact gateway finish string or null and the
  derived boolean in existing server-owned generator JSON. Optional fields
  survive object and JSON-string reads. Historical absent fields and null
  generators keep their existing shapes; no migration is needed.
- Acceptance checks stored server facts before source reservation or section,
  lineage, revision, audit and filing writes. A true stored flag or known
  reason refuses; a false flag or contradictory client metadata cannot override
  a known cutoff. The existing catch rolls back first, retaining the candidate
  and saved state, then returns 422. Unconfirmed commit/rollback handling and
  connection eviction are unchanged.

Only three production files change: the actual router, optional candidate
metadata retention and one small policy helper. The canonical finish classifier,
gateway, model selection, tokens, client production flow, source/current-access
checks, saved-base verification and lifecycle gates are unchanged.

## Fail-first and verification

Four scoped test owners worked on separate files. All baseline production
hashes were rechecked before root changed production. Frozen tests establish:

| Proof | Baseline | What it proves |
| --- | --- | --- |
| Actual generation HTTP/PGlite | 18 intended red, 11 controls pass | 12 cutoff reason/format cases previously returned 200; six viable controls lacked stored metadata. Failed turns retain served evidence; no new candidate or section/revision change after refusal. |
| Actual acceptance HTTP/JWT/PGlite | 7 intended red, 7 controls pass | Previously a stored cutoff saved both section and governed filing. Refusal now rolls back the consumed candidate before responding and preserves section/revision/lineage/audit/filing/version state. Normal/unknown/null/absent accept once; replay and malformed base/source refusals remain. |
| Real candidate store/PGlite | 16 intended red, 12 controls pass | Metadata survives real JSONB and a simulated JSON-string driver representation without changing source/base/turn receipts or legacy shapes. Direct store consumption retains metadata; HTTP owns acceptance policy. |
| Actual client transport/panel/assembly | 4 baseline controls pass | Nested 422 is actionable, fresh refusal yields no new usable body/Accept, failed regeneration retains a prior valid candidate/edits, and assembly stops at a failed slot while preserving completed siblings. No automatic acceptance/retry. |

Total baseline: **41 intended failures, 34 passing controls**. Test hashes are
in `frozen-tests.json`; each owner's raw baseline log and exact command are
retained in its subdirectory. `generation/frozen-test.ts.txt` is the frozen
test snapshot, not a second production implementation.

The identical frozen test bytes plus existing structured drafting, selected-source,
saved-base/transaction safety, acceptance records, editor/assembly, envelope,
project-source, turn-record and canonical-classifier regressions pass:
**196 tests / 16 suites**, exit 0. `final-result.json` verifies all 23 recorded
test/production/config input hashes remained stable across that run;
`final-command.json` gives the actual Node22 canonical-config command.

Scoped lint reports zero errors and **24 existing warnings before and after**
(23 router, one candidate store); new helper/tests have zero warnings.
`lint-comparison.json` joins by ESLint's actual filePath. An initial ordinal
pairing misassigned per-file results; the superseded diagnostic is preserved in
`lint-comparison-pre-path-remedy.json`. Raw final lint output is unchanged.
No baseline, suppression or dependency changed.

Independent read-only production review found no blockers. The reviewer checked
served/failed ordering, optional metadata compatibility and rollback-safe
refusal; it did not rerun the tests. Root owns final runtime/source verification.
Normal Git hook outcomes, TypeScript and canonical publication are recorded
separately after publication. No hook bypass or force push is authorized.

## Limits and remaining work

Unknown/absent/unrecognized status remains unconfirmed under the existing policy;
false is not evidence that scientific content is complete or correct. Legacy
candidates still need the existing saved-base/source/current-access gates.
Direct database corruption/malformed metadata is not attested by this change.

The acceptance proof uses actual application SQL/JWT routes with PGlite and
local governed filing/version triggers. It does not establish native PostgreSQL
concurrency, live provider behavior, production deployment, model PQ, independent
validation or agency acceptance. Existing uncertain-outcome regressions retain
their fixture limits; the new cutoff suite does not simulate a native lost socket.

The existing client intentionally keeps an earlier valid candidate after a
failed regeneration. The claim is no **new** cutoff candidate or replacement
prose, not deletion of all earlier review content. No client production edits
were necessary. Generic save attestation, quick-completion metadata, nested
cancellation, retrieval/OCR and regional qualification remain separate needs.
This closes a bounded D2 defect, not the D2 launch row or the full remaining-needs
assessment.
