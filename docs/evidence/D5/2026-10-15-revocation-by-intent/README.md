# A revocation withdraws the signature that was named, not the newest one on the target

**Date:** 2026-10-15 · **Row:** D5 (Part 11) · **Session:** `…01T2wooCZu46W7msw4TJuuzr`

**Found by** the P-34 implementation, which recorded the hazard and left it alone
(`docs/evidence/D2-FOUNDER-DECISIONS/2026-10-15/p34-shadow-review-waiver/README.md`, "Revocation hazard (not changed)").

## The defect

`persistGovernedSignatureRevocation` (`server/services/part11/signature-persistence.ts`) is the one writer behind
`POST /api/c2c/actions/revoke-signature`. It chose "the signature under revocation" like this:

```sql
SELECT id, … FROM electronic_signatures
 WHERE organization_id = $1 AND signed_target = $2 AND signature_type <> 'governed-revocation' AND superseded_by IS NULL
 ORDER BY signed_at DESC, id DESC
 LIMIT 1
```

That is the newest live row on the target, whatever it was given for. Until P-34 a sequence rarely held more than one live
signature, so the newest row was usually the right one. Since P-34 (and P-35), one target, `ectd-sequence:<id>`, holds live
signatures for several acts at once:

- a freeze
- a dispatch (the release)
- a transmit
- a Shadow Review waiver (`shadow-waiver`)
- one disposition per critical finding (`shadow-finding-disposition`)

Revoking the release could withdraw a newer waiver instead, and revoking a waiver could withdraw a newer release. The
revocation row (`revokedSignatureId`, its `superseded_by` pointer) would then record the withdrawal of a signature nobody
chose, and the one that was meant to be withdrawn would stay in force. That breaks §11.10(e), because the trail records an act
that did not happen, and §11.70, because the supersession links the wrong record.

The only caller is the route. `writeMutation` passes the envelope's `payload` through to the writer as `params.payload`, so
the caller can name the signature. The intent each signature was given for is recorded on its sign action
(`c2c_ana_actions.payload.intent`). That is the same record the release resolver and Gate 1 read, joined through the
signature's `signature_manifest.actionId`.

## The change

- **The payload names the signature** (`RevocationSelector`). It can give `signatureId` (the `electronic_signatures.id`),
  `signatureActionId` (the sign action), `intent` (the act it was given for), or a combination. A combination narrows the
  match: `{ signatureId, intent }` means "signature N, which must have been given for this intent".
- **Exactly one live signature must answer** (`chooseSignatureToRevoke`, `server/services/part11/revocation-selection.ts`).
  - None answers: 409 `REVOCATION_TARGET_UNRESOLVED`. The detail names the live signatures on the target, and says so when
    the named signature was given for a different intent.
  - More than one answers: 409 `REVOCATION_TARGET_AMBIGUOUS`. The body carries `candidates`
    (`signatureId`, `signatureActionId`, `intent`, `signedAt`, newest first) so the caller can name one.
  - In both cases nothing is written: no revocation row, no `c2c_ana_actions` or `audit_logs` row, and no change to any signature.
- **Nothing named, on a target whose signatures declare intents** (a sequence): exactly one live signature is accepted, and more
  than one is ambiguous. The newest is never taken silently.
- **Kept: a target whose signatures declare no intent** (`program:`, `document:`, `protocol-document:` …) behaves as before. Its
  live signature is revoked without naming it, and with several live signatures the newest is still revoked. This was
  kept on instruction; see "Not changed".
- **"Live" is the canonical predicate.** The candidates are rows with `superseded_by IS NULL` and `!isSignatureWithdrawn(row)`,
  so a signature voided for a refused act (P-23) is not a candidate either.
- **A malformed name** is refused with 400 `REVOCATION_SELECTOR_INVALID`, for example a `signatureId` that is not a positive
  integer, or an empty `intent`. The route checks it before re-authentication (`commandMeaningRefusal`), and the writer checks
  it again as the floor (`revocationSelectorOf`).
- **The revocation row states what was withdrawn.** Its manifest now also carries `revokedSignatureActionId` and
  `revokedSignatureIntent`, appended after the existing members.
- **Route mapping in one place.** `revocationRefusal(err)` maps the three refusals, in the same shape as
  `separationOfDutiesRefusal`, so the handler's branch count is unchanged.

