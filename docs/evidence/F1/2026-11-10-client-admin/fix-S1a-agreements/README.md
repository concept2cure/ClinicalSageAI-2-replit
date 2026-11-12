# Agreements: who may publish one, and an honest answer when they are not set up (F1, 2026-11-10)

Lane S1a-agreements of the client administration work, phase 2. Found by the walk (`../walk-onboarding-and-people.md`,
W1-05) and the audits (ADM-01, IAM-ADM-02, R1-ADM-11). Server only: proven at the HTTP layer and on the running app.

## What already exists

- `server/routes/licensing.ts`: the agreement routes (`/api/licensing/agreements/*`, `/acceptances`) and
  `/entitlements`, `/features`. Mounted at `/api/licensing` (`server/bootstrap/register-inline-routes.ts`). No screen
  calls them.
- `server/services/licensing/eula-service.ts`: the agreement catalogue and the acceptance ledger. Acceptance is already
  audited in its transaction with `writeChainedAuditRow` (`server/services/auditService.ts`). Publishing was not.
- `server/middleware/requirePlatformAdmin.ts`: the one platform-staff decision, `resolvePlatformAdmin` (the owner's own
  password sign-in on the allowlist, or an active platform grant; never the organisation membership role). Used here as
  `routes/audit-trail-routes.ts` uses it.
- Reason of at least 3 characters for a governed platform act: the same rule as `routes/admin/access-management.ts`
  and `routes/admin/master-admin.ts`. Platform acts are audited in the platform's chain (tenant 0), as those routes do.
- `server/middleware/requireLicenseAcceptance.ts`: the acceptance gate. Already fails closed (503); mounted on no route.
- `db/migrations/20260621_intelligent_licensing_eula.sql`: the two tables. It is on no migration applier.
- Sign-up's acceptance is recorded on the sign-up's audit event (`../fix-signup/README.md`). Not duplicated here.

## What was wrong

- **ADM-01, IAM-ADM-02 (blocker).** `POST /api/licensing/agreements` let in any caller whose request role was `admin`.
  That role is the caller's organisation membership role, so every client's own administrator could supersede the
  EULA that every user of every organisation must accept. No reason was asked and no audit row was written.
- **W1-05.** The service created its tables at run time. The hosted runtime role may not, and `CREATE TABLE IF NOT
  EXISTS` is refused to it even when the table exists. Every agreement route, and `GET /api/licensing/entitlements`,
  answered a bare 500 ("permission denied for schema public" in the log, nothing said on the wire).

## What changed

- Publishing is platform staff's act. A client administrator is refused 403: "Agreements are published by platform
  staff. An organisation's administrator cannot publish or replace one." A federated session whose e-mail is on the
  allowlist is refused too.
- A publish takes a reason (3 characters or more), checked in `publishAgreement` before anything is written (400).
- The publish writes one sealed audit row (`license_agreement_published`, platform chain) with the reason, the
  version(s) it superseded and the new one (id, version, title, scope, required, text digest), before COMMIT. If the
  row cannot be written, nothing is published and the old version stays active.
- The service checks whether its two tables exist before any DDL. If they exist it uses them and never tries to create
  them (so admitting the migration later needs no code change). If they do not exist and cannot be created, every call
  refuses with one sentence, answered 503 `AGREEMENTS_NOT_SET_UP`: "Agreements are not set up on this installation
  yet: their records do not exist, so no agreement can be read, accepted or published." Never an empty list, never a
  bare 500. A developer database that can create them still does.
- The acceptance gate says the same sentence in that case, and still serves nothing.

## Proof

- **Red first** (`red.txt`): 15 tests fail before the change. A client administrator publishes (201 where 403 was
  expected); staff without a reason are refused only for the wrong reason; every not-set-up route answers 500; existing
  tables are re-created; `publishAgreement` resolves with no reason and writes no audit row.
