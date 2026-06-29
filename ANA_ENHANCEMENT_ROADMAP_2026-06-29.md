# AnA Regulatory-Intelligence Assistant — Engineering Roadmap

> Owner: lead engineer · Branch base: `claude/ana-verify-resolve-h525wy` (note: task stated `concept2cure-v2`; the working tree is actually on `claude/ana-verify-resolve-h525wy` — **confirm you branch from the intended base before starting**) · Date: 2026-06-29

---

## 1. Executive Summary

AnA is a chat-first regulatory-intelligence assistant whose differentiating surface is the **Document Studio author → validate → verify loop**. The three committed builds harden that surface from a demo into a governed, multi-tenant product:

- **Build 1 (Version Persistence)** turns in-session-only draft history into durable, org-scoped, immutable version rows in `concept2cure_artifact_versions`. This is the **keystone build** — every high-value enhancement (Part 11 sealing, consistency-sweep-per-version, CRL pre-mortem export) depends on a persisted, hash-anchored version row to attach to.
- **Build 2 (Model/Effort Picker)** closes the L8/G7 control gap with a Fast/Balanced/Thorough effort control plus an advanced model override, riding the gateway's already-wired explicit-override path. Almost pure plumbing + UI, low risk, ships dark behind `ENABLE_MODEL_EFFORT_PICKER`.
- **Build 3 (Per-Org Studio Enablement)** lets us turn on `ENABLE_ANA_DOCUMENT_STUDIO` for named pilot orgs via `organizations.settings.features`, hydrated to the client at runtime, while the global default stays fail-closed `false`. This is the **gating prerequisite for any controlled Document Studio rollout**.

All three were independently verified as **sound**. The verifier surfaced no blocking defects but did flag concrete corrections that this roadmap folds in: RLS interaction and `NOT NULL type/category` columns (Build 1), a missing public gateway accessor and derived `label`/`recommendedEffort` fields (Build 2), and a false "same-query" reuse assumption plus the `pool`-vs-`req.db` access pattern (Build 3).

**Recommended execution order: Build 3 → Build 1 → Build 2.** Build 3 unblocks safe pilot exposure of the existing Studio; Build 1 is the data foundation the enhancement roadmap is built on; Build 2 is independent and can slot in opportunistically. The enhancement roadmap then layers segment-specific, verified-document deliverables (IVDR PER, 510(k) SE, GSPR, ODD, safety narratives, dossier consistency sweep) on top of the persistence + governance foundation, culminating in the cross-segment **Part 11 verified-and-sealed export** that converts a verification verdict into audit-grade evidence.

---

## 2. The Three Committed Builds

### Build 1 — Persist AnA Document Studio Version History

**Goal.** Replace the in-session-only `versions` array assembled in `Ana.tsx` (lines 515–542) with durable, immutable, org-scoped version rows in the existing `concept2cure_artifacts` / `concept2cure_artifact_versions` tables, surfaced in the Document Studio version dropdown.

#### Corrected implementation plan (verifier corrections folded in)

1. **Server persist (new module `artifactVersionStore.ts`).** On each `artifact_draft` with `status==='generated'`, find-or-create a `concept2cure_artifacts` row keyed on the natural key `(organization_id, project_id, ana_thread_id, title_slug)`, then append an immutable `concept2cure_artifact_versions` row at `version = max(version)+1` and bump the artifacts row's `version`/`content`/`content_hash`/`updated_at`. De-dupe on `content_hash` (SHA256) so a re-streamed identical draft is a no-op.
   - **CORRECTION (NOT NULL columns):** `concept2cure_artifacts` has `type` and `category` as `NOT NULL` **in addition to** `project_id`/`organization_id`. Mirror `artifactWriteback.ts` exactly: hardcode `type='regulatory_document'`, `category='document'` on the INSERT, or it will violate NOT NULL.
   - **CORRECTION (schema source of truth):** Follow `shared/schema.ts` (drizzle), not the `20260311` migration. The versions table also has an `updated_at` column (defaultNow, nullable) and the unique constraint is named `c2c_artifact_unique_version`. `artifactWriteback.ts`'s INSERT writes both `created_at` and `updated_at` (`$7,$7`) — copy that.
   - **CORRECTION (RLS):** `concept2cure_artifact_versions` has **row-level security ENABLED** (`20260128_concept2cure_foundation.sql`). The WHERE-clause org-scoping in the plan is correct, but confirm `getPool()`'s DB role either bypasses RLS (table owner / `BYPASSRLS`) or that policies permit these inserts/selects. `artifactWriteback.ts` uses the same `getPool()` and works, which is reassuring — but treat RLS as a verified assumption, not an unstated one.
   - **CORRECTION (concurrency, now MANDATORY):** Wrap find-or-create + insert-next-version in a transaction and take `SELECT ... FOR UPDATE` on the artifacts row to serialize concurrent same-thread drafts against `UNIQUE(artifact_id, version)`. The "retry once on unique-violation" path the original spec listed as optional is the fallback; `FOR UPDATE` is the primary fix and is **required**, not optional.
