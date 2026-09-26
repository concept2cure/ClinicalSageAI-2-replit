# VMP-001 — Validation Master Plan: Concept2Cure launch catalog

| Field | Value |
|---|---|
| Document ID | VMP-001 |
| Version | 0.2 |
| Status | **DRAFT — UNSIGNED** |
| System | Concept2Cure.RI (this repository, branch `concept2cure-v2`), launch catalog only |
| Regulatory basis | 21 CFR Part 11; FDA *Computer Software Assurance for Production and Quality System Software* (final guidance, September 2025; February 2026 update); GAMP 5 2nd ed. (risk-based, critical-thinking approach); ICH E6(R3) §4 computerised systems |
| Launch row moved | D4 — Validation package (`docs/LAUNCH_DEFINITION_OF_DONE.md`) |
| Owner | Founder (system owner) |
| Prepared by | Claude session W3a, 2026-09-21 (drafting and automated execution only) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First draft from the code base as of the evidence run. |
| 0.2 | 2026-09-26 | D6 session | §7a: the declared time source (Amazon Time Sync, through Fargate and RDS) and the one rule for audit and signature timestamps, with the clock each store uses and the chain's independence from it (security audit 2026-09-24, DP-25; plan P1-26). Unsigned. |

## 1. Purpose

This plan defines how the six launch applications of Concept2Cure.RI are shown fit for their intended use before a regulated customer files a governed document through them (row D10). It follows FDA's CSA guidance: assurance effort is proportionate to the risk a feature poses to patient safety, product quality and data integrity, and it favours evidence produced by running the real software over documentation produced about it.

Every protocol in this package is executed by a script that drives the real application (Express + React, Chromium via `playwright-core`) and writes what it observed. Nothing in this package records a pass that was not observed. Steps that could not be executed are recorded as **deviations** with the reason; steps whose expected result was not observed are recorded as **fail**.

## 2. Scope

### 2.1 In scope — the launch catalog

The system under validation is exactly the launch catalog declared in `shared/constants/launch-scope.ts` (`LAUNCH_APPS`), enforced server-side by `server/services/entitlements/navigation-entitlements.ts` when `LAUNCH_SCOPE_ENFORCE=on`:

| # | App | Surface ids | URS | OQ |
|---|---|---|---|---|
| 1 | Projects | `projects`, `project-home`, `program-journey`, `filings-catalog`, `tasks` | URS-001 | OQ-001 |
| 2 | Vault | `vault`, `artifacts-center` | URS-002 | OQ-002 |
| 3 | Authoring | `document-authoring`, `authoring-engine`, `template-library`, `review`, `regulatory-workspace` | URS-003 | OQ-003 |
| 4 | Submission Center | `submission-center`, `dossier-map`, `ectd-compile`, `ectd-coauthor`, `ectd-publishing`, `gateway-transmittals` | URS-004 | OQ-004 |
| 5 | Submission Readiness | `dispatch-readiness`, `orchestration`, `inconsistency` | URS-005 | OQ-005 |
| 6 | QMS controlled documents | `quality`, `qmp` | URS-006 | OQ-006 |

The shell and compliance surfaces that `LAUNCH_SHELL_SURFACES` keeps available (login, apps catalog, audit trail, Part 11 console, administration) are exercised where a launch app depends on them (authentication, the audit ledger) and are otherwise out of scope of this plan.

### 2.2 Out of scope

Every surface outside the catalog (the 80 surfaces the navigation payload locks with source `launch-scope`), the regulatory digital twin, the epistemic / causal / self-evolving engines, federated learning and the manufacturing digital twin (CLAUDE.md Rule 2). Model quality (PQ of any AI model) is out of scope: the launch apps are validated for their deterministic behaviour, and the governed AI path is validated only for **failing closed** when no provider is configured.

### 2.3 Environment qualified in this revision

A single local installation (IQ-001 §3): Node 22, PostgreSQL on 127.0.0.1:5432 database `clinicalsage`, the application booted with `NODE_ENV=development`, `ALLOW_DEV_AUTH=1`, `LAUNCH_SCOPE_ENFORCE=on`, no AI provider, no Redis. This is **not** the production posture (`docker-compose.yml`, `terraform/environments/production`, `.github/workflows/deploy-aws.yml`): the same protocols must be re-executed against staging once row D1 lands. IQ-001 records every difference as a numbered deviation.

## 3. CSA risk-based approach

### 3.1 Intended use and risk classification

Each requirement in URS-001…006 carries:

- **Part 11 relevance** — which of §11.10(d) access control, §11.10(e) audit trail, §11.50/§11.70/§11.200 electronic signature, or "none" the feature bears on;
- **Risk** — *high* when a failure could put wrong or unattributable content into a regulatory filing or destroy the record of who did what; *medium* when a failure disrupts the regulated process but is visible and recoverable; *low* when a failure is cosmetic or informational.

