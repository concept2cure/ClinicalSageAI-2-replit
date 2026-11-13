# D5 — one walk of the audit-event chain, and screens that say what it found

**Row:** D5 (Part 11 evidence)
**Plan package:** F1 (repairs: defects in shipped behaviour; no new screen, mount or table)
**Finding closed:** the half of HS-1008-7 left open on 2026-10-12
(`docs/evidence/D5-AUDIT-LINKAGE-CLAIM/2026-10-12/`: "the wording was corrected over a weaker
check; moving the check is real work")
**Date:** 2026-11-12
**Head before:** `da35d66fc1`

## The defect

`audit_events` is one hash chain per organisation. A trigger writes each row's hash
(`db/migrations/20260222_audit_events_hash_chain.sql`). Six pieces of code read that chain and gave a
verdict on it, and they did not run the same check:

| Reader | What it checked before this change |
|---|---|
| The audit trail's second banner (`server/routes/part11-compliance.ts`, `GET /api/part11/audit-trail/chain-integrity`) | Re-computed each row's hash and compared pointers |
| The signed audit export's manifest (`server/services/audit/signedAuditExport.ts`, `snapshotChainIntegrity`) | Compared stored pointers only |
| The compliance report's attestation (`server/services/audit/compliance-reports/queries/audit-trail-integrity.ts`) | Printed the export's snapshot |
| The in-process monitor (`server/services/audit/chainIntegrityMonitor.ts`) | Compared stored pointers only |
| The nightly sweep's per-organisation verdict (`server/jobs/auditChainOrganizationVerdicts.ts`) | The monitor's comparison |
| The signed tenant attestation (`server/services/tenant-export/attestation-report.service.ts`) | Compared stored pointers only, by a recorded product decision |

So a row whose fields were altered with its stored hashes left alone read **broken** on the audit
trail and **intact** in the signed export, the compliance report, the monitor and the nightly sweep,
over the same rows.

The one reader that did re-compute had two defects of its own:

1. It counted every hashed row as verified, including a row whose hash did not re-compute.
2. It skipped the pointer comparison when a row's `previous_hash` was null. An entry removed, with
   its successor's pointer blanked and re-hashed, was a pointer nobody compared: **intact**.

Defect 2 was in every reader.

## What already exists

Searched: `audit_events`, `record_hash`, `previous_hash`, `chainIntegrity`, `chain-integrity`,
`verifyChain`, `walk`, `tamperEvident`, under `server/`, `scripts/`, `client/src/`, `db/migrations/`
and `migrations/`; and `git log --all --diff-filter=D` on the same names.

| Piece | Path | What it does | What it does not |
|---|---|---|---|
| The trigger | `db/migrations/20260222_audit_events_hash_chain.sql` (in `C2C_MIGRATION_FILES`) | Hashes sequence, event type, entity type, entity id, user id, user name, timestamp text, reason and the predecessor's hash | It does not hash the before and after values, the changed fields, the metadata, the comments, the role, the address or the session |
| The route's loop | `server/routes/part11-compliance.ts` | Re-computed and compared pointers; reads the timestamp as the database prints it (AUD-02, `a8187cb66`, 2026-11-10) | The two defects above |
| The export's snapshot | `server/services/audit/signedAuditExport.ts` | Pointer comparison; "unverified" for unhashed and unlinked rows (HS-1008-7, `629604979`) | No re-computation |
| The monitor | `server/services/audit/chainIntegrityMonitor.ts` | Pointer comparison on a timer; records the failure in each organisation's trail | No re-computation |
| The per-organisation verdict | `server/jobs/auditChainOrganizationVerdicts.ts` | The monitor's comparison, per organisation, for the nightly sweep | No re-computation; read five columns |
| The tenant attestation | `server/services/tenant-export/attestation-report.service.ts` | Pointer comparison, declared in its signed body as `stored-link-continuity` (schema 1.1) | No re-computation, by decision; the null-pointer hole |
| The operator's verifier | `scripts/ops/verify-audit-chain.mjs` (`npm run ops:verify-audit-chain`) | Re-computes in SQL with the trigger's expression | Filters unhashed rows before `LAG`, so the row after an unhashed gap reads as a pointer break |
| The cron script | `scripts/run-chain-verify.mjs` (`npm run audit:verify:24h`, `audit:verify:full`) | Pointer comparison over a time window; exit codes for intact, broken, unverified | No re-computation; the same null-pointer skip |
| The banner | `client/src/concept2cure/v2/surfaces/AuditEventChain.tsx`, hosted by Audit trail (`AdminSurfaces.tsx`) | States the route's verdict as a second verdict beside the ledger's; tells AnA | Composed its own detail from two counts |
| The attestation screen | `client/src/concept2cure/v2/surfaces/ComplianceAttestation.tsx` | Prints the verdict, the coverage, the server's reason and the declared method | Its fixed meaning for "not verifiable" named one cause only |
| The other chain | `server/services/audit/chain.ts` (`audit_logs`, `sha256_chain`) | A different chain with its own verifier | Not touched here |

Nothing was deleted from history that this change rebuilds.

## The change: complete the route's walk, and move the other readers onto it

**`server/services/audit/audit-event-chain.ts`** is the route's loop, split out into the folder the
other readers live in, with its two defects fixed. It is pure: callers run the query and pass the
rows. It exports the select list and the order every reader uses, the walk, the verdict, the record's
term for a gap, and the one sentence a screen or report may print.

- **Both halves, always.** Each hashed row's hash is re-computed and compared (content), and each
  row's pointer is compared with the row before it (pointer). A failure is one or the other, and is
  named as such.
- **A blank pointer after a hashed row is "unlinked".** It is not a break, because no mismatch was
  found. It is not verified either. The chain reads **not verifiable**, and says why.
- **Verified means re-computed and matched.** A row that failed is not counted.
- **The timestamp is the database's text.** `"timestamp"::text AS timestamp_text` is in the select
  list; the walk refuses rows read without it. A driver-parsed date cannot equal the hashed bytes.

Moved onto it: the route, the export's snapshot, the monitor, the per-organisation verdict. The
compliance report prints the walk's sentence. The preimage's field order is pinned to the trigger's
SQL, read from the migration file, by `audit-event-chain.test.ts`.

**The tenant attestation was not moved.** Its header records a product decision of 2026-10-12 that
re-computing is not its method, and the method is in its signed body. Only the hole that made its
declared claim false is closed: an entry that names no predecessor after a hashed one is now
**UNVERIFIABLE** with a reason, where it was **INTACT**. Moving it onto re-computation changes the
declared method and the schema version. That is the founder's decision, and it is open.

## The screens

The server change alone made the audit trail's banner say something false. For a chain that could
not be placed, the route now answers "not verifiable" with no unhashed rows, and the banner printed
**"0 of 12 entries carry no record hash, so the chain could not be verified"**.

`AuditEventChain.tsx` (the existing banner; no new screen):

- The detail under each verdict is the server's sentence, the one the compliance report and the
  nightly sweep print. It is used only under a verdict the sentence is about, so the title and the
  detail cannot disagree.
- "Intact" says what was checked and what was not: *"The before and after values of a change are not
  part of the hash, so this does not show they are unaltered."* AnA is told the same sentence.
- An altered entry is no longer called a "broken link".
- The entries that did not verify are listed under the id the trail's table gives them (`AUD-<id>`),
  with what was wrong with each. One that is loaded in the table opens there. When the server listed
  only the first of them, the banner says how many are listed.
- With no sentence from the server, the banner names only a cause the server sent, and guesses none
  ("Some of N carry no record hash" is gone).

`ComplianceAttestation.tsx`: "not verifiable" read *"some or all carry no hash"* directly above *"All
4,821 entries are hashed"* for the new reason. Its meaning now covers both causes.

The sentences as the walk writes them are in `the-sentences.txt`.

## Verified by making each check fail

Each production file was restored from `da35d66fc1` in turn, and the named tests were run against it.
`red-against-the-code-as-it-was.txt` is the output.

| Restored file | Tests | Result against the code as it was |
|---|---|---|
| `server/routes/part11-compliance.ts` | `part11-chain-one-walk.pglite.test.ts` (PGlite, the real trigger) | 3 failed, 1 passed (the control) |
| `server/services/audit/signedAuditExport.ts` | `chain-integrity-unlinked-rows.test.ts` | 3 failed, 8 passed |
| `server/services/audit/chainIntegrityMonitor.ts` | `chainIntegrityMonitor.test.ts` | 6 failed, 4 passed |
| `compliance-reports/queries/audit-trail-integrity.ts` | `integrity-report.test.ts` | 4 failed, 10 passed |
| `server/jobs/auditChainOrganizationVerdicts.ts` | `auditChainIntegritySweep.test.ts`, then `auditChainOrganizationVerdicts.audit-events.test.ts` | **35 passed** on the first run: the job's change had no test behind it. Three cases were written (now in their own file, against `verifyOrganization`); 3 failed, 2 passed (the controls) |
| `server/services/tenant-export/attestation-report.service.ts` | `attestation-report.test.ts` | 1 failed, 16 passed |
| `AuditEventChain.tsx`, `AdminSurfaces.tsx`, `ComplianceAttestation.tsx` | `auditTrailEventChainVerdict.test.tsx`, `complianceAttestation.test.tsx` | 7 failed, 41 passed |

Controls assert only what the change leaves alone, so they pass on both sides. Two controls that
asserted a new field were split, so a control that fails before the fix is not counted as proof.

With the change: the 88 test files that import a changed module pass, 1,043 tests.

`audit-event-chain.pglite.test.ts` runs the walk against rows the real trigger wrote, including an
edited after-value that still re-computes. That case is the limit below, pinned.

## What this does not establish

- **The hash does not cover the before and after values.** A change to `old_values`, `new_values`,
  `changed_fields`, `metadata`, `comments`, the role, the address or the session passes every reader,
  before and after this change. The walk's sentence says so wherever "intact" is printed. Widening
  the hash is a migration and a re-seal of history, and a founder decision.
- **A removed prefix or suffix is not detectable by a walk of the rows that remain.** The nightly
  sweep's external anchor is the control for that, and it is not changed here.
- **The banner was not opened in a running app.** No database is provisioned in this container. Its
  cases run in a simulated DOM against the route's bodies, which by RULE 4 is not evidence that the
  screen works. It is owed a look on staging.

## Still open

1. **Founder decision:** move the signed tenant attestation onto re-computation (method and schema
   version change), or keep stored-link continuity as its declared method.
2. `scripts/run-chain-verify.mjs` still compares pointers only, with the same null-pointer skip. It
   is a plain Node script, so moving it onto the walk changes how it is run.
3. `scripts/ops/verify-audit-chain.mjs` filters unhashed rows before `LAG`, so the row after an
   unhashed gap reads as a pointer break.