2. **Collect-then-flush, not block.** In `stream.ts`, push `{title, content, documentType, sourceTool}` into a per-turn `collectedDrafts` array declared alongside `collectedProvenance` (~L490, in scope of both the emit site L668–678 and the `runStreamPostProcessing` call at L817). Persist in post-processing so a DB failure never breaks the live draft. Emit a new SSE event `artifact_version_saved { artifactId, version, contentHash, title }` so the client can reconcile in-session drafts with their persisted numbers.
3. **Server read API.** New `GET /api/conversation-os/artifacts/:artifactId/document-versions` backed by `listDocumentArtifactVersions({ artifactExternalId, organizationId })` joining `concept2cure_artifacts → concept2cure_artifact_versions`, returning full content ordered by `version ASC`. **Do NOT reuse** the existing `/versions` route — it resolves through `artifactProposalService.ts` → `persistence.ts listAcceptedArtifactVersions` (L383–395) which hard-codes `content:''` against the proposal-acceptance table. Net-new org guard required.
   - **CORRECTION (type coercion):** `resolveContext()` returns `organizationId` as a **string** (`String(authUser.organizationId)`). `Number()` it before binding to the int-typed `organization_id` column, or the parameterized comparison is text-vs-int.
4. **Client wiring.** Extend `AnaMessage.generatedDraft` with optional `{ artifactId?, version? }`; handle `artifact_version_saved` in `useAnaChat.ts`. In `Ana.tsx`, fetch full history on mount/selection when a persisted `artifactId` exists, and make the `activeDocument` useMemo prefer persisted versions (authoritative, `v1..vN` with change descriptions) while keeping the in-session path as a fast-path fallback. `DocumentStudioPane` needs no structural change.

#### Identity decision
Natural key = `ana_thread_id` (the resolved/created `threadId` at `stream.ts` L308/L312) + a normalized `title_slug` (lowercase, trim, collapse whitespace). This matches `Ana.tsx`'s existing in-session same-title-within-conversation grouping exactly, so persisted and in-session grouping agree.

#### Files to touch

| File | Change |
|---|---|
| `server/services/ana/artifactVersionStore.ts` | **NEW.** `upsertDocumentArtifactVersion(...)` (transactional find-or-create + `FOR UPDATE`, NOT NULL `type`/`category`, SHA256 de-dupe) and `listDocumentArtifactVersions(...)` (org-scoped join). |
| `server/routes/ana-ri/stream.ts` | Declare `collectedDrafts` ~L490; push draft payloads at the `artifact_draft` emit (L668–678); pass `collectedDrafts` into `runStreamPostProcessing` (L817). |
| `server/routes/ana-ri/post-processing.ts` | Add `collectedDrafts` to context; after message persistence, call `upsertDocumentArtifactVersion` per draft (skip silently if org/project/user missing); emit `artifact_version_saved` SSE; wrap in try/catch so DB failure never blocks `post_done`. |
| `server/routes/conversation-os.ts` | Add `GET .../document-versions`; resolve ctx, `Number(ctx.organizationId)`, require org (400/403 if absent). |
| `client/.../ana/useAnaChat.ts` | Extend `generatedDraft` type; handle `artifact_version_saved` to set `artifactId`/`version` on the right message. |
| `client/.../ana/Ana.tsx` | Fetch + merge persisted versions into the `activeDocument` useMemo; keep latest-version reset on merged length. |
| `client/.../ana/DocumentStudioPane.tsx` | No structural change. Optional: `change_description` as `<option>` tooltip. |

#### DB / API changes
- **No new tables.** Tables exist with all needed columns and `UNIQUE(artifact_id, version)`.
- **Migration (preferred over JSON expression index):** new `db/migrations/20260629_ana_artifact_thread_lookup.sql` adding **nullable `ana_thread_id TEXT` and `title_slug TEXT` columns + a btree index** on them. The verifier confirms `metadata` is `json` (not `jsonb`); an expression index on a JSON column is fragile, so the explicit-columns approach is the maintainable choice.
- **Degraded path:** `project_id` is `NOT NULL` — if `streamProjectId` is null, **skip** the upsert (no row, no error); Studio still works in-session. Document this as intended, not a bug.
- **New API:** `GET /api/conversation-os/artifacts/:artifactId/document-versions` → `{ success, versions: [{version, content, contentHash, changeDescription, createdAt}] }`. New SSE `artifact_version_saved`. `artifact_draft` unchanged.
- **Verification results are NOT persisted in this build** — they remain in-session, paired by matching the in-session message to the persisted version. Persisting verification is a follow-up (needs a `verification_result` column or sibling table) and is the hinge for the Part 11 sealing enhancement.

