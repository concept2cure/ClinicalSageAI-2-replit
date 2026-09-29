# D2 — the launch catalog with a real program in it

**Date:** 2026-09-28 · **Row:** D2 (Launch catalog) · **Workstream:** W1
**Companion:** `../2026-09-23-surface-truth/` (the same catalog on an empty organisation)

The empty-organisation sweep shows the catalog tells the truth about nothing. This
one shows it with something: a first IND program carried through every launch app
by the product's own API, then every launch surface opened with that program open.

## What was seeded, and how

`npm run demo:seed -- --pack biotech` (`scripts/demo/launch-demo/`) against a
database provisioned from empty by `npm run up`, the server in the production
posture (`LAUNCH_SCOPE_ENFORCE=on`, `RLS_ENFORCE=on`, non-superuser runtime role).
Every record goes through the HTTP API as the signed-in admin — never SQL, never a
service import — and a refusal is a failed step. The run's own record is
`docs/evidence/DEMO/biotech/manifest.json`.

| App | What exists after the run |
|---|---|
| Projects | Program C2C-101 — anti-IL-23p19 mAb, moderate-to-severe plaque psoriasis, US IND |
| Vault | 6 documents ingested and filed (IB, protocol, SAP, CMC summary, tox summary, pre-IND minutes) plus the program's eCTD dossier structure |
| Authoring | Protocol synopsis (6 sections, review requested, frozen v1.0), Module 2.5 Clinical Overview, IB summary with comments |
| Protocol development | Protocol C2C-101-201: 10 sections, objectives, eligibility, a 10 × 9 schedule of assessments, 6 risks, 5 milestones, amendment 1, a version snapshot |
| Submission Center | The program's IND submission; sequence 0000 with 6 leaves, moved draft → assembling → validated |
| Submission Readiness | The deterministic dispatch gate: blocked, 2 blockers, each named |
| QMS | 4 SOPs (draft / in review) and change-control record C2C-CC-001 |
| Audit trail | 9 chained entries written by the run; the ledger's chain verdict `ok` |

**Not executed, and recorded as such:** the second signer's e-signature and the
QMS approvals (no second account was supplied), Shadow Review (no AI provider on
this installation: 502), and the readiness-review orchestration (the engine takes
an integer project id; programs are uuid-keyed — why Orchestration is outside the
catalog). Nothing in this list is recorded as done.

## Result

`launch-surfaces-populated.json`: all 38 launch-catalog surfaces opened with the
program open — **0 crashed, 0 uncaught exceptions**; the only failed API calls are
the two platform-operator consoles' 403s, which both surfaces now say as a refusal.
The ten screenshots here are the main surfaces on `48337a429`.

## What the sweep found — each fixed, shown failing first

| Defect | Fix |
|---|---|
| The dispatch gate said "The agency-grade validator's report for this package carries no errors — **Satisfied**." No validator is configured and no report exists; the gate is advisory unless `ECTD_REQUIRE_EVALIDATOR` is set in production. | Dispatch readiness: the card says **"Not assessed"** and why (`dispatch-readiness.png`). Whether to require the validator is unchanged — a D7 decision. |
| A failed readiness measurement reached the Projects card as a stored, never-updated "0% ready". | Projects: no figure, "Readiness not measured". (C2C-101's own 0% is real: 0 of its 92 dossier sections are approved yet.) |
| The demo seed sent every review request with no reviewer (it read `/api/auth/me` in an envelope the route no longer uses), and stopped before QMS on the out-of-catalog orchestration step. | Seed fixed; orchestration recorded as not executed with its reason. |
| Two dispatch-readiness test harnesses failed on `concept2cure-v2` (a mock missing an export added upstream). | Mocks take the real pure function. |

## With a second person: the governed steps

A second account was created **through user administration**, the way a customer
admin adds a colleague: `POST /api/tenant-users` as the admin (Rae Okafor, Head
of Quality, organisation admin), which returned the password-setup link (no mail
server on this installation, so the product hands the admin the link to deliver);
the password was then set through that link's token (`POST
/api/auth/reset-password`), and she signed in. The pack was re-run with her as
the second signer (`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD`, held in memory only;
the manifest carries no password).

| Governed step | Result |
|---|---|
| Protocol synopsis C2C-101-201 | Frozen v1.0, then **e-signed by Rae Okafor as REVIEWER**, the signature covering freeze v1.0 |
| SOP-001 Document Control, SOP-002 Change Control | **Approved by her electronic signature → effective** |
| Read-and-understood training on SOP-001 v1.0 | Acknowledged; the QMS tile now measures **17%** (one acknowledgement across two effective SOPs and the roster) |
| Audit trail | **196 chained entries, verified intact server-side**; 1 e-sign, 7 review, 10 submission, 18 vault, 21 authoring |

`quality.png`, `audit-trail.png` and `part11-console.png` are this state. The
Part 11 console verifies the chain the platform writes ("INTACT · 196 entries
verified") where on an empty organisation it had said "Integrity valid" over
zero entries.

**Found with signatures in it:**

- Fixed: three "ss11.50" / "ss11.70" citations in the audit-trail detail and in
  Setup; the copy test now refuses any "ss11.<n>".
- **Open:** an SOP approval is an electronic signature, but its audit-trail row
  reads "C2c Work Approve" with no meaning and no link to the signature. The
  generic governed-action writer (`recordGovernedAction`,
  `server/routes/c2c/actions.ts`) keeps the payload — meaning and signature
  included — in `c2c_ana_actions`, linked by `ana_action_id`, and leaves the
  audit row's values empty, so the ledger has nothing to show. The authoring
  e-signature's row, written elsewhere, carries its meaning. The fix belongs in
  that writer or in the ledger read (a join on `ana_action_id`); it is core audit
  code other sessions are changing, so it is recorded here rather than made in
  passing.
- **Open:** audit-trail targets are raw ids (`qms-document:2`,
  `authoring_document:a7e1ba58-…`) — the third clause of finding 53.

## Owed

- On staging with the production image (D1), where the second factor is
  enforced at sign-in and at signing.
