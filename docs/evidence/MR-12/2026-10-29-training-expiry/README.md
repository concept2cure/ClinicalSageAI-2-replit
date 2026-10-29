# G10: Quality lists whose training lapses soon, read as coverage reads it

Row: D2 (W1), workstream MR-12 (QMS controlled documents). Slice G10 of
`docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md`: "a per-person expiry view in Quality, with no new route."
Benchmark: Training Basics (UNVERIFIED, as the plan records).

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Expiry route | `GET /api/mdx/qms/training/expiring`, `server/routes/mdx-qms.ts` | Listed every `qms_training_records` row whose `expires_at` fell inside the window, joined to its document. | No client called it. It applied none of coverage's rules: it listed a superseded version's record, a record its member had since renewed, a departed or suspended member's, and an unverified or trainer or quiz record. |
| Coverage | `readQmsTrainingCompliance`, `server/services/qms/training-compliance.ts`; `GET /qms/training/compliance`; `TrainingCoverage.tsx` | Counts the active roster's verified current receipts on the exact version and digest in force. | Says how many are current, never who lapses next. |
| Receipt rule | `verifiedTrainingReceipt`, `server/services/qms/training-content.ts` | The one definition of a current receipt. | — |
| Raw list | `GET /api/mdx/qms/training` | Every record, newest first. | No client caller. Left as it is. |
| Assignment | §5.2 of the plan | Waits on NEW-2 and NEW-3. | Not this slice. |

Searches run:
- `training/expiring` and `qms/training` in `client/src/`, `server/` and `tests/`;
- `expires_at` in `server/services/qms/`;
- `TrainingCoverage` and `useTrainingCompliance` in `client/src/concept2cure/`.

## What changed

- **One read for coverage and expiry.** The verified-current-receipts step moves out of `readQmsTrainingCompliance` into
  `readCurrentReceipts`, unchanged. Coverage maps it to the same rows as before.
- **`readQmsTrainingExpiring(client, org, withinDays, now)`** reads the same receipts. For each active member and
  release in force, the member is current until the latest expiry among their current receipts, so a renewal replaces
  the receipt it renews and a receipt with no expiry means no lapse. It lists those who lapse inside the window: person,
  document, version, date and days left. A member already lapsed has no current receipt; coverage counts them as not
  trained, and they are not listed. Names are read only for the people listed, so coverage still reads no name.
- **The route is fixed** to return that list (`withinDays` 1 to 365, default 60).
- **Quality shows it**: `TrainingExpiry.tsx`, "Training lapsing soon", under the coverage panel in the SOP register, read
  through `useTrainingExpiring` (`hooks.ts`). A failed or unreadable read is a failure, never "no one".

## Proof

- `training-compliance.pglite.test.ts`, against PostgreSQL in process with the canonical DDL, passes 8 of 8. The new
  cases:
  - Member 1, trained to lapse in 10 days, is listed with SOP-001 v1.0 and 10 days left. A renewed member, a superseded
    version, a suspended member and another organisation's member are not. A 5-day window lists no one;
  - a member whose later receipt has no expiry is not listed.
  - The six coverage cases pass unchanged on the shared read.
- `TrainingExpiry.test.tsx` passes 2 of 2: the person, the document and the lapse date are shown; a failed read is said,
  never "no one".
- **Shown failing first:**
  - with the earliest expiry taken instead of the latest, the renewed member is listed and the first PGlite case fails;
  - with the empty message also shown on a failed read, the second screen case fails.
  - Restored, all pass. At HEAD nothing listed a person.
- `SopRegisterIdentity.test.tsx` now counts five tenant-owned reads, not four. It asserts that the previous tenant's
  member is gone on an identity change and that a late body from the old tenant is ignored. The five SopRegister tests
  that mock `../hooks` add the new hook.
- The Quality client suite, `server/services/qms` and the personal-training route pass 408 of 408 (35 files).
  `tsc --noEmit` reports no error in the changed files.

## Owed

- ~~Lapsed members are counted by coverage but not named anywhere.~~ Named since the second change below.
- A reminder to the person before the lapse, through the task store as the CAPA and supplier dates do
  (`docs/evidence/D2-ONE-ANA/2026-10-29/p48-quality-reminders/`). The acknowledgment is the act that would write it.
- Staging screenshot with D1.

## Second change: whose training has lapsed

- **What existed.** The expiry read above listed only members with a current receipt. A member whose receipt expired
  and was not renewed had no current receipt, so coverage counted them as not trained, but no screen named them.
- **What changed.**
  - `readQmsTrainingExpiring` also reads the expired attested receipts on the documents in force, each verified with
    `verifiedTrainingReceipt` as it stood one millisecond before it expired. This is coverage's own rule, applied at
    the receipt's time.
  - A member with no current receipt, whose last receipt on the exact release in force expired, is listed as lapsed:
    `lapsed: true`, with negative days left.
  - Training on a superseded version is not a lapse. It is training not yet done on the new version, which coverage
    counts.
  - Coverage's own query is unchanged.
- **Screen.** The section is now "Training lapsed or lapsing soon". A lapsed row reads "lapsed {date}". The hook
  requires the `lapsed` flag, so a body without it is a failed read.
- **Proof.**
  - `training-compliance.pglite.test.ts` passes 9 of 9. The new case: Member 1, lapsed 5 days ago, is named with
    `lapsed: true` and days left -5. A member who renewed after the lapse, a superseded version and a suspended member
    are not. Coverage still counts one current member, the renewed one.
  - `TrainingExpiry.test.tsx` passes 2 of 2: one lapsing row and one lapsed row, each in its own words.
  - `SopRegisterIdentity.test.tsx` passes with the flag in its payload.
  - **Shown failing first:** with a renewed member treated as lapsed, the PGlite case fails; with the flag ignored on
    screen, the screen case fails.

