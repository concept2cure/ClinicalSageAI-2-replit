# Handoff to Design — Client Segmentation, Capability Taxonomy & Filing Spines

> [!CAUTION]
> **RETRACTED AS EVIDENCE — 24 July 2026.**
> This brief is a historical record of what was believed on its authoring date. It is
> **not** evidence of what the code does and must not be cited as a reason to build,
> skip, or scope anything. At least one brief in this set was materially wrong about a
> live subsystem (`HANDOFF_TO_DESIGN_document_authoring.md` §2 — see
> `_sync/CLAUDE_DESIGN_MASTER_WORK_ORDER_2026-07-24.md` §0.1).
>
> Verify every claim below against the code at the head of `concept2cure-v2`, or treat
> it as an open question. Authoritative scope lives in
> `_sync/CLAUDE_DESIGN_MASTER_WORK_ORDER_2026-07-24.md`.

**Date:** 2026-06-23
**From:** Claude Code (platform/contract enablement)
**To:** Claude Design / UI team
**Scope:** How clients are segmented, how segment drives the UI, how every capability is classified (AnA tool vs service vs surface), the per-segment filing spines, and the concrete UI patterns each implies.
**Companion docs (still current):** `GLOBAL_UI_READINESS_ADVISORY_2026-06-17.md`, `HANDOFF_TO_DESIGN_document_authoring.md`, `HANDOFF_TO_DESIGN_global_ri.md`, `FEATURE_INVENTORY.md`, `GA_GAP_AUDIT_2026-06-10.md`.

Everything below is grounded in code with `file:line` citations so it can be verified against the repo. No UI was built; this is the contract + design-intent layer the components sit on.

---

## 0. The five things for design to internalize

1. **Segment is a *scope + entitlement + AI-context* selector, never a nav variant.** Build **one** left rail. Do not fork navigation per industry. (§2)
2. **A "capability" is rarely one thing.** Most are simultaneously an AnA tool, a REST service, *and* sometimes a surface. Design must render the same capability in three places consistently. (§3)
3. **Trust is a first-class visual.** Every AnA output carries a 4-level determinism pedigree. The badge is not decoration — it changes how a regulated user is allowed to rely on the output. (§4)
4. **A filing is a stepper.** Each segment has a canonical, code-defined stage sequence. One reusable stepper component, fed by per-segment constants, covers device/IVD/IND/NDA. (§5)
5. **Two segments are sold ahead of their UI:** CRO multi-sponsor and Academic. The data models exist; the workspaces do not. (§2.3, §8)

---

## 1. Canonical client segmentation

### 1.1 The authoritative enum

`IndustryMode` is the single source of truth — 7 values.

- Type: `client/src/concept2cure/types/workspace.ts:23-30`
- Array: `client/src/concept2cure/zen-app-constants.ts:241-249` (`INDUSTRY_MODES`)
- Normalizer (defaults to `biotech`): `zen-app-constants.ts:251-255` (`normalizeIndustryMode`)

```ts
type IndustryMode =
  | 'biotech' | 'pharma' | 'cro' | 'medtech'
  | 'academic' | 'regulatory' | 'medical_writing';
```

### 1.2 The signup→industry mapping (8 → 7)

Users pick from **8** `organizationType` options at signup, which collapse into the 7-value enum.

- Options: `client/src/concept2cure/auth/ZenSignup.tsx:109-118`
- Mapping: `ZenSignup.tsx:233-242`

| Signup `organizationType` | → `IndustryMode` |
|---|---|
| Pharmaceutical Company | `pharma` |
| Biotechnology Company | `biotech` |
| Medical Device Company | `medtech` |
| Contract Research Organization | `cro` |
| Regulatory Consulting | `regulatory` |
| Government / Regulatory Agency | `regulatory` |
| Academic / Research Institution | `academic` |
| Other | `medical_writing` |

