# P-39 step 4 (last): the Agency Meetings store and surface retire into Communication

Row: D2 (W1). Decision P-39 step 4 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, amended 2026-10-30): the `c2c_agency_meetings`
minutes converge onto `ha_interactions`, and `c2c_agency_meetings` and the Agency Meetings surface retire.

## What already exists (the replacement, by path)

| User outcome | Delivered by | Proven reachable by |
|---|---|---|
| Record a meeting with an agency, and move it through its lifecycle | Communication's Meetings tab: `client/src/concept2cure/v2/surfaces/HaMeetings.tsx` in `CommunicationCenter.tsx`, on `/api/ha-interactions` | `haMeetingMove.test.tsx`, `ha-interactions-meeting-admission.test.ts`, `meeting-lifecycle.pglite.test.ts` (`../../D2-MEETINGS-IN-COMMUNICATION/2026-10-30/`) |
| The meeting's minutes, agreements and commitments | An inbox letter (`meeting_minutes`), named by the meeting (`ha_interactions.minutes_event_id`). Its questions and signed answers carry the agreements and commitments (`agency-responses.ts`). | `meeting-lifecycle.pglite.test.ts`, `haMeetingMove.test.tsx` (`../../D2-MEETING-MINUTES-IN-INBOX/2026-10-30/`) |
| The meeting's briefing book | The meeting package in the editor, on the IND screen: `client/src/concept2cure/v2/surfaces/IndBriefingBookStart.tsx` | `indLifecycleDeliverables.test.tsx` (`../../D2-BRIEFING-BOOK/2026-10-29/`). The Agency Meetings door to it (`agencyMeetingsNoFixtures.test.tsx`, 2026-10-30) retires with the surface. |

### What the retired pieces were

- **`AgencyMeetings.tsx`**: an org-wide surface outside launch scope.
- **`/api/agency-meetings`**: refused in production as an unmapped path.
- **`c2c_agency_meetings`** (`db/migrations/20260717_agency_meetings_store.sql`):
  - a free-text programme and TEXT dates;
  - a create with no reason and no project admission;
  - `minutes` and `briefing_book` JSONB that nothing in a deployed organisation wrote. Only the laptop demo seed did.

`deletion-history.txt` records `git log --all --diff-filter=D` on the surface's and store's names. It is empty: no
earlier generation of this surface was deleted and rebuilt.

## What changed

- **Deleted:**
  - `client/src/concept2cure/v2/surfaces/AgencyMeetings.tsx` and `agencyMeetingsNoFixtures.test.tsx`;
  - `server/routes/agency-meetings.routes.ts`, its mount and its two route tests;
  - `scripts/seed/ga-demo.d/100-agency-meetings.mjs`, which wrote invented minutes and would now be refused by the
    table;
  - the `agency-meetings.select-meeting` AnA action;
  - the surface's AnA context entry, its rail entries and its registry surface.
- **Kept, as an alias.** `agency-meetings` is a deep-link alias to `communication-center` (`registryModel.ts`). Old
  links, the Biopharma journey's buttons, skills and demo steps land on Communication. The navigation target stays
  for AnA, with its description saying where meetings are now.
- **Read-only, rows kept.** `migrations/20261030b_c2c_agency_meetings_read_only.sql` refuses INSERT, UPDATE and
  TRUNCATE, and leaves DELETE open for a tenant purge, as `20261029i` did for `c2c_commitments`.
- **AnA tools unchanged in scope.** The launch inventory's hidden tools that named `agency-meetings` are refiled:
  - `prepare_meeting_package` and `review_ha_interaction` under `pdev-fda-interactions`;
  - the commitment tools under `lifecycle-mgmt`, which they already named.

  Neither is a launch surface, so production offers nothing new.

## Proof

- `tests/schema-contract/c2c-agency-meetings-read-only.pglite.test.ts` passes, on the real creator DDL with a row
  that predates the file:
  - a write is refused and the row is unchanged;
  - the file replays with its creator;
  - a purge's DELETE is allowed.
- `mutation-no-write-trigger.txt`: with the INSERT and UPDATE trigger removed, the refusal and replay cases fail. The
  file was then restored.
- The registry and navigation suites pass: 79 files, 1,222 tests, with routing, nav targets, rail, the AnA
  launch-scope inventory, launch scope and entitlements included.
- One failure there is not this change's: `launch-reproof-narrowing.test.ts`, `/api/submission-ops/blockers`. It
  fails identically on HEAD without it.
- Gates:
  - the four migration gates, `ci:launch-scope-api`, `ci:sql-interpolation` and `ci:server-error-leaks` pass;
  - `ci:surface-text-ramp` passes after regeneration;
  - the ESLint ratchet is net −6.