- **Green** (`green.txt`): every test file that imports a changed module: 9 files, 78 tests pass. New:
  `server/routes/__tests__/licensing-agreements-publish-and-store.test.ts` (real router, real platform guard, pool
  stubbed), `server/services/licensing/__tests__/eula-publish-audited.pglite.test.ts` (PGlite, the real migration and
  the real chained audit writer, chain verified). Extended: the gate's test and the three stubbed-pool tests beside them.
- **Mutations** (`mutations.txt`, driver `mutate.py.txt`): 9 of 9 killed, each file restored byte-identical (sha256).
  Platform check removed; reason check removed; audit row not written; superseded version not returned; existence
  check removed; raw error rethrown; route not answering not-set-up; gate not telling it apart; actor not passed.
- **Running app** (`running-app.txt`, script `http-walk.cjs.txt`): 5220 restarted on this tree (runtime role, RLS and
  the launch gate on), signed in through the real form as the seeded organisation's administrator (membership `admin`,
  no platform grant, agreement tables absent). Publish with and without a reason: 403 with the sentence above.
  `/entitlements`, `/agreements/active`, `/agreements/outstanding`, `/acceptances` and accept: 503 with the not-set-up
  sentence (was 500). No screenshot: no screen calls these routes.
- **Typecheck** (`typecheck.txt`): no error in a changed file.

## Not fixed here

- **W1-05, the decision.** Whether `db/migrations/20260621_intelligent_licensing_eula.sql` goes on the migration applier
  (and the routes are reached from a screen), or the service and routes are retired, is the founder's. Until then the
  answer is the honest 503. Note for that decision: the file seeds two required agreements with no text, which no one
  can accept; it would need text, or no seed, before it goes on the applier.
- **R1-ADM-11 (three entitlement resolvers).** Not started, as decided. What converging takes:
  `server/services/entitlements/resolver.ts` (`resolveCapabilities`) is the one the API gate (`require-entitlement.ts`,
  the 510(k) and report-os routes) and AnA read; the screen and navigation read `services/license-manager.ts`
  through `GET /api/module-subscriptions/license` (`routes/module-subscriptions.ts`); `licensing.ts` `/entitlements`
  and `/features` read `services/licensing/entitlements-service.ts` and have no caller. Converging means: make `/license`
  answer from `resolveCapabilities` (or have the resolver read `readLicenseInfo` for the tier, so both agree), move the
  client's navigation onto it, and delete `/entitlements`, `/features` and `entitlements-service.ts` in the same change,
  keeping the outstanding-agreements input. Files: `routes/module-subscriptions.ts`, `services/entitlements/resolver.ts`,
  `routes/billing-dashboard.ts`, the client's licence reader, plus this lane's `licensing.ts`. Owner: the licensing owner,
  who confirms which resolver is canonical.

## Questions for the founder

1. Are the agreement records (`license_agreements`, `license_acceptances`) admitted to the migration applier and reached
   from a screen (sign-up and a re-acceptance prompt when a new version is published), or is the EULA service retired
   in favour of the acceptance recorded on sign-up's audit event?
2. If admitted: which agreements are required at launch, and who holds their text? The current seed has none.

## After the independent check (2026-11-10)

The lane's verifier passed it and raised two gaps, both closed in the same commit.

- **Support staff could publish.** The guard used the general platform-staff decision, which admits the `support`
  role. Publishing or replacing terms owed by every user of every organisation is now held to `super_admin` and
  `platform_admin` (`holdsPlatformRole`, the same module, the same two roles as the Part 11 platform writes).
  Tests: a `support` grant is refused 403 and nothing is written; a `platform_admin` grant publishes.
  Mutation: adding `support` back fails the first test.
- **One table of the two read as "set up".** `ensureSchema`'s both-tables condition could be weakened to
  either-table with every test still passing (the verifier's surviving mutation V9). A case now holds it:
  `license_agreements` present and `license_acceptances` absent answers 503 `AGREEMENTS_NOT_SET_UP`.
  Mutation: `&&` to `||` fails that test.

Not fixed here, recorded for the licensing owner: two concurrent publishes of one agreement key can leave two active
versions (no lock on the key; it predates this change, and no screen calls the route).
