# MDX BETA — backend progress + remaining gaps

**Branch:** `claude/audit-mdx-backend-QvnNr`. **Author:** Claude Code. **Date:** 2026-05-01.

Companion to `docs/reports/MDX_BETA_AUDIT_2026-05-01.md` (the master plan,
on `claude/mdx-beta-audit-2026-05-01`). Records what landed in this
backend-only push, and the remaining backend slices that still need to
ship for limited BETA. UI work is not in scope here — that's owned by
Claude Code per the assignment split.

## Decisions taken

1. **Demo project** — confirmed `OR-801` (510k) as the BETA seed anchor.
2. **Shadow service** — productized as a sidecar (no demo-stub flag), per
   directive.
3. **Q-Sub backend** — the Q-Sub `/api/q-sub/*` family is owned by this
   backend stream, not the backend lead's queue.

## Shipped this PR

### B3.1 — Q-Sub schema + migration

- `shared/schema/q-sub.ts`: cleaned up the DRAFT preamble, dropped a dead
  `regulatoryPrograms` import, added a `summary` column on `q_submissions`
  to back the detail surface.
- `migrations/20260501_q_sub.sql` and a mirror at
  `db/migrations/20260501_q_sub.sql` so the bash runner picks it up too.
  Tenant isolation enforced at the service layer by joining
  `regulatory_programs.organization_id`.
- `shared/schema/index.ts` re-exports the Q-Sub tables and types.

### B3.2 — Q-Sub routes

`server/routes/q-sub.ts` mounted at `/api/q-sub`:

| Method  | Path                                      | Description                                              |
|---------|-------------------------------------------|----------------------------------------------------------|
| GET     | `/api/q-sub`                              | List with filters (`type`, `stage`, `program_id`, `limit`).  |
| POST    | `/api/q-sub`                              | Create new Q-Sub (always lands in `plan` stage).         |
| GET     | `/api/q-sub/:id`                          | Detail (questions + commitments + meeting + timeline).   |
| PATCH   | `/api/q-sub/commitments/:id/rolled-in`    | Toggle commitment.rolled_in; clears actor when flipping off. |

Service: `server/services/q-sub/q-sub.service.ts` — list/detail/create
/setCommitmentRolledIn. Tenant isolation enforced inside every method by
joining `regulatoryPrograms.organization_id`. `TenantAccessError` is the
typed escape hatch, mapped to HTTP 403 at the route layer.

Audit trail: every mutation writes to `audit_logs` + the tamper-proof
chain via `auditService.logAction`. Action codes: `q_sub.create`,
`q_sub.commitment.rolled_in`, `q_sub.commitment.rolled_out`.

Tests:

- `server/services/q-sub/__tests__/q-sub.service.test.ts` — tenant gate
  tests for both write entry points; never lets a write through when the
  scope JOIN returns empty.
- `server/__tests__/routes/q-sub.test.ts` — full route-layer contract:
  validation 422s, tenant 403s, 404 on missing detail, happy paths.

### B0.1 — Demo seed

`scripts/seed-mdx-beta.mjs` (also wired as `npm run db:seed:mdx-beta`):

- 5 device programs under the `concept2cure` org with stable UUIDs:
  BX-204 (CGM), **OR-801 (orthopedic Class II — the BETA anchor)**,
  RX-340, PM-660, NM-512.
- 7 Q-Submissions covering every life-cycle stage (plan, package, await,
  feedback, integrate, plus an SRD and an SIR), all matching the
  `client/src/concept2cure/mdx/data/presub.ts` fixture so the BFF→UI
  contract is exercised end-to-end.
- Idempotent: re-running upserts by deterministic UUID and `display_code`.

What this seed deliberately does **not** create yet:

- 4 OR-801 predicates (depends on the predicate-intelligence shadow's
  storage; out of scope for the Q-Sub backend stream)
