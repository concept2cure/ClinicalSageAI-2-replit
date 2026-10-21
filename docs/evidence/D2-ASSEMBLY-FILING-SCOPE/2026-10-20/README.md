# Assembly filing scope and saved review evidence

W1 / D2; canonical `concept2cure-v2`; local/Codespaces only.

## What already exists

The existing `server/services/authoring/authoring-assembly.ts` and
`authoring-assembly-source.ts` already authorize, preview and transactionally
append the chosen template in the single editor. Built-in working copies stay
unbound through `templateWorkingBinding`; blank documents may bind the project's
actual governed filing. Recorded parent applicability does not yet check that
binding, and same-region components can bypass full-filing scope.

`server/services/market-specs/document-preparation.ts` already owns exact device
component compatibility. `server/services/c2c/document-class.ts`,
`governed-document-binding.ts` and `shared/regulatory/filing-catalog.ts` own filing
and authority identity; they will be reused rather than restated. The existing
Notified Body pack-key mapping is moved from market support into the existing
pure document-class module so assembly can reuse it without loading gateways.

`server/services/authoring/authoring-template-guidance.ts` already validates
section assembly provenance independently of parent template identity.
`server/services/ana/saved-template-review.ts` supplies the existing bounded
whole-document critique, but skips those sections without a parent template and
otherwise attributes all sources to that parent. Existing editor oversight
controls and review pagination/snapshots are retained.

Code/route/shared/fixture searches and deleted-history review found no alternate
assembly, scope validator or reviewer to restore. See the
[implementation contract](../../../design/ASSEMBLY_FILING_SCOPE_AND_REVIEW_2026-10-20.md)
for exact observed gaps, ownership, invariants and qualification scope.

The catch-up base was `4282257ac`: report-only fast-forward from the preceding
regional initialization increment `7b87ad1a4`. Before combined qualification,
canonical was fast-forwarded to `38c7f1606`, integrating the concurrent schedule
admission, passage-result fitting and repository checks. None of the current
owned files overlapped; see `canonical-prequalification-integration.json`.
No editor, UI pattern, dependency, schema, provider or transport is added.

## Changes and limits

The existing assembly resolver verifies the actual bound filing on the caller's
tenant/project executor before reading selected sources. It rejects contradictory
template filing, component, region or authority, and includes the verified binding
in the existing target fingerprint. Commit locks and recomputes this scope, so a
changed filing requires a fresh preview. Unbound regional working copies and
compatible common medicinal Modules 2–5 retain their existing behavior. Legacy
implicit US IND administrative or whole-pyramid templates do not inherit the
common-module allowance.

The existing whole-document review reads each assembled section's validated
recorded source and guidance even when its parent has no template or a different
one. Source identity, format, eligibility and limitations remain section-scoped,
bounded and part of the review snapshot. The authorized actual program must
match the assembly receipt. Existing AnA review controls explain that scope;
authored text, review scoring and parent identity are unchanged.

Two boundaries remain explicit. A saved bound filing choice without an exact
canonical document-class mapping, including the legacy Canada NDS choice, is
unverified rather than guessed; a matching unbound working copy remains
available. Stored organization/global assemblies that lack complete recorded
source and guidance remain manually usable, but a complete AnA review returns
unverified instead of borrowing their parent's source or eligibility. This
increment does not manufacture missing provenance or certify template adequacy.

## Verification

The qualified source freeze is [source-freeze-qualified.json](source-freeze-qualified.json):
232 pinned inputs, Node 22.23.3, canonical lockfile installed without edits.
The subsequent `6b9b20628` fast-forward contains six publication-evidence files
only; all pinned inputs remained identical. See
[canonical publication integration](canonical-publication-integration.json).

- [Combined regression](qualified-integration.json): **1,101 passed, 38 suites**,
  no failures or skips, no source drift. The retained verbose output includes
  the actual HTTP Canada MDL assembly into a blank/no-parent document followed
  by complete paginated saved review on the same PGlite executor.
- [Compiler](qualified-typecheck.json): zero errors against the unchanged zero
  baseline. [Production build](qualified-build.json): exit 0, no source drift.
- [Strict lint](qualified-lint.json): all 14 changed/new code files, zero errors
  and warnings. [Warning comparison](qualified-warning-ratchet.json): all 14
  included, no file grew against canonical `6b9b20628`.
- [Static gates](qualified-static-gates.json): all 16 passed, including the
  single-editor/canvas paths, editor integrity, design system, token cascade and
  contrast, SQL/gateway safety, repository ceiling and migration guards.
- [Independent review](independent-review.json): no remaining blockers, including
  follow-up review of the fixed SQL query. Focused meaningful RED, candidate and
  GREEN receipts remain under [assembly](assembly/README.md) and
  [saved review](review/README.md); the root prompt and pure authority mapping
  RED/GREEN outputs are retained alongside them. These overlapping counts must
  not be added to the combined total.
- [Local human-testing worksheet](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md):
  53 cases, all explicitly **Not run**; four assembly/review cases appended.

The initial static run rejected an interpolated fixed locking clause; complete
literal queries resolved it without changing the SQL baseline. The first
compiler candidate overlapped that correction and found two incompatible casts
in the new regression test. A local reference-item type resolved them. Those
earlier unqualified receipts are retained; only the `qualified-*` receipts and
qualified freeze support the results above. No baseline was increased.

Human acceptance, live AnA/provider behavior, full fresh PostgreSQL installation,
official form adequacy and agency transmission remain unverified. This is a
local/Codespaces authoring increment, not a commercial-launch or filing verdict.
