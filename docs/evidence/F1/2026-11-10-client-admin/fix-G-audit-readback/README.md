# The audit trail reads back what was changed, and its second chain verifies (F1, 2026-11-10)

Lane G-audit-readback. Phase 2 of the client administration work. Findings: AUD-02 (this lane), AUD-01 and W1-18
(their audit-trail half). Found by the walks in `../walk-security-and-licensing.md` (6b) and
`../walk-onboarding-and-people.md`.

## What already exists

- `db/migrations/20260222_audit_events_hash_chain.sql`: the trigger that hashes every `audit_events` row on insert.
  Its input includes `timestamp::text`. This lane does not change it.
- `server/routes/part11-compliance.ts`, `GET /audit-trail/chain-integrity`: the verifier the audit trail's second
  banner reads (`client/src/concept2cure/v2/surfaces/AuditEventChain.tsx`).
- `server/services/audit/signedAuditExport.ts`: the signed export. It also writes the `audit.export` row. That writer
  was already correct, and it is not changed.
- `server/routes/audit-trail-ledger.routes.ts`: the read-model behind the audit trail screen
  (`AdminSurfaces.tsx` `AuditTrail`). It already named Vault acts in words (`ACTION_EVENT`) and named a signed record
  by its subject, with the reference kept in `targetRef`. This lane extends both patterns.
- `public.actor_name` (`migrations/20260929_actor_names.sql`): the existing name reader the ledger uses for actors.
  It is reused here for the person a change is about.
- `services/audit/compliance-reports/queries/administrative-changes.ts`: already reads the reason stored with the
  values (`COALESCE(a.reason, a.new_values->>'reason')`). The ledger and the export now do the same.
- The stored shapes were read from the walk database, not assumed (see the header of
  `server/services/audit/audit-change-words.ts`).
- Trunk since 2026-11-10 (`git log --since=2026-11-10`): one commit touched these files, 4f2aadd33 (the ledger
  names Vault folder acts in words). It does not overlap this lane, and nothing was withdrawn.

## What was wrong

- **AUD-02.** The walker saw "Audit-event chain verification failed, 3 broken links over 3 entries" after three
  signed exports in a new organisation.
  - The rows were sound. Re-computing the trigger's formula in SQL matched all three `record_hash` values.
  - The cause was in the verifier. It rebuilt the trigger's timestamp in JavaScript: first as an ISO string cut to
    milliseconds with "+00" added, then as `String(Date)`.
  - The trigger hashes `timestamp::text`. The column is `timestamp without time zone`, and `NOW()` writes
    microseconds ("2026-11-10 07:26:03.891025"). So neither guess was ever the input, and every row the trigger
    hashed read as a broken link.
- **AUD-01 (audit-trail half).**
  - A session policy change read "Tenant Settings Changed", with the target "organization_settings:7". The entry
    showed neither the field nor the values, although the row held both.
  - The signed export did not carry the stored values (`new_values`, `old_values`) at all.
  - Where a reason was stored only with the values (seats, client type), the entry showed none.
  - A row that holds no values (PDF/A, stored as `values:{}`) or no reason (API key revocation) did not say so.
- **W1-18 (audit-trail half).**
  - Six role changes on Priya Raman read "Member Role Changed", with the target "organization_users:11".
  - A search for "Priya Raman" found nothing.
  - The entry did not show the role before and after.
- Also seen on the walk: a signed export's own row read "Audit Export", with the target "audit_export".

## What changed

- `part11-compliance.ts`. The verifier selects `"timestamp"::text` and hashes exactly that, the trigger's own input,
  with nothing else. The two guesses are removed. The verifier is not lenient: there is one preimage, so a changed
  reason, timestamp or actor still breaks the link.