> **Design note:** two distinct signup intents ("consulting" and "government") collapse to `regulatory`, and "Other" silently becomes `medical_writing`. If the welcome/first-run screen ever echoes the chosen segment back to the user, echo the **signup label**, not the normalized `IndustryMode` — otherwise a government user is told they're "regulatory" and an "Other" user is told "medical writing," which reads as a bug.

### 1.3 Direct answers

- **Biotech ≠ Pharma — split.** Distinct first-class values (`workspace.ts:24-25`), distinct data models, distinct AI context. (Pricing currently aliases pharma — `server/services/billing.ts:158-296`.)
- **CRO — first-class** (`workspace.ts:26`) with model `CROClient` (`workspace.ts:218-235`).
- **IVD / Diagnostics — NOT a segment.** `diagnostics` is a `TherapeuticArea` (`workspace.ts:64`); `IVDR` is a `SubmissionType`. Both live **under `medtech`**. There is no `MedtechProduct`/`DeviceProduct` interface — medtech reuses `BiotechProduct` with `therapeuticArea: 'medical_device' | 'diagnostics'`.
- **Academic — first-class** value, but thinly modeled (own pricing band ~$149/user, AI-context blurb, no product interface).

### 1.4 ⚠️ Two parallel segment axes (reconcile before building segment-aware UI)

There is a **second, finer-grained** company taxonomy used server-side for org-context prompt templates:

- `server/services/industry-context-templates.ts:16-22` — `CompanyType = 'biotech' | 'pharma' | 'medical_device' | 'combination_product' | 'cell_gene_therapy' | 'biosimilar'`

This is **not** the same axis as `IndustryMode` (it splits modality — cell/gene, biosimilar, combination — but drops cro/academic/regulatory/medical_writing). **Design should treat `IndustryMode` as canonical for nav/scope/entitlement, and `CompanyType` as a content-template detail inside the org profile.** Flag for PM: these will drift; pick one as the contract.

### 1.5 Per-segment data models

`client/src/concept2cure/types/workspace.ts`:
- `BiotechProduct` (75-103) — modality, indication, IND program, designations, milestones.
- `PharmaPortfolio` (125-138) — therapeutic-area units, global products, PDUFA dates, commitments.
- `CROClient` (218-235) → `CROProject` (240-260) — MSA, SOW, deliverables, milestones, billing.

---

## 2. How segment drives the UI

### 2.1 The principle: scope + entitlement + AI-context, NOT nav

`industryMode` is read into `ZenApp` (`ZenApp.tsx:350-354`, `:1902-1905`) but **no component renders conditionally on it.** The rail is identical across all 7 segments.

| What segment **changes** | Where |
|---|---|
| AnA prompt guidance (pathway emphasis) | `server/services/lumen-context-builder.ts:527-535` |
| Module entitlement (gating by `metadata.industries[]`) | `server/services/license-manager.ts:126,139,205` |
| Default submission type on new project | `server/services/module-intelligence.ts:1494-1497` |
| Pricing band | `server/services/billing.ts:158-296` |

| What segment **does NOT change** |
|---|
| Left-rail nav, surface visibility, workspace layout, document/CTD defaults, any component render path |

### 2.2 Design implications

- **One rail, data-driven from the registry** (`shared/constants/ui-surface-registry.ts`, 4 tiers: global / project / specialist / admin). Project-tier surfaces stay hidden until a project is active, with a project switcher above them (`FEATURE_INVENTORY.md §7`).
- **Express segment as ambient context, not structure.** A small, persistent **segment chip** (e.g. in the org/tenant switcher area) tells the user which lens they're in. It drives *defaults* (the new-project submission type, AnA's emphasis) — it must not hide or reorder nav.
- **Entitlement gating is the only place segment removes capability.** When a module isn't entitled for the org's industry+tier, render the **locked-module card** (§7.2), never a hidden or dead item.

### 2.3 CRO multi-sponsor — modeled, NOT built

