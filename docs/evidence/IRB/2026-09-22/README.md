# IRB — step 1 of docs/design/IRB_SUBMISSION.md: the tables reach a deployed database

## What was wrong

`migrations/20260610_irb_submissions.sql` — six tables, a Drizzle mirror, a
service whose every mutation is a governed transaction, three deterministic
engines and nine mounted routes — was **not registered in
`C2C_MIGRATION_FILES`**. Under Rule 1 that means it was on no applier, so on
every deployed database the IRB tables did not exist. The capability was dead
in production and alive only on laptops where an overlay had created the
tables by hand.

## The deploy-breaking defect found while registering it

`irb_submissions.study_id` carried `REFERENCES clinical_studies(id)`.
**Nothing on the applier creates `clinical_studies`**, and it is not in the
Drizzle schema that `install-fresh` pushes — the only three files that create
it are themselves on no applier. Registering the file unchanged would have
failed the first deploy that ran it.

Per Rule 1 the creator was amended in place, with a dated note in the file,
rather than a DROP being appended. `study_id` is now a soft link, the same
shape `consent_forms.protocol_document_id` already uses, and the reading code
already tolerates a null. The three foreign keys that remain —
`organizations`, `users`, `submissions` — all resolve on the applier.

## Proof, both directions

Against a clean database containing only the three real dependencies:

| Version | Result |
|---|---|
| The file as it was (`git show HEAD:…`) | `ERROR: relation "clinical_studies" does not exist` — **0 of 6 tables created** |
| The amended file, applied once | 6 of 6 tables created |
| The amended file, applied a second time | 6 of 6, no error — idempotent, as the replay contract requires |

Gates: `ci:migration-set-order` OK (295 migrations, sweep last),
`ci:migration-drop-safety` OK (no DROP added), `db:sync-manifest:check` in
sync. The entry sits above the final pair so the tenant-isolation sweep
policies all six tables — without that, under `RLS_ENFORCE=on` they would be
readable across tenants.

## Still owed (the rest of the design)

The capability remains unreachable from the product: no client code calls
`/api/irb` or `/api/protocol-consent`. Steps 2 to 6 of
`docs/design/IRB_SUBMISSION.md` — the placement vocabulary, package assembly,
the surface, the lifecycle and the live run — are not started.