#### Test plan (highlights)
- **Unit:** first call → `version=1` + artifacts row; second (different content) → `version=2` + bump; third (identical hash) → no-op `created:false`; assert SHA256 matches `crypto.createHash('sha256').update(content).digest('hex')`. `listDocumentArtifactVersions` returns full content, ordered ASC, returns `[]` for a different org. `title_slug` normalization groups `'IND Cover Letter'` / `'ind cover letter '`.
- **Integration:** stream a `generated` tool result → `artifact_draft` live, row exists after `post_done`, `artifact_version_saved` carries external `artifactId`+version; second rewrite → `version=2`. `GET document-versions` returns both with content; 400 with no project context; cross-tenant → empty/403.
- **Degraded:** null `projectId` → no rows, no error, Studio still renders in-session.
- **Concurrency:** two near-simultaneous drafts for the same artifact → exactly `[1,2]`, no `UNIQUE` violation surfaced (covers `FOR UPDATE`).
- **Regression:** existing DocumentStudioPane/version-dropdown and verify/resolve-loop tests stay green; verification-per-version pairing still resolves after merge.

#### Effort
**Medium — ~2–3 days.** Server store + transaction logic + read endpoint ≈ 1 day (templated on `artifactWriteback.ts`); post-processing flush + SSE ≈ 0.5 day; client merge + event handling ≈ 0.5–1 day; tests ≈ 0.5–1 day.

---

### Build 2 — Model / Effort Picker in the AnA Composer

**Goal.** Add a Fast/Balanced/Thorough effort segmented control plus an advanced model dropdown to the Composer; flow them client → body → `stream.ts` → gateway via the already-wired explicit-override path; echo the resolved model/effort in the `done` event. Gated by new `ENABLE_MODEL_EFFORT_PICKER` (default off).

#### Corrected implementation plan (verifier corrections folded in)

- **Effort model.** `EffortLevel = 'fast' | 'balanced' | 'thorough'` with `EFFORT_TO_STRATEGY = { fast:'cost_optimized', balanced:'task_based', thorough:'quality_optimized' }`. Effort is primary; a set model override pins a specific model deterministically via `selectModel`'s explicit branch (placement/entitlement still enforced at `gateway.ts:1327`).
- **CORRECTION (missing public accessor — the biggest gap).** The plan references `gw.getModels()` / `getEnabledModels` as if they exist. They **do not** — `this.models` is a private field with no public getter. **First add a ~3-line public accessor** `getModels(): ModelConfig[] { return this.models; }`. Therefore the "gateway internals untouched" claim is slightly wrong: one small additive gateway method is required. Adjust the effort estimate accordingly (still small).
- **CORRECTION (derived fields).** `ModelConfig` has **no `label` and no `recommendedEffort`** (it has `id, provider, model, contextWindow, qualityScore, costPer1kInput, costPer1kOutput, capabilities, enabled`). The `/api/claude/models` projection must **derive** `label` (from `provider-preference.ts` PROVIDER_PREFS or a hand map) and `recommendedEffort` (a qualityScore/cost heuristic). It is not a straight registry projection.
- **CORRECTION (accessor naming / which import).** `ana-intelligence.ts` should keep using its existing `getGateway()` (sync singleton, `gateway.ts:1863`), **not** `ensureGateway` (which is only exported from `ana-ri/shared.ts`, not the gateway module). `stream.ts` keeps importing `ensureGateway` from `./shared.js`.
- **CORRECTION (health filtering).** `buildModelRegistry()` already bakes `enabled = m.enabled && enabledProviders.has(m.provider)` into `this.models`, so filtering on `m.enabled` yields provider-enabled models. But **health** (`isProviderHealthy`) is private and separate — "healthy" filtering is **not achievable from outside** without another accessor. Either expose health too, or drop the "healthy" qualifier and filter on `enabled` only. Recommend: filter on `enabled` for v1; defer health-aware filtering.
- **CORRECTION (preserve `frameworks`).** The current `/api/claude/models` handler also returns a `frameworks` array (L610–617). **Preserve it** (or confirm no caller depends on `data.frameworks`) before dropping it. Keep the `{success, data}` envelope.
- **CORRECTION (precedence is a product decision).** `selectedStrategy` is `policyHint?.preferredStrategy || routingPlan.strategy` (L478). Putting user effort **above** `policyHint` is a behavioral change — `policyHint` can encode tenant/route governance. Compliance is still protected by `selectModel`'s placement checks, but **strategy-level governance is not.** Flag this for an explicit product decision before shipping; default recommendation: user effort overrides routing plan but **not** a governance-pinned `policyHint` (i.e. `policyHint?.preferredStrategy || effortStrategy || routingPlan.strategy`).
- **Thinking gate.** `thorough` may enable extended thinking even when `riskTier!=='high'`; `fast` suppresses it. Cap `budgetTokens` (reuse 10_000) and document the cost/latency trade-off.
- **`done` event.** Add `effortUsed` (additive; client handler at `useAnaChat.ts:578–580` reads it cleanly).
- **Validation.** Server is source of truth: validate `effort_level` against the enum (default `balanced`); validate `model_override` against `gw.getModels()` filtered to the tenant's enabled set, drop silently → fall back to effort strategy. Client validation is defense-in-depth only.
- **CORRECTION (deterministic mode).** When `gw.isDeterministic()` (`stream.ts:112`), selection is moot — hide/read-only the picker and have `effortUsed` reflect the deterministic substrate.

