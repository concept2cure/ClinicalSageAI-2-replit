# P-122: a person records a milestone from the project page's Schedule, in production

Founder decision P-122 (2026-11-10). Follows `../defects/` item 1 (`8846faf52`: a milestone can be stored) and
`../project-page/` (`34d66b559`: the Plan step's Schedule; `280035bd9`: its reads admitted to production).

## What already exists (Rule 3)

| Piece | Path | What it did | What it did not do |
|---|---|---|---|
| Milestone routes | `server/routes/project-sections.ts`: `POST /milestones`, `GET /milestones`, `PATCH /milestones/:id` (name, description, `target_date`, `status: 'completed'` sets `completed_at`), `DELETE /milestones/:id` | Record, list, change, mark done, delete; each admitted by the project sharing policy (`admitNamedProject`, `admitMilestoneProject`, F1 2026-11-05) | Answer in production (no launch surface claimed the path: 403 `LAUNCH_SCOPE`); check the edit right (the file said "The edit right on a write is not decided here"); refuse a date that is not one (500) |
| Write admission | `server/routes/c2c/project-access.ts` `requireProjectAdmission(req, id, true)` | The project tasks' write gate (D6): a role that writes, edit permission, not archived | Run on milestone writes |
| Launch claim | `shared/constants/ui-surface-registry.ts` project-home `apiPrefixes` | `/api/project-sections/summary`, `/timeline` (`280035bd9`) | Claim the milestone path |
| The list | `client/src/concept2cure/v2/surfaces/ProjectSchedule.tsx` `SectionSchedule` | Lists dated sections and milestones from `/timeline` | Offer any control; show linked sections |
| The form | `client/src/concept2cure/v2/C2CForm.tsx` | The governed data-entry drawer (text, date, seg, live description) | |
| The button | ONE_DESIGN_PLAN §2 ("ghost by default"); `btn ghost small` with `I.plus`, as `ProjectCoreWork.tsx` "Add a work project" | | |
| Section numbers | `shared/regulatory/section-code.ts` `normalizeCtdCode` | The one rule for a CTD code's syntax | |

Searches run: `project-sections/milestones` in `client/`, `server/`, `shared/`, `scripts/`, `tests/` (callers: the demo
seed `scripts/demo/launch-demo/packs/project-management.mjs`, the DB tests, the narrowing test; no screen);
`linked_sections`, `target_date`, `milestoneId` in `client/src`; `C2CForm` users on the project page; `btn ghost small`.
No milestone form or control existed on any screen.

## Commits

| Commit | Plan | What |
|---|---|---|
| `326af4e1e` | R1 | project-home claims `/api/project-sections/milestones`; each milestone write is admitted as a write on the project; a date or project id that is not one is a 400 |
| `757a7afc4` | D3 | "Record a milestone" and "Update" (move the date, mark done) on the Schedule; linked sections on a milestone row; the list stays while it is read again; calendar dates said in UTC |

The registry carried another session's uncommitted hunk (the IND registers) while `326af4e1e` was made; that commit
holds the project-home hunk alone (staged as `HEAD` plus this hunk, the working-tree file left as it was).

## What the claim serves (server, `server/`)

The claim is a path, so it serves every method on it: `POST /milestones` (record), `PATCH /milestones/:id` (change,
mark done), `GET /milestones` (the list, read-admitted) and `DELETE /milestones/:id`. Every write now takes the
write admission; a project the person cannot open is still answered as missing (404) before the write check. The screen
offers no delete. The section list, section writes, dependencies and notifications stay unclaimed.

| Run | Result | File |
|---|---|---|
| HEAD | 9 of 24 fail: every milestone call 403 `LAUNCH_SCOPE` | `server/red-head.txt` |
| The claim alone | 2 of 24 fail: a member the private project is shared with to **use** records a milestone (200); a date that is not one is 500 | `server/red-claim-only.txt` |
| Claim and route checks | 24 of 24; with `p122-project-milestones` and `p122-project-management-reads`, 42 of 42 | `server/green.txt` |

`tests/db/p122-milestone-writes.dbtest.ts`: a deploy-shaped database provisioned from empty
(`C2C_TESTDB=c2c_p122_milestone_writes bash scripts/db/provision-test-db.sh`, then `node scripts/db/deploy-migrate.mjs`),
as `app_service` with `RLS_ENFORCE=on` (asserted), the production auth boundary and the gate as production builds it.
It proves: a project member with edit permission records a milestone on a private project, moves its date and marks
it done, and the timeline lists it; a colleague not on it is 404 and nothing is written or changed; a member who may only
use it is 403 `PROJECT_WRITE_PERMISSION_DENIED` on record, change and delete, as is a member with no edit permission on an
organisation-wide project; another organisation's project is 404 both ways; the owner's DELETE is served; fifteen
unclaimed project-sections routes stay 403 `LAUNCH_SCOPE`; "milestones" under the claim is no section and writes nothing.

Also: `server/unit-narrowing-and-listing-doors.txt` (229 pass); `server/unit-entitlement-suites.txt` (695 of 697: the
two failures are the IND registers' claims, another session's uncommitted registry hunk at the time);
`server/ci-gates.txt` (`ci:launch-scope-api`: 657 paths, none refused; `ci:sql-interpolation` OK);
`server/typecheck-focused.txt`.

## The control (client)

| Run | Result | File |
|---|---|---|
| HEAD's `ProjectSchedule.tsx` | 8 of 9 fail (the passing case: a person who may not change the project is offered nothing) | `client/red.txt` |
| Only the `Read` change reverted | 1 of 9 fails: the list is replaced by "Reading…" while it is read again after a save | `client/keep-list-red.txt` |
| Final | 9 of 9 | `client/green.txt` |

`client/project-suites.txt`: 987 of 989 across the project suites and the retired-name ratchet. Neither failure is this
work: the `btn sm` ratchet rose with the IND registers' screen (another session), and `.pj-act`/`.pj-act-w` are defined
in `project-home-v2.css` by `d053ba0d5` (`projectHomeStageCss`). `ci:undefined-css-classes` OK; lint clean in every
changed file; `client/typecheck-focused.txt` has no error in a changed file.

## Running app (`instance/`)

`c2c_rr5_phone_instance`, organisation 5, port 5267, `LAUNCH_SCOPE_ENFORCE=on` and `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`,
signed in through the form as the demo author. `shots-after.json`'s gate probe: an unclaimed section read answered 403
`LAUNCH_SCOPE`, the claimed milestone list 200. Through the form: "Pre-IND briefing package sent", due 8 Jan 2027,
sections 1.2 and 2.5, recorded (200), moved to 22 Jan (200), marked done (200); the stored row is in
`instance/final-run-row.txt`. Each run's row was then deleted, so the shared demo data is as it was (three milestones on
C2C-101). Run 2's "date moved" shot missed the module while it re-read; the `Read` change and a wait in `shots.cjs`
followed, and run 3 is the set below.

