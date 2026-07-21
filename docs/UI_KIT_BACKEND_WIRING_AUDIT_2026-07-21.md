# UI-Kit → Backend Wiring Audit & Roadmap — 2026-07-21

**Scope:** Audit the Claude Design-kit install (the ui-v2 shell + ~95 surfaces) and enumerate the concrete, code-grounded tasks to get the backend fully wired to the new UI and the platform usable by real regulatory professionals for real work — **GA enterprise-grade only: no mock, no fixture-as-content, no low-level MVP stand-ins.**

**Method:** Three parallel code audits (frontend surface wiring, backend route status, platform readiness), cross-verified against code at commit `f480b73`, then reconciled by hand (the sub-audits over-claimed in two places — corrected below).

---

## Headline

The platform is **not a mock**. Auth, the Postgres/Drizzle data layer, application-level tenant scoping, and Part 11 (hash-chained audit, §11.50 e-signature, §11.10(g) signing authority) are **real and enforced**. The ui-v2 shell is the product (Phase 7 flipped `ENABLE_UI_V2` on by default; the legacy shell is deleted), and it is reachable behind a real auth gate. An active "de-fabrication" program has already replaced most invented data with real read-models or honest `null`/`501`/empty states.

**What stands between here and "a regulatory professional logs in and does real work" is NOT backend engineering depth.** It is:
1. A handful of **surface mock-writes that have a real, mounted backend already** — wire the surface to it (this is the highest-value, lowest-risk, fully-in-lane work; **shipped the first two today** — see below).
2. **Rich-fixture surfaces** whose cold-start UX is fixture-backed — a design-owned call, not a mechanical swap.
3. **Ops posture** (RLS enforcement flip, corpus ingestion, audit-default-on) and **procurement** (eCTD DTDs, eSTAR templates, LORENZ, MedDRA, gateway creds) — code seams exist and fail closed; out of a coding session's lane.

The wiring convention is already in the codebase (`client/src/concept2cure/v2/dataConnect.tsx`): the **fixture-free standard** — `useLiveData` / `useLiveRows` + honest `EmptyState` — renders real persisted data, an honest empty state, or an honest error; **never a fabricated stand-in.** 51 surfaces already use it; the remaining fixture-backed surfaces are being migrated onto it one at a time. All new wiring below MUST use this standard.

---

## Shipped today (verified: 291 vitest tests pass, full `tsc --noEmit` clean, committed + pushed)

### CMC Module 3 — specifications + batch records wired to their real governed backends (`f44237b`)

Both tabs previously did **local-only mock writes** (drafts held in component state, labelled "not yet persisted"). Both backends already existed, mounted, tenant-scoped, and Part 11-governed. Now wired end-to-end:

- **Specifications** (`server/api/cmc/specificationRoutes.ts` → `quality_specifications`): real `GET /:projectId` list, `POST` create, `PUT` update, and approval **only** through the governed `POST /:id/approve` (verifyReauth password/TOTP + hash-chained `recordGovernedAction`). Surface renders real rows, honest empty/error, honest no-project prompt; adopts the server row on write; no fabricated success.
- **Batch records** (`server/api/cmc/batchRecordRoutes.ts` → `cmc_batch_records`): real list + create + governed `POST /:id/release` (re-auth + disposition decision + hash-chained audit), with a real §11 e-signature release form (disposition / reason / password / TOTP).
- The jsonb ↔ display-column shape gap is crossed by pure, **reversible, unit-tested** mappings: `client/src/concept2cure/v2/surfaces/cmcSpec.ts`, `cmcBatch.ts` (14 new tests).

This is the template for every item in "Tier 1" below: **real DB, real §11 governance where the action is a signature, honest empty/error, no mock.**

### Admin console — API-key create + revoke wired to the real audited backend (`274d211`, fix `4ed31cc`)

The API-keys admin section rendered live keys but Create only toasted and Revoke was inert. Both are now wired to the real, mounted, audited `/api/api-keys` (`server/routes/api-keys.ts`): Create takes a name + ≥1 scope (the six `API_KEY_SCOPES`), POSTs, and shows the raw secret **once** in a reveal panel (held only in local state, never persisted or logged, cleared on dismiss); Revoke is a confirmed, audited DELETE. Honest failure on any non-2xx; the live list re-fetches. **Verified: mount tests pass, full `tsc --noEmit` clean.**

### CMC §3.2 section approval wired to the real governed endpoint (`fcecaf2`)

