# Work Report & UI Advisory — AnA Registry Convergence

**Date:** 2026-06-24
**From:** Claude (Backend / Code)
**To:** Claude (Design)
**Re:** Today's backend convergence work + a grounded UI advisory built from the actual backend contracts
**PRs:** #927 (merged into `concept2cure-v2`), #928 (open, draft) — branch `claude/magical-thompson-mazk1e`

---

## 1. Executive summary

The platform now has a single canonical spine for **every regulatory filing type**, and **AnA is wired to author against all of it through natural language**. Concretely:

- **158 filing types** are live in the Global Document Registry (`GLOBAL_REGISTRY`), all active, spanning **4 segments**, **23 filing categories**, **13 regions**, and **12 agencies**.
- A single resolution layer — the **Submission Type Bridge** (`shared/regulatory/submission-type-bridge.ts`) — maps any string a client could throw at us (`IND`, `ind`, `US_IND`, `510(k)`, `FDA_510K`, `SNDA`, `JP_MKT_APPROVAL`, …) to one canonical registry entry. Pure, deterministic, no DB/network/LLM.
- **~35 backend services** now resolve submission types *through the bridge* instead of carrying their own private enums, so deep intelligence (precedent, deficiency patterns, cross-jurisdictional strategy, reasoning engine, readiness) activates uniformly for all 158 types — not just the original handful.
- **AnA's authoring service** (`AnaDocumentDraftingService`) now builds a registry-grounded system prompt for *any* of the 158 types. Previously only 6 hardcoded frameworks got specialized prompts and everything else silently fell back to generic. That gap is closed.

The strategic outcome: **AnA can build, edit, author, review, and gap-analyze any document type, for any client segment, in any region, driven by natural language.** The backend no longer has "supported" vs "unsupported" filing types — it has one registry and one brain over it.

---

## 2. What changed today (backend)

### 2.1 AnA authoring is now registry-driven for all 158 types
`server/services/ana/AnaDocumentDraftingService.ts`

- `resolveSystemPrompt(submissionType)` is now the universal resolver. Cascade:
  1. Direct hardcoded framework key (`fda_510k`, `ich_clinical`, …) — backward compatible.
  2. Known alias → framework.
  3. **Registry entry → dynamic, registry-grounded system prompt** built from `displayName`, `agency`, `region`, `dossierStandard`, `ctdModule`, `segment`, `category`, `submissionFormat`.
  4. Generic regulatory operator fallback.
- Every public method routes through it: `draftDocument`, `analyzeImage`, `reviewCompliance`, `analyzeGaps`, `quickComplete`, all via a new optional `submissionType` field.

### 2.2 API surface AnA drives
`server/routes/ana-intelligence.ts` — these now accept `submissionType` (any of the 158 types) in addition to the legacy `framework`:

| Endpoint | Verb | Purpose |
|---|---|---|
| `/api/claude/draft` | POST | Draft a document section |
| `/api/claude/draft/stream` | POST (SSE) | Stream a draft token-by-token |
| `/api/claude/review` | POST | Compliance review of content |
| `/api/claude/gap-analysis` | POST | Gap analysis vs target sections |

Either `framework` **or** `submissionType` is now sufficient — passing a registry type unlocks framework-grade authoring.

### 2.3 Service convergence (bridge at the entry points)
Precedent engine; completeness validation; cross-jurisdictional intelligence; `ana-ri/role-adapter`; `ana-ri/chat-context-builder`; `module-intelligence`; `lumen-context-builder`; `governed-ana-execution`; `governedDocumentContractService`; all submission gateways (FDA ESG, EMA CESP, Health Canada, PMDA, regional packager); IND lifecycle (cover letters, eCTD envelope, package manifest); innovation services (template-learning, readiness-twin, delta-radar, compliance-guardrails); eCTD regional rules; AI detectors; proof types.

All changes additive and backward-compatible — unrecognized strings fall through to prior behavior. Full `tsc --noEmit` is clean.

---

## 3. The data model you should design against

These are the real axes in `shared/regulatory/document-taxonomy.ts`. The UI's navigation and filtering should mirror them exactly — do not invent a parallel taxonomy.

**Segments (4)** — top-level workspace split:

| Segment | Count | Notes |
|---|---|---|
| `pharma_biotech` | 92 | Largest; drugs & biologics |
| `medical_devices` | 31 | 510(k), De Novo, PMA, EU MDR |
| `diagnostics_ivd` | 21 | IVD, companion Dx, EU IVDR |
| `cross_cutting` | 14 | CTD/eCTD, QMS, safety/PV |

**Filing categories (23)** — second-level grouping within a segment, e.g. `investigational`, `marketing_authorization`, `post_approval_lifecycle`, `cmc_quality`, `device_market_auth_us`, `ivd_companion_dx`, `ctd_ectd`, `safety_pv`.

**Regions (13):** US, EU, UK, CA, JP, CN, AU, CH, BR, IN, KR, SG, GLOBAL.
**Agencies (12):** FDA, EMA, MHRA, Health Canada, PMDA, NMPA, TGA, Swissmedic, ANVISA, CDSCO, MFDS, HSA.
**Dossier standards:** eCTD, CTD, ACTD, NeeS, eSTAR, regional, none.