The hierarchy CRO → Client → Program → Study is fully typed (`workspace.ts:218-260`), documented (`docs/.../cro_client_architecture.md`), and the server returns a client list (`server/services/.../workspace-summary.ts:230`, table `cro_clients`). **But there is no sponsor switcher and no per-sponsor scoping in the client.** All projects render regardless of selected client. The only real multi-program aggregation is generic org-scoped portfolio + drift (`server/routes/ind-lifecycle/submission.routes.ts:94-143`).

**Design advice when this is prioritized:**
- Add a **sponsor/client switcher** at the *top* of the project tier (peer of the project switcher, one level up): `CRO org ▸ Client ▸ Program ▸ Study`.
- Treat the active client as a **hard scope filter** on projects, tasks, submissions, and AnA context — mirror the existing `x-organization-id` header pattern with an active-client dimension.
- A CRO **portfolio home** (distinct from project-home): utilization, revenue/recognized vs invoiced (`CROClient.contractValue/invoiced/recognized`), SOW/deliverable status, deadline radar across sponsors, change-order queue.
- Strict visual tenant isolation — never let one sponsor's data bleed into another's view; the per-row `cro_id`/`client_id` RLS is the backstop, the UI must match it.

---

## 3. Capability taxonomy — tool vs service vs surface

### 3.1 The categories are NOT mutually exclusive

The platform's design is **"one deterministic engine, exposed simultaneously as a REST service, an AnA tool, and (when it needs its own workspace) a surface."** Designers will render the *same* capability in up to three places — they must look and behave consistently.

**The rule the codebase uses (verified):**
- **(b) Service** — the engine in `server/services/<domain>/`. Every capability has one. The substrate.
- **(a) AnA tool** — LLM-callable **iff** it has a spec `{name, description, input_schema}` in `server/services/ana/AnaToolDefinitions.ts` (or `server/services/global-ri/ana-tools*`) **and** a dispatch case in `server/services/ana/AnaToolExecutor.ts`. The registry holds ~130+ specs (`name:` entries span `AnaToolDefinitions.ts:21`→`:3263`) plus 41 global-RI specs.
- **(c) Surface** — iff it has a `layoutMode` (`zen-app-constants.ts`) + a row in `ui-surface-registry.ts`.

Per-surface tool exposure for the slash menu / "Ask AnA" chips comes from each surface's `anaToolFamilies` (registry) and `SUBMISSION_WORKSPACES.anaTools` (`shared/types/submission-ui.ts`).

### 3.2 Classification matrix (corrected & verified)

a = AnA tool · b = service · c = standalone surface · ~ = partial / shares another surface