#### Files to touch

| File | Change |
|---|---|
| `server/services/ai-gateway/gateway.ts` | **NEW (verifier-required):** add public `getModels(): ModelConfig[]`. (Optional) expose health if health-aware filtering is wanted. |
| `server/services/ai-gateway/types.ts` | Add `EffortLevel` and `EFFORT_TO_STRATEGY` near `RoutingStrategy`. |
| `server/routes/ana-intelligence.ts` | Rewrite `GET /api/claude/models` (574–620) to project `getModels()` with **derived** `label`/`recommendedEffort`; add `effortLevels`/`defaultEffort`; **preserve `frameworks`** and `{success,data}` envelope; use existing `getGateway()`. |
| `server/routes/ana-ri/stream.ts` | Destructure `model_override`/`effort_level` (92–105); validate; map effort→strategy with corrected precedence (≤ `policyHint`); validate override against `getModels()`; pass `{provider, model}` to `gw.route()` (533–566); gate thinking on effort (499–502); add `effortUsed` to `done` (792–800). |
| `client/src/flags/featureFlags.ts` | Add `ENABLE_MODEL_EFFORT_PICKER` (default off). |
| `client/.../ana/Composer.tsx` | Effort segmented control (`role=radiogroup`) + Model dropdown, gated by the flag; repurpose the static "AnA 1.0 RI" chip (226–229) as the dropdown trigger; lazy-fetch `/api/claude/models`; a11y + 200ms ease-out, no emoji. |
| `client/.../ana/useAnaChat.ts` | Add `modelOverride`/`effortLevel` options; add to POST body when set; add to `send` deps; optionally read `effortUsed`. |
| `client/.../ana/Ana.tsx` | State + drill to `EmptyState` and `ChatView`. |
| `client/.../ana/ChatView.tsx`, `EmptyState.tsx` | Forward the four props to **both** Composer instances. |

#### DB / API changes
- **No DB work, no migration, no gateway-internal selection changes.**
- `POST /api/ana-ri/stream`: two optional body fields `model_override`, `effort_level`; unknown/unentitled values silently ignored (no 4xx). `done` event gains `effortUsed`.
- `GET /api/claude/models`: additive/compatible — dynamic `data.models` projection + `data.effortLevels` + `data.defaultEffort`; preserve `frameworks` and envelope.

#### Test plan (highlights)
- **Unit (server):** `EFFORT_TO_STRATEGY` mapping; `effort_level='garbage'`→`balanced`; invalid `model_override` dropped → effort strategy; valid override resolves `{provider, model}`. Models endpoint returns only enabled models + `effortLevels`/`defaultEffort`, preserves envelope & `frameworks`.
- **Unit (gateway):** `selectModel` honors explicit provider/model over strategy and respects `meetsPlacementRequirements`.
- **Integration:** `effort_level='thorough' + model_override` → `done` carries that model/provider + `effortUsed='thorough'`; no fields → identical to today. Guardrail: unentitled/unhealthy override → server drops/substitutes, emits `warning`, completes; assert no unapproved model in `done.model`.
- **Component:** picker renders only when flag on; effort `role=radiogroup`, dropdown keyboard-navigable; **both** EmptyState and ChatView forward props.
- **A11y:** accessible names, visible focus, contrast, no focus trap (run accessibility-enforcement checks).

#### Effort
**Small–medium — ~1–1.5 engineer-days.** Server ≈ 15–25 lines + a ~3-line gateway accessor + a ~40-line models-endpoint rewrite (now incl. derived fields). Dominated by Composer UI + a11y polish. Low risk — override path and the `selectedTools` prop-drill pattern already exist.

---

### Build 3 — Enable `ENABLE_ANA_DOCUMENT_STUDIO` for Specific Pilot Orgs Only

**Goal.** Turn Document Studio on for named pilot orgs via per-org `organizations.settings.features` overrides hydrated to the client at runtime, while the global `featureFlags.ts` default stays fail-closed `false`. No schema migration, no new table.

#### Corrected implementation plan (verifier corrections folded in)

