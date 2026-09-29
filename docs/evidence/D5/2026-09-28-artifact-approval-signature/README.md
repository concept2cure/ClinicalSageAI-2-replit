# Approving or locking an artifact is an electronic signature

**Row:** D5 (Part 11: every governed change leaves a record, and a signature is
a signature). **Session:** `…01P6GWSv`. **Date:** 2026-09-28. **Source:** the
first item of "Found by the vault re-baseline (`…01KnUGoX`)" in
`docs/work-orders/README.md`. It was handed to `…01Wcyqbq` on 2026-09-24; that
lane's last commit was 2026-09-25 07:23 and the defect was still at HEAD. It is
taken over here and recorded on the board.

## What was wrong

`PUT /projects/:projectId/artifacts/:artifactId/status` (`server/routes/c2c/artifacts.ts`)
is the governed approval act that records an artifact's approved and locked
versions, the columns the filing rule reads. Its two signed transitions,
review → approved and approved → locked, each wrote a Part 11 signature to
`concept2cure_signatures`. Five problems:

- **No re-authentication (§11.200).** The signature was written from the
  session alone. `authentication_method` said `session_jwt`.
- **Any text as the meaning (§11.50(a)(3)).** Free text such as "Approved"
  was written as the signature's meaning.
- **A printed name that could be anything (§11.50).** It was
  `userName || email || 'unknown'`.
- **Not atomic.** The status change committed first and the signature after
  it, on its own. A failed signature left an approved artifact with no
  signature.
- **Skipped silently.** With no stored row for the version, there was no
  signature at all, and the approval stood.

The route's note about the removed signing route also claimed this router
writes no signature substrate. That was false.

## The change

- **The act fixes its meaning.** Approve is signed `approval` and lock is
  signed `release` (`ARTIFACT_ACT_MEANING`, `server/services/artifact-approval-act.ts`).
  A different meaning, a missing one, or a missing `attestationText` is refused
  400 before anything is read or asked, even with a wrong password.
- **The signer re-authenticates before anything is written.** `verifyReauth`
  is the governed actions' password check, with TOTP when the account is
  enrolled. It must pass, or the answer is 401. The review quorum, the role
  table and the lock-covers-approval rule still run first, so a refused
  transition is not asked for a password.
- **One transaction.** `commitSignedArtifactAct`
  (`server/services/artifact-signed-act.ts`) writes, and a failure anywhere
  rolls all of it back:
  - the status change;
  - the version signed, when the artifact had no stored row for it;
  - the ledger pair (`recordGovernedAction`);
  - the signature row;
  - for a lock, the submission snapshot.

  The route adds the provenance event on the same transaction. Lock order:
  the artifact row, then the audit chain. Nothing after the COMMIT can turn a
  committed signature into an error answer.
- **Only from the state the signer was shown.** The UPDATE requires the
  status, the version and the approved version the route read. A concurrent
  edit, a second approval, or an approval revoked and given again in between
  gets 409 `ARTIFACT_CHANGED`, and nothing is written.
- **Every signature binds a stored version.** Chat, upload and form imports
  create artifacts with no version row. For those, the act records the
  current version from the artifact's content, using the sha256 the route's
  own saves write, and signs it. Such an artifact was approvable before this
  change only unsigned. The signature and the lock's snapshot bind the same
  hash: the stored version's.
- **What the signature row now says:**
  - the account's printed name (`resolveSignerIdentity`). A signer it cannot
    name is refused 403 `SIGNER_NOT_ATTRIBUTABLE`, and nothing is written;
  - `password`, or `password+totp` only when a TOTP was verified;
  - the manifest carries the ledger's action, audit and chain ids.
- **The signature stays in `concept2cure_signatures`**, the table the
  readiness engine, the Artifacts Center and the DOCX signature block read. The
  removal note now says so. Consolidating the two signature substrates is not
  done here.
- **The route no longer writes a separate, discarded 'SIGN' audit entry.** The
  ledger pair on the transaction replaces it. The `ci:discarded-audit-write`
  baseline for the file drops from 14 to 13.

