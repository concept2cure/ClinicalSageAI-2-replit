# Demo recovery — existing launch seed repair

Workstream: customer-entry recovery (D2). Date: 2026-10-30.
Repository: concept2cure/ClinicalSageAI-2-replit. Branch: concept2cure-v2.
Inspected parent: 22859cca96ca016c509bd48c09bae41d987137de.

## Status

This is a tested repair of the EXISTING operator-run demo seeder. It is not a
claim that the hosted demo, Demo Access button, or navigation incident is fixed.
No live tenant was seeded, no migration ran, and no application was deployed.
No UI, database schema, authentication policy or permission grant was changed.

## What already exists

- `scripts/demo/launch-demo/lib.mjs`: the API-only demo connection, manifest,
  PDF helpers and signer helper. Previously it derived seed organization from
  `/api/auth/me`, including an account-default fallback, rather than the verified
  session. It did not check Projects or Tasking before starting writes.
- `scripts/demo/launch-demo/seed.mjs`: the existing biotech/MDX CLI. Previously it
  silently dropped unknown pack names, lacked an explicit workspace option, and
  wrote a finished manifest without an explicit success/failure qualification.
- `scripts/demo/launch-demo/packs/biotech.mjs`: existing fictional C2C-101 biologic,
  Vault, authoring, protocol, submission and QMS pack. Its project request omitted
  the product class required by current IND intake and searched only page one.
- `server/routes/c2c/projects.ts` and `project-intake.ts`: canonical create/list/
  detail, authorization, product-class and client-workspace decisions. Reused,
  not bypassed or changed. `productTypeForIntake` requires the IND product class.
- `server/routes/auth.ts`: `/session` verifies bearer membership and names its
  organization; the seeder now reads it. The distinct dev-login defect described
  below remains UNCHANGED in this batch.
- `server/services/sign-in-organisation.ts`: canonical membership selection
  already used by ordinary login. Reuse this in the dev-login follow-up.
- `server/routes/taskBoard.routes.ts` and the existing TaskBoard surface: real
  `/api/task-management/board`, including partial/unread-source metadata. The
  seed now checks that read; it does not create another task store or screen.
- `tests/validation/lib/harness.mjs`: existing API client and dev-login helper,
  retained. No new runtime dependency or parallel API client is introduced.

Current files, callers and source contracts were inspected through GitHub. The
three original script snapshots were verified byte-for-byte against Git blob
hashes before modification. A full checkout and deleted-history search were not
available in this execution environment; no capability or source file was deleted.

## Repairs

1. Read the actual authenticated session before seeding. Reject incomplete actor/
   organization identity, a different explicitly named account, or an unexpected
   organization. Never treat `defaultOrganizationId` alone as session authority.
2. Probe the existing protected Projects and Tasking reads before pack writes.
   A genuine empty tenant is allowed; unavailable/unprovisioned/reconciliation-
   required Projects or partial/unread Tasking is a failure, not an empty demo.
3. Pass `productType: 'biologic'` for the pack's already-defined fictional antibody.
   Carry an explicit client-workspace selection into the canonical project create.
   Do not silently reuse an existing demo in a different requested workspace.
4. Follow portfolio pagination before creating the demo project; an incomplete
   bounded lookup refuses instead of creating a duplicate.
5. Reject invalid, duplicate or missing CLI choices before connecting. Explicit
   workspace selection is biotech-only in this batch; MDX/all with that flag is
   refused rather than silently ignoring it.
6. Record the target environment/account/organization and probe outcomes in the
   manifest. Distinguish failed, seeded_unqualified and purged outcomes. Browser
   qualification always remains not_executed here.

## Verification

`node --test scripts/demo/launch-demo/demo-recovery.test.mjs`

35 tests. Original source: 33 failures, 2 passes. Repaired source: 35 passes,
0 failures, 0 skipped. Four changed/added JavaScript files pass `node --check`.
Runtime used: Node v22.16.0. See verification.json for exact blob/log hashes.

These are module-level regressions importing the actual script bytes, with HTTP,
fixtures and downstream authoring/protocol/submission/QMS operations replaced by
explicit test doubles. They prove input selection, connection/probe behavior,
project-create payload, pagination, reuse and manifest behavior. They do NOT prove
live SQL/RLS, the whole seed pack, provider availability, browser clicks, signatures
or deployment. Fixtures contain fictional test identities only.

No full application TypeScript, build, lint, ordinary pre-push hook, real-database
suite or browser suite executed: this executor has no full checkout/dependencies
and its network cannot clone/install them. No gate, baseline or branch protection
was changed. Publication of this script-only batch is not release qualification.

## Using the repaired existing operator path

Use a session belonging to the actual intended demo tenant on the intended server,
not an unrelated developer database. For biotech, the existing command accepts:

```sh
node scripts/demo/launch-demo/seed.mjs --pack biotech \
  --base-url "$DEMO_BASE_URL" --organization-id "$DEMO_EXPECTED_ORGANIZATION_ID" \
  --client-workspace-id "$DEMO_CLIENT_WORKSPACE_ID"
```

Omit workspace selection only where canonical intake can choose an unambiguous
workspace. Authentication uses DEMO_SEED_TOKEN, or the existing explicitly allowed
development-login account (DEMO_SEED_EMAIL / --email). Do not enable development
authentication in production. Never put tokens or passwords in committed commands.
A successful seed still requires a browser walkthrough on that same environment.

## Incident still open — not repaired or qualified here

- `server/routes/auth.ts` dev-login independently takes an account's default org
  and the first membership's role. These may not describe the same membership.
  Ordinary login already uses `membershipsOf` + `signInMembership`; the dev-login
  path must use the same selection and refuse unavailable/inactive identity before
  issuing a session. This is a source-supported defect, NOT a proven diagnosis of
  the hosted incident. It is not patched in this batch.
- Demo Access currently writes credentials directly and redirects without a demo
  readiness check. This batch does not change that button or seed at sign-in.
- Actual hosted organization membership, workspace provisioning, seed location,
  deployment version and errors are unknown. The reported organization message
  has not been matched to a captured live response.
- Tasking, Communication and the other left-rail clicks have not been exercised on
  the affected deployment. A script probe is not navigation acceptance.
- Browser access was attempted but the connected browser context was unavailable.
  No affected hosted URL/session/database was available to this execution.

Acceptance remains: use the actual Demo Access identity, open the populated demo,
create and reopen a project, open each advertised rail destination, edit/save/reopen
an authored document, and record network outcomes, deployed commit and screenshots.
Until those pass on the affected deployment, do not call this demo-ready.