- 18 eSTAR sections in mixed states (depends on `authoring` schema; not
  Q-Sub's concern)
- 5 unread complaints (`post_market` schema; defer)

These are tracked in B0.1 follow-up — the per-domain teams own them.

### B0.2 — Predicate-intelligence shadow service productization

- **Unauthenticated ops probes**: `server/routes/_ops-predicate-shadow.ts`
  mounted at `/api/_ops/predicate-intelligence/{live,ready,info}`. The
  pre-existing `/api/predicate-intelligence/health` is gated behind
  `authenticateToken` and is unsuitable for k8s probes; the new endpoints
  fix that gap. Readiness probe enforces both `REVIEW_ADMIN_TOKEN` set and
  shadow `/predicate/health` reachable (2 s timeout).
- **Reference K8s manifest**: `infra/k8s/bff-with-predicate-shadow.yaml`
  shows the BFF + shadow as sidecars in one pod with explicit resource
  requests/limits, slow shadow liveness probe (cold-start tolerant), and
  secret-bound config.
- **Runbook**: `docs/operations/predicate-intelligence-shadow-service.md`
  documents the SLO targets, failure modes, on-call rotation, and the
  GA-graduation checklist.
- **Tests**: `server/__tests__/routes/_ops-predicate-shadow.test.ts`
  verifies the probe semantics under all four config/upstream states.

## Remaining backend slices for BETA

Listed in priority order. Each is sized so that one engineer can pick it
up cleanly.

### B5.4 — Cover letter / 510(k) summary §-pull (3-4 days)

**Current state.** `server/services/regulatory-correspondence/response-package-compiler.ts`
returns a hard-coded one-liner for `coverLetterDraft`:

```ts
coverLetterDraft: `Response package for correspondence ${input.correspondenceId} addressing ${selected.length} issue(s).`,
```

**The gap.** A real FDA cover letter pulls verbatim text from the eSTAR
sections that the response addresses — typically §3 (Indications for Use),
§6 (Substantial Equivalence), §11 (Performance Testing), and §12 (Labeling).
The compiler should:

1. Resolve `selected[].mappedCtdSections` to live `authoring_sections`
   rows for the relevant program.
2. Render a multi-paragraph cover letter from a stable template, with
   per-section blocks pulled from current section content.
3. Generate the 510(k) summary in parallel — same template engine, same
   sources, different scope (§3 + §6 + §11 + §12 in long form).

**Plan.**

- Add a `pullSection(programId, sectionId)` helper in a new
  `server/services/cover-letter/section-pull.ts`.
- Extend `compileGovernedResponseAssembly` to optionally accept a
  `programId` and synthesize the cover letter from real sections when one
  is supplied.
- Keep the deterministic-no-LLM contract (the `provenance.deterministic`
  flag must remain `true`).
- Test with a fixture program that has §3/§6/§11/§12 populated, asserting
  the compiled cover letter contains the verbatim section content with
  predictable section headings.

**Owner:** to be assigned. **Gates:** none.

### C8 / B7.1 — Tenant isolation evidence (3-4 days)

**Current state.** Each org-scoped service (evidence-sufficiency, post-
market, GSPR, q-sub) enforces tenant isolation independently. There is no
shared cross-cutting test that asserts the invariant globally.

**The gap.** BETA needs a single test suite that proves cross-customer
data leakage is impossible across all org-scoped routes. Without this,
"tenant isolation" is a story, not a guarantee.

**Plan.**

- New file: `server/__tests__/security/tenant-isolation.contract.test.ts`.
- Seed two orgs (`org-A`, `org-B`) each with one program + one Q-Sub +
  one evidence-sufficiency assessment + one post-market doc.
- For each org-scoped route family, assert four invariants:
  1. List as `org-A` returns only `org-A` rows.
  2. GET `:id` of an `org-B` resource as `org-A` returns 403/404.
  3. POST/PATCH against an `org-B` resource as `org-A` returns 403.
  4. `audit_logs` rows reflect the actor's `tenantId`, not the target.
- Wire into `npm run test:security` as a non-skippable gate.

**Owner:** to be assigned. **Gates:** none.

### C7 / B7.3 — Audit trail end-to-end coverage (2 days)

**Current state.** `auditService.logAction` is invoked from many code
paths but coverage is uneven:

- ✓ Q-Sub mutations (this PR).
- ✓ E-signature flows.
- ? Evidence-sufficiency assessments — needs verification.
- ? Post-market document creation — needs verification.
- ? `regulatory-correspondence` responses — needs verification.

**The gap.** Need an audit-log coverage map: every governed mutation
logged with the canonical action code. Missing entries break the 21 CFR
Part 11 trail.

**Plan.**

- Grep `auditService.logAction` references; map each to a route family.
- For each route family without coverage, add the log call.
- Add a test fixture that exercises every governed mutation and asserts
  one `audit_logs` row was written.
- Document the action code taxonomy in
  `docs/operations/audit-trail-coverage.md` so future code follows it.

**Owner:** to be assigned. **Gates:** none.

### B7.2 — Limited pen test scoping (1 day to scope, ~10 days to execute)

**Plan.**

- Engagement scope: BFF (auth, JWT, IDOR), e-sign API, dossier transmit,
  Q-Sub routes, predicate-intelligence proxy.
- Out-of-scope: shadow service internals (separate engagement), client-
  side React, third-party services.
- Vendor: shortlist Trail of Bits, Latacora, Doyensec. Match against
  CDRH-savvy firms.
- Deliverables: written report with CVSS-rated findings, retest after
  remediation, no-finding letter for the BETA package.

**Action.** Draft RFP, get 3 quotes, schedule before W12 to land before
limited BETA.

### B7.6 — IQ/OQ validation kit lite (3-5 days)

**Plan.**

- Author IQ template: env vars, secrets, DB connectivity, migrations
  applied, predicate shadow `/ready` probe green.
- Author OQ template: walk through the 5 BETA workflows (W1-W5) on the
  seeded OR-801 project, assert end-to-end behavior matches spec.
- Author PQ template: pre-defined load profile (10 concurrent users, 1
  hour, p99 latency targets met).
- Ship as Markdown templates that the customer's RA team can fill in for
  their own GxP — we are not the validators.

**Action.** Owner: RA consultant + this backend stream.

## Summary

This PR closes the backend-only critical-path items for B0.1, B0.2, B3.1,
B3.2, plus the audit-trail wiring for Q-Sub. Q-Sub is now demo-able
end-to-end on the seeded OR-801 project.

Five backend items remain: B5.4 cover-letter §-pull, C8 tenant-isolation
contract test, C7 audit-log coverage map, B7.2 pen-test RFP, and B7.6
IQ/OQ kit. None of them gate the next PR; UI integration (Claude Code
stream) can begin against the live `/api/q-sub/*` family today.
