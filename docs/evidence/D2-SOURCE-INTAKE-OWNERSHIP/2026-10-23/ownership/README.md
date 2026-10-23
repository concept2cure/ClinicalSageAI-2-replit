# Source working-copy intake ownership tests

## What already exists

- `v2/editor/SourceImportDialog.tsx` already renders the canonical source reason,
  workflow preview, receipt and explicit Open action. The private intake hook
  previously used a mount-lifetime guard and source/project prop key only. Root
  completed that existing owner through `editor/useSourceIntake.ts`; this worker
  adds actual dialog/hook tests and aligns existing fixtures only.
- `v2/authoringHandoff.ts` already owns workflow intake and exact origin/selection
  parsing. The transport owner consolidated binary decoding/creation there and
  completed guarded requests and read-only recovery. No import endpoint or
  replacement writer was added by this worker.
- `editor/authoringCreationRecovery.ts`, `editor/authoringCurrentRead.ts`,
  `shellProject.ts`, `taskTarget.ts`, `utils/authToken.ts` and the auth service
  already supply component-owned attempts, current session/project ownership and
  captured actor credentials. Tests use those actual implementations.
- `AuthoringRecoveryNotice.tsx` already supplies the native notice/action pattern.
  The completed dialog reuses it for retirement and uncertain creation recovery.
- `sourceImportDialog`, `sourceImportScope` and `workflowSourceImport` already
  cover reasons, source/project remounts, double clicks, workflow fingerprint,
  association/provenance and dirty editor opening. Their earlier fixtures lacked
  adopted auth and complete backend-shaped document/section ownership. The
  worker aligned those fixtures and the expected captured request headers.

The approved scope and repository/deleted-history discovery are recorded in
`docs/design/SOURCE_INTAKE_OWNERSHIP_2026-10-23.md`. No competing intake was
restored or built. Worker edits are limited to the new focused test, the three
assigned existing tests and this evidence folder. Production is owned by root
and the transport worker.

## Qualified behavior

The initial focused 54-case suite uses actual SourceImportDialog/useSourceIntake,
authentication service, canonical refresh and shell project APIs. Only HTTP and
saved records are synthetic. Fixtures carry document/section UUIDs, tenant,
program, creator, exact parent, source-import provenance, title/content and order.

Cases cover stale pending preview/create/body delivery; account/session/raw
unadopted bearer replacement; project A-B-A; source changes, in-place mutation and
source A-B-A; unmount; retained setters/Create/Refresh/Check callbacks; anonymous
fallback; legitimate canonical refresh with original dispatched headers and newly
adopted headers on a later operation; known receipt opening after owner changes;
latest dirty Open hold and a post-close account change before navigation.

Unknown network/408/5xx/malformed creation outcomes hold duplicate creation and
preview replacement. Explicit Check reads only scoped inventory. Generic
inventory never becomes a guessed receipt; a subsequent workflow creation needs
a fresh explicit preview. Typed recovery additionally verifies the exact current
document and sections and offers a separate Open using actual edited workflow
section codes. Foreign/malformed typed identity, tenant, creator, source,
section-only projection and unavailable metadata remain held. Every recovery hop
keeps the dispatched bearer while legitimate canonical refresh remains current.
Delayed recovery bodies retire on ownership changes; failed checks retain the
hold and can be checked again. Preview failure remains retryable.

Existing controls, reason bounds and dirty-work behavior remain exercised. No
CSS or additional surface was added by the worker.

## Actual checks and retained failure

| Receipt | Actual result | Interpretation |
| --- | --- | --- |
| `red.json` | Exit 1; 22 failed, 4 passed in 26 focused cases | Meaningful behavior RED before root/transport production edits. Missing guards, pinned headers and recovery controls failed; source/unmount/dirty Open/preview retry behavior passed. |
| `lint-baseline.json` | Exit 0; all four assigned test files 0 errors/0 warnings | Before existing fixture edits. |
| `lint-tests-initial.json` | Exit 0; all four files 0 errors/0 warnings | Aligned fixtures and expanded tests. |
| `green-initial.json` | Exit 1; 75 passed, 1 failed across four suites | Test fixture omitted onOpenDocument in the recovery-refresh case. Recovery succeeded, and the existing dialog correctly offered no Open button without a navigation callback. Corrected the fixture rather than production. |
| `green-expanded.json` | Exit 0; 81 passed across four suites | Initial qualified 54 focused ownership/recovery cases and 27 aligned existing source/workflow cases. |
| `lint-final.json` | Exit 0; all four files 0 errors/0 warnings | Initial qualified forced explicit-file lint with `--no-ignore --max-warnings 0`. |
| `review-red.json` | Exit 1; 4 failed, 54 skipped | Authorized follow-up to the bounded read-only review. Actual-dialog regressions demonstrate post-close host hold/callback changes and legitimate reused copies with no remaining sections, before root fixes. |
| `review-green.json` | Exit 0; 85 passed across four suites | Pre-merge historical qualification: 58 focused cases and 27 aligned existing cases, including all four review regressions. |
| `review-lint.json` | Exit 0; all four files 0 errors/0 warnings | Pre-merge historical forced explicit-file lint with zero warnings permitted. |

Every recorded check has an empty source drift list. Receipts retain argv,
Node version, elapsed time, actual exit and declared source hashes before/after.
Raw output is deterministic gzip with a receipt SHA-256. Original RED production
and test bytes, pre-alignment old fixtures and the initial integration test source
are retained as gzip snapshots. `source-freeze.json` pins the historical pre-merge
qualified inputs. `final-*.gz` preserve the final assigned test bytes;
`audit.json` verifies every receipt/raw hash and retained RED snapshots;
`manifest.json` hashes this packet,
excluding itself.

The original 81-case qualification source freeze/audit/manifest and focused test
snapshot remain archived separately as `qualified81-*`. Review RED/GREEN source
and production snapshots use separate `review-*` names and do not replace the
initial receipts. `final-review.json` records the two accepted findings, root's
bounded fixes and final clear disposition. Post-close Open rechecks the current
host hold/callback. Reused/recovered empty section arrays remain valid edited
structure; fresh copies remain nonempty. The empty workflow receipt omits the
section selector and opens the verified document without a guessed code.

After the 85/4 check and lint completed without source drift, root committed its
code as `8c86a44a3` and merged canonical `eba2d8050`. The merge changes
`utils/authToken.ts` after the historical checks: generic organization resolution
now follows bearer claims; the captured-actor helper remains unchanged. That
post-check change is recorded in `post-review-dependency-drift.json`. Current
production pins after the merge are not claimed here. At root's direction this
worker did not replay tests; root's final merged intake/editor/incoming cohort
owns that qualification. `evidence-freeze.json` freezes evidence bytes only.

`incoming-review.json` records a bounded read-only review of canonical MDX/
Projects and Reporting changes in `1eca721b1..62a8d5e7f`, reviewed current file
hashes and recommended root suites. It reports no material intake overlap and
preserved one-editor handoffs. It does not claim an incoming integration run by
this worker.

Root owns broader integration, production lint/compiler/build/gates, human guide
and normal canonical publication. No compiler, build, Git mutation, dependency
change, live database/provider/agency call or human acceptance check was performed
by this worker. These synthetic checks do not establish durable request
idempotency, source eligibility or filing/submission completeness.
