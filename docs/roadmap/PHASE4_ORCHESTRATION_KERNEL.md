# Phase 4: Orchestration Kernel — Technical Specification
> **Version:** 1.0 | **Created:** 2026-02-06 | **Status:** IN PROGRESS  
> **Parent:** [CONCEPT2CURE_MASTER_ROADMAP.md](./CONCEPT2CURE_MASTER_ROADMAP.md)  
> **PR:** [#110](https://github.com/concept2cure/ClinicalSageAI-2-replit/pull/110)

---

## Purpose

Phase 4 replaces the existing stub workflow engine with a **real orchestration kernel** — a database-native work graph that:

1. Turns `core.programs` into orchestratable **workflow runs** with typed steps
2. Models step dependencies as a **DAG** (Directed Acyclic Graph)
3. Provides a **worker claim pattern** (lock → heartbeat → complete/fail)
4. Bridges to the existing **A8 batch worker** via `vault.review_batches`
5. Emits an **append-only event log** for forensic traceability (Part 11)

---

## Architecture

### Schema Overview (`orchestration` schema)

```
orchestration.workflow_templates   — versioned blueprints (code + version unique)
orchestration.step_templates       — typed steps within a template
orchestration.step_dependencies    — DAG edges (finish_to_start / start_to_start)
orchestration.workflow_runs        — instance of a template for a program
orchestration.step_runs            — instance of a step within a run
orchestration.step_run_events      — append-only audit log (immutable trigger)
```

### Entity Relationship

```
core.programs(id)
    │
    ├──▶ orchestration.workflow_runs (program_id FK, RLS anchor)
    │       ├──▶ orchestration.step_runs (A8 bridge: batch_id → vault.review_batches)
    │       │       └──▶ orchestration.step_run_events (immutable)
    │       └── status: pending → running → paused → completed | failed | cancelled
    │
    └── RLS GUC: app.current_program_id
```

### Step Types

| Type | Purpose | Worker |
|------|---------|--------|
| `task` | Generic synchronous work | Any worker |
| `gate` | Human approval checkpoint | UI + human |
| `ai_review` | AI-powered analysis | AI worker |
| `human_approval` | Explicit human sign-off | UI + human |
| `document_gen` | Generate regulatory artifacts | Doc worker |
| `batch_job` | Delegate to A8 batch queue | A8 bridge → `vault.review_batches` |
| `external_api` | Call external service | API worker |

---

## Implementation Files

### Phase 4.1 — Schema (PR #110)

| File | Purpose | Lines |
|------|---------|-------|
| `db/migrations/20260206_phase4_orchestration_kernel.sql` | Schema DDL: 6 tables, RLS, indexes, views, grants | ~547 |
| `db/migrations/20260206_phase4_seed_templates.sql` | 2 seed workflow templates (IND Intake, DOCX Gen) | ~150 |

### Phase 4.2 — Runner + API (PR #110)

| File | Purpose |
|------|---------|
| `shadow_service/shadow_service/sql_orchestration.py` | Parameterized SQL queries for all orchestration operations |
| `shadow_service/shadow_service/models_orchestration.py` | Pydantic models for API request/response |
| `shadow_service/shadow_service/orchestration_runner.py` | Core runner: start, advance, claim, complete, fail, A8 bridge |
| `shadow_service/shadow_service/router_orchestration.py` | FastAPI router: 9 endpoints under `/orchestration/` |
| `shadow_service/tests/test_orchestration.py` | Unit tests: idempotency, DAG gating, claim lock, A8 bridge |

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/orchestration/runs/start` | Start a workflow from template |
| `GET` | `/orchestration/runs?program_id=` | List runs for a program |
| `GET` | `/orchestration/runs/{run_id}?program_id=` | Get run detail + steps |
| `GET` | `/orchestration/steps/queue?program_id=` | Claimable (queued) steps |
| `POST` | `/orchestration/steps/{id}/claim` | Worker claims a step |
| `POST` | `/orchestration/steps/{id}/complete` | Mark step completed |
| `POST` | `/orchestration/steps/{id}/fail` | Mark step failed (may retry) |
| `GET` | `/orchestration/steps/{id}/events` | Step event audit trail |
| `POST` | `/orchestration/batch/complete` | A8 batch completion callback |

---

## RLS Strategy

- **Templates** are global (not program-scoped) — no RLS
- **Runs, step runs, events** are program-scoped — full RLS
- GUC: `app.current_program_id` set per-connection (transaction-local)
- Admin bypass: `app.bypass_rls = 'true'`
- Consistent with `vault.*` pattern from A8

---

## Step Lifecycle State Machine

```
                    ┌─────────┐
                    │ pending  │
                    └────┬─────┘
                         │ advance_workflow (deps satisfied)
                    ┌────▼─────┐
                    │  queued   │
                    └────┬─────┘
                         │ claim_step (worker lock)
                    ┌────▼─────┐
                    │ running   │◄── heartbeat_at refreshed
                    └────┬─────┘
                    ┌────┴─────┐
               ┌────▼──┐  ┌───▼───┐
               │completed│  │ failed │──▶ retry? → new attempt (queued)
               └────────┘  └───────┘
```

Additional terminal states: `skipped`, `cancelled`

---

## Seed Templates

### 1. IND Intake Pipeline (`ind_intake`)

Linear 4-step DAG:

```
Ingest Protocol → Extract Claims → AI Batch Review → Generate Draft Outline
     (task)        (ai_review)       (batch_job)       (document_gen)
```

- **A8 Bridge:** Step 3 creates `vault.review_batches` row, polls for completion
- **Retry policy:** 2-3 attempts per step with backoff

### 2. DOCX Artifact Generation (`docx_gen`)

Linear 2-step DAG (stubbed for Phase 5 expansion):

```
Gather Document Inputs → Render DOCX/PDF
       (task)              (document_gen)
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `program_id` as RLS anchor (not `organization_id`) | Programs are the atomic scope for regulatory work; org-level is too broad |
| Soft FK to `core.programs` | Orchestration schema can be applied before core schema exists (parallel migration) |
| Denormalized `program_id` on `step_runs` | Avoids JOINs for RLS policy evaluation (hot-path performance) |
| `batch_id` FK to `vault.review_batches` | Don't build a second queue — reuse A8 infra |
| Append-only events with immutability trigger | Part 11 forensic trail — rows are INSERT-only |
| `set_config('app.current_program_id', ..., TRUE)` | Transaction-local GUC — no session state leakage between requests |

---

## Dependencies & Interfaces

### Upstream (consumed)
- `core.programs(id)` — Domain Spine pivot point
- `vault.review_batches(batch_id)` — A8 batch worker target

### Downstream (produced)
- Workflow status for **Mission Control dashboard** (Phase 7)
- Step outputs feed **Intelligent Document System** (Phase 5)
- Event trail feeds **Compliance Audit** screens

---

## Acceptance Criteria

- [ ] Schema migration is idempotent (re-runnable)
- [ ] `start_workflow` with duplicate `idempotency_key` returns existing run (not error)
- [ ] Steps with unsatisfied dependencies remain in `pending` state
- [ ] Only one worker can claim a step (atomic `UPDATE ... WHERE locked_at IS NULL`)
- [ ] `fail_step` with retry policy creates new attempt row
- [ ] A8 bridge: `batch_job` step creates `vault.review_batches` row and links via `batch_id`
- [ ] `step_run_events` are immutable (UPDATE/DELETE raises exception)
- [ ] All queries use parameterized statements (no SQL injection)
- [ ] RLS prevents cross-program data access
