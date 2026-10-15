# D3: legacy digest routes that took the target user from the request

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-10-04. Found while taking the board's hand-on "`GET /api/user/:id`
captures `GET /api/user/preferences`; `notification_routes.ts:163` never runs".

## The defect

`server/routes/notification_routes.ts` registered five authenticated routes,
mounted verbatim by `register-advanced-platform-routes.ts`. Every one took its
target user from the request body or query, never from the session:

| Route | What any signed-in person could do |
| --- | --- |
| `POST /api/user/save-digest-prefs` | Write another user's digest preferences to a local file named `user_${user_id}_prefs.json`. A `user_id` containing `../` wrote outside the folder |
| `POST /api/digest/get-data` | Read another user's preferences back, with a digest built from that user's export log |
| `GET /api/user/preferences` | The same read; shadowed by `GET /api/user/:id`, so it never ran. Un-shadowing it, the board's ask, would have added one more cross-user read |
| `POST /api/notify/send-weekly-digest`, `POST /api/notify/send-comparison-notification` | Have the server mail any address. Outside production the mailer only logged and the route answered "sent successfully"; in production every send answered 500 or 503 |

No client code calls any of them (`client/src` searched). The export log behind
the digest (`server/export_logger.ts`) was a plain local JSONL file with no
other importer.

**Red:** `red/before.txt` runs the production module, as user 1. All four
cases show the defect:

- user 999's preferences written;
- a file written outside the folder;
- user 999's preferences read back;
- "sent" reported for an email that was only logged.

## The change

These are removed:

- the module and its mount;
- the logger, which had no other importer;
- the module's governance test;
- the two CI entries that existed only for it:
  - the `allowedFiles` entry in `check-no-mock-in-prod-routes.mjs`;
  - the `../data/user_preferences` decision in `check-image-runtime-assets.mjs`.

**Reachable replacements, by path** (working agreement):

- **The digest:** the proactive digest, `server/services/digest/`
  (`proactive-digest.ts`, `digest-heartbeat.ts`), with its tests in
  `server/services/digest/__tests__/`.
- **Digest controls:** org-level, in `server/services/digest/digest-preferences.ts`
  (`digest-preferences.test.ts`).
- **A person's own notification preferences:** `GET` and `PATCH
  /api/users/me/notifications` (`server/routes/users.ts`), keyed by the verified
  token, exercised by `tests/db/request-parent-boundary.dbtest.ts`.
- **The comparison-ready email:** it reached nobody in production, so there is
  no user outcome to replace.

The history search (`git log --all --diff-filter=D`) finds no earlier deletion
of this module.

## The contract

`tests/routes/legacy-digest-routes-removed.contract.test.ts` asserts two things:

- the module and logger are absent;
- no server source registers these paths or imports the module.

`red/contract-before-removal.txt`: both cases fail on the tree before removal.
`green/after.txt`: 2 of 2 pass.

`ci:no-mock-in-prod-routes` passes (0 current, 0 baseline).
`ci:image-runtime-assets` passes with two fewer paths, as does its selftest.