RA-001 assigns each requirement an assurance activity per the CSA guidance:

| Assurance activity | Used for | What it is here |
|---|---|---|
| **Scripted testing** | high-risk requirements, all Part 11 controls | A protocol step with a predefined action, expected result and pass criterion, executed by the runner, with the API response and (where a surface is involved) a screenshot captured |
| **Unscripted testing** | medium-risk behaviour where the failure mode is not fully known | Exploratory steps whose observation is recorded verbatim and reviewed afterwards (e.g. what the surface does when the rate limiter or an unavailable store interrupts it) |
| **Ad-hoc / observation** | low-risk, informational surfaces | A single rendering check with a screenshot; no functional assertion beyond "renders without a runtime error" |

Vendor and open-source components are not re-tested: PostgreSQL, Express, React, `pg`, `zod`, `multer`, `helmet` are treated as GAMP category 1/3 infrastructure and covered by IQ (presence, version) only.

### 3.2 Leveraging existing evidence

The repository's own gates are treated as validation evidence where they already exist and are re-listed rather than duplicated: `docs/validation/IQ_OQ_EVIDENCE_PACK.md` (generated), `npm run ci:launch-scope` and its self-test (`docs/evidence/W1/2026-09-20/`), the migration-drop-safety gate, and the 100+ Vitest/Jest suites. The CORTEX-series documents in this folder (`VMP-CORTEX-001` …) cover the AI engines, which are out of scope here, and are not superseded by this plan.

## 4. Roles and responsibilities

| Role | Who | Responsibility |
|---|---|---|
| System owner | Founder | Approves this plan, the URS and the VSR; accepts or rejects open deviations; signs |
| Qualified validation contractor | To be engaged (D4 names one) | Reviews the package for adequacy against CSA and Part 11; witnesses one re-execution; signs |
| Validation drafter / executor | Claude session (W3a) | Drafts documents from the code, builds and runs the automated protocols, records deviations. **Cannot sign.** |
| Developer | Whoever fixes findings | Resolves failed steps and open deviations under change control; the protocol is re-executed |
| Quality (future) | Named regulatory user of the pilot | Periodic review (§9) |

## 5. Deliverables

| ID | Document | Location | Produced by |
|---|---|---|---|
| VMP-001 | this plan | `docs/validation/VMP-001-VALIDATION-MASTER-PLAN.md` | drafted |
| URS-001…006 | user requirements per app | `docs/validation/URS-00N-*.md` | drafted from code |
| RA-001 | risk assessment | `docs/validation/RA-001-RISK-ASSESSMENT.md` | drafted |
| IQ-001 | installation qualification protocol + record | `docs/validation/IQ-001-INSTALLATION-QUALIFICATION.md`; record in `docs/evidence/W3/<date>/IQ/` | `npm run validation:iq` |
| OQ-001…006 | operational qualification protocols + records | `docs/validation/OQ-00N-*.md`; records in `docs/evidence/W3/<date>/OQ-<APP>/` | `npm run validation:oq` |
| TM-001 | traceability matrix | `docs/validation/TM-001-TRACEABILITY-MATRIX.md` (+ `.json`) | **generated** by `npm run validation:traceability`; never edited by hand |
| VSR-001 | validation summary report | `docs/validation/VSR-001-VALIDATION-SUMMARY-REPORT.md` | drafted from the records |
| Evidence README | what was executed and what is owed | `docs/evidence/W3/<date>/README.md` | drafted |

## 6. Acceptance criteria

The package is complete for a given environment when all of the following hold for that environment:

1. IQ-001 has no `fail` and every `deviation` is either closed or accepted in writing by the system owner in the VSR.
2. Every requirement of risk **high** in TM-001 reads **pass** (all of its scripted steps passed) in an execution against that environment.
3. Every requirement of risk **medium** reads **pass** or **partial** (passed steps plus deviations that the system owner accepted).
4. No OQ step reads **fail** without a linked change request or an accepted-risk statement in VSR-001 §6.
5. TM-001 was regenerated from the final execution records (`generatedAt` later than every `result.json` it cites) and reports no integrity problems.
6. The VSR is signed by the system owner and the qualified contractor.

The local execution in this revision does **not** meet criteria 1–4 (see VSR-001 §4); it establishes the protocols and the baseline.

## 7. Test evidence rules

- Each OQ step records: the HTTP request and response of every API call it made (secrets redacted), a full-page screenshot when it drove the browser, browser console errors during the step, the verdict, and the observed value. Files live under `steps/` next to `result.json`.
- A step depending on a step that did not pass is recorded as **not-executed**, never re-tried by hand.
- The runner never guesses credentials, never writes to the database directly, and never seeds fixtures: every prerequisite is created through the product's own API and is itself an observation.
- A 500 that the server log attributes to a missing database grant on this installation is recorded as a **deviation** referencing IQ-DEV-001 with the log excerpt attached; a 500 with any other cause is a **fail**.
- Execution records carry the git branch and commit read from `.git/HEAD` (no git command is run by the runners).