- `server/services/audit/audit-change-words.ts`, split out of `signedAuditExport.ts` in the same folder (repair V-1,
  below). It is read by both the screen and the export, so they never disagree:
  - `describeAuditChange` (pure). From a row's own columns it gives the act, the person or thing the act is about,
    each changed field with its value before and after in words, a note for what the row does not record (the
    values, or a reason), and the stored reason.
  - `readPeopleNames`. One query through `actor_name`.
  - `personWords` and `changeEventLine`.
  - `ledgerChange` and `namesForRows` (the screen's reading) and `exportChangeWords` (the export's).
- The export:
  - carries `old_values` and `new_values` (audit_logs; audit_events also carries `changed_fields`);
  - adds `event_name`, `target_name`, `change_summary`, `changes`, `change_note` and the actor's name;
  - keeps `reason` exactly as stored, and carries a reason kept only with the values beside it as
    `reason_from_values` (repair V-3);
  - adds the same columns to the CSV, at the end.
- `audit-trail-ledger.routes.ts`. Each `audit_logs` entry now has:
  - `target`: the person's name, or the thing in words. The stored reference stays in `targetRef`, so the drawer
    still shows it as "Record".
  - `event`: the act and its change, for example "Member role changed: role from Approver to Administrator".
  - `reason`: falls back to the reason stored with the values.
  - `changes` and `changeNote`.
- A row is never invented from:
  - a value the row lacks reads "not recorded";
  - a person whose name the organisation cannot read is "A person who is no longer a member".
- The `audit.export` row is named "Signed audit trail exported", with the target "Audit trail".
- How a row is written is unchanged.

## Proof

- **AUD-02, red first** (`red1.txt`). A PGlite test (`server/routes/__tests__/part11-chain-trigger-written.pglite.test.ts`)
  uses the canonical columns, the real trigger file, rows written by the real signed export, and the real route.
  - Three exports gave 3 broken links over 3, as on the walk. 4 of 5 tests failed.
  - The fifth, a changed actor, passed before the fix, as a break must.
- **AUD-02, green** (`green1.txt`): 5 of 5 pass, including three tamper cases (reason, one microsecond of timestamp,
  actor), each still read as broken.
- **AUD-02, mutations** (`mutations-aud02.txt`, driver `mutate.cjs.txt`). 4 of 4 killed, each file restored with its
  sha256 checked: the old guess put back, the reason dropped from the preimage, mismatches ignored, the column not
  selected.
- **AUD-01 and W1-18, red first.**
  - `red2-ledger.txt`: 8 of 9 fail on the ledger (`server/routes/__tests__/audit-trail-ledger-governed-change.test.ts`).
  - `red3-export.txt`: 4 of 4 fail on the export (`server/services/audit/__tests__/signed-export-governed-change.pglite.test.ts`).
  - `red4-export-row.txt`: the export row's name.
- **Green.** The ledger has 10 of 10 and the export 4 of 4.
- **Mutations** (`mutations-aud01.txt`). 11 of 11 killed:
  - the target kept as the reference;
  - no reason fallback;
  - the settings values ignored;
  - a missing value not said;
  - a missing reason not said;
  - an unnamed person shown as nothing;
  - the export's values not selected;
  - the export's words not added;
  - the CSV columns dropped;
  - raw role codes shown;
  - the export row named by its type.
- **Every test that imports a changed module** (`green-importers.txt`): 40 files, 367 tests pass.
  - That includes the existing ledger, export, Part 11 and compliance-report suites.
  - Two existing fixtures were updated. `part11-chain-unhashed-honesty.test.ts` now carries the database text the
    verifier reads. `signed-export-audit-logs.pglite.test.ts` now has the real `audit_events` value columns.
- **Typecheck** (`typecheck.txt`): a scoped tsc over the changed files and their tests. It finds 0 errors in this
  lane's files. After the repair, the importers are covered too (`typecheck-repair.txt`).