1. **Storage + admin write.** Store under `settings.features: { ENABLE_ANA_DOCUMENT_STUDIO: true }`. Extend `tenantSettingsSchema` (zod, `tenant-config.ts` 18–98 — it uses `.safeParse` at L165 which **drops** unknown keys, confirmed) to add a `features` section. Prefer an **explicit `z.object({ ENABLE_ANA_DOCUMENT_STUDIO: z.boolean().optional() })`** over `z.record` so only known keys validate. Add `'features'` to the `validSections` array (322–330). Existing merge (186–198, 380–389) handles it.
2. **Server read.** Extend `GET /api/module-subscriptions/enabled` (67–89) to return a `featureFlags` map = server-side allowlist defaults (`['ENABLE_ANA_DOCUMENT_STUDIO']`, default false) with `settings.features` overrides applied for allowlisted keys only. Echo back **only allowlisted keys** so an admin can't toggle arbitrary internal flags.
   - **CORRECTION (no "same query" reuse).** `license-manager.ts getLicenseInfo()` (70–94) selects only `id, tier, industry_mode, max_users, max_projects, max_storage` — **it does NOT select `settings`.** You must add a **separate** read (`SELECT settings FROM organizations WHERE id=$1`) or extend that SELECT. The plan's "single indexed row read, already loading license / same query" premise is false.
   - **CORRECTION (use `pool`, not `req.db`).** `module-subscriptions.ts` registers **no `authMiddleware` and no `req.db`** — every handler reaches the DB via the imported `pool` (`db.js`). The new settings read must use `pool.query(...)`, not the `req.db` pattern from `tenant-config.ts`.
   - **CORRECTION (no-license branch).** The early-return at L77 returns `{ modules: [], tier: 'free' }` — it must **also** return `featureFlags` (defaults, studio off), or the client sees `undefined`.
3. **Client hydrate.** Extend `useEnabledModules` return type with `featureFlags?: Record<string, boolean>`; add `useOrgFeatureFlags()` (or fold into `usePlatformContext`) that calls `setFeatureEnabled(key, value)` per returned flag. Call it once at the **ZenApp root** (confirmed: imports `isFeatureEnabled` L69, calls `usePlatformContext` L355, already uses the runtime-mutation pattern for other flags) so hydration runs before Ana reads `isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')` (`Ana.tsx:509`). Because `isFeatureEnabled` reads a mutable module constant at render time, the `setFeatureEnabled` call must run on ZenApp's render path; when the query resolves ZenApp re-renders and Ana (descendant) re-reads L509.

**Why not entitlements/license tiers or a global flag:** a pilot is "these specific orgs regardless of tier" — a per-org settings override expresses exactly that; reusing tier would force a pricing change, and the global flag would enable Studio for everyone.

#### Files to touch

| File | Change |
|---|---|
| `server/routes/tenant-config.ts` | Add explicit `features` object to `tenantSettingsSchema`; add `'features'` to `validSections`. No handler logic change. |
| `server/routes/module-subscriptions.ts` | In `GET /enabled`: **separate `pool.query('SELECT settings ...')`**; build `featureFlags` from server allowlist + overrides; return it on both the success and the **no-license** branch. |
| `client/.../hooks/useLicense.ts` | Extend `useEnabledModules` return type with `featureFlags`; add `useOrgFeatureFlags()` calling `setFeatureEnabled` per flag (keep 5-min staleTime). |
| `client/.../ZenApp.tsx` | Call `useOrgFeatureFlags()` (or apply `setFeatureEnabled` from `usePlatformContext`) once at the shell root. |
| `client/src/flags/featureFlags.ts` | No behavioral change. Optional doc comment + exported `ORG_OVERRIDABLE_FLAGS` allowlist (server keeps its own copy — do not import client code server-side). |
| `client/.../ana/Ana.tsx` | **No change** (L509/L521 gate now reflects org-resolved flag). |

#### DB / API changes
- **No schema change.** Reuses `organizations.settings` (`json`, `shared/schema.ts:162`). Pilot enablement is a data write: merge `{ "features": { "ENABLE_ANA_DOCUMENT_STUDIO": true } }` into each pilot org's `settings`; reversible by setting false / removing the key.
- `PATCH /api/tenant-config/:tenantId/settings` (and `/settings/features`): schema extended; auth unchanged (super_admin any tenant; admin own tenant only, inline check 152–162).
- `GET /api/module-subscriptions/enabled`: response gains `featureFlags` (backward compatible).
- Pre-existing `modules` shape mismatch (license-manager returns `string[]`, client type declares `EnabledModule[]`) is **orthogonal** — don't let the new field obscure it, but it's out of scope here.

