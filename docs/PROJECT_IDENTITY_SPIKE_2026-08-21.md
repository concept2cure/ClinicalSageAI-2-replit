# Project-identity spike — ADR-0011 gate deliverable

**Status:** spike findings (read-only). Fulfils the four outputs ADR-0011 requires
before any execution date is committed. **Does not authorise execution** — the
re-key moves live tenant data and remains gated on human approval per ADR-0011.

- Date: 2026-08-21
- Branch surveyed: `concept2cure-v2` @ `55e5cc93` (current tip at time of survey)
- Prerequisite ADR: `docs/adr/0011-canonical-project-identity-space.md` (Proposed)
- Method: full read-only inventory of both migration lineages + every server-side
  id-coercion site. No schema or data changed.

---

## 0. Executive summary

ADR-0011's decision (converge on `regulatory_programs` uuid, freeze integer
`projects`) is sound and its premises **still hold on the current tip** (the
`ProjectHome.tsx` fork, `project_members.project_id INTEGER`, and the unpopulated
anchor are all still present; no execution has started).

Three findings change how it should be sequenced:

1. **The re-key surface is ~65 integer FK columns across ~60 tables, in two
   migration lineages that redefine ten of the same tables against each other.**
   A single big-bang migration is not viable; ADR-0006 (two lineages) must be
   resolved first or the re-key cannot be reasoned about per-environment.
2. **The `project_members` backfill is blocked on a prerequisite** — the
   `projects.regulatory_program_id` anchor is only partially populated (programs
   matched by two projects link to neither). Until the anchor is total, there is
   no integer `projects.id` to key an ownership row to.
3. **There is a safe, high-value win that needs *none* of the above** — hardening
   the ~15 id-coercion sites that today truncate a program UUID to a valid-but-wrong
   integer row. That is a fail-closed correctness fix, shippable now, no data moved.

**Recommendation:** ship the coercion hardening now (Section 5); treat the full
identity convergence as a **bridge/anchor-based staged migration** (Section 3),
explicitly gated behind ADR-0006 resolution and human approval. Revised estimate
in Section 6.

---

## 1. Deliverable 1 — the re-key surface (inventory)

### Anchor tables

| Table | PK | Type |
|---|---|---|
| `projects` | `id` | **serial/integer**; `parent_project_id` integer self-FK |
| `regulatory_programs` | `id` | **uuid** |
| `projects.regulatory_program_id` | — | **uuid, NO FK** — the only integer→uuid crossover, partially backfilled |

The type split is **clean**: every FK to `projects(id)` is integer; no uuid column
anywhere FKs to integer `projects`. So the hazard is entirely at the *application*
layer (coercion), not a mixed-type schema.

### Bucket A — integer/serial FK → `projects(id)` (must be converted)

**~65 columns across ~60 tables.** They cluster in:

- **concept2cure PM stack:** `concept2cure_artifacts`, `concept2cure_conversations`,
  `concept2cure_submission_center_items`, `c2c_submissions`, `c2c_correspondence`,
  `c2c_response_packages`, `c2c_communication_timeline_events`, `c2c_submission_packages`,
  `c2c_automation_runs`, `c2c_digests`, `c2c_blockers`, `c2c_project_work_items`,
  `project_sections`, `section_status_log`, `section_comments`, `section_dependencies`,
  `project_milestones`, `project_notifications`, `project_modules`, `project_rules`
  (`scope_project_id`), `rule_execution_log`, `project_tasks`, `project_workflow_stages`,
  `project_predictions`, `project_schedule_of_events` / `_goals` / `_revisions`
  (one **composite** FK `(project_id, organization_id)`), `project_members`
  (UNIQUE `(project_id,user_id)`), `project_visibility_settings` (UNIQUE `(project_id)`).
- **OS / governance layer:** `assumption_records`, `decision_records`,
  `governance_boundary_rules` / `_transitions`, `contradiction_links`,
  `governed_decision_transitions`, `sentinel_findings`, `risk_detections`.
- **ANA intelligence:** `ana_relational_profiles`, `ana_outcome_log`,
  `ana_project_capabilities`, `ana_client_objectives`.
- **Jobs / lineage / reporting:** `csr_build_jobs`, `csr_section_outputs`,
  `data_lineage_records`, `evidence_chain_records`, `report_program_group_projects`,
  `artifact_compute_jobs`, `bundle_execution_receipts`.
- **drizzle baseline core:** `documents`, `unified_tasks`, `communication_channels`
  / `_messages`, `fda_510k_projects` (its own PK is integer), `fda_communications`,
  `template_usage`, plus the `projects.parent_project_id` self-reference.
- **Also `INTEGER project_id` with no FK** (still re-key candidates if they mean
  `projects`): the pv_*/assumption/contradiction/resolution-orchestration/chat-store
  set (~15 tables).

