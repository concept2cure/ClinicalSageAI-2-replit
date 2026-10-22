# The Project home feed names a governed act and shows its reason (2026-10-21)

Row: D2. Follow-up to FILING_SPINE F22 (add a market). The person's reason for adding a market was recorded and shown nowhere.

## What already exists

- **`GET /api/c2c/projects/:id/activity`** (`server/routes/c2c/projects.ts`) reads the project's `audit_logs` rows, rendered as the "Team & activity" feed in `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`. The market-add row was already in it: its `record_id` is the project. It read "c2c.work.transition · project", with no reason, because the projection had no `reason` column and no event.
- **`c2c_ana_actions.payload`** holds the governed action's `event` (`market_added`) and `agency`, written by `recordGovernedAction` (`server/routes/c2c/actions.ts`). The audit row points at it by `ana_action_id`.
- **`RecordHistory.tsx`** with `readRecordAuditHistory` is the per-record history view (Vault document, sequence). It is not a project feed, and nothing here duplicates it.
- **`GET /api/regulatory-programs/:id/activity`** (`server/routes/regulatory-programs*`) is a second activity route. Project home does not call it. Noted for its owner, not changed here.
- **Deletions:** `git log --all --diff-filter=D -- '*ProjectActivity*' '*project-activity*'` finds nothing.

## What changed (a completion of the existing feed)

- The feed's read moved unchanged into `server/services/c2c/project-activity.ts`, and adds:
  - `reason` (`audit_logs.reason`, blank read as none);
  - `event` and `event_agency`, joined from `c2c_ana_actions` on the row's `ana_action_id`, within the same tenant.
- The feed names `market_added` as "Market added · EMA" and shows ". Reason: …" when one was recorded. A row with no known event reads exactly as before.

## Red, then green

- `red/feed-without-reason.txt`: the PGlite test against a real add-a-market, run with the projection as it was. No row carries the event or the reason.
- `red/feed-before.txt`: the client test against the pre-change Project home (no `activityLabel`).
- `green/feed.txt`: both tests, every Project home suite, and the projects route suites. 449 of 450 pass. The one failure, `projects-detail-taxonomy.test.ts` "201 carries `program`" (the create answers 400), fails the same way on trunk with this change stashed. It is another lane's.

Typecheck clean; the ratchet shows no change. These pass: `ci:sql-interpolation`, `check:microcopy`, `ci:internals-in-copy`, `ci:undefined-css-classes`. HawkScan not run: HAWK_API_KEY is not set.
