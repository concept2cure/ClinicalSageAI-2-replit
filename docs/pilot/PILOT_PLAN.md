# Pilot Plan

**Concept2Cure.RI / TrialSage — First Human-Testing Pilot**

| | |
| --- | --- |
| **Document ID** | C2C-PILOT-PLAN-001 |
| **Version** | 1.0 |
| **Status** | Decided. These are decisions, not options. |
| **Owner** | Pilot Owner (founder) |
| **Companion** | `docs/pilot/PILOT_DATA_AGREEMENT.md` · `PRODUCT_READINESS_ASSESSMENT.md` |

The first time real humans touch this platform, they test **one thing, all the
way through**: authoring an IND section and taking it to a signed, exported,
audited record. Everything else in the product is available to look at; nothing
else is what we are measuring.

---

## 1 · Scope

| Decision | |
| --- | --- |
| **Testers** | 5–8. Named individuals, invited one at a time. No open sign-up. |
| **Data** | Synthetic only. No PHI, no PII, no real or confidential submissions. |
| **Primary path** | **IND authoring** — the spine, and the only path we hold to a standard. |
| **Window** | **30 days** from first tester invite to pilot close. |
| **Environment** | One dedicated pilot deployment on its own Neon database. Never shared with dev. |
| **Tenancy** | One organization per tester. Cross-tenant isolation is under test, not assumed. |

**Why IND authoring is the spine.** It is the only journey proven end to end.
`tests/golden-journeys/ind-authoring.journey.test.ts` runs 25 steps at route
level against real HS256-verified JWTs — **18 ok, 7 blocked-as-expected, 0
failed** — covering create document → create section → save (revision recorded)
→ history → revert → freeze → e-sign (author + approver) → export → durable
Part 11 audit trail, with cross-tenant reads and forged tokens rejected as
known-bad steps. That is the loop we put in front of people.

**What the journey does not prove, and we therefore treat as unproven:** token
**issuance** (login / email OTP) sits outside the journey, and the browser layer
is phase 2 — the journey exercises routes, not the UI. Both are covered below as
gates and risks, not assumptions.

---

## 2 · Entry criteria

**All five must pass before any tester is invited.** Not most. All. A failure
here is a date change, not a waiver.

| # | Gate | Proof |
| --- | --- | --- |
| 1 | `npm run pilot:go-no-go` returns **GO** | Verdict line reads `VERDICT: GO`; exit code 0. Five HARD gates green: schema provisioned (core tables **and the authoring subsystem present as a unit** — a partial subsystem is a NO-GO), no known-password demo admin, boot secrets present, SMTP/login-OTP configured, RLS posture. |
| 2 | **A real OTP reaches both external inboxes** | `npm run pilot:verify-otp -- <addr>` run **twice** — once to a Gmail address, once to an Outlook address — and the code is read out of each inbox by a human. Configuration present ≠ mail delivered; the script says so itself. |
| 3 | **`RLS_ENFORCE=on`, cross-tenant read returns zero rows** | Restart with the flag on; execute one read from org A against org B's data; record the zero-row result with a timestamp. **The system now enforces this itself**: creating a *second* organization fails closed unless `RLS_ENFORCE=on` (`server/db/tenantAdmission.ts`). The founding tenant is unaffected, so a fresh install still onboards with no configuration — but the pilot's second tenant cannot exist without row filtering. That turns "remember to flip it" into a thing you cannot forget. |
| 4 | **No known-password demo admin** | `SEED_DEMO_USER=false`; the row confirmed absent by direct query, not by config inspection. |
| 5 | **Every tester has signed the data agreement** | Countersigned `C2C-PILOT-DATA-AGREEMENT-001` on file per tester, before their account exists. |

**Before the gates — one build prerequisite.** The tester loop asks for a
section save that records a Part 11 revision *from the editor UI*. The v2 editor's
section-save to the audited backend is the last unwired slice (open work item).
The spine must be walked by hand in a browser — sign-in through export — and pass,
before gate 1 is even worth running. No hand-walk, no invites.

The two SOFT advisories (Sentry monitoring, PDF export capability) do not block
GO. They are accepted knowingly and appear in the risk register as §7 items 3 and 4.

---

## 3 · What testers are asked to do

One loop. Real, end to end, unaided. We watch, we do not coach.

1. **Sign in with OTP** — receive the code in their own external inbox and complete login.
2. **Create a project** — persisted, not a wizard animation.
3. **Author a document section** — real content, synthetic subject matter.
4. **Save it** — and confirm a Part 11 revision was recorded (who, what, when).
5. **View history** — see the revision trail, attributed.
6. **Freeze and e-sign** — set a signing PIN, freeze the document, sign as author, then as approver.
7. **Export** — produce the output artifact and open it.