- **The running app** (5220: runtime role, RLS and the launch gate on), after a server restart, signed in through the
  real form. Script: `walk-audit.cjs.txt`. Output: `walk-walk2.txt` and `walk-walk1.txt`.
  - **Walk Two Biologics** (organisation 7, the walker's).
    - The three rows that read as broken now verify intact, 3 of 3.
    - After further signed exports from the screen, the second banner reads "Audit-event chain intact, 6 chained
      entries re-computed on the server" (`audit-trail-desktop-chain-intact.png`).
    - The downloaded bundle carries `sessionTimeoutMinutes` (30 times), `before` (58), `requirePdfA` (2) and
      `seatsPurchased` (8). Before the fix the walker found 0, 0, 0 and 0.
    - Searching for "Idle sign-out" finds 6 entries. The detail reads "Organisation settings changed: idle sign-out
      (minutes) from 16 to 15", with the target "Organisation settings" and the reason.
    - "PDF/A" reads "the values before and after were not recorded for: PDF/A required."
    - "API key revoked" reads "No reason was recorded."
    - "Purchased seats" reads "from 50 to 5".
    - Shots: `audit-trail-walk2-desktop-settings-change.png` and `audit-trail-walk2-phone-settings-change.png`.
  - **Northgate Biologics** (organisation 6, signed in as its administrator).
    - Searching for "Priya Raman" finds 7 entries (0 before).
    - The detail reads "Member role changed: role from Administrator to Member", with the target "Priya Raman", the
      record kept beside it and the reason.
    - Shots: `audit-trail-walk1-desktop-role-change.png` and `audit-trail-walk1-phone-role-change.png`, at 1440 and
      390 px.

## Repair after the adversarial verifier (2026-11-12)

Re-run first on the tree as it is after the 23:35 UTC merge: the lane's 3 test files, 19 of 19 pass.

- **V-1, lint gate (blocking).** `signedAuditExport.ts` had gained 3 warnings (describeAuditChange complexity 78,
  valueWords 17, 762 lines) and the ledger 1 (543 lines).
  - The governed-change block moved to `server/services/audit/audit-change-words.ts` (same folder).
  - `describeAuditChange` is now named steps, each at complexity 15 or less: settingsChanges, roleStatusChanges,
    heldPairs, singleValueChanges, changesOf, storedReason, subjectOf, missingNotes, summaryOf.
  - `valueWords` is split into scalarWords and compoundWords.
  - The ledger's reading (EVENT_TYPE_WORDS, namesForRows, the pure part of withChange as ledgerChange) moved too.
    The ledger passes its own ACTION_EVENT table in. It reads the signatures and the names in one `Promise.all`.
  - Counted lines: the ledger 500 (500 at HEAD), the export 494 (490 at HEAD), the new file 344.
    `check-pushed-lint-warnings --base HEAD` names none of the lane's files (`lint-repair.txt`).
  - Behaviour kept: the lane's earlier tests pass unchanged.
- **V-2, a held value said to be missing.** A seats change from 5 to 5 read "This entry does not record the values
  before and after." A governed change whose before and after are equal now reads "purchased seats stayed at 5",
  and the note is not added. Red: `red5-repair.txt` (`changes` was `[]`).
- **V-3, the export replaced the stored reason.** `reason` is now the stored column, unchanged (on audit_events it is
  part of the record hash). The reason kept with the values is in `reason_from_values`, also a CSV column. The screen
  still shows that reason under "Reason for change", because it is the record's own stored reason. Red:
  `red5-repair.txt` (`reason` was the values' reason).
- **V-4, behaviours no test pinned.** New tests for a switch read "from off to on", an exported `old_values` carried
  unchanged, and the "does not record the values" note on the screen and in the export. The verifier saw these
  mutations survive. Now each is killed (R5, R6, R7).
- **V-5, the typecheck did not cover importers.** It now does, in batches (`typecheck-repair.txt`):
  - the lane's files;
  - 13 server importers;
  - RecordHistory.tsx, AdminSurfaces.tsx and AuditEventChain.tsx, each alone (all four client files together ran
    out of memory at 4 GB).
  - 0 errors in any of them. The other lines are known gaps outside the lane: Request augmentation and untyped
    modules.
- **V-6, unbounded words.** Array and object values are now said in at most 120 characters, as strings already were.
  The stored values are still carried whole. Red: `red5-repair.txt` (2951 characters).

Proof of the repair:

- Red: `red5-repair.txt`, 5 failed (V-2 on the screen and in the export, V-3 twice, V-6). The 3 V-4 tests passed:
  they pin behaviour that was already right.
- Green: `green5-repair.txt`, 5 files and 62 tests (the lane's 3 files, the existing ledger suite and the
  audit_logs export suite).
- Mutations: `mutations-repair.txt`, driver input `mutations-repair.json.txt`. 21 of 21 are killed, each file
  restored and its sha256 checked:
  - the 11 earlier AUD-01 mutations, re-aimed at the moved code;
  - R1 to R10 for V-2 to V-6 and the ledger's own-description rule.
  - R2 was skipped in the main run (a shell quoting slip blanked its text) and then run on its own, at the end of
    the same file.
- `mutations-aud02-rerun.txt`: AUD-02's 4 of 4 are still killed on the current tree.
- Importers: `green-importers-repair.txt`, 40 files, 374 tests.
- `npm run ci:undefined-css-classes` passes (this lane changes no client file).
- The running app: 5220 was restarted on the repaired server and signed in through the real form as walk2.owner
  (organisation 7). Output: `walk-repair.txt`. Script: `walk-repair.cjs.txt`.
  - The row the verifier cited, AUD-75b92bf2, reads "Purchased seats changed: purchased seats stayed at 5" with its
    reason, at 1440 and 390 px. Shots: `audit-trail-walk2-desktop-seats-unchanged.png` and
    `audit-trail-walk2-phone-seats-unchanged.png`.
  - The downloaded bundle's three seats rows have the reason column null and `reason_from_values` filled.
  - The audit-event chain reads intact over 8, then 9 after the export.
  - As Avery Lind (organisation 6), "Priya Raman" still finds 7 entries, and the detail reads "role from
    Administrator to Member" (`walk-walk1.txt`, now from the desktop pass of this re-run).

## Not fixed here

- **AUD-01, the writers.**
  - The PDF/A change stores `values:{}` (`server/services/tenant/tenant-settings-writer.ts`).
  - API key revocation takes no reason (`server/routes/api-keys.ts`, `AdminAccess.tsx`).
  - Both belong to the writers' lanes. The trail now says plainly what each row lacks.
- **The drawer's layout** (`client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx`, the audit trail screen's
  owner). Today the change is shown in the event line. The entry now also carries `changes` (field, before, after)
  and `changeNote`, so the drawer can list each one as its own row. The table at 390 px is still clipped (PH-01).
- **The admin console's "Admin audit · recent" panel and "Audit activity"** (`server/routes/mdx-admin.ts`,
  `AdminAccess.tsx`, U1 lane, W1-18). The panel can call `describeAuditChange`, `readPeopleNames` and `personWords`
  from `server/services/audit/audit-change-words.ts` to name the same rows the same way. The search can then use the person's name, which
  the trail now matches.
- **The signed export's row** stores the address in `user_name` and no `user_id`, because `exportedBy` is the email
  (`server/routes/audit-trail-routes.ts` ~701 and ~754 pass `exportedBy: userName`; `signedAuditExport.ts` stores `user_id` only when that is a number). The trail shows the address as the actor, and it runs over
  its column on screen. The fix is for the caller to pass the account id and name. This is not changed here, because
  how a row is written belongs to its writer.
- **The actor's account reference.** "user:5" beside a name is a deliberate earlier decision (VSR-001 F-42: a name
  alone does not say which account acted), rendered by `AdminSurfaces.tsx`. It is unchanged.

## Questions for the founder

- None for this lane. The fixes are defects whatever the answer to any open product question.