## 7a. Time source and audit timestamps

**Declared time source.** Every clock the system stamps a record with is disciplined by the **Amazon Time Sync
Service** (UTC, leap-second smeared, served to AWS compute at the link-local address 169.254.169.123): the ECS
Fargate tasks that run the API and the worker (the Fargate platform keeps the task clock synchronised to it; the
container image runs no time daemon of its own) and the RDS PostgreSQL instance (managed by AWS on the same
service). No other clock is used in the qualified environment. A local or CI run uses its host's clock and is not a
qualified environment (§2.3).

**One rule for audit and signature timestamps.** The timestamp of an audit row or an electronic signature is
generated by the computer at the moment of the write, in UTC, by the component that performs the write. It is
never accepted from a client, a request body or a header, and it is never altered afterwards: the immutability
triggers refuse the UPDATE. Where each store gets its time:

| Record | Column | Clock | Set in |
|---|---|---|---|
| `audit_logs` — the chained per-tenant trail every launch app writes | `occurred_at` | the API task's clock, read inside `writeChainedAuditRow` in the same transaction as the change it records | `server/services/auditService.ts` |
| `electronic_signatures` | `signed_at` | the API task's clock, at the signing ceremony, in the signature's transaction | `server/services/part11/signature-persistence.ts` |
| `audit.tamper_proof_log` | `event_timestamp` | the API task's clock, at the write | `server/lib/tamper-proof-audit.ts` |
| `audit_events` — client-recorded events and the legacy trail | `timestamp`, `created_at` | the database's `NOW()` in the INSERT; the client's body carries no time | `server/routes/audit-trail-routes.ts` |

Two clocks appear, the task's and the database's. Both are disciplined by the same service in the same region, and
their disagreement is bounded by that service's accuracy (milliseconds at most). **The order of the chained trail
does not depend on either clock:** `audit_logs` rows are ordered by `chain_seq`, assigned by the database inside
the tenant's advisory lock, and the verifier walks that order (`server/services/audit/chain.ts`). The timestamp is
evidence of when; the sequence is the record of what came before what. Two API tasks with skewed clocks therefore
cannot reorder or fork the chain.

**Display and export.** Timestamps are stored and exported in UTC (ISO 8601); the interface renders them in the
viewer's locale and zone; an export carries the UTC value.

**Verified at this revision** by reading the four writers and the two client-recording routes; no audit or
signature writer reads a time from a body or a header (`docs/evidence/D6/2026-09-25-p1/P1-26/writers.txt`). The
periodic review (§9) re-reads them after any change to an audit or signature writer.

## 8. Deviation handling

A deviation is numbered where it is raised (IQ-DEV-nnn in IQ-001; per-step `deviationReason` in the OQ records) and consolidated in VSR-001 §5 with one of three dispositions: **closed** (fixed and re-executed), **accepted** (system owner signs the risk statement), **open** (blocks acceptance). Environmental deviations (no AI provider, no gateway credentials, development boot posture) are expected on a local run and are closed by re-executing on staging; they are never closed by editing the record.

## 9. Periodic review and change control

- **Change control link.** Every change to code under `server/`, `client/src/concept2cure/v2/`, `shared/` or `migrations/` that touches a launch surface re-runs `npm run validation:oq` for the affected app in CI before the deploy job in `.github/workflows/deploy-aws.yml` promotes an image (to be wired under W2). The matrix is regenerated on every run; a requirement that regresses from pass to fail blocks the deploy.
- **Periodic review.** The system owner and the qualified contractor review this package every six months, or after any change to the Part 11 controls (audit chain, signature seam, access control), whichever is sooner. The review re-executes all six OQ protocols against staging and re-issues the VSR.
- **Retirement.** A surface removed from `LAUNCH_APPS` has its URS marked withdrawn and its OQ protocol archived; the matrix regenerates without it.

## 10. References

`docs/LAUNCH_DEFINITION_OF_DONE.md` · `CLAUDE.md` Rules 1–2 · `shared/constants/launch-scope.ts` · `server/startup/inline-endpoints.ts` (`/readyz`) · `server/auth/dev-auth-policy.ts` · `server/services/audit/chain.ts` · `server/routes/authoring.router.ts` · `server/routes/submissions.ts` · `server/routes/mdx-qms.ts` · `server/routes/c2c/projects.ts` · `server/routes/vault-ingest.ts` · `server/routes/c2c/project-vault.ts` · `docs/validation/IQ_OQ_EVIDENCE_PACK.md`.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
| Author (drafting only, not a signatory) | Claude session W3a | n/a | 2026-09-21 |