Then one question, answered in writing, by every tester:

> **Is this output defensible?** If you had to hand this to a health authority
> reviewer, or defend it in an inspection, what would fail first?

That written judgment is a deliverable of the pilot, equal in weight to the
defect list. We are testing whether the record holds up, not whether the app is
pleasant.

---

## 4 · Success metrics

Six. Countable. Measured from audit rows and the defect log, not from impressions.

| # | Metric | How it is counted | Target |
| --- | --- | --- | --- |
| 1 | **Unaided loop completion** | Testers who complete step 1 → step 7 with zero help from us ÷ total testers | **≥ 75%** (6 of 8) |
| 2 | **P0 defects open at close** | Defects rated P0 in triage and not fixed or formally accepted | **0** |
| 3 | **Median time to first saved section** | Invite email timestamp → first `save-section` revision row, per tester, median | **≤ 20 min** |
| 4 | **E-sign completion rate** | Documents reaching both AUTHOR and APPROVER signatures ÷ documents frozen | **≥ 90%** |
| 5 | **Honest-empty / error states hit** | Distinct surfaces where a tester hit an empty or error state, logged individually | **Counted, not capped** — but **0** may sit on the spine |
| 6 | **Written defensibility verdicts** | Testers returning the §3 written judgment | **100%** of testers; **≥ 60%** answer defensible-with-changes or better |

Metric 5 is deliberately uncapped. Honest empty states are the designed
behavior — the platform shows real data or an honest empty/error state, never a
fake "sample data" pill. Hitting them on peripheral surfaces is information.
Hitting one on the spine is a defect.

---

## 5 · Exit criteria and stop conditions

### Stop the pilot immediately

Any one of these halts the pilot the day it is found. Access revoked (§8),
findings written up before anything is fixed.

- **Cross-tenant leak** — any read, list, export, or search returning another organization's data.
- **Data-integrity defect** — `npm run audit:verify:full` fails; a saved revision is lost or altered; a signature does not recompute from the durable section state it claims to cover.
- **Audit-trail gap** — any action in the §3 loop that completes without producing its audit row.
- **PHI or PII entered** despite the agreement — contain, purge that tenant, notify the tester, do not resume until the egress screening path is re-verified.
- **Credential or secret exposure** — any tester able to see another user's PIN, token, or secret material.

The first three are not "bugs to prioritize." They are the product's entire
claim. If one is real, the pilot's job is finished and the finding is the result.

### A successful pilot

All five, at the 30-day mark:

1. Metrics 1, 2, 4 and 6 at target.
2. `npm run audit:verify:full` clean at close.
3. Zero stop conditions triggered.
4. Every tester's written defensibility verdict collected, and every "not defensible" traced to **missing content** rather than a **missing control**.
5. A written defect ledger with every P0 and P1 closed or explicitly accepted with an owner and a date.

Anything less is a pilot that produced findings — which is a legitimate outcome,
recorded honestly, not relabeled as success.

---

## 6 · Roles and cadence

Three roles, one named owner each. In a pilot this size one person may hold two —
but never zero, and never "the team."

| Role | Owns |
| --- | --- |
| **Pilot Owner** *(founder)* | The go/no-go call, the stop-condition call, entry-criteria sign-off, final read on every defensibility verdict. |
| **Triage Owner** | Defect intake, severity assignment within 4 business hours, fix-or-defer decision, the defect ledger. Single throat for "is this a P0." |
| **Comms Owner** | Tester invitations, the agreement countersigning, daily check-ins, all outbound messages. Testers talk to one person, not a queue. |

**Cadence**

- **Daily, 15 minutes, fixed time** — triage standup. New defects, severity, anything touching a stop condition. Skipped only if there were zero events.
- **Daily, async** — Comms Owner touches every active tester once, even if only to confirm nothing is blocked.
- **Weekly, 30 minutes** — tester sync, all testers, live. What broke, what was confusing, what they would not sign.
- **Weekly, written** — a status note from the Pilot Owner: metrics to date, open P0/P1, decisions taken. Five bullets, not a report.

---

## 7 · Risk register

Top five, drawn from the platform's actual state. Every one has an owner and a
mitigation that is an action, not a hope.