**Helpers already built for the UI — use these, don't re-derive:**
- `getSubmissionTypeOptions()` → `{ value, label, segment, category }[]` — ready-made for a grouped picker.
- `getSubmissionTypeContext(id)` → `{ displayName, agency, region, segment, category, dossierStandard, submissionFormat, ctdModule, description }` — everything a header/detail panel needs.
- `getBySegment(segment)` / `getByCategory(category)` — for browse/filter views.

---

## 4. UI advisory

> **Guiding constraint (from the product owner):** do not rebuild anything, do not duplicate, do not add net-new UI surfaces where an existing one can be extended. The backend deliberately has *no* per-type UI — it exposes one registry and one AnA. The frontend should expose the same single spine. Every recommendation below is "extend/expose," not "build new."

### 4.1 The core principle: one surface, registry-parameterized
The backend's whole design philosophy is *one bridge, one brain, N types*. The UI should match: a **single authoring surface parameterized by `submissionType`**, not 158 bespoke screens. If a "510(k) workspace" and an "IND workspace" exist as separate code paths today, they should converge to one component that takes a registry context — the same way the backend collapsed its private enums into the bridge.

### 4.2 Submission-type selection (highest-leverage UI work)
Wherever a user picks what they're filing:
- Drive it from `getSubmissionTypeOptions()` — never a hardcoded `<option>` list. New registry entries should appear in the UI with zero frontend changes (the backend is already forward-compatible; the UI should be too).
- **Group by segment, then category.** That mirrors the taxonomy and keeps a 158-item list navigable. Segment as the primary tab/rail, category as the section header, filing type as the leaf.
- Show region + agency as secondary metadata on each option (`displayName` + a region/agency chip). Two filings can share a label across regions; the chip disambiguates.

### 4.3 Context header that proves AnA "knows" the filing
On any authoring/review screen, render a compact context strip from `getSubmissionTypeContext(id)`:
`displayName · agency · region · dossierStandard · ctdModule`.
This is cheap, fully backed by the registry, and it's the single clearest signal to the user that AnA is operating *in the correct regulatory frame* — important for trust in a regulated product.

### 4.4 AnA authoring affordances (map to the real endpoints)
The four verbs the backend exposes should be the four primary actions in the AnA surface, and **all four already accept `submissionType`** — pass the selected registry id straight through:
- **Draft / Author** → `/api/claude/draft/stream` (use the streaming endpoint; render tokens live).
- **Edit / Revise** → `/api/claude/draft` with `existingContent`.
- **Review** → `/api/claude/review`.
- **Gap analysis** → `/api/claude/gap-analysis` with `targetSections`.

Design these as verbs available *in context on the document*, not as a separate "AI tools" page. AnA should feel like she's operating on the open document, parameterized by its registry type.

### 4.5 Streaming, thinking, and provenance
- `/draft/stream` emits SSE events typed `text` | `thinking`. Design a **two-track render**: a subordinate, collapsible "reasoning" track and the primary document track. Extended thinking is on by default for drafting.
- Every response carries `model`, `usage`, and provenance is recorded server-side. Surface a quiet provenance affordance (model + token cost) — in a regulated tool this is reassurance, not clutter. Keep it understated.

### 4.6 Regulatory-compliance UX (non-negotiable for this product)
The backend has `governed-ana-execution`, Part 11 governance, and signoff services. Any AnA action that mutates or publishes a governed document must, per `regulatory-compliance-ux`:
- Confirm with a reason-for-change capture before commit.
- Show a visible audit trail / immutable history.
- Respect role-scoped visibility.
Design these as first-class states of the authoring surface, not bolt-ons.

### 4.7 Calm, restrained execution
This is a senior regulatory operator's tool. Apply `microcopy-tone` (factual, no cheerleading), `motion-discipline` (200ms ease-out, no bounce, honor `prefers-reduced-motion`), and `accessibility-enforcement` (WCAG 2.2 AA — keyboard, focus order, contrast, color-never-alone). The voice of AnA's surface should match the voice of the system prompts: precise, evidence-grounded, authoritative.

### 4.8 What NOT to do
- Don't hardcode the type list, regions, or agencies — bind to the registry helpers.
- Don't build per-type screens — parameterize one.
- Don't surface "unsupported type" states — there are none; the bridge resolves everything or falls through gracefully.
- Don't add a separate "AI" destination — AnA lives in the document context.

---

## 5. Suggested first design slice
1. Registry-driven submission-type picker (segment → category → type), backed by `getSubmissionTypeOptions()`.
2. Context header strip from `getSubmissionTypeContext()`.
3. In-context AnA verb bar (Draft / Edit / Review / Gap), wired to the four endpoints with `submissionType` passed through, streaming + thinking track on Draft.
4. Governed-action confirmation (reason-for-change) on any publish/mutate.

That slice exercises the entire backend spine end-to-end for *all 158 types at once*, with no per-type work — which is exactly the leverage the backend convergence was built to give the frontend.

---

*Appendix — key files: `shared/regulatory/submission-type-bridge.ts`, `shared/regulatory/global-document-registry.ts`, `shared/regulatory/document-taxonomy.ts`, `server/services/ana/AnaDocumentDraftingService.ts`, `server/routes/ana-intelligence.ts`.*