The section-approval action mutated local state and toasted "not yet persisted". It now POSTs the real `POST /api/cmc/module3-os/sections/:projectId/:sectionKey/approve` (`server/api/cmc/module3OperatingSystemRoutes.ts:490`), which blocks on unresolved **critical contradictions** (409 → honest message), snapshots a new **approved version**, sets `approval_state`, and writes a `cmc_provenance_events` audit entry keyed to the authenticated user. Reflects approval only on a real 2xx; honest failure otherwise. **Verified: mount tests pass.**

> **Remaining backend follow-up (well-scoped, now verifiable here):** unlike the specification-approve and batch-release endpoints, this section-approve endpoint does **not** verify §11 re-authentication (`verifyReauth`) or route through the hash-chained `recordGovernedAction` — it records the reason and keys to the authed admin, but the sign form's password/TOTP are not yet checked server-side. Add `verifyReauth` + `recordGovernedAction` to the endpoint (mirroring `specificationRoutes.ts /:id/approve`, wrapping its existing version/provenance writes in a transaction) so section approval is a full §11 e-signature consistent with specs/batch. **This is now doable at GA quality without a live DB: backend route contract tests run here** (mocked pool — e.g. `server/routes/__tests__/labeling-pi-read.test.ts` (4 pass ~0.8s), `agency-meetings-write.test.ts`, `approval-workflow.contract.test.ts`). Write a contract test asserting 401-on-failed-reauth, 409-on-critical-contradiction, and governed-action-recorded-on-success alongside the change.

---

## Tier 1 — mock-write → real, mounted backend (wire now; highest value, in-lane, verifiable)

Each has a **real, mounted** backend; the only gap is the surface calling it. Follow the CMC template. Ordered by value.

| # | Surface / action | Real backend (verified mounted) | Notes |
|---|---|---|---|
| 1 | **Admin → API keys: Create + Revoke** (`AdminSurfaces.tsx:2177,2190`) | `server/routes/api-keys.ts` — `POST /` (returns raw key **once**), `DELETE /:id` (audited). Mounted `register-document-routes.ts:460`. List already live. | Create needs `{name, scopes:ApiKeyScope[]≥1}` and a **one-time secret reveal** modal; Revoke is a scoped DELETE. Add a reload counter to the `useLiveData` deps to refresh. |
| 2 | **CMC → §3.2 section approval** (`CmcModule.tsx:259`) | Confirm/extend a governed section-approve endpoint over `cmc_module3_sections` (pattern: `specificationRoutes /:id/approve`). | If no approve endpoint exists yet, add one mirroring the spec-approve (re-auth + `recordGovernedAction`), then wire. |
| 3 | **Collab launcher: post message + add task** (`CollabLauncher.tsx:246,362`) | `POST /api/task-management/tasks` (real; TaskBoard already uses it) and `POST /api/collaboration/messages`. | Task create is a clean reuse of TaskBoard's call. Message-post + WebSocket delivery: verify the collaboration route is real before wiring; the backend notes note io.emit is stubbed. |
| 4 | **BioPathwayPanes: signed audit export** (`BioPathwayPanes.tsx:318`) | `GET /api/audit/export/signed` (referenced as real). | Verify the route exists + returns a signed artifact; wire the export button, else leave inert with an honest tooltip. |
| 5 | **Admin → Artifacts "Export all"** (`AdminSurfaces.tsx:1443`) | Needs a bulk-export endpoint; single-artifact signed export exists (`AdminSurfaces.tsx:567`). | Wire single-artifact export first (real); bulk export is a small new endpoint. |
| 6 | **eTMF file / file-essentials** (`Etmf.tsx:128,150`) | Has real write paths (`filed` toasts on failure honestly). | Confirm persistence target; timeliness/QC explicitly not yet persisted — leave honest. |

**Definition of done per item:** surface renders real persisted data + honest empty/error; writes go through the real endpoint and adopt the server row; any signature action goes through a governed `/approve`-style endpoint (re-auth + hash-chained audit); a pure mapping (if a shape gap exists) with a unit test; `tsc --noEmit` clean; the `workflowAudit` mount test still green.

---

## Tier 2 — rich-fixture surfaces (design-owned; do NOT blind-migrate)

These attempt live data but fall back to a **rich in-file fixture** (label text, negotiation diffs, catalogs) with a visible `SampleTag`. Their backend list endpoints are real, but the surface's value depends on rich per-section content that a cold-start org will not have — so a mechanical fixture-free swap **degrades cold-start UX to blank**. The GA Readiness Register scopes these as **Design/UI-owner (Plan 1.3)**. Migrate only with a design decision on the empty/cold-start experience.

