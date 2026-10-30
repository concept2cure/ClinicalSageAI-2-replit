# PM-06 backend qualification

The frozen [contract](contract.md) reaches the existing canonical programme-profile writer through `GET/PATCH /api/c2c/projects/:id/settings`. The backend owns only `server/routes/c2c/project-settings.ts`, its two-line import/mount in `server/routes/c2c/projects.ts`, and `server/routes/c2c/__tests__/project-settings.pglite.test.ts`. The canonical profile writer, program/sharing policy and audit writer remain their existing owners. The root worker owns shared wire/calendar changes and native PostgreSQL, UI, build, whole-program TypeScript and publication evidence.

## Results

| Evidence | Result | Scope |
| --- | --- | --- |
| [backend-fail-first.txt](backend-fail-first.txt) | 31 failed / 31 | Actual HTTP/SQL tests ran before the settings routes existed; canonical schema fixture setup completed. This is the original baseline, before six later boundary cases were added. |
| [backend-settings.txt](backend-settings.txt) | 37 passed / 37 | Actual Express Projects router, canonical current actor/program/sharing admission, canonical profile writer through `drizzle(client)`, actual profile SQL and chained audit SQL on PGlite. |
| [backend-retained-callers.txt](backend-retained-callers.txt) | 121 passed / 121, 7 files | Existing profile, projection, device, date, request-pinned access, failed-verification and project-intake callers. |
| [backend-lint.txt](backend-lint.txt) | Exit 0, zero warnings/errors | Scoped ESLint for the new route helper and dedicated HTTP/SQL test file. Empty output is the retained successful result. |

The dedicated 37 cases cover saved scope and capabilities; current SQL role/lead rather than a stale request role; share Edit without program-management authority; strict outer and inner keys; forbidden ownership/lifecycle/client/profile fields; impossible dates and year 0001; canonical description/date clearing; actual changed fields; stale program/workspace revisions; malformed, mismatched and int32-overflow client claims; foreign/private/revoked access; archived read-only programs; preservation of the existing inactive-workspace and open-role policies; unverifiable saved priority; and a nullable legacy workspace without a resolver fallback.

Atomicity cases execute the actual profile update and canonical chained audit insert, refuse an actual audit failure, roll both records back when the final saved projection fails, and execute actual COMMIT or ROLLBACK before losing its acknowledgement. The latter cases assert the unknown-outcome response, exactly one `release(error)`, and no subsequent SQL on the owned connection. Successful writes verify actor, trimmed reason, before/after fields, canonical anchor/workspace, both revisions, audit chain and payload hashes, and a pre-COMMIT receipt. The program UPDATE lock precedes the first SHARE reservation.

PGlite is a single-connection PostgreSQL-compatible fixture with synthetic request identity and request ALS, and does not qualify deployed authentication, FORCE RLS, concurrent connection locking or production key management. The fixture uses canonical extracted table DDL/migrations, provisions the audit side store, and asserts no unexplained schema gaps. One test temporarily removes the fixture's workspace NOT NULL constraint solely to exercise the explicitly supported historical nullable wire, then restores it. Retained older caller fixtures still emit their existing audit-side-store / chain-sequence warnings; they are regression coverage, not new native database qualification. The root-owned native packet qualifies the production database boundaries separately.

## Commands

All commands ran from `/workspace/ClinicalSageAI-2-replit` under Node 22, using:

```sh
export PATH=/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/.bin:$PATH
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts server/routes/c2c/__tests__/project-settings.pglite.test.ts
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts server/services/c2c/__tests__/programme-profile-write.test.ts server/services/c2c/__tests__/project-setup-projection.test.ts server/routes/__tests__/510k-device-profile-estar-fields.test.ts server/routes/__tests__/rim-date-validation.test.ts server/routes/c2c/__tests__/project-route-access-requestdb.test.ts server/routes/c2c/__tests__/project-access-guard-unavailable.test.ts server/routes/c2c/__tests__/projects-create-anchor.pglite.test.ts
npx eslint server/routes/c2c/project-settings.ts server/routes/c2c/__tests__/project-settings.pglite.test.ts
```

The first command was run before implementation for fail-first evidence, then after the implementation and six additional boundary cases. Repeated executions are not additional test counts. These worker checks did not run a whole-program typecheck, build, warning ratchet, provider call, migration or Git mutation.