**Two-lineage duplication (ADR-0006):** ten tables get an integer `projects(id)` FK
in *both* the raw-SQL `migrations/` lineage **and** the drizzle baseline
`migrations/0000_sweet_joseph.sql` — `concept2cure_artifacts`, `concept2cure_conversations`,
`project_modules`, `project_rules`, `project_tasks`, `project_workflow_stages`,
`rule_execution_log`, `sentinel_findings`, `governance_boundary_rules`/`_transitions`,
and `projects` itself. Which physical shape a given environment has is not
answerable from code today — this is the ADR-0006 problem, and it directly gates
a reliable re-key.

### Bucket B — already uuid on `regulatory_programs(id)` (no work)

~23 hard-FK columns (workbench `evidence_objects`/`program_milestones`, IVD/IVDR
surfaces, GSPR/post-market, pdev, the living-record spine `regulatory_sequences` /
`canonical_facts` / `fact_bindings` / `spine_nodes` / `spine_edges`) plus ~9
deliberately FK-free uuid soft-links (`cre_evidence_sources.client_program_id`,
`authoring_documents.client_program_id`, `project_industry_profiles.program_id`,
`vault.document_archives.program_id`, and the canonical `projects.regulatory_program_id`).

### Traps to not conflate (three *other* "program" spines)

- **`core.programs(id)` (uuid)** — the GCC `db/migrations` lineage. Dozens of
  `program_id UUID REFERENCES core.programs(id)` (one even named `project_id`). **Not**
  `regulatory_programs`; must not be swept into the re-key.
- **`cmc_projects(id)` (uuid) / `fda_510k_projects(id)` / `cer_projects(id)` (integer) /
  `ind_projects` (text)** — parallel project-like tables with their own spines.
- **Numeric non-project stores** — `evidence_claims.program_id`, `ctd_programs`,
  `program_groups`, and the mission-control/snowglobe KV document store. Legitimately
  integer; their `parseInt` is correct.

### `c2c_documents.project_id` — the one naming trap

`c2c_documents.project_id` is **uuid → `regulatory_programs(id)`** (not integer
`projects`). The name says "project"; the key is the program spine. It is already
on the target and needs no change, but any tooling that assumes `*.project_id` is
integer will mis-handle it.

---

## 2. Coercion hazard (the application-layer defect the split actually causes)

The schema split is clean; the damage happens where request ids are coerced.
Four classes, only two of which are bugs:

- **Class A — wrong-row (HIGH).** `parseInt(String(id).replace(/^proj_/,''), 10)`.
  On a program UUID `7abb…`, `replace` is a no-op and `parseInt('7abb…') = 7` — a
  *valid but wrong* `projects.id` in the same org. Silent cross-record corruption.
  Live sites: `server/routes/concept2cure.ts` (~10, e.g. `:3487,3572,3653,3674,4295,6573,…`),
  `server/routes/dossier-readiness.ts:67`, `server/routes/test-assembly.ts:150`,
  `server/services/projects/project-instructions.ts:42`.
- **Class B — uuid→0 (HIGH, isolated).** `server/routes/docx-factory.ts:435`
  `projectId: Number(programId) || 0` where `programId` **is** the
  `regulatory_programs` UUID (ownership is gated on it as a *string* at `:67,85-87`).
  `Number(uuid)` → NaN → `|| 0` writes **0**.
- **Class C — NaN miss (MEDIUM).** ~100 plain `Number(...)/parseInt(...)` on the
  integer `projects` space (operating-system, orchestration, client-intelligence,
  submission-ops, fda-forms, contentAssembly, …). A UUID from a v2 surface yields
  NaN and a silent empty result — no wrong row, but a dishonest empty state.
- **Class D — legitimately integer (NO change).** rtm-export, preclinical,
  report-os, mission-control/snowglobe KV, etc. — a different integer id-space,
  already guarded.

**The fix pattern already exists in-repo:** `server/routes/project-schedule-of-events.ts:57-62`
`getProjectId()` — `^(?:proj_)?(\d+)$` → `null` → 400 on a UUID. Class A/B/C sites
should adopt it (reject a non-integer id with 400 rather than truncate/NaN).

---

## 3. Deliverable 2 — transitional strategy

**Recommendation: bridge/anchor-based staged migration, NOT a direct big-bang re-key.**

ADR-0011 leaned toward direct re-key with the bridge as a fallback. The inventory
argues for making the bridge the *primary* transitional mechanism, because:

1. **65 columns × two lineages** cannot be converted atomically or reasoned about
   per-environment until ADR-0006 is resolved. A bridge lets the re-key proceed
   table-by-table without a schema-wide lock.
2. **The anchor already exists** (`projects.regulatory_program_id`). Completing it
   to a *total, unique* mapping is the smallest first step and is independently
   useful (it makes every existing integer row addressable by program).
3. **Each step stays revertible** — ADR-0011's own hard requirement.

Concrete sequence (each step independently revertible, none destructive until the
final freeze):

