# P-86 C1: a sequence never filed is retired by its own signed act, and the database admits no other removal (row D7, 2026-11-09)

## The decision, and the rulings that bind this commit

- **P-86** (founder, 2026-11-01, `docs/LAUNCH_DEFINITION_OF_DONE.md`): a sequence that was never filed "may be
  retired by a signed, audited act, which frees its number, only while no production send is bound to it and it is
  not filed. The act reuses the filed-elsewhere baseline's existing removal of drafts. It goes under launch row D7
  (`Plan: L1`)."
- **P-108 item 2(a)** (founder, 2026-11-08): "A production attempt that records nothing reached FDA … is not a 'bound
  production send', so the sequence can be retired by P-86's signed act."
- **The coordinating session's rulings of 2026-11-02** (appended to the design): no new module; the act lives in an
  existing file of `server/services/submission-service/`; the holds; the `migration-set.mjs` turn.
- **The coordinating session's rulings of 2026-11-09:**
  - C1's scope as re-cut: the act lives in `filed-sequence-baseline.ts`.
  - Check 3, worded exactly as below.
  - Check 3b fails closed, with its own sentence.
  - The sequence's own signing chain (D2), not `signGovernedAct`.
  - All of the design's narrowings are kept.
  - C1b is owed, not built.
  - `Plan: L1`, with one progress line in `ONE_DESIGN_PLAN.md` §3a.
- **The design:** `docs/evidence/RIM/2026-11-08-designs/p86-retire-unfiled-sequence.design.md`, with its re-anchor
  addendum (`92c984c2f`).

## What already exists (RULE 3)

- **The removal this act reuses.** The filed-elsewhere declaration's removal of the empty drafts it replaces
  (`filed-sequence-baseline.ts`, `declareFiledBaseline`). It was a bare `UPDATE … SET deleted_at = NOW()`. It is now
  `liveSetRemoval`, the one statement both acts run.
- **The sequence's own signing chain:**
  - Gate 1 (`governedSignatureVerdict`) with its `payloadRefusal` hook;
  - `INTENT_MEANING_REFUSAL`;
  - `independentSignerRefusal`;
  - `recheckUnderSequenceLock`;
  - `voidingSignatureOnRefusal` (P-23);
  - `applySequenceChangeWithAudit`.

  These are the templates the Shadow Review waiver (P-34) and finding disposition (P-35) use on the same target.
  The signer's reason is read by `dispositionSignatureReason`.
- **What a send leaves behind** (F1 slices 1 and 2):
  - each sequence transmit is bound (`metadata.dispatchBinding`) and names its environment;
  - a production send refused before the wire writes a chained `TRANSMIT_BLOCKED` with `transmitted: false`
    (`recordBlockedSequenceTransmit`).
- **Freeing the number.** Step 4 (repair A, `2c0b4c8fe`): `createSequence` refuses only a **live** holder of a number.
- **Readers of a removed sequence.** Repair B (`cec19b461`) and `e4992a733` already read live sequences only, so
  D8 needs no new filter.
- **The precedent for the guard** is `migrations/20261029g_submission_filed_baselines.sql`: a deferred constraint
  trigger that admits a row only with its signature from the same transaction.
- **No removal of a sequence existed** in code apart from the baseline's (searched: `update(ectdSequences)` and every
  `UPDATE ectd_sequences … deleted_at` in `server/`, `scripts/` and `migrations/`).

## The change

### The act (`retireSequence`, `submission-service.ts`)

1. **The live sequence.** A sequence already retired is answered: "Sequence NNNN was retired on YYYY-MM-DD UTC by
   NAME. Nothing was changed."
2. **Gate 1** with intent `retire`:
   - the meaning is `responsibility` and only it;
   - the payload carries `notFiledElsewhere: true` and the statement, word for word:
     > Sequence NNNN has not been filed with the agency by any route: not by a send from this sequence, not as a
     > package sent from this platform, not from an export, and not by courier or any other route.