| # | Risk | Why it is real | Owner | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | **Email deliverability blocks every login** | OTP is mandatory 2FA and the sharpest week-one risk. SMTP config being *present* is not delivery — sender-domain rejection, PaaS egress blocks on the SMTP port, and spam filing all produce a green config and zero logins. Token issuance is also the one part of the spine the golden journey does not cover. | Pilot Owner | Entry gate 2: prove delivery to a real Gmail **and** Outlook inbox before any invite. Verify egress from the pilot host, not a laptop. Warm one invite at a time and confirm receipt before sending the next. Keep a manual OTP-issuance fallback ready for day one. |
| 2 | **Backup and restore are unproven** | Neon PITR is a setting, not a rehearsal. A restore that has never been executed is a plan, and the first data loss is the wrong time to find that out. | Pilot Owner | §8 rehearsal completed **before the first tester's first byte**: PITR confirmed on, one real `pg_dump`, one restore into a scratch branch, both timed and written down. No rehearsal, no invites. |
| 3 | **No paging on errors** | `SENTRY_DSN` is a SOFT gate and currently unset. Without it, a tester hitting a 500 at 9pm is discovered when they mention it — or never. | Triage Owner | Set `SENTRY_DSN` and confirm a deliberately thrown test exception pages a human before day 1. Until it does, the Comms Owner's daily touch is the detection mechanism, and that is stated as such. |
| 4 | **veraPDF absent — the PDF/A gate cannot run** | The go/no-go PDF gate reports veraPDF and Chromium availability and is SOFT for a reason: without veraPDF nothing validates PDF/A conformance. The journey's proven export is XML. A PDF that looks right is not a PDF/A that passes. | Triage Owner | Scope the pilot's export claim to what is proven — export and open the artifact, no PDF/A conformance claim made to testers. Install veraPDF in the pilot image and re-run the gate; until it passes, any PDF/A question is answered "not validated." |
| 5 | **Breadth — peripheral surfaces may still be thin** | ~50 v2 surfaces were de-mocked to real data with honest empty/error states, but breadth means some peripheral surfaces will be sparse or rough. A tester who wanders off the spine and finds a dead corner may generalize from it. | Comms Owner | Direct testers to the spine explicitly and tell them plainly that peripheral surfaces are early. Log every empty/error state as metric 5 rather than as a defect — unless it sits on the spine, where it is a defect. |

---

## 8 · Rollback and revocation

### Before first data — rehearsed, not planned

Completed and written down **before the first tester signs in**:

1. Neon **PITR / branching confirmed on** for the pilot database.
2. One real **`pg_dump`** taken, stored off the pilot host, restore target identified.
3. One **restore into a scratch Neon branch**, executed and verified against table and RLS-policy counts — the same counts the installer verifies (hundreds of tables · hundreds of RLS policies · core route tables · **11/11 authoring-subsystem tables** on a clean install).
4. Both operations **timed**. The recovery-time number is a fact we know, not one we estimate during an incident.

Reprovisioning from empty is a single command —
`DATABASE_URL=… node scripts/db/install-fresh.mjs`, idempotent and safe to
re-run. It provisions the app schema, the RLS policies, **and the authoring
subsystem as an atomic unit** (the four `db/migrations/20260725_authoring_*`
files — the flagship IND loop that no path provisioned before); the installer's
final step fails loudly if any of those eleven tables is absent, so a half-built
authoring surface can never ship green. On an already-provisioned database the
same unit can be (re)applied on its own with
`APPLY_C2C_MIGRATIONS=true npm run db:apply-c2c`. A reprovision is not a
restore — only the rehearsal above gets data back.

### Two commands, and which one you want

There are exactly two supported paths, and they are not interchangeable.

| | **First provisioning** | **Every deploy after** |
| --- | --- | --- |
| Command | `node scripts/db/install-fresh.mjs` | `npm run db:migrate:deploy` |
| Runs from | a repo checkout (needs devDependencies — it shells out to `drizzle-kit`) | the production image, as a one-off ECS task |
| Against a blank DB | provisions it | **refuses, exit 3** |
| Who runs it | a human, once per database | the `migrate` job in `deploy-aws.yml`, automatically |

**Deploys migrate the database themselves now.** Before this existed there was
no production migration mechanism at all: the container command applies nothing,
the deploy workflow had zero migration steps, and the runtime image did not even
carry `db/migrations` or `scripts/db`. Schema reached a real database only when
somebody remembered to run an applier by hand — which is how *merged* and
*applied* drifted apart, and why routes shipped reading tables that were not
there. `deploy-aws.yml` now runs `scripts/db/deploy-migrate.mjs` as a one-off
Fargate task on the **same digest-pinned image** the services are about to run,
inside the same VPC as the database, and `deploy-api` / `deploy-worker` both
`needs: migrate` — a failed migration blocks the rollout instead of shipping
code onto a schema that cannot serve it.

The deploy migration deliberately **will not bootstrap a blank database**
(exit 3, and the deploy fails with the installer command in the error). Applying
the incremental set onto an empty schema would leave an island of tables with
nothing under them and let the app boot against a schema it does not own.
Absent is honest and `/readyz` reports it; half-provisioned is the state nobody
can reason about.

It also verifies, before reporting success, the same contract `/readyz` enforces
at boot: 11/11 authoring tables, 4/4 tenant-parentage FKs, and
`tenant_isolation_policy` on every one of those tables. A deploy therefore
cannot go green and then have every task fail its readiness probe.