#### Test plan (highlights)
- **Server unit:** schema accepts `{features:{ENABLE_ANA_DOCUMENT_STUDIO:true}}`, strips non-allowlisted keys; per-section PATCH merges without clobbering branding/security. `GET /enabled` returns the flag true only when `settings.features` has it true; false for missing key / `features:{}` / explicit false / unknown keys; **no-license branch returns defaults**.
- **Server authz:** non-admin PATCH → 403; admin targeting another tenant → 403; super_admin any tenant → 200.
- **Client:** `useOrgFeatureFlags` → `setFeatureEnabled(..., true)` → `isFeatureEnabled` returns true; leaves false when omitted.
- **Integration (Ana):** org flag true → DocumentStudioPane renders; flag false (default) → `activeDocument` null, pane absent.
- **E2E pilot flow:** admin PATCHes pilot org → user in that org sees Studio + author→validate→verify loop; user in non-pilot org sees nothing. **Regression:** fresh/default org shows Studio OFF (proves no silent global enable). **Rollback:** setting false / removing key removes Studio for that org only.

#### Effort
**Small–medium — ~1–1.5 days.** ~30–40 lines across two server files, no migration; one hook + one ZenApp call. Bulk of effort is the test matrix (authz, default-off regression, per-org isolation) because this gates a **Part 11 surface** and must provably stay globally off.

---

### Recommended Build Order (committed builds)

**Build 3 → Build 1 → Build 2.**

| Order | Build | Rationale |
|---|---|---|
| 1st | **Build 3 — Per-org enablement** | Smallest, lowest-risk, no migration, and the **gating prerequisite** for exposing Document Studio to anyone safely. Lets us pilot the *already-built* Studio loop immediately and start gathering real-org feedback while Build 1 lands. Fail-closed default means zero blast radius. |
| 2nd | **Build 1 — Version persistence** | The **data keystone**: nearly every enhancement (Part 11 sealing, consistency-sweep-per-version, CRL pre-mortem export, all segment authoring templates) attaches to a persisted, hash-anchored version row. Medium effort and the longest pole — start it early but after Build 3 so pilot orgs exist to validate against. |
| 3rd | **Build 2 — Model/effort picker** | Fully **independent** of the other two (different files, no shared DB). Lowest coupling, ships dark behind its own flag, can be slotted in opportunistically or in parallel by a second engineer without merge contention. Lowest enhancement-roadmap leverage, so it goes last. |

Builds 2 and 3 touch disjoint surfaces from Build 1's hot files, so **Build 2 can run in parallel** with Build 1 if a second engineer is available.

---

## 3. Enhancement Roadmap

### Prioritized table

| # | Title | Segment | Client value | Effort | Dependencies |
|---|---|---|---|---|---|
| E1 | Part 11 verified-and-sealed export (sign + seal verified version) | MDX / Biotech / Pharma (cross-segment) | Converts a verification verdict into immutable, e-signed, audit-grade evidence — closes the named P0 gap | L | Build 1; e-sign manifestation contract; report-os SealedRecord/ProvenanceTrail; Build 3 for governed rollout |
| E2 | Dossier Consistency Sweep as a sealed per-version Studio artifact | Pharma | One-click cross-document RTF/IR reconciliation verdict, persisted per version | M | Build 1; `check_dossier_consistency` (built); new ConsistencyPanel |
| E3 | IVDR Performance Evaluation Report (PER) authoring + verification | MDX | Turns the multi-day Annex XIII PER transcribe-and-proofread into a verified draft proving narrative matches recorded study data | M | Document Studio live (Build 3); IVDR study/PER data; Build 1 for auditable re-gen |
| E4 | Orphan Drug Designation (ODD) request authoring + verification | Biotech | High-leverage rare-disease artifact (7-yr exclusivity) drafted to 21 CFR 316 with verified required sections | M | Build 1; `advise_special_designation` (built); 316-section required_strings constant + ODD template |
| E5 | Guided ICH E3 §16 safety-narrative batch authoring + QC | Pharma | Dozens–hundreds of SAE narratives, house-styled, fidelity-checked against CIOMS/E2B source | M | `draft_safety_narrative` + `author_docx_native` + `verify_docx_against_source` (built); batch line-listing parser |
| E6 | 510(k) Substantial Equivalence narrative + comparison table from SE-matrix | MDX | Defensible SE discussion whose predicate facts/verdicts match the analyzed matrix; avoids RTF | M | Predicate-intelligence routes; `analyze_predicate_device` (built); Document Studio live |
| E7 | GSPR (Annex I) conformity-matrix exporter | MDX | Tech-file-ready conformity table verified against the stored 23-requirement checklist | S–M | GSPR checklist data; Document Studio live; Build 1 for versioned re-export |
| E8 | Pre-IND / EOP2 briefing-book builder with reviewer-challenge pre-mortem | Biotech | Assembles the meeting briefing book and stress-tests sponsor questions against likely FDA pushback | M | `simulate_reviewer_challenges`, `run_submission_premortem` (built); RegAgencyMeeting model; briefing template |
| E9 | Build-from-template labeling authoring with USPI/SmPC section guard + currency check | Pharma | Correct PLR/QRD sectioning + deterministic label-currency gate for US/EU labeling teams | M | `build_from_template`, `advise_labeling_structure`, `review_label_currency` (built); labeling-mode toggle |
| E10 | One-turn eCTD Module 2/5 assembly + readiness verification gate | Pharma | Single audited assembled module + structural/consistency verdict before the PDUFA-clock gate | L | `assemble_ectd_module_from_artifacts`, `validate_docx`, `check_dossier_consistency` (built); ctd_section metadata |
| E11 | Verified IND module drafting + Part 11 e-sign on verified draft | Biotech | Transcription-safe IND narrative modules sealed as Part 11-defensible authoring step | L | Build 1 (hard); e-sign meaning enum server-side; ESignatureModal wiring |
| E12 | CDx claim-concordance check across drug + device dossiers | MDX | Word-for-word companion-diagnostic claim consistency across paired drug/device submissions | M | `pair_companion_diagnostic` (built); `check_dossier_consistency` cross-dossier extension; tenant linkage |
| E13 | Natural-history / external-control evidence dossier | Biotech | Defensible NH/external-control evidence base for rare-disease pivotal-trial rationale | M | `search_clinical_evidence`, `advise_rwe_design` (built); Build 2 (thorough effort) helpful |
| E14 | CRL/RTF pre-mortem sealed as exportable decision artifact | Biotech | Board-ready approval-probability + top-risk + fix-list report grounded in orphan precedent | L | `run_submission_premortem`, precedent tools (built); precedent corpus ingestion (P2 data-ops); Build 1 |

