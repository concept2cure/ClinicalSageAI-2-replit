# Client administration: the walk, the audit, and what came of them (2026-11-10 and 2026-11-11)

The founder, 2026-11-10: "Continue across all client onboarding, setup, licensing, admin, client security settings in
their client admin." And: "add user roles per biotech, pharma, CRO, cmc - and so on to align to the many use cases of
the entire platform." The founder, 2026-11-11: "Continue and focus entirely on getting what we built surfaces
correctly on the UI and working for GA."

This folder is the record of that work: what a customer's own administrator meets from sign-up to a running
organisation, used in the running app, then audited, then fixed.

## What already exists

- Sign-up, verification and sign-in: `client/src/concept2cure/auth/`, `server/routes/auth.ts`.
- Onboarding and Home's set-up: `client/src/concept2cure/v2/surfaces/Onboarding*.tsx`, `HomeSetup.tsx`.
- Administration ("Admin and access"): `client/src/concept2cure/v2/surfaces/AdminAccess.tsx`, `AdminSettings.tsx`,
  `AdminSurfaces.tsx`, with members, roles, single sign-on, API keys, skills and settings; the server behind them in
  `server/routes/tenant-users.ts`, `mdx-admin.ts`, `organizations-routes.ts`, `api-keys.ts`, `sso.ts`, `scim.ts`.
- Licensing and billing: `client/src/concept2cure/v2/surfaces/LicensingSurface.tsx`, `UsageBilling.tsx`,
  `server/routes/billing.ts`, `billing-dashboard.ts`, `licensing.ts`, `module-access-requests.ts`.
- The account drawer: `client/src/concept2cure/v2/AccountPanel.tsx`.
- Job roles (P-49): `/api/mdx/qms/job-roles`, `server/routes/mdx-qms-training.ts`; the standard catalog of job roles by
  client type (P-119): `shared/regulatory/client-type-job-roles.ts`.

Nothing here is a new screen. Every fix finishes, reaches or corrects one of these files.

## What is in this folder

| Path | What it is |
|---|---|
| `walk-onboarding-and-people.md` | Walk 1: sign-up, verification, first run, the organisation's profile and client type, onboarding, inviting six people at each access level, accepting, two organisations, a removed member. Finding ids `W1-`. |
| `walk-security-and-licensing.md` | Walk 2: the Administration tabs, single sign-on and provisioning, API keys, session policy, the authenticator, the account drawer, Licensing and usage, the audit trail, phone width. Finding ids `W2-` and the audit ids. |
| `walk1-scripts/`, `walk2-scripts/` | The walk scripts, as text. Passwords are read from the environment or a scratch file; none is in a script. |
| `shots/` | The 150 screenshots the two notes cite, 24 colours (5 MB). See "Screenshots". |
| `fix-signup/` | Sign-up can be typed into; a refusal is tied to its field; the acceptances and the job title are kept (`8a65a6f3a`, `452ea0ac6`). |
| `job-roles/` | P-119 slice 1: 53 standard job roles by client type, as data (`7649a63be`). |
| `fix-S1a-agreements/` | Agreements are published by platform administrators, audited (`e44b0c0b8`, `1ec422033`, `a341aff77`). |
| `fix-<lane>/` | One folder per fix lane, filed with that lane's commit. |

## How it ran

- Two walks in the running app (`http://127.0.0.1:5220`: runtime database role, row-level security on, launch gate on,
  no model key), at 1440 × 900 and 390 × 844, as an administrator, a member and a viewer. A second instance with a
  local mail sink was used where real e-mail mattered.
- Seven read-only audits of the same area, each through one lens: security and licensing, Part 11, accessibility,
  honest state, microcopy, design, and reach (what is built and not reachable).
- Four adversarial verifiers re-checked the findings in the code and the app.

## What it found

162 findings, grouped into twelve lanes over disjoint files:

| Lane | Findings | What it covers |
|---|---|---|
| S1a agreements | 4 | Who may publish the platform-wide agreement; the agreement store on a hosted database |
| S1b billing writes | 8 | Seats, budgets and weekly limits a client administrator could set for themselves |
| S1c module requests | 5 | Approving a module outside the plan |
| S2 settings doors | 21 | Settings writable without a reason through several doors; controls nothing enforces |
| S3 invitations | 15 | Invitations unaudited and without a reason; delivery, expiry, withdrawal |
| U1 Administration | 38 | The Administration screen: invented single sign-on status, groups, semantics, words, design |
| U2 Licensing | 21 | Invented seats and tier; plan cards; usage |
| U3 sign-in and account | 29 | The recovery code at sign-in; the account drawer; refusals |
| U4 organisation switch | 6 | Switching organisation names the previous one |
| G audit read-back | 1 | The audit chain reads "verification failed" after a signed export |
| O onboarding | 11 | The set-up wizard and Home's set-up steps |
| X SCIM consent | 3 | Provisioning attaches accounts without consent |

The security findings were verified first and fixed first: any client administrator could publish a platform-wide
agreement; a client administrator could set their own seats and weekly limits; approval granted modules outside the
plan; any member could set budgets; provisioning attached accounts without consent.

## What came of it

- **The fix lanes.** Each lane is fixed test-first, verified by a second agent who tries to break it, repaired, and
  used in the running app. Each lane's evidence is its `fix-<lane>/` folder.
- **Job roles by client type** (founder decision P-119): the standard catalog, then Administration reaching it.
- **The fifth P-122 inventory.** Under founder decision P-122 ("The UI shows the work") this area was inventoried the
  way the other four were: `docs/evidence/DESIGN/P-122/inventory/administration.md` (66 capabilities: 23 hidden, 21
  built and never reached, 15 shown but never recorded, 6 removed, 1 reached but refused) and its restoration order,
  `administration-restoration-order.json` (30 restorations). The decisions that govern them are **P-125**.
  Restorations file their before and after under `docs/evidence/DESIGN/P-122/administration/`.

## Screenshots

`shots/` holds only what the two notes cite, reduced to 24 colours. Four that the notes name are not kept, because a
screen of that kind can show a secret: the API key shown once (`w2-30`), and the three set-up link pages (`w1-54`,
`w1-55`, `w1-56`). The authenticator set-up and its recovery codes were never kept. The notes' words stand for them.

## Questions that are the founder's

Recorded in P-125 ("Not decided here"): which number is the contract seat limit; whether credits and tokens are
metered and enforced at GA; the free plan's limits; the module-enforcement default; whether a client administrator
configures their own identity provider; closing an organisation and deleting a person's data on request; whether
the agreement records go on the migration applier, and who supplies their text.