1. **Resolve ADR-0006** (canonical lineage) — or scope the re-key to the lineage a
   given environment actually runs. Without this, "which shape does prod have" is
   unanswerable.
2. **Complete the anchor.** Make `projects.regulatory_program_id` total and unique:
   backfill every live integer project to its program, and resolve the
   "matched-by-two-projects → links-neither" cases by hand. Add the FK + UNIQUE once
   clean. *This is the gating data task.*
3. **Dual-write** new project-scoped writes to both id-spaces via the anchor;
   shadow-read and diff for a soak period.
4. **Repoint routers one at a time**, each behind a contract test (expect the 60
   orphaned endpoints to hide further broken assumptions).
5. **Flip reads → freeze `projects` → deprecate in a follow-up ADR.**

**Reject** the pure direct-re-key (too coupled across 65 columns + two lineages) and
**reject** leaving the bridge permanent (keeps the "two project lists" symptom).

---

## 4. Deliverable 3 — `project_members` backfill plan

**Goal:** every live program gets an `owner` membership row so that flipping
read-side privacy locks nobody out.

**Source (clean):** `regulatory_programs.lead_user_id` (INTEGER, nullable) →
`project_members.user_id`, `role='owner'`, `status='active'`.
`regulatory_programs.created_by` is **TEXT** (not a user id) — a weaker fallback that
needs resolution; `team_members` (JSON) is a secondary roster.

**Blocker (must clear first):** `project_members.project_id` is
`INTEGER REFERENCES projects(id)`. A program UUID cannot be written to it. The
backfill therefore **cannot run until the anchor (Section 3, step 2) is total** —
every program needs a resolved integer `projects.id` to key the ownership row to.
Programs with no anchored project have no target row.

**Third representation to reconcile:** `server/services/project-sharing-access.ts`
stores members inside `project.settings.projectSharing.members` **JSON** (roles
`owner|edit|use`), separate from the `project_members` table. The backfill must pick
one canonical target (recommend the table) and reconcile the JSON, or the two access
models will disagree.

**Lock-nobody-out proof obligation (write + dry-run before execution):**
- For every non-deleted `regulatory_programs` row with a non-null `lead_user_id`,
  assert an `owner` `project_members` row exists post-backfill (via the anchor).
- Enumerate programs with `lead_user_id IS NULL` — these need a creator/`team_members`
  fallback or an explicit owner assignment; they must not silently become owner-less.
- Enumerate programs with no anchored `projects.id` — blocked set; must be zero
  before the access-control default flips.
- Diff `project_members` table vs `settings.projectSharing` JSON; reconcile
  conflicts before either becomes authoritative.

Only after all four are green may the read-side privacy default change.

---

## 5. The safe, ship-now win (independent of the migration)

Hardening the Class A + Class B coercion sites is a **fail-closed correctness fix
that needs none of the migration and moves no data.** Replace each
`parseInt(String(id).replace('proj_',''))` / `Number(programId)||0` with the
existing `getProjectId()` fail-closed pattern (reject a non-integer/UUID id with
400 instead of loading row `7` or writing `0`).

Scope: ~14 Class-A sites (`concept2cure.ts`, `dossier-readiness.ts:67`,
`test-assembly.ts:150`, `project-instructions.ts:42`) + the one Class-B site
(`docx-factory.ts:435`). Optionally ratchet Class C toward `Number.isFinite` guards.

This stops silent wrong-row/zero-row corruption immediately and is reversible,
test-backable, and safe to land on `concept2cure-v2` without ADR-0011 approval.
**Recommend doing this first, as its own change.**

---

## 6. Deliverable 4 — revised estimate

The audit's 30-day figure understates it once the two lineages and the anchor gap
are counted.

| Work | Estimate | Gate |
|---|---:|---|
| Coercion hardening (Section 5) | ~2–4 days | none — ship now |
| ADR-0006 resolution (canonical lineage) | ~1 week | prerequisite |
| Anchor completion + backfill proof (Section 3.2, 4) | ~1–2 weeks | human approval (moves data) |
| Dual-write + shadow-read soak | ~1–2 weeks calendar | approval |
| Router repointing (7 routers, contract-tested) | ~1–2 weeks | per-router review |
| Flip reads + freeze `projects` | ~2–3 days | final approval |

**Realistic total for the full convergence: 5–8 weeks**, not 30 days — and only the
first row is safe to start without ADR-0011 sign-off. Every data-moving step must
be independently revertible with a parity proof, per ADR-0011.

---

## 7. Recommendation to decision-makers

1. **Approve and ship the coercion hardening (Section 5) now** — safe, high-value,
   no approval needed for data.
2. **Do not start the identity migration** until (a) ADR-0006 is resolved and (b)
   this spike's anchor-completion and backfill proofs are written and dry-run — both
   gated on explicit human approval because they move live tenant data.
3. Promote ADR-0011 from **Proposed** to **Accepted** only alongside that approval.
