# Existing authoring-to-Vault continuity evidence

W1 / D2; canonical `concept2cure-v2`; local/Codespaces only.

## What already exists

`editor/FileToVaultDialog.tsx` already renders and files through the existing
authoring route, reports approval and opens the exact returned document through
`vaultTarget.ts`. `DocumentCanvas.tsx` and `DocumentWorkbench.tsx` are its current
hosts. Vault placement and filing-context/reconciliation patterns already exist
in the shared submission placement components; they are extended or reused.

`authoring-file-to-vault.ts` already renders saved sections, admits and places
bytes through canonical Vault services, rechecks sections under transaction and
audits the export before byte-bound approval carryover. Canonical Vault ingest,
check-in, version family and database lineage guards already exist; authoring
currently supplies a hash version without a predecessor. Existing real PGlite
filing/placement/check-in fixtures are the verification starting point.

Searches across client, routes, services, schemas, migrations, design/work orders
and deleted history found no retired alternate filer/version engine to restore.
The existing File to vault → Open in Vault path must be verified before treating
the older placement TODO as missing product functionality.

The confirmed client gap was an incorrect definite “nothing was written” verdict
and possible replay after an ambiguous POST or unreadable success receipt.
The existing dialog now validates identity and retains the reconciliation hold.
See the [discovery contract](../../../design/AUTHORING_VAULT_CONTINUITY_2026-10-21.md).

The audits now confirm header drift after export, reused-admission compensation
and unconfirmed cleanup as concrete server gaps. The bounded implementation
extends the existing locked header read, canonical ingest admission identity and
compensation result, alongside client receipt/session guards. It qualifies the
existing multi-step Vault placement chain; it does not add a new placement UI or
renumber historical authoring hash versions. Canonical was caught up from
`463181413` to `218e49eb8`, then fast-forwarded to `bd24ecb4c`; see
`canonical-catchup.json` and `pre-verification-remote.json`. The later nine code
paths concern AnA raw round-body delivery and are disjoint from this increment.
Their five focused suites and assembled-template oversight are included in the
combined regression selection. Package, lockfile and configuration are unchanged.

## Result and boundaries

- The existing File to vault dialog verifies Vault/project UUIDs, SHA-256,
  requested format and contradictory envelope errors. Missing approval remains
  unknown. Uncertain and already-recorded outcomes hold another POST through
  ordinary close/reopen. Pending, document/project-visit and account guards
  suppress duplicate actions and obsolete callbacks, toasts and navigation;
  genuine same-account bearer refresh remains current.
- The existing filing service compares the complete captured header and saved
  sections before recording. Canonical ingest proves creation using its
  attempted UUID, including a real SQL conflict winner after a declared missed
  pre-read seam. Existing rows are not re-placed, approved or compensated by
  this filing attempt. Only a proven new row can receive a tenant/project-scoped
  audited tombstone; failed cleanup requires reconciliation.
- Lost admission/recording COMMIT or rollback acknowledgements retain possibly
  held rows and bytes and return `OUTCOME_UNKNOWN`. A reused admission discards
  only its unheld fresh upload through the existing guarded cleanup helper.
- The mounted editor → Open in Vault → existing placement dialog test carries
  the exact returned UUID into a `vault_documents` leaf request. The obsolete
  “no product path” TODO was replaced by its test reference. No editor, placement
  control, CSS, dependency, production schema or transmission path was added.

The hold is an ordinary mounted-dialog/session safeguard, not durable request
idempotency across navigation or browser restart. The tests use deterministic
HTTP/storage/scanner/renderer seams. PGlite executes actual SQL transactions and
conflict handling; the declared empty-pre-read seam does not qualify native
multi-connection scheduling. Neither every third-party-use race after admission
nor universal post-admission compensation is claimed: a later Vault view lookup
throw still reaches a generic server error and the client's unknown-outcome hold.

Historical hash-version supersession remains the one explicit parity TODO; no
predecessor is guessed or version silently renumbered. The fixture also keeps its
explicit missing Vault authoring-lineage assertion. Human testing, live approved
AnA/provider behavior, native full-install qualification and agency transmission
remain unverified. All 58 cases in the Codespaces guide remain **Not run**.

## Verification

The [client packet](client/README.md) retains meaningful RED and final 126-pass
seven-suite GREEN, strict dialog/test lint, unchanged host warnings and source
pins. The [server packet](server/README.md) retains header/ownership/cleanup and
transaction-acknowledgement REDs, final 136-pass eleven-suite GREEN with one
retained TODO, and strict lint except the two inherited ingest warnings.
These cohorts overlap the combined selection and must not be added together.
Independent client/server reviews are retained beside those receipts.

Combined verification passed; counts below are not added to the overlapping
worker cohorts. The first merged run retained two canvas-binding fixture
failures (and their unhandled missing-export errors). That fixture now preserves
the actual auth module while retaining its `useAuth` stub. Its focused 2/2 and
strict lint pass are in `client/binding-fixture/`; production code did not change.

| Check | Actual result | Receipt |
| --- | --- | --- |
| Final merged regressions | 616 passed, 47 suites, 1 retained TODO; exit 0 | `release-regressions.json` |
| TypeScript | 0 errors, unchanged zero baseline; exit 0 | `typecheck-final.json` |
| Production build | exit 0 | `build.json` |
| Changed-file lint | 15 TypeScript files, 0 errors, 40 inherited warnings | `release-lint-summary.json` |
| Warning comparison | no file gained warnings; exit 0 | `release-warning-ratchet.json` |
| Existing repository gates | all 16 passed; SQL allowance lowered from 1 to 0 | `static-gates.json` |
| Codespaces checklist | 58 sequential cases, all Not run | `evidence-check.json` |

`source-freeze.json` records initial compiler inputs.
`qualified-source-freeze.json` records the route-comment correction and the
47-suite selection. `release-source-freeze.json` records the sole test-mock
correction and explicitly pins the lowered SQL baseline: all 80 final inputs
match at that qualification. Compiler/build/runtime input hashes are unchanged by that test correction.
The publication check then removed one extra EOF newline byte from the types-only
extraction; `publication-whitespace-note.json` records the exact byte change and
`publication-source-freeze.json` pins the final 80 inputs. No semantic change
requires a repeated regression run; normal push hooks verify the final inputs.
The later canonical catch-up to `440a1d006` contains only two repository-report
documents; see `pre-publication-remote.json`. Raw command output, argv, exits,
elapsed times and input/output hashes are retained beside the JSON receipts.

The prior increment's 1,101/412 counts are historical and are not current
qualification. Publication stays on `concept2cure-v2` with normal Git hooks;
the parent session reports the final pushed commit identity.
