# Human Beta Program v1

Generated: 2026-04-01. Provisioning and task-handoff scope revised: 2026-10-14.

## Tester personas

1. **Founder/operator** — witnesses the actual environment, setup and continuity.
2. **Regulatory author** — creates and saves governed work in an authorized project.
3. **Independent reviewer/QA** — reviews another person's saved work and uses
   signing controls only with current authority.
4. **Restricted member** — verifies private work cannot be read or decided without
   access. For account-switch checks, use another actual account/organization to
   which the test operator is authorized.

Each actor signs in as themselves. Current organization membership, project and
record access, reviewer assignment and signing authority must be established
through existing product controls. An administrator is not independent of work
they authored, and a task or peer verdict does not replace a required signature.

## Provision the baseline before the cohort

`scripts/seed/rc-beta-seed.ts` emits a static descriptor. It performs no database
writes and does not establish the existence of `RC-BIO-001`, `RC-DEV-001`, their
artifacts or their memberships. Those labels may describe a planned cohort;
they are not record IDs or a reproducible provisioning operation.

Use the existing organization onboarding/invitations, **Projects → New project**,
**Authoring** and **Tasks → New task** controls to create authorized test records,
or select existing authorized records. Confirm the actual product, filing and
jurisdiction. Save real document text and assign the independent reviewer through
**Send for review**. Prepare an ordinary assigned task and an approval-gated task
through the existing task/workflow controls. Do not manually construct legacy
project URLs or replace persisted setup with browser storage or intercepted APIs.

The release owner records the environment URL and release, actual organization
and actor IDs, current access, program ID and displayed project name/code, saved
document/version, displayed task IDs and source records. Record a separate numeric
project ID separately when reported; it is not the program UUID. Use normal
configured sign-in and MFA. Credentials are not part of the evidence record.
Unavailable setup or a missing persona is a blocked scenario, not a passed check.

The exact setup fields and execution steps are in the
[Human Beta Checklist](HUMAN_BETA_CHECKLIST_V1.md).

## Goals by persona

- Founder/operator: complete the actual click path with retained record IDs and
  honest outcomes, without dead ends or wrong-account continuation.
- Author: save and reopen a governed document, request independent review and
  preserve organization/project context and audit visibility.
- Reviewer/QA: read the complete saved version, record only an assigned current
  verdict, follow the exact task handoff and use required native signing controls.
- Restricted member: verify refusal of private records and old-account targets,
  with no fallback to another person's or similarly titled work.

## In scope

- Canonical entry: `/` → `/concept2cure/login` → `/concept2cure`, then the existing
  Projects/workspace navigation using actual provisioned records.
- Existing Authoring saved-content review, provenance/audit and required task
  signing; existing Quality controlled-text/personal acknowledgement checks.
- **Your work → Tasks** exact-ID handoff for assigned tasks and task approvals,
  including duplicate titles, same-screen selection, hidden filters, unavailable
  targets/reads, active forms/signatures and actor/organization changes.
- Existing AnA and Vault/reference access where the correct project context is
  retained. Inventory or generated text alone does not establish readiness.

Other review/workflow queue IDs retain their existing destinations. This task
handoff grants no additional access and does not add an approval or signing path.

## Out of scope

- Legacy route-museum or `/client-portal/*` pathways and guessed project links.
- New features outside the launch catalog or the approved beta workstream.
- Treating local unit/PGlite tests, development sessions, synthetic API responses
  or static seed output as deployed human acceptance.
- Certifying production RLS, live MFA/password ceremonies, external storage or
  scanning, model qualification, regulatory validation or intended-use fitness
  from this continuity check alone.

## Evidence and go/no-go

Use the checklist's failure format and severity rubric. For each scenario record
**passed**, **failed**, **blocked** or **not executed**, the deployed release and
actual actor/org/program/document/task IDs, witnessed steps, before/after location,
retained audit/review/transition/signature/receipt IDs and evidence links. Separate
source-test, synthetic-browser and actual deployed-human results. A green CI job
is evidence about that commit and test scope, not a named user's successful run.

Pause for any S0 condition, reproducible S1 blocker or cross-project/account
leakage. The founder/release owner reviews observed evidence before widening the
cohort; missing setup, unavailable reads or unwitnessed signing cannot be counted
as successful workflow completion. The
[task setup audit](../evidence/D2-TASK-HANDOFF/2026-10-14/beta-setup-audit.md) records
why the descriptor-based instructions were corrected.

## Program duration and cadence

- Initial cohort: five business days after its baseline is provisioned.
- Daily 15-minute triage and end-of-day evidence update.
- Mid-week release-owner risk sweep.
- End-of-week founder decision to widen, continue within scope or pause.

## Issue intake format

- `id`: `BETA-YYYYMMDD-###`
- `persona`, `actor_id`, `organization_id`
- `environment_url`, `deployed_release`, `program_id`, `project_name_or_code`
- `document_id`, `task_id` and applicable retained outcome IDs
- `route_before`, `route_after`, `steps_to_reproduce`
- `expected`, `actual`, `severity`, `execution_status`, `evidence_links`
