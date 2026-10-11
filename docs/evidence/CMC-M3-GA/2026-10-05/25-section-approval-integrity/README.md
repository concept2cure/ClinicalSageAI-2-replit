# A Module 3 section approval records what the signer said, and reads what it signs

Rows **D2** and **D5** (21 CFR Part 11 §11.10(e), §11.50, §11.70). GA plan
item 4 (decision 2026-10-05).

## The defects

Four, all in `POST /module3-os/sections/:projectId/:sectionKey/approve`.

1. **An invented reason.** With no reason stated, the route recorded
   `Approved Module 3 section <key>` — text the code made up — into the
   governed-action ledger and the `electronic_signatures` row. That is against
   `recordGovernedAction`'s own contract, whose `reason` is documented as "the
   person's stated reason … never one the code made up".
2. **The blocking read ran outside the transaction.** The
   critical-contradiction check ran before `BEGIN`, and the section row was
   never locked. A sweep, a recompile or a second signer committing in between
   was not seen.
3. **A globally unique idempotency key.** `c2c_ana_actions.idempotency_key` is
   UNIQUE across every tenant, so another organisation's key made the
   signature fail with a 500 rather than replay.
4. **No separation of duties on a blocking finding.** A critical contradiction
   blocks every section approval, and any member could resolve one.

## The fix

**The reason is the signer's.** `requireGovernedReason` runs first — before
the signing-authority check and before the password — and answers 400
`REASON_REQUIRED` with `field: 'reason'`. Nothing is read or written. The
reason recorded is exactly the one sent. The sign form states the floor.

**What the signature depends on is read inside the transaction.** After
`BEGIN`, the section row is read `FOR UPDATE`, and only then are the blocking
contradictions, the compiled record, staleness, lineage drift and evidence
drift read. The state flip is guarded on the hash it read
(`compiled_hash IS NOT DISTINCT FROM $3`); a row that moved under it answers
409 `SECTION_CHANGED` and nothing is signed.

**What the signer read is what is signed.** The read-before-sign panel showed
the section's content hash and then dropped it. It now hands that hash to the
signature form, which sends it as `compiledHash`, and a recompile since the
read is refused with 409 `SECTION_CHANGED`.

**The idempotency key is the organisation's.** The client's key is namespaced
(`cmc-m3-approve:<orgId>:<key>`), so one tenant's key cannot collide with
another's. A retry with the same key **replays** the approval it already made
(`replayed: true`, with the version it wrote) and signs nothing new.

**Separation of duties.** `resolveContradiction` takes the resolver's
`signingAuthority`, read from the membership row by the route
(`resolveSignerOrgRole` + `isSigningAuthorized`, the platform's one signing
policy). A **critical** finding refuses a resolver without it: 403
`ESIGNATURE_NO_AUTHORITY`, nothing changed, no audit row. A lower-severity
finding is unchanged.

## Red, then green

- **New** (`module3SectionApproveIntegrity.test.ts`, 7 tests). On the previous
  route (`red-integrity-before.txt`) **all 7 fail**:
  - an approval with no reason was accepted;
  - the recorded reason was not the signer's;
  - the contradiction read came before `BEGIN`;
  - a recompile since the read was not noticed, and the flip was unguarded;
  - the key was not namespaced, and a retry did not replay.

  After, all 7 pass.
- **Separation of duties** (`contradiction-lifecycle.pglite.test.ts`): a
  critical finding is refused to a resolver without signing authority, with
  the row still open and no audit row.
- **Route** (`module3GovernedActs.test.ts`): the route passes
  `signingAuthority` from the membership row — false for `member`, true for a
  role that holds it.
- **The existing suites were re-sequenced, not relaxed.**
  `module3OperatingSystemRoutes.test.ts` and
  `module3SectionApproveSignature.test.ts` drive the mock in SQL order, so
  their fixtures now put `BEGIN` and the locked section read before the
  contradiction check — the order the route now uses. Their assertions are
  unchanged, and the reasons they send meet the floor.
- **Board** (`cmcOverviewCompleteness.test.tsx`). On HEAD
  (`red-board-hash-before.txt`) the signature carried no hash at all
  (`expected undefined to be 'abc123def4567890'`). After, the POST carries the
  hash the panel displayed, with the signer's reason: 11 tests pass.
- **Green** (`green-after.txt`): 5 server files, **50 tests**.

## Not yet

- The signer may still approve a section composed from records they wrote
  themselves. The second half of the plan's separation-of-duties item (the
  approver is not the last writer of the cited records) needs the record-level
  audit rows of plan item 2, which name that writer. It is not inferable
  today.
- `compiledHash` is honoured when sent, not required. A caller that omits it
  still gets the in-transaction lock and the flip guarded on the hash the
  transaction itself read, which is what protects the signature from a
  concurrent recompile; the sent hash is what additionally ties it to the
  person's own read.