The pure selection rule lives in `revocation-selection.ts` (no database access). The query, the compare-and-set UPDATE and the
revocation row stay in `persistGovernedSignatureRevocation`. The UPDATE is byte-identical, which
`signature-revocation-trigger.pglite.integration.test.ts` extracts from source and runs against the trigger.

## Proof

New suite: `server/routes/c2c/__tests__/revoke-signature-by-intent.pglite.integration.test.ts`, 25 tests. It runs on PGlite
with the real D6 `electronic_signatures` migration (`20260813d`) and the real §11.70 immutability trigger (`20260730`). The
signatures are written by the real `writeMutation('sign')` and revoked by the real `writeMutation('revoke-signature')`, and
the real router answers the HTTP cases. Only the database handle, the signer's role and the credential check are replaced.

| Check | Red (trunk's writer and route) | Green |
|---|---|---|
| A live `dispatch` and a newer live `shadow-waiver` on one sequence: revoking `intent: 'dispatch'` revokes the dispatch row and leaves the waiver in force | fails: the waiver was revoked | passes |
| The converse (waiver older, dispatch newer; revoke `intent: 'shadow-waiver'`) | fails: the release was revoked | passes |
| By `signatureId`, and by `signatureActionId`, with a newer signature for another act present | fails | passes |
| Nothing named, two acts live: 409 `REVOCATION_TARGET_AMBIGUOUS` naming both, nothing written | fails: the newest was revoked | passes |
| Two live `shadow-finding-disposition` signatures, revoke by intent: ambiguous. Then by id: only that one is revoked | fails | passes |
| Nothing answers (`intent: 'transmit'`, an id given for another intent, an unknown id, an unknown action): 409 unresolved, nothing written | fails: each revoked the newest | passes |
| An already-revoked signature named again: refused. A voided (P-23) signature named: refused, and not counted as live | fails | passes |
| A signature on another target, named by id: refused | fails | passes |
| Seven malformed selectors: `REVOCATION_SELECTOR_INVALID`, nothing written | fail | pass |
| Kept: an intent-less target's one live signature, and the newest of several, revoked unnamed. An empty target refuses with the same sentence as before | **pass on trunk** (unchanged behaviour) | pass |
| Route: 409 with `candidates`; 409 unresolved; 400 before the credential is asked for (`reverifySigner` not called); 200 revokes only the named one | fail (200 for each, the newest revoked) | pass |

- `red-against-trunk.txt`: 22 failed, 3 passed (the 3 kept-behaviour cases). This is the finished suite against
  `git show HEAD:` of `signature-persistence.ts` and `actions.ts`.
- `green.txt`: 25 passed.

### Each guard shown failing (`mutations.txt`, `mutations-superseded-pair.txt`)

Each mutation was applied alone, the suite was run, and the file was restored (`restored-ok`).

| Mutation | Cases that go red |
|---|---|
| M1 intent filter removed | 5 red: both "dispatch vs waiver" cases, "no live signature answers", the intent-less target named by an intent it never declared, the route 409 unresolved |
| M2 ambiguity refusal replaced by "take the newest" | 3 red: both ambiguous cases, the route 409 ambiguous |
| M3 kept rule removed (intent-less target, several live) | 1 red: "with several live signatures, the newest is revoked, as before" |
| M4 `signatureId` filter removed | 7 red: by id, the disposition case named by id, "no live signature answers", already revoked, voided, other target, the route 200 |
| M5 `signatureActionId` filter removed | 2 red: by sign action, "no live signature answers" (the unknown action) |
| M6 withdrawn (voided) rows counted as live | 1 red: the voided case |
| M7 writer ignores a malformed selector | 7 red: all seven malformed selectors |
| M8 parser accepts negative or fractional ids | 2 red: `-3`, `1.5` |
| M9 route: no early selector refusal | 1 red: "400 before the credential is asked for" (the password was asked for) |
| M10 route: ambiguous not mapped to 409 | 1 red: the route's 409 ambiguous |
| M11 SQL `superseded_by IS NULL` dropped, alone | 0 red. This is an equivalent mutant: `isSignatureWithdrawn` also excludes superseded rows, and the compare-and-set UPDATE checks it a third time |
| M6 + M11 together | 2 red: "already revoked … no longer counts as live", and the voided case |

### Suites on the paths this touches (`related-files.txt`, `green-related.txt`)

151 files: every suite that imports `signature-persistence` or the c2c actions route, plus the part11, release-signature
resolver, `sequence-release-signature`, Shadow Review waiver and c2c route suites.

- **Result:** 147 files and 1,994 tests pass.
- **Every suite on the paths this change touches is green:**
  - all of `server/services/part11/__tests__`, including `signature-revocation-trigger` (6) and `revoked-signature-authorizes-nothing` (10)
  - `protocol-signature-manifestation` (21), which revokes through this writer
  - the release-signature resolver suites (`release-signature-status` 50, `-gate` 39, `-covers-sequence` 18)
  - `sequence-release-signature` (18 and 9)
  - `governed-sign-esignature` (13), `governed-sign-authority` (8), `governed-action` (15), `c2c-router.parity` (14)
  - the 24 waiver cases that do not reach the dispatch assessor
- **The 10 failures are in 3 files and share one cause, which is not this change.** It is 42703
  `column f.disposition_signature_action_id does not exist`: the P-35 finding-disposition work (committed in `3624fe667`, with
  further uncommitted edits in this working tree by another session to `shadow-finding-disposition.ts`,
  `assess-dispatch-readiness.ts` and `server/db/pglite-harness.ts`) reads a column those suites' schemas do not create yet.
  - The 3 files are the golden NDA journey, the founder-path lineage and the waiver suite's three
    `assessSequenceDispatchReadiness` cases.
  - The journey and lineage suites never revoke a signature.
- **Separately, `ci:discarded-audit-write` fails on committed trunk** at `server/services/shadow-review/shadow-review-service.ts:326`
  (0 to 1), a file this change does not touch.
- **Other gates run on this change, all OK:** `ci:sql-interpolation`, `ci:json-operator-types`, `ci:sign-ceremony`,
  `ci:column-reachability`, `ci:runtime-ddl`, `ci:server-error-leaks`.

Typecheck of the touched files: no errors in them (`tsc -p` over a scratch config listing them; the only errors are
pre-existing ones outside the change, from the narrowed file list). ESLint, compared per file with
`git show HEAD:<file> | npx eslint --stdin`:

- `signature-persistence.ts`: 1 warning at HEAD, 1 now (482 to 489 effective lines, under the 500 limit).
- `actions.ts`: 5 warnings at HEAD, 5 now. The handler's complexity is unchanged at 38.
- The new `revocation-selection.ts` and the new suite: 0 warnings each.

## Not changed

- **Intent-less targets with several live signatures still revoke the newest unnamed.** This was kept on instruction
  ("keep the existing behaviour for targets with only one signature kind"), and M3 pins it. The same wrong-signature hazard
  exists there in principle: two signers' `approval` and `review` on one `document:`. Making the unnamed case strict
  everywhere is a one-line change (drop the `every(intent === null)` branch). It would make such a revocation answer 409
  with its candidates. That is a decision for the reviewer, not this change.
- **No client calls the revoke route today** (grep of `client/`). The Submission Center's revoke control, when built, should
  send `signatureId`. The waiver status and the release resolver already carry it.
- **Found, not fixed: the P-23 void is refused by the database.** `voidSignatureForRefusedAct` updates `is_valid` and
  `verification_status` without `superseded_by`. The deployed trigger (`db/migrations/20260730_esign_audit_db_level_immutability.sql`)
  permits the verification columns to change only in the supersession statement, so the UPDATE raises `IMMUTABILITY_VIOLATION`.
  This was reproduced in a scratch PGlite run of that exact statement against that migration. `voidRefusedStepSignature`
  catches the error and still writes its `GOVERNED_SIGNATURE_VOIDED` audit row, which Gate 1 reads, so a void still holds.
  But the signature row itself stays `is_valid = true`, and every reader that consults only the row (the release resolver,
  the waiver resolver, this revocation's candidates) sees it as live. That belongs to the P-23 owner and the migration's
  Rule 1 amendment, not to this change.

## Amended on integration, same day: no "newest" on any target

The first version kept the old rule for targets whose signatures declare no intent: unnamed, with several live signatures, the newest was revoked. That is the same hazard (two signers on one `document:`, one revocation meant for the other), and no client calls the route yet, so making it strict breaks no caller.

`chooseSignatureToRevoke` now refuses that case 409 `REVOCATION_TARGET_AMBIGUOUS` with the candidates, as it does on a sequence. The kept case in the suite became "with several live signatures and none named, nothing is revoked". It also shows the one named by id going while the other stays. The suite passes 25/25, and every suite that revokes through this writer, plus `server/services/part11`, passes: 21 files, 228 tests.