### Top 5 write-ups (selected across segments)

**E1 — Part 11 verified-and-sealed export (cross-segment, L).**
The single highest-leverage enhancement and the natural sequel to Build 1. Today `VerificationPanel` is read-only: a passing `verify_docx_against_source` verdict lives only in session memory and is never auditable evidence. This makes "verify against my source" a *governed action*. On `verification.ok === true`, render a **"Sign and seal verified version"** action that opens the existing `ESignatureModal` (manifestation: `printedName`, `dateTimeUtc`, `meaning` enum AUTHOR/REVIEWER/APPROVER, server-side enforced). On sign, persist the verified content as a `concept2cure_artifact_versions` row **plus** a `SealedRecord` (SHA256 `contentHash`, atoms, `aiDisclosed`, `sealedAt`) and a `regulatory_audit_logs` entry, reusing `registerArtifactWithGovernance`'s transaction pattern and report-os sealing types. Render a `SealBadge` + expandable `ProvenanceTrail`. Block sealing on draft/sample (`isSample`) content. This directly closes the audit's named P0 gaps ("e-signature not wired", "verification not bound to an immutable audit trail") and is what unblocks regulated customers from trusting Studio output. Hard dependency on Build 1; rollout gated by Build 3. **Run `regulatory-compliance-ux` and `accessibility-enforcement` skills on this build.**

**E2 — Dossier Consistency Sweep as a sealed per-version artifact (Pharma, M).**
FDA Refuse-to-File and EMA Information Requests are frequently triggered by the same labeled quantity (N, p-value, dose, NOAEL, shelf-life) appearing with conflicting values across Module 2 summaries and Module 5 study reports — days of manual reconciliation before a gate review. The `check_dossier_consistency` tool is **already built** (returns `clean | minor_issues | needs_review | blocker` with per-divergence severity, conflicting values, and source-artifact pointers). This wires it into the Document Studio right pane as a second verification surface (a `ConsistencyPanel` modeled on `VerificationPanel`), renders each divergence as a deep-linked red bullet with the two conflicting values, reuses the existing "Ask AnA to resolve" chat-turn loop, runs automatically after `author_docx_native`/`surgical_docx_xml_edit` returns a Module 2/5 draft, and **persists the verdict per-version against Build 1's `concept2cure_artifact_versions`** so consistency state travels with version history. High value, moderate effort, leans entirely on already-built tooling.

**E3 — IVDR Performance Evaluation Report authoring + verification (MDX, M).**
An IVD/MDX regulatory lead's single largest authoring burden is the IVDR Annex XIII PER — scientific validity, analytical performance, clinical performance — each backed by exact study numbers (LoD/LoQ/precision/CV, sensitivity/specificity/PPV/NPV/AUC-ROC + 95% CI). Today the structured numbers live in `record_analytical_performance_study` / `record_clinical_performance_study` / `create_per_document`, while the prose is hand-written in Word with no guarantee the narrative matches. This joins those three existing tools to the authoring loop: AnA pulls the PER + linked study rows, materializes section prose via `build_from_template`/`author_docx_native` with recorded numbers injected, then **auto-populates `verify_docx_against_source`'s `required_strings` with the exact performance values** so `VerificationPanel` catches any missing or mistyped figure. No new core tool — a PER template DOCX plus a data-join + `required_strings` derivation. JTBD: "Produce a notified-body-ready PER whose narrative provably matches my recorded data." Benefits from Build 1 so each regeneration after new study data is an auditable version.