| Capability | a | b | c | Evidence |
|---|:--:|:--:|:--:|---|
| Truth engine | ✓ | ✓ | – | tools `trace_provenance` (`AnaToolDefinitions.ts:3224`), `check_consistency` (:3238); svc `truth-engine-service.ts`; renders in Submission Center *validation* workspace |
| Shadow review | ✓ | ✓ | – | tools `run_shadow_review` (:3089), `simulate_reviewer_challenges` (:2291); svc `shadow-review-service.ts`; *shadow-review* workspace |
| Dispatch gate | ✓ | ✓ | – | tool `dispatch_qc_check` (:3202); svcs `ind-lifecycle/ind-dispatch-gate.ts`, `ectd/dispatch-gate.ts`; *dispatch* workspace + e-sign |
| Deep research | – | ✓ | ✓ | **no tool — it's a mode**; svc `deep-research-orchestrator.ts`; surface `layoutMode:'deep-research'` |
| Precedent intelligence | ✓ | ✓ | ✓ | tools `lookup_regulatory_precedents` (:2171), `mine_precedents` (:1670), `compare_submission_against_precedent` (:2220); `/api/precedent-engine`; surface `precedent-intelligence` |
| Predicate intelligence | ✓ | ✓ | ~ | tool `analyze_predicate_device` (:1438); `/api/predicate-intelligence` (proxy to shadow svc); renders in 510(k) workbench / shares precedent surface |
| CDISC / SEND validation | ✓ | ✓ | – | tool `review_send_readiness` (:4048-4051, "deterministic SEND (CDISC) gate"); svcs `server/services/cdisc/*`; `/api/cdisc-validation` (under artifacts-center) |
| Biostatistics | ✓ | ✓ | ✓ | tools `compute_sample_size` (:1706), `compare_statistical_scenarios` (:1826), `narrate_statistical_result` (:245), `simulate_study_design` (:1224); `/api/biostat`,`/api/ana-biostats`; surface `biostatistics` |
| Safety / PV narrative | ✓ | ✓ | ✓ | tools `draft_safety_narrative` (:490), `advise_pharmacovigilance` (:341); `/api/pharmacovigilance`; surface `safety-narrative` |
| Global-RI capabilities | ✓ | ✓ | ✓ | 41 `GLOBAL_RI_TOOL_SPECS` (`global-ri/ana-tools.ts:32`) + `dispatchGlobalRiTool()`; `/api/global-ri` + `GET /catalog`; surface `intelligence`. **Gold standard**, all `deterministic_registry` |
| Contradiction detection | ✓ | ✓ | – | tools `check_dossier_consistency` (:1895), `check_consistency` (:3238); svc `ana/evidence-contradiction-detector.ts`; inline in authoring/review intelligence pane |
| Report engine | ~ | ✓ | ✓ | svc `intelligent-report-engine.ts`; `/api/intelligent-reports`,`/api/haq-manager`; surface `report-engine`. Sealing exposed via tool `render_signature_manifestation` (:968); report *generation* is not a tool |
| Evidence / RAG search | ✓ | ✓ | ✓ | tools `search_clinical_evidence` (:21), `search_connected_repositories` (:100), `project_knowledge_search` (:914), `search_document` (:1493); `/api/corpus`,`/api/evidence-search` (OpenSearch); renders in `vault` |

### 3.3 The three rendering archetypes (design patterns)

The matrix collapses into **three patterns**. Build a component family for each, not per-capability.