3. **Separation of duties:** the sequence's creator never retires it.
4. **The signature's own reason.** One with no reason is refused.
5. **The facts**, judged before the lock and again under the sequence lock on the transaction:

   | Check | What keeps the sequence | Sentence (409 `SEQUENCE_NOT_RETIRABLE`) |
   |---|---|---|
   | 2a | Filed: `sent` or `acknowledged` (`isFiledDispatchStatus`) | "Sequence NNNN is on file with the agency (dispatch status 'sent'), so it cannot be retired. A correction is a new sequence numbered after it." |
   | 2b | A send in flight | "A send of sequence NNNN is in flight and not yet settled, so it cannot be retired now. …" |
   | 3 | A non-staging transmittal bound to it, unless a chained `TRANSMIT_BLOCKED` with `transmitted: false` names that attempt's signature (P-108 2(a)). A missing environment counts as production. A blocked row that names no signature proves nothing. When P-92's "released as not received" lands, checks 3 and 4 exclude it too (said in the code). | "A send of sequence NNNN to the agency's production environment is recorded on YYYY-MM-DD UTC, so it cannot be retired. …" (or "… with no environment named, so it is treated as a production send …") |
   | 4 | An `ECTD_TRANSMITTED` row outside staging (sends before bindings) | the same |
   | 3b | Its number sent to production as a package for the same application (program or application number, same region). This fails closed. | "Sequence NNNN was sent to the agency's production gateway in a package, and nothing records that the agency did not receive it, so it is not retired." |
   | 6 | IND records filed in it | "1 IND record is recorded as filed in sequence NNNN (an amendment). Retiring it would leave them filed in a sequence the agency never received, so it is not offered. Returning them to draft is not available yet." |
   | 5 | A live later sequence of the same submission and region. One that is kept is named with its reason; otherwise the highest is retired first. | "Sequence MMMM, numbered after NNNN, is kept (it is on file with the agency), so NNNN's number cannot be freed. …" / "… is still in use. Retire MMMM first: a number is freed only from the highest down." |
   | 5b | A filed twin of the same number whose record is read from compiles, by the filed fold's own read | "Another sequence NNNN of this submission is on file with the agency, and what it filed is read from the compiles numbered NNNN. …" |

   A read that fails answers `INVALID_STATE`: "Whether sequence NNNN can be retired could not be checked, so it was
   not retired. Try again." It is never a pass.
6. **The removal and its record, in one transaction:**
   - the instant is read after the locks (`clock_timestamp()`, to the millisecond);
   - `liveSetRemoval` writes it to `deleted_at`;
   - `writeChainedAuditRow` seals it as `occurred_at` (new optional `occurredAt`) on one `ECTD_SEQUENCE_RETIRED` row;
   - that row carries the reason in its column and in its details, with the signature, the meaning, the statement
     signed, the leaf-manifest digest, the staging transmittal ids and whether the number was freed;
   - the answer's `retiredAt` is the same instant.
7. **The signature is spent.** `ECTD_SEQUENCE_RETIRED` joins the spent list, so a second request is answered "already
   retired" and never voids the signature that did the act. A refusal voids the signature it was given (P-23).

### The database's rule (`migrations/20261109_ectd_sequence_removal_guard.sql`)

This is triggers only, and replay-safe (Rule 1).
- **G1, at COMMIT:** a removal stands only with one of two records:
  - (a) the `ECTD_SEQUENCE_RETIRED` row naming an executed `retire` sign action, whose live signature carries the
    meaning `responsibility` and was made by the row's actor;
  - (b) the filed-elsewhere declaration's signature, written by this transaction, naming the removed number.
- **G2, before update:**
  - a removed row is never changed or restored;
  - `sent`, `acknowledged` and `transmitting` are never removed;
  - a removal changes nothing else.
- **In the set:** directly after `20261108_report_bundle_register.sql`, above `UUID_TENANT_ISOLATION_NONPUBLIC`
  (`ci:migration-set-order` OK).

### Tests and fixtures

- **`_freeze-gate-fixture.ts`** gains the real table's `signer_id`, `signature_meaning`, `signature_type` and
  `created_at`. Its `sign()` records the signer and the meaning. This was done first, with no assertion changed.
  - `00-fixture/before.txt` and `after.txt` show its users: 84 = 84.
  - `refused-step-voids-signature.pglite.test.ts` adds the same columns for the real sign route, now with
    `IF NOT EXISTS`.