**E4 — Orphan Drug Designation request authoring + verification (Biotech, M).**
A rare-disease biotech's highest-leverage early-clinical artifact: the FDA ODD request (21 CFR 316) unlocks 7-year exclusivity, tax credits, and PDUFA fee waivers, filed years before the IND/NDA — today assembled by hand or expensive consultants. This adds an "Orphan Drug Designation Request" template driving `author_docx_native` from the existing `BiotechProduct.strategy.designation`/indication/modality fields, chaining already-built tools: `advise_special_designation` (eligibility/benefit/pitfalls rationale), `search_drug_approvals` + `lookup_regulatory_precedents` (same-drug/same-disease prior-designation analysis), `search_literature` (prevalence/natural-history citations). It then runs `verify_docx_against_source` with `required_strings` set to the mandatory §316.20/316.21 section headers so `VerificationPanel` proves every required element is present before download. Reuses the full author→verify loop and the resolve loop; needs only a 316-section checklist constant and the ODD template. Depends on Build 1 so the draft + verdict survive the session.

**E5 — Guided ICH E3 §16 safety-narrative batch authoring + QC (Pharma, M).**
Safety/PV writers must produce dozens-to-hundreds of patient narratives per NDA/BLA, each on a strict ICH E3 §16 skeleton and each QC'd for missing required fields — a top labor cost and common inspection finding. This adds a Safety Narrative affordance in the Composer driving the **already-built** `draft_safety_narrative` (which drafts strictly from supplied case facts, reports missing required fields, and never invents clinical detail), pipes output into `author_docx_native` for a house-styled DOCX, then auto-runs `verify_docx_against_source` with the case-fact strings as `required_strings` so the writer gets immediate fidelity confirmation that the narrative reproduced the source CIOMS/E2B facts exactly. The tool's "missing required fields" list surfaces as an in-chat QC checklist the writer clears before sign-off; an optional batch mode over an uploaded line listing produces a set of narratives in one turn. Moderate effort, entirely on existing tools.

---

## 4. Sequencing Recommendation (for execution)

**Phase 0 — Foundations (committed builds, ~4–6 eng-days, parallelizable):**
1. **Build 3** first (~1–1.5d) — unblocks safe pilot exposure of the existing Studio; lowest risk, no migration, fail-closed.
2. **Build 1** in parallel/immediately after (~2–3d) — the data keystone; longest pole; everything downstream attaches to its persisted version rows. Land the `FOR UPDATE` concurrency fix and NOT NULL `type`/`category` columns per verifier.
3. **Build 2** opportunistically/parallel (~1–1.5d) — independent surfaces, ships dark; assign to a second engineer if available since it never contends with Build 1's hot files. Resolve the `policyHint` precedence product decision before merge.

**Phase 1 — Governance & cross-segment trust (depends on Build 1 + Build 3):**
4. **E1 — Part 11 verified-and-sealed export** (L). The flagship governance build; closes the named P0 gaps and is the prerequisite for regulated-customer confidence in every authoring template below. Run `regulatory-compliance-ux` + `accessibility-enforcement`.

**Phase 2 — Pharma high-volume wins (depends on Build 1; reuse built tools):**
5. **E2 — Dossier Consistency Sweep** (M) — immediate RTF/IR risk reduction, leans on already-built `check_dossier_consistency`.
6. **E5 — Safety-narrative batch authoring** (M) — highest labor-volume payoff, all tools built.

**Phase 3 — Segment authoring templates (parallelizable; pick by pilot-org segment):**
7. Drive by which pilot orgs land via Build 3. For **MDX** pilots: **E3 (IVDR PER)** → **E7 (GSPR exporter, S–M, cheapest)** → **E6 (510(k) SE)**. For **Biotech** pilots: **E4 (ODD)** → **E8 (Pre-IND/EOP2 briefing book)**. For **Pharma** pilots: **E9 (labeling)** → **E10 (eCTD assembly)**.

**Phase 4 — Higher-effort / data-dependent (gate on prerequisites):**
8. **E11 (verified IND module + e-sign)** and **E14 (CRL pre-mortem export)** after E1 lands the seal/provenance UI; E14 additionally gates on the **P2 precedent-corpus ingestion** data-op for credible grounding. **E12 (CDx concordance)** and **E13 (NH/external-control dossier)** as segment demand warrants.

**Cross-cutting discipline for every Phase 1–4 build:** enforce the honesty contract (`isSample`/`not_assessed` content is never sealable or exportable; AI-assisted paragraphs carry the determinism-pedigree badge), and run `microcopy-tone` + `motion-discipline` + `accessibility-enforcement` on every new Studio surface, since these all sit on a 21 CFR Part 11 regulated path.