- `LabelingPi.tsx` (`/api/labeling-pi` real; 17-section catalog + label text + FDA negotiation are fixture chrome).
- `SmpcLabeling.tsx` (`/api/labeling-smpc`).
- `BiopharmaProject.tsx` — biopharma / csr-workflow / regulatory-workspace (`/api/biopharma/ctd`, `/api/csr-workflow/board`, `/api/regulatory-workspace` real; program header + BLA gate cells are fixture chrome).
- `EctdCoauthor.tsx` (hardcoded tree/thread; only validation/compliance are live).
- `PdevInd.tsx` (`/api/pdev/*` real; legacy `liveGet` + `SampleTag`).
- `AuthoringEngine.tsx`, `intelligence-catalog` (`Intelligence.tsx`) — **pure fixtures, no fetch.** For "no mock", either give them a real read-model or convert to honest empty; the intelligence catalog may be legitimately static config (capability index), not data — confirm before touching.

---

## Tier 3 — stranded / orphan surfaces (verify intent before acting)

- `BioPathwayPanes.tsx` and `TranslationWorkspace.tsx` were reported as "fully-built real-data surfaces not registered in `SURFACE_VIEWS`." **Correction (verified):** `BioPathwayPanes` exports a *pane library* (no `SurfaceViewProps` surface, no default export) consumed conceptually by biopharma/regulatory-workspace; `TranslationWorkspace` likewise exports components, not a registered surface, and is imported nowhere. Registering them is **not** a one-line fix and risks shipping half-built orphans that overlap existing surfaces. Decide whether a distinct reachable `translation`/`pathway` surface is wanted before building a composed top-level wrapper.
- Dead legacy `*Route.tsx` ports under `client/src/concept2cure/{rbm,quality,communication,translation,biopharma,...}` are imported nowhere (superseded by the v2 surfaces). Safe to delete as a drift-cleanup once each is confirmed unreferenced.
- Path drift: `taskingService.ts` targets `/api/regulatory/tasks/*` while routes mount at `/api/task-management/*` (`TaskBoard.tsx:418`). Reconcile.

---

## Cross-cutting (the two primitives several Tier-1/2 items depend on)

1. **Numeric-`projectId` context.** Surfaces read the current project from `window.C2C_PROJECT` (the CMC board + the shipped CMC wiring use this). Org-scoped reads (Risk, TaskBoard) need no project. `ProjectContext.activeProjectId` is a **UUID** while some legacy endpoints want a numeric id — use `asProjectUuid()` (in `cmcSpec.ts`) to gate UUID-keyed calls; org-scoped endpoints are unaffected.
2. **Shell governed-action execution** (`V2App.tsx` `runAction` → `makeSampleActionResult`). The generic rail/⌘K action chips still return a **fabricated** Part 11 audit/hash. `/api/ai-actions/execute` is real (`AnaCommand.tsx` uses it), but the shell's `AI_ACTIONS` carry only `id/governed/verb` — **no `projectId`/`targetType`/`targetId`**, which the endpoint requires. Making the shell chips real needs (a) a **design decision** on how a generic chip resolves execution context, and (b) full-app QA of the platform's central interaction. **Recommendation:** route generic governed chips to the real command surface (`AnaCommand`, which has portfolio selection + confirm gate + real execute + audit) instead of fabricating; wire surface-local governed actions (which *do* have target context — e.g. CMC spec approve, batch release, shipped today) directly to their governed endpoints. Also make `ESignGate` (`Shell.tsx:432`) capture-and-forward real credentials (today it collects password/TOTP and discards them with a `SampleTag`).

---

## Out of a coding session's lane (tracked in `docs/GA_READINESS_REGISTER_2026-07-05.md`)

- **Ops:** flip `RLS_ENFORCE=on` (needs DB-owner query-surface validation), run the corpus ingestion sweep (`scripts/ingest-corpus.ts`), set `AUDIT_TRAIL_ENABLED=true` + provision the audit table/HMAC secret, decide CI coverage floors.
- **Procurement (seams built, fail closed):** eCTD DTDs → `assets/ectd-dtd/`, FDA eSTAR templates, LORENZ eValidator, MedDRA, ICSR E2B gateway creds.
- **DB-owner:** audit-trail consolidation, CDISC stub-table decision.
- **Design program:** the authoring UI (largest trapped-value item), sentence-traceability click-through, the Tier-2 fixture surfaces.

---

## Recommended execution order

1. Tier 1, top-down — each is a self-contained, verifiable, no-mock win on the CMC template. (Specs + batch shipped; API keys is next and its contract is documented above.)
2. Resolve the two cross-cutting primitives so the shell action flow and any project-scoped Tier-2 items can be wired honestly.
3. Take the Tier-2 fixture surfaces through the design program (cold-start UX decision), then migrate to the fixture-free standard.
4. Ops + procurement in parallel (owners outside this lane).