## Screenshots (`screenshots/`, `shots.cjs`)

- `before-schedule-*`: HEAD, the "Section owners and deadlines" module at 1440 and 390, light and dark. No control.
- `after-schedule-*`: the same, with "Update" on each open milestone, linked sections on each milestone row, the done
  milestone with none, and "Record a milestone" under the list.
- `after-form-*`: the drawer, empty, at each size.
- 1440 light, the flow: `after-form-filled`, `after-recorded`, `after-move-date-form`, `after-date-moved`,
  `after-mark-done-form`, `after-done`.

The after PNGs over 99,000 bytes are reduced to 96-colour palettes (ImageMagick), to stay under 100,000 bytes.
Failed requests in the after run: the gate probe's own 403, and `GET /api/c2c/projects/:id/intelligence` 409 twice
(`PROJECT_WORKSPACE_MISMATCH`, noted in `../defects/README.md`; not this work).

## Not done, and why

- **Delete is served, not offered.** The path claim admits `DELETE /milestones/:id` with the other methods. It is
  write-admitted; it is a hard delete with no milestone history of its own (only the request audit trail, where
  `AUDIT_TRAIL_ENABLED` is on, records it). Refusing it would remove a route; the screen offers none. Whether production
  should delete milestones at all is a product decision.
- **A done milestone is not reopened.** The route has no way to clear `completed_at`; the drawer says so.
- **Linked sections are typed as numbers, not chosen from the project's sections.** The project's section list
  (`GET /api/project-sections`) stays unclaimed; claiming it was outside this brief.
- **Typecheck.** The client's focused typecheck was started while another session's DB vitest run was in progress, which
  the brief asked not to do. It completed normally (no memory kill).