- **T15, the bare soft-deletes on real PostgreSQL**, now run with triggers off for their own transaction, as
  `review-route-guard.dbtest.ts` lays a row:
  - `tests/db/vault-where-used.dbtest.ts` (the removed sequence it lays);
  - `tests/db/sequence-number-once.dbtest.ts`, both the removed-0000 case and the racing removal.

  Without this, the guard would refuse each of them at COMMIT.
- **`server/db/pglite-harness.ts`** gains `applySequenceRemovalGuard`, applied from disk, opt-in.

## Proof

| File | What it shows |
|---|---|
| `00-fixture/before.txt`, `after.txt` | the fixture widened with no assertion changed: its six PGlite users, 84 pass before and after |
| `01-red.txt` | at `785f56d73`, with the tests in place: the rules, the act and the guard do not exist (9 unit cases fail; both PGlite files fail to load) |
| `02-green.txt` | the submission-service, ectd, submission-gateways, audit, MCP, AnA submission-tool, submissions-route and IND-lifecycle suites, and the filed-elsewhere baseline's route test: 3846 pass in 310 files, none fail |
| `03-mutations/` | 28 mutations, each red on its own case, each file restored byte for byte |

The tests:
- `sequence-retirement.pglite.test.ts`, 21 cases, the real act with the guard applied:
  - retired with staging sends only, the row otherwise unchanged, and `getSequence` then answers NOT_FOUND;
  - one instant across `retiredAt`, `deleted_at` and the sealed `occurred_at`;
  - a legacy duplicate is retired with `numberFreed: false`;
  - a second request is answered "already retired", and its signature stays in force;
  - every check's refusal, with the row left live and no record written;
  - P-108 2(a): an attempt proven blocked is admitted; a blocked row that names no signature is not;
  - 3b admits a package sent to staging, one of another application, and one of another region;
  - Gate 1: wrong intent, wrong meaning, missing flag, missing statement, a statement off by one character, the
    creator, and no reason;
  - P-23: the void, and the void signature refused afterwards;
  - an unreadable fact gives "could not be checked";
  - the recheck under the lock refuses a production send recorded after the first read.
- `sequence-removal-guard.pglite.test.ts`, 11 cases:
  - G1: a bare removal refused; the retirement record admitted; records naming another act, another meaning or
    another actor refused; the baseline's removal admitted;
  - G2: restoring or editing a removed row refused; `sent`, `acknowledged` and `transmitting` refused even with a
    record; a removal that changes the row refused;
  - the migration's status list equals `[...FILED_DISPATCH_STATUSES, 'transmitting']`;
  - replay leaves the two triggers, still guarding.
- `sequence-retirement-rules.test.ts`, 9 cases:
  - the refusals' order and wording;
  - the statement;
  - the payload and the meaning;
  - an unreadable audit instant refused before any query.

**Gates:**
- `ci:migration-set-order`, `ci:migration-guard-order`, `ci:migration-drop-safety`, `ci:migration-deploy-path`;
- `ci:json-operator-types`, `ci:runtime-ddl`, `ci:sql-interpolation` (the action name is a parameter);
- `ci:discarded-audit-write`, `ci:sign-ceremony`.

All OK. ESLint: no file gained a warning (`submission-service.ts` 7 = 7, `auditService.ts` 5 = 5, `pglite-harness.ts`
1 = 1, the rest 0).

## Owed, and named (not done here)

- **C1b:** returning IND records filed in a sequence to draft. Owed, not built (the coordinating session, flag 4). It
  is listed in D7's open items under RIM's row.
- **C2:** the door (`POST /api/submissions/sequences/:seqId/retire`), the precheck's `retirement` answer with the
  statement, MCP's wording, and the verb pin. The retire branch goes in a helper, so `precheckGovernedStep` stays at
  complexity 15.
- **C3:** on screen, on D7-A2's layout. It waits for D7-A2.
- **Not run here, because this container has no PostgreSQL server:**
  - T13, the two-connection lock case (`sequence-retirement-lock.pg.test.ts`);
  - the three dbtest fixes above.

  The CI database job runs `tests/db`.
- **T12, the baseline's own route test under the guard.** Case (b) is proven at SQL level by the guard test's
  "admits the filed-elsewhere declaration's removal" case. The route test (`submission-filed-baseline.pglite.test.ts`)
  is the baseline lane's file and was not edited.