**Adversarial review.** An independent security review ran on the first
version of this change. It found no break in the ordering or atomicity. Every
finding in this lane's files was fixed before commit:
- the approved-version race;
- the provenance insert that could answer 500 over a committed act;
- artifacts with no version row;
- one hash for the signature and the snapshot;
- the unnamed signer;
- a branch that keyed on a found row rather than on the act;
- test cases that could not fail: the meaning checked with the correct
  password, TOTP never exercised, one race only, one ledger store checked.

Its findings in other lanes' files are handed on (see "Still open").

## Proof (PGlite, a real engine; the real status route is mounted)

`server/routes/c2c/__tests__/artifact-approval-ceremony.pglite.integration.test.ts`.
The quorum, the signer lookup, the ledger writer and every table the act
writes are production code. Only the password check's dependencies and
services unrelated to the act are stubbed.

| Case | HEAD | Change |
|---|---|---|
| Approve with no re-authentication | 200, approved | 401, nothing written |
| Approve with a wrong password | 200, approved | 401, nothing written |
| No meaning / free text / the lock's meaning, with a wrong password | 200 / 200 / 200 | 400, before the password |
| Approve, re-authenticated | signature says `session_jwt` and prints the email | `password`, printed name; both ledger stores; a provenance event |
| Enrolled in TOTP, no code / with the code | 200 / 200 (`session_jwt`) | 401 / `password+totp`, second factor verified |
| No stored row for the version | 200, approved with no signature | the version is recorded from the content and signed |
| The provenance event cannot be written | the approval committed, answered 500 | all rolled back |
| The signature cannot be written | the approval committed anyway | all rolled back; no ledger row in either store |
| Lock with no re-authentication | 200, locked | 401, not locked, no snapshot |
| Lock, re-authenticated | — | locked at the version; snapshot and signature bind one hash; ledger row `lock` |
| Approved, edited, or re-approved with no version, in between | — | `ARTIFACT_CHANGED`, nothing written (3 cases) |

The evidence files:
- `red.txt`: the 12 route cases against HEAD's route, 12/12 red. The three
  stale-state cases call the new module directly, so they pass there.
- `red-guard.txt`: those three failing with the UPDATE's status, version and
  approved-version conditions removed.
- `green.txt`: the green runs.

Three existing suites pinned the old contract, and were moved to it in the
same change:
- `tests/artifact-status-lock-covers-approval.test.ts`: each act sends its own
  meaning and a password; the success cases queue the version and signature
  rows.
- `tests/artifact-status-project-scope.test.ts`: the lock's meaning.
- `tests/phase10-runtime-esign-snapshots.test.ts`: its string checks read the
  module that now writes the signature and the snapshot.

## Still open, handed on

- **`/api/authoring-actions/approve-artifact` and `/lock-artifact`**
  (`server/routes/authoring-actions.ts`) record an approved or locked version
  with no signature at all. They have no client caller, but they are an API
  path around this ceremony. The file is inside `…01GJidg5`'s 24-hour window,
  so it is handed on (work-orders, item 6): route both through `verifyReauth`
  and `commitSignedArtifactAct`, or refuse them.
- **AnA `update_artifact_status`** (`server/services/ana-ri/command-executor.ts:818`)
  can set approved or locked with a reason only. It is not in
  `PART11_ESIGN_COMMANDS`. It records no version, so the result is not
  filable, but the artifact reads as approved or locked with no signature. It
  is inside `…01KiDof7`'s window (item 10).
- **`promote_artifact`** (`server/services/ai-actions/handlers/promote-artifact.ts:275`)
  sets status `approved` unsigned in the same way. It is outside every window.
  It is the D5 lane's next item after this one.
- **`concept2cure_signatures` is not append-only on any applier.** Its
  immutability trigger lives only in `db/migrations/_legacy/`, which no applier
  runs. `20260318_ga_immutability_hardening.sql` is not in the migration set
  either. An app-role UPDATE or DELETE can rewrite or remove a signature.
  This predates this change. It needs an additive, replay-safe trigger
  migration, and first a census of the table's legitimate UPDATE writers (a
  revocation, if any). It is the D5 lane's next item after this one.
- The seal-verified route persists a client-supplied `signerRole` (the same
  re-baseline item). Not touched here.