**Proven, not asserted.** CI job `blank-db-provisioning` runs the whole sequence
against a genuinely empty Postgres on every PR: the deploy migration refuses the
blank database and creates nothing → the installer provisions it → the deploy
migration succeeds → running it a second time is a no-op → the readiness
contract is re-verified independently from `psql`.

**Retrofit onto a database that already holds authoring rows.** The unit also
installs composite **tenant-parentage** foreign keys (a child's
`(parent_id, tenant_id)` must match a real parent of the same tenant). On a
fresh or empty database these apply cleanly. If a database already holds
authoring content whose child rows point cross-tenant or dangle, the validated
`ADD CONSTRAINT` raises and the whole provisioning transaction rolls back
(fail-closed at provision time). For that case, apply the four FKs `NOT VALID`,
remediate the offending rows, then `VALIDATE CONSTRAINT` — do **not** ship
without the constraints present: `/readyz` and go/no-go gate 1 both fail closed
when the authoring tables exist but their tenant-parentage FKs do not.

### Revoking access fast

**Read this before you need it.** The obvious levers do not do what their names
suggest. An access token lives **24h** and a refresh token **7d**, and
`/api/auth/refresh` (`server/routes/auth.ts`) re-checks **organization
membership only** — not account lockout, not password state. So locking an
account or rotating its password blocks the *next password login* and nothing
else: an already-signed-in tester keeps working, and keeps minting fresh tokens
for up to seven days.

| Need | Lever that actually works | Why |
| --- | --- | --- |
| **One tester, immediately** | **Delete their `organization_users` membership row.** Then also set `locked_until` and rotate the password hash to stop re-login. | `server/middleware/auth.ts` re-checks membership on every authenticated request and fails closed (`AUTH_009`), and `/api/auth/refresh` returns 403 without it — so this kills both the live session and the refresh path. Membership is cached for **60s**, so allow up to a minute. |
| **Everyone, immediately** | Rotate **`JWT_SECRET` *and* `REFRESH_TOKEN_SECRET`**, and confirm **`JWT_SECRET_PREVIOUS` is unset**. | Rotating `JWT_SECRET` alone does **not** end every session: refresh tokens are signed with a separate secret in staging/production, so an old refresh token mints a brand-new access token under the rotated secret — and `JWT_SECRET_PREVIOUS`, if set for a rotation, keeps old access tokens valid by design. |
| **One specific token** | `revokeToken()` — `server/services/token-revocation.ts` (Redis-backed, in-memory fallback). | Durable per-token revocation. Useful when you know the exact token; not a substitute for the membership lever. |
| **Block signing only** | Set `users.status` to `suspended`. | Part 11 signing refuses a non-active user. **This does not block login today** — never use it alone to revoke access. |

**Known gap, accepted for this pilot:** there is no one-command "revoke this
user's sessions" primitive. Membership deletion is the working equivalent and is
what this runbook uses. Rehearse it once, on a throwaway account, before the
first tester is invited — a revocation lever you have never pulled is not a
lever.

Stop-condition response order: **snapshot the database first → then revoke
(membership row, or both secrets for a global kill) → then investigate.**
Evidence before remediation; a rotation you perform first can destroy the
session state you needed to understand what happened.

---

## 9 · Data handling

- **Synthetic only.** Enforced by the signed agreement, backed by automated PHI/PII screening on AI-gateway egress. The screening is a safeguard, not permission.
- **Pilot data and audit logs are deleted no later than 90 days after pilot close.** Decided policy. Not negotiable per tester, not extended by convenience.
- **Deletion is a scoped purge of the pilot dataset**, not selective erasure. Part 11-style immutable, tamper-evident records mean individual entries cannot be picked out mid-pilot — by design.
- **Third-party AI processing** — tester input reaches Anthropic and OpenAI endpoints through the AI gateway. Disclosed in the agreement, before the account exists.
- **The pilot database is separate.** No pilot data in dev. No dev data in the pilot.

---

## 10 · Close-out

Within five business days of day 30:

1. Final metrics table, all six, actuals against targets.
2. Defect ledger closed — every P0 and P1 fixed or accepted with owner and date.
3. All eight written defensibility verdicts, collected verbatim.
4. Final `npm run audit:verify:full` result, recorded.
5. **The purge date set and calendared** — pilot close + 90 days — and the actual close date written into `PILOT_DATA_AGREEMENT.md` §4.
6. One page: what we proved, what we did not, what ships next.

---

*Concept2Cure, Inc. — Pilot Plan, Document ID C2C-PILOT-PLAN-001, v1.0. Governs a
non-production pilot of pre-production software. Not a validation, certification,
or claim of regulatory compliance.*