1. **Surface capabilities** (own workspace): global-RI, biostatistics, safety-narrative, precedent, deep-research, report-engine, vault/RAG. → Full surface + the AnA rail offers its tools via `anaToolFamilies`.
2. **Embedded-gate capabilities** (no own surface; render inside another workspace's intelligence pane or as a governed action): truth engine, shadow review, dispatch gate, contradiction detection. → These are **panels and buttons inside Submission Center / authoring / review**, plus AnA tools. Never give them a top-level nav item.
3. **Mode capabilities** (a surface but not a tool): deep research. → The AnA rail switches *mode* (`standard / deep-research / nano-banana`), and the surface shows the long-running job. Don't model it as a slash-tool.

> **Consistency mandate:** a capability invoked from chat (tool), from a workflow button (service), and from its surface must produce the **same result object and the same pedigree badge**. The provenance/seal UI (§6) and pedigree badge (§4) are shared components, imported everywhere the capability appears.

---

## 4. The determinism-pedigree badge — a required, shared visual

Every AnA tool output is tagged by a pure classifier so the UI can show **how much the user is allowed to rely on it.** This is the single most important regulated-UX primitive in the product.

- Source: `server/services/ana/tool-pedigree.ts`
- Enum (`:38-42`): `deterministic_registry | deterministic_query | external_api_live | model_assisted`
- Descriptors with trust + guidance copy (`:63-94`)
- Classification precedence (`:115-119`): global-RI tool names → `deterministic_registry`; `search_*` → `external_api_live`; **everything else → `model_assisted`** (conservative default — never over-claims).

### 4.1 Badge spec (design)

| Pedigree | Trust | Deterministic | Badge intent | Suggested copy (chip) |
|---|---|---|---|---|
| `deterministic_registry` | high | yes | strongest — rule/registry, reproducible | "Registry-grounded" |
| `deterministic_query` | high | yes | strong — governed internal data | "Data-grounded" |
| `external_api_live` | medium | no | authoritative but time-varying — show source + recency | "Live source" |
| `model_assisted` | requires_verification | no | advisory — must verify against a primary source | "AI-assisted · verify" |

**Design rules:**
- Use the `PEDIGREE_LEVELS[...].guidance` string verbatim as the tooltip/expander — it is legally-reviewed caveat copy (`tool-pedigree.ts:63-94`). Do not paraphrase.
- **Color-never-alone** (`accessibility-enforcement`): pair every badge with an icon + text label, not color alone. Two "high-trust" levels should be visually distinguishable (registry vs data) but clearly a family.
- The badge sits on: AnA message bubbles, every "Ask AnA about this" result, generated draft blocks, and any value the user might cite. A `model_assisted` paragraph must be **visually weaker** than a `deterministic_registry` fact — the user should never cite them with equal confidence.
- Render the badge in `microcopy-tone` register: factual, no exclamation, no "Verified!" cheerleading.

---

## 5. Filing-building spines per segment

Each segment follows a code-defined stage sequence. **Build one reusable `FilingStepper` fed by per-segment constants** — do not hand-build four steppers.

### 5.1 Device 510(k) — 8 stages
`shared/constants/mdx.ts:76-85` (`STAGE_LABELS`):
`Intake → Classify → Predicate search → Performance Testing → Substantial Equivalence → Assemble eSTAR → Submit → Cleared`

| Stage | Route / service | AnA tool |
|---|---|---|
| Classify | `/api/fda510k-unified` | `lookup_fda_guidance` |
| Predicate search | `/api/predicate-intelligence/candidates\|analyze` | `analyze_predicate_device` |
| Substantial Equivalence | `/api/substantial-equivalence/evaluate` (`evaluateSubstantialEquivalence`) | — (SE matrix panel) |
| Assemble eSTAR | `pathway-engines/estar/estar-mapper.ts:86 mapToEstar` | — |
| Submit | `/api/submission-ops` (`validateEctdLeafs`) | submission tools |

**De Novo:** same spine, branches at Classify; `estar-mapper.ts:68-72 SLOTS_DE_NOVO` adds classification-request + special controls.

### 5.2 PMA — 10-phase grid
`client/src/concept2cure/mdx/data/pma.ts:31-42`:
`Pre-submission → Preclinical → IDE → Mfg validation → Pivotal → Labeling → Module assembly → Advisory panel → Approval → Post-approval studies`; assembled via `pathway-engines/pma/pma-mapper.ts:82 mapToPma`.
> The 7-stage device timeline maps onto this 10-phase grid (`PmaSurface.tsx` `KIT_TO_PMA`). Design the stepper to support **both granularities** (a compact 8-step device track and an expanded 10-phase PMA track).

### 5.3 IVD / IVDR
`Annex VIII classification → Analytical validation → Clinical performance → Risk/GSPR → Performance Evaluation Report → PMPF → Submit (+ CDx branch)`
- Classify: `ivdr-routes.ts:21 classifyIvdrAnnexVIII`
- Analytical validators: `ivd-lifecycle.ts:37-44` (`assessRealTimeStability/AcceleratedStability/Carryover/HookEffect/Recovery`, `determineCutoff`)
- Scientific validity / PER: `ivd-lifecycle.ts:41 assessScientificValidity`; tech-doc `tech-doc-assembler.ts:97 assembleTechDoc` (Annex II/XIII sections :70-83)
- CDx branch: `pairCompanionDiagnostic` (:58), `designIvdStudyProgram` (:59)

### 5.4 Biotech/Pharma IND → NDA/BLA/MAA
**IND lifecycle** (`/api/ind-lifecycle/*`): draft/author (`documents.routes.ts:9-26`) → ICSR E2B(R3) (`composeE2bR3Icsr`, `buildIcsrTransmission`) → render/validate → file as eCTD sequence+leaves (`filing.routes.ts`) → regulatory clock 30-day (`compute.routes.ts:62 evaluateRegulatoryClock`) → readiness (`evaluateIndReadiness`, 108-section blueprint) → dispatch gate + cross-reference register (`submission.routes.ts`).
**NDA/BLA assembly:** region-aware CTD Module 1/2 (`biopharma/ctd.ts:19-21`) → eCTD pipeline `plan → assemble → validate → shadow-review → cross-region → publish → dispatch` (`submission-ops.ts buildECTDZip/validateEctdLeafs`).

### 5.5 CRO
**No distinct spine** — CROs run the per-program spines above across sponsors, isolated by `organizationId` (JWT-derived, never from body — `submission-ops.ts:76-86`; `programType ∈ CER/510K/IND/NDA/BLA/PMA/DE_NOVO` at `shared/schema/programs.ts:54`). The CRO layer is **aggregation + scoping over the same steppers**, not a new stepper.

### 5.6 Stepper design advice
- One `FilingStepper` component; `stages` come from `STAGE_LABELS` / `PMA_PHASES` / IVDR section list. Each stage carries: status (`complete/active/blocked/idle` — see `pma.ts` `status` field), % complete, attached service route, and the AnA tool offered at that step.
- Each step exposes its **AnA tool inline** ("Run predicate search", "Check SE matrix") — the same tool the rail offers — so the stepper *is* the workflow, and AnA is the accelerator at each node.
- Blocked/idle states must give a reason (microcopy-tone) and a next action, never a dead stop.

---

## 6. Provenance & seal UI (shared, for any generated/sealed output)

For report-engine, sentence-traceability, and any sealed artifact:
- Immutable record fields to surface: `reportUuid`, `reportCode`, `verificationCode`, `contentHash`, `merkleRoot`, `sealStatus ('unsealed'|'sealed'|'verified')`, `complianceScore`, `indemnificationTier` (`server/routes/intelligent-reports.ts:106-172`).
- Seal block (`server/services/report-os/sealing/types.ts:29-38`): `algorithm:'sha256'`, `contentHash`, `atoms[]`, `aiDisclosed`, `sealedAt`, `atomCount`.
- Provenance atom (display per block): `blockPath ('sectionId#blockIndex')`, `sourceTable`, `sourceField`, `recordId`, `transformation`, `confidence`, `auditId`.

**Design:** a "Sealed" affordance with a verifiable hash, an expandable provenance trail (atom → source record), and an explicit **AI-disclosed** flag. This pairs with the pedigree badge (§4): the seal proves *what the bytes are*; the pedigree says *how much to trust each claim inside them*.

---

## 7. Cross-cutting UI mandates

### 7.1 Compliance rails (per surface, encoded in the registry `compliance` field)
- **`regulatory-compliance-ux`** — governed actions need reason-for-change capture, immutable history, role-scoped visibility, and the **e-signature modal**.
- **`accessibility-enforcement`** — WCAG 2.2 AA, color-never-alone (critical for pedigree badges and stage status), keyboard, focus.
- **`microcopy-tone`** — calm, factual, no exclamations, no cheerleading. Applies to every string incl. errors and empty states.
- **`motion-discipline`** — 200ms ease-out, no spring/bounce, respect `prefers-reduced-motion`.

### 7.2 Two resolved product decisions (build to these)
- **Locked-module CTA → self-serve upgrade.** Render: `Upgrade your plan to unlock [Module]` → routes to existing `upgradeUrl` (`/settings/subscription`, `license-manager.ts`). No "contact sales." Calm tone, never a dead/hidden button. This unblocks the `apps` surface (currently `planned`).
- **E-signature "meaning" → fixed enum dropdown** (10 values: `AUTHOR, REVIEWER, APPROVER, VERIFIER, WITNESS, RESPONSIBLE_PARTY, QUALITY_APPROVAL, REGULATORY_APPROVAL, CLINICAL_APPROVAL, TECHNICAL_APPROVAL`). ⚠️ Backend prerequisite: the live `POST /api/esignature/sign` (`server/routes/esignature.ts`) currently writes `signature_meaning` as free text; it must enforce the enum before the dropdown is truthful end-to-end. Until then, treat the enum as a UI-only convention.

### 7.3 E-signature modal contract (`/api/esignature`)
Three-step: `verify-password` → `verify-mfa` (6-digit TOTP, conditional on user MFA) → `sign`. Sign requires `documentId, versionId, signaturePurpose, action, password, (mfaToken)`. §11.50 manifestation returned: `{ printedName, dateTimeUtc ('YYYY-MM-DD HH:MM:SS UTC'), meaning }` (`server/services/compliance/signature-manifestation.ts:32-43`). Reuse this one modal across review, submission dispatch, and authoring approval.

### 7.4 The AnA rail (persistent, every surface)
- Modes: `standard / deep-research / nano-banana` (`client/src/concept2cure/mdx/data/nav.ts:65-76`) — labels Sonnet/Opus/Haiku 4.5; real model IDs `claude-sonnet-4-6 / claude-opus-4-7 / claude-haiku-4-5-20251001` (`server/services/anthropic-client.ts:45-53`). **Mode is a UI affordance**; the server picks the model by task.
- Per-surface slash menu / "Ask AnA about this" chips come from `anaToolFamilies`.
- Every response carries a **pedigree badge** (§4) and, where applicable, the provenance/seal affordance (§6).

---

## 8. Recommended component inventory (build once, reuse everywhere)

| Component | Fed by | Used on |
|---|---|---|
| `LeftRail` (4-tier) | `ui-surface-registry.ts` selectors | every surface |
| `SegmentChip` | `IndustryMode` | tenant/org switcher |
| `ProjectSwitcher` / (later) `SponsorSwitcher` | `/api/projects` / `cro_clients` | project tier |
| `PedigreeBadge` | `tool-pedigree.ts` PEDIGREE_LEVELS | AnA rail, drafts, results |
| `FilingStepper` | `STAGE_LABELS`/`PMA_PHASES`/IVDR sections | device/IVD/IND/NDA surfaces |
| `GovernedActionButton` + `ESignatureModal` | `/api/esignature` | review, dispatch, approval |
| `LockedModuleCard` | `/api/module-subscriptions` | apps catalog, any gated surface |
| `ContractDrivenForm` | `GET /api/global-ri/catalog` `inputSchema` | global-RI (reference), then reuse |
| `ProvenanceTrail` + `SealBadge` | report-os sealing types | report-engine, sealed artifacts |
| `AnaRail` (modes + chips + badges) | `@shared/types/ai-actions`, `anaToolFamilies` | every surface |

---

## 9. Build sequence for design

1. **Cross-cutting first:** `LeftRail`, `AnaRail`, `PedigreeBadge`, `ESignatureModal`, `LockedModuleCard`, `SegmentChip`. These unblock everything and the client plumbing already exists.
2. **The two contract-ready surfaces** as reference: `global-ri` (catalog-driven nav + auto-forms) and `submission-center` (workspace map + error catalog). Copy these patterns.
3. **Filing steppers** for the routes-ready spines (device → IVD → IND/NDA), each reusing `FilingStepper`.
4. **Specialist surfaces** (biostatistics, safety-narrative, precedent, report-engine, deep-research) — add a `@shared` contract per surface as you install it.
5. **Defer:** CRO multi-sponsor workspace and Academic specialization until product prioritizes them (§2.3, below).

Run `design-brief → brief-to-tasks → build → design-review` per surface, with `accessibility-enforcement` and `regulatory-compliance-ux` as gates throughout.

---

## 10. Open product decisions (for PM, not design to invent)

1. **CRO multi-sponsor is sold ahead of its UI.** If CRO is a GTM segment, prioritize the sponsor switcher + scoping + portfolio home (§2.3).
2. **Academic is a first-class segment with almost no specialization** beyond pricing + AI blurb. Decide whether it gets IIT/IRB-flavored surfaces or rides the biotech model.
3. **Two segment axes** (`IndustryMode` vs `CompanyType`) will drift — pick one canonical (§1.4).
4. **E-signature enum enforcement** must land server-side before the §7.2 dropdown is truthful.

---

*All citations are against the repo at the date above. Nothing here renders a pixel — it's the contract + design-intent floor the components sit on.*
