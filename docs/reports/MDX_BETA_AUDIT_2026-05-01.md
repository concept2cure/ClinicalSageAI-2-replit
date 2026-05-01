# Medical Device & Diagnostics Module — BETA readiness audit

**Author:** Claude Code, 2026-05-01.
**Scope:** What it takes to take the MDX module from "design-system port + dead-code retired" to BETA — a 3-5 design partner release where a real customer takes a Class II 510(k) program from claims drafted to ESG transmit, end-to-end, on a single seeded project.

**Companion:** `UI_MIGRATION_MAP_2026-05-01.md`, `CLAUDE_DESIGN_KIT_BRIEFS_2026-05-01.md`, `DESIGN_BRIDGE_PROPOSAL_2026-05-01.md`, `SHELL_MIGRATION_ANALYSIS_2026-05-01.md`.

---

## 1. What's shipping today

### 1a. Claude Design surfaces in the MDX React port

11 surfaces ported and rendering inside the MDX shell. **All on fixtures** — zero live backend wiring.

| Surface | LOC | Fixture import | Live API call |
|---|---:|---:|---:|
| `Overview` | ~150 | 1 | 0 |
| `ProjectHome` | ~700 | 1 | 0 |
| `K510Surface` | ~430 | 2 | 0 |
| `PmaSurface` | ~90 | 1 | 0 |
| `CerSurface` (basic) | ~210 | 1 | 0 |
| `CerWorkbench` (4-tab) | ~470 | 0 | 0 |
| `PrecedentSurface` | inline | 0 | 0 |
| `PreSubManager` | ~370 | 1 | 0 |
| `EstarEditor` | ~430 | 1 | 0 |
| `PmaEditor` | ~35 | 1 | 0 |
| `CerEditor` | ~35 | 1 | 0 |
| **Total** | ~3,000 | | |

**Working chrome:** Rail, TopBar, TabBar, AnaRail (live AnA via `/api/ana-ri/stream`), CmdK, AskAnaChip, GovernedActionButton (Phase 0), DataState (Phase 0).

**Stubs (`<InDesignSurface>`):** `tasks`, `vault`, `validation`, `submissions`, `templates`, `analytics`, `memory`, `admin`, `engineering`, `udi`, `postmarket`.

### 1b. Backend mounted and reachable

| Path | Service | BETA-relevant |
|---|---|---|
| `/api/concept2cure` | projects, conversations, briefings | yes — project_id source |
| `/api/chat`, `/api/ana-ri` | AnA gateway | yes — already wired |
| `/api/predicate-intelligence` | candidates, SE matrix, defense preview, RTF/CRL triggers (proxies to Python shadow) | yes |
| `/api/regulatory-graph` | claim-evidence, propagation, **reviewer simulator (`/reviewer/personas`, `/reviewer-simulations`)** | yes |
| `/api/regulatory-correspondence` | **AI letter ingest, response packaging** | yes |
| `/api/gspr` | GSPR catalog + per-program mappings | yes |
| `/api/post-market` | PMS, PMCF, complaints, KPIs | yes |
| `/api/evidence-sufficiency` | pillar scoring, per-program | yes |
| `/api/cerv2`, `/api/cer`, `/api/cerv2-sections`, `/api/cerv2-versions` | CER authoring | yes |
| `/api/authoring`, `/api/authoring-actions` | section authoring, module readiness | yes |
| `/api/document-authoring` | document authoring | yes |
| `/api/esignature` | **Part 11 e-sign** (`legacy-esign` UI wraps it) | yes |
| `/api/se-matrix` | substantial equivalence matrix | yes |
| `/api/510k-workflow` | 510(k) workflow state machine | yes |
| `/api/assumptions/*`, `/api/decisions/*`, `/api/contradictions/*` | governance | yes |
| `/api/vault` | document vault | yes |
| `/api/fda-forms` | FDA form generation | yes |
| `/api/external-evidence`, `/api/evidence` | evidence objects | yes |
| `/api/ivdr` | IVDR | post-BETA |

**Per the earlier audit, claim-evidence + reviewer-simulator + change-router services are all 70-85% built and mounted.** Their UI is what's missing.

### 1c. Backend gaps blocking BETA

| Gap | Effort | Blocks |
|---|---|---|
| `/api/q-sub/*` routes (schema drafted at `shared/schema/q-sub.ts`) | 3-5 days | PreSubManager wires to live data |
| Cover letter / 510(k) summary §-pull (finish `response-package-compiler`) | 3-4 days | RTA gate completeness |
| Filing calendar dependency engine | 1-2 weeks | not BETA-blocking; defer |
| ISO 14971 risk file schema + service | 2-3 weeks | not BETA-blocking for 510(k) Class II; defer |

---

## 2. Five core BETA workflows

A program qualifies for BETA only if all five work end-to-end on a seeded demo project:

| # | Workflow | Surfaces touched | Backend touched | Status |
|---|---|---|---|---|
| **W1** | Read program state | Overview · ProjectHome · K510Surface | `/api/concept2cure`, `/api/evidence-sufficiency`, `/api/predicate-intelligence`, `/api/se-matrix`, `/api/authoring-actions` | UI fixture-only · backend ready |
| **W2** | Author eSTAR + run validation | EstarEditor · ValidationCenter (currently stub) | `/api/authoring`, `/api/510k-workflow` (validation) | UI fixture · validation backend exists |
| **W3** | Pre-Sub cycle | PreSubManager · in-section commitment pill | **`/api/q-sub/*` (missing)** | UI ready · backend gap |
| **W4** | AI-letter response | New surface (Claude Design brief #2) | `/api/regulatory-correspondence` | UI missing · backend ready |
| **W5** | Pre-flight + transmit + clock | New surface (Claude Design brief #8) · SubmissionsCenter (stub) | `/api/510k-workflow`, `/api/fda-forms`, `/api/esignature`, response-package-compiler | UI missing · backend partial |

**W1, W2, W3 are MDX-internal** — already-shipped surfaces just need fixture→live.
**W4, W5 are new surfaces** — gated on Claude Design briefs #2 and #8.

---

## 3. Cross-cutting BETA requirements

These aren't workflows but they gate any BETA release:

| # | Item | Status |
|---|---|---|
| **C1** | Real demo project (seeded in DB) with at least: claims, evidence, predicates, eSTAR sections in various states, a Pre-Sub history | partial — `db:seed:ga-demo` script exists; needs verification |
| **C2** | Project-id flows from URL → `useActiveProgram()` → every wired surface | hook shipped; per-surface wiring not yet done |
| **C3** | Shadow service (Python) running in BETA environment, OR `VITE_LIVE_PREDICATE` flag with stub mode | not decided |
| **C4** | Every governed mutation routes through `<GovernedActionButton>` | primitive shipped; per-call wrapping not done |
| **C5** | Token cascade CI green on every PR | shipped |
| **C6** | All 5 workflows demo-able via the seeded project | not yet |
| **C7** | Audit trail visible per section (last-modified-by + reason-for-change) | backend exists at `/api/esignature` + audit-log; UI gap |
| **C8** | Tenant isolation (no cross-customer leakage) | exists in middleware; needs verification |
| **C9** | Limited-scope pen test | not started |
| **C10** | IQ/OQ/PQ validation kit | not started |

---

## 4. The BETA work plan

**Cut against ICP A** (Class II 510(k) sponsor, active filing in 6 months). Work organized by what's gated on what.

### Phase B0 · Foundations (1.5 weeks · doable now)

Already shipped: 5 primitives (`useActiveProgram`, `<DataState/>`, `<GovernedActionButton>`, `lib/dataMode`, `npm run ci:token-cascade`).

Outstanding:

- **B0.1 — Demo project seed.** Verify `npm run db:seed` (or `db:seed:ga-demo`) creates: a 510(k) project with id `1`, code `OR-801`, with seeded device profile, 4 predicates, 18 eSTAR sections in mixed states, 3 closed Pre-Subs with commitments, 5 unread complaints. **2 days · backend**
- **B0.2 — Shadow-service decision.** Productize the Python shadow as a sidecar with health endpoint + SLO, or implement stub responses behind `VITE_LIVE_PREDICATE=0` for BETA demos. Decision document required. **0.5 days · product/eng**
- **B0.3 — End-to-end project-id resolution.** `/concept2cure/project/1/k510` → `useActiveProgram()` → returns `{ id: 1, code: 'OR-801', pathway: 'k510', name: 'OR-801 Orthopedic…', isFixture: false }`. Verified via persona switcher. **1 day · me**
- **B0.4 — Persona switcher in dev.** Render any surface as RA Lead / RA Specialist / RA Project Manager / Clinical Lead / V&V Engineer for sprint demos. **1 day · me**
- **B0.5 — Wire `useDataMode()` per surface** so each surface declares `live`/`fixture`/`both` and CI fails when target dates pass. **1 day · me**

### Phase B1 · 510(k) reading vertical (W1) (2 weeks · 80% doable now)

The reference vertical. Once it works, B2 + B3 replicate the pattern.

| Slice | Hook | Backend | Effort |
|---|---|---|---|
| B1.1 | `useK510Predicates(programId)` | `GET /api/predicate-intelligence/candidates?program_id=…` | 2 days |
| B1.2 | `useK510SeMatrix(programId)` | `GET /api/se-matrix?program_id=…` | 1 day |
| B1.3 | `useEstarReadiness(programId)` | `GET /api/authoring-actions/module-readiness/:programId/510k` | 1 day |
| B1.4 | `useEvidenceSufficiency(programId)` | `GET /api/evidence-sufficiency/program/:id` | 1 day |
| B1.5 | `K510Surface` consumes 4 hooks; fixture fallback when `programId === null`; `<DataState/>` for empty/loading/error/unconfigured | n/a | 2 days |
| B1.6 | `Overview` + `ProjectHome` consume `useEvidenceSufficiency` (KPI strip enhancement) | n/a | 1 day |
| B1.7 | `PrecedentSurface` consumes predicate-intelligence + RTF/CRL trigger overlay | `GET /api/predicate-intelligence/toxic-detail/:k`, `/radar` | 2 days |

**Exit:** `/concept2cure/project/1/k510` shows OR-801's real predicates, real SE matrix, real eSTAR readiness, real evidence sufficiency score.

### Phase B2 · eSTAR authoring + validation (W2) (2 weeks)

| Slice | Outcome | Effort |
|---|---|---|
| B2.1 | `useEstarSections(programId)` consumes `/api/authoring/docs?module=510k&program_id=…` | 1 day |
| B2.2 | `EstarEditor` renders real sections; section save → POST `/api/authoring/sections/:id` | 2 days |
| B2.3 | Validation popovers: server-side findings via `/api/510k-workflow/validate` (or equivalent) | 2 days |
| B2.4 | New `ValidationSurface` (replaces `<InDesignSurface>`): list of sections with state, validation findings | 3 days · gated on Claude Design kit |
| B2.5 | Wire `<GovernedActionButton>` for section approval / sign-off | 1 day |
| B2.6 | Audit-trail strip on section header: last-modified-by, reason, e-sign chain | 2 days |

**Exit:** A user can edit `eSTAR §6 (Substantial Equivalence)` in OR-801, save, see real validation findings, and sign off through the Part 11 chain.

### Phase B3 · Pre-Sub cycle (W3) (3 weeks)

Backend buildout + UI wire-up.

| Slice | Outcome | Effort |
|---|---|---|
| B3.1 | Run `migrations/20260501_q_sub.sql` (after backend lead review). Tables exist. | 1 day · backend |
| B3.2 | Build `/api/q-sub/*` routes: list (with type/stage filters), detail (with questions/commitments/timeline), POST new Q-Sub, PATCH commitment.rolled_in | 4 days · backend |
| B3.3 | `usePresubList()` + `usePresubDetail(id)` hooks | 1 day · me |
| B3.4 | `PreSubManager` consumes hooks, replaces fixtures | 2 days · me |
| B3.5 | Q-Sub commitment pill component (Claude Design kit brief #15) renders inside `EstarEditor` section header when a commitment links to that section | 3 days · gated on Claude Design |
| B3.6 | Mark-rolled-in flow via `<GovernedActionButton>` | 1 day · me |
| B3.7 | New-Q-Sub creation flow (form modal) | 3 days · gated on Claude Design |

**Exit:** Filed Q-Sub Q251142 has 3 commitments; one of them lands as a pill in eSTAR §6.1; user marks it rolled-in with reason+sign; the dossier reflects rolled-in state.

### Phase B4 · AI letter response (W4) (3-4 weeks · gated on Claude Design)

The wedge. Highest-pain moment, biggest scope.

| Slice | Outcome | Effort |
|---|---|---|
| B4.1 | Claude Design ships brief #2 — AI letter response surface kit | 1 week · design |
| B4.2 | Port kit into `client/src/concept2cure/mdx/correspondence/` | 3-4 days · me |
| B4.3 | Wire to `/api/regulatory-correspondence/*`: list, ingest (PDF upload + email paste), parse, item-classify, owner-assign, response-track, close-out | 4 days · me |
| B4.4 | Transmit-gate logic: AI-letter close-out unlocks dossier transmit | 2 days · backend + me |
| B4.5 | Living-file integration: AI-letter items linked to dossier sections refresh those sections' staleness | 2 days · me |

**Exit:** Upload a real FDA AI letter PDF. Each item is auto-classified, routed to an owner, and tracked. Once all are closed, the next dossier transmit unlocks.

### Phase B5 · Pre-flight + transmit (W5) (3 weeks · gated on Claude Design)

| Slice | Outcome | Effort |
|---|---|---|
| B5.1 | Claude Design ships brief #8 — pre-flight RTA gate kit (overall verdict + per-check drilldowns + transmit button) | 1 week · design |
| B5.2 | Port kit; replace `<InDesignSurface>` for `submissions` route | 3 days · me |
| B5.3 | Hook to `/api/510k-workflow/preflight` (consolidates RTA + reviewer-sim + Part 11 sign-offs) | 2 days · me + backend |
| B5.4 | Cover letter / 510(k) summary auto-generation: finish `response-package-compiler` §-pull | 3-4 days · backend |
| B5.5 | New `CoverLetterEditor` surface with `DocumentEditor` primitive | 2 days · me |
| B5.6 | ESG transmit flow: confirm via `<GovernedActionButton>`; track receipt; review-clock UI | 3 days · me + backend |

**Exit:** A user clicks "Submit to FDA" in OR-801. RTA gate is all green. Cover letter and 510(k) summary auto-populate from §3, §6, §11, §12. User signs off through Part 11. Submission transmits via ESG. Receipt captured. Review clock starts.

### Phase B6 · Reviewer simulator (extra credit · 2 weeks · gated on Claude Design)

Strategic differentiator. Backend exists; UI is the gap.

| Slice | Outcome | Effort |
|---|---|---|
| B6.1 | Claude Design ships brief #4 — reviewer simulator kit | 1 week · design |
| B6.2 | Port; mount as new MDX surface (or under SubmissionsCenter) | 3 days · me |
| B6.3 | Wire to `/api/regulatory-graph/reviewer/personas` + `/reviewer-simulations` | 1 day · me |

**Exit:** Click "Run reviewer sim" on OR-801; 8 personas vote; questions surface ranked by severity; each links back to the relevant claim/evidence.

### Phase B7 · Hardening (3 weeks · necessary for BETA, not GA)

| Slice | Outcome |
|---|---|
| B7.1 | Tenant isolation evidence — write tests proving cross-customer data leakage is impossible |
| B7.2 | Limited pen test (focus on auth, e-sign, dossier transmit) |
| B7.3 | Audit-log retention proof: every governed action lands in immutable storage |
| B7.4 | Customer onboarding runbook — how a design partner gets a seeded tenant |
| B7.5 | Support runbook — top 10 issues, how to triage |
| B7.6 | Validation kit lite — IQ/OQ document templates customers can fill out for their own GxP |
| B7.7 | Monitoring + on-call — pager rotations, key alerts |

---

## 5. What I'm NOT doing for BETA

Defer to GA expansion:

- PMA full lifecycle (BETA shows the surface, no live data)
- IVDR PER (different ICP)
- De Novo pathway (different ICP)
- Combination products
- Post-market vigilance top-level surface (CER PMS tab is enough)
- Article 88 trend detection
- Field action / recall
- Portfolio rollup (executive dashboard)
- Filing calendar with dependency engine
- ISO 14971 risk file
- Biocompat (ISO 10993) matrix
- Human factors (IEC 62366-1) authoring
- Cybersecurity premarket SBOM
- Pathway decision wizard
- Filing-date estimator
- External collaborator portal
- Regulatory memory KB

Every one of these stays as a `<InDesignSurface>` stub or doesn't have a route. Customers see a "coming soon" affordance, not a broken surface.

---

## 6. Schedule

```
W1-2     Phase B0  Foundations + demo seed + project-id resolution    ████░░░░░░░░░░░░░
W2-3     Phase B1  510(k) reading vertical (W1)                       ░██████░░░░░░░░░░░
W4-5     Phase B2  eSTAR authoring (W2)                               ░░░░██████░░░░░░░░
W5-7     Phase B3  Pre-Sub cycle (W3) — backend buildout              ░░░░░░░██████████░
W7-10    Phase B4  AI letter response (W4) — gated on Claude Design   ░░░░░░░░░██████████
W10-12   Phase B5  Pre-flight + transmit (W5) — gated on Claude Design ░░░░░░░░░░░██████████
W11-12   Phase B6  Reviewer simulator (extra credit)                   ░░░░░░░░░░░░██████░
W12-14   Phase B7  Hardening                                           ░░░░░░░░░░░░░░██████
```

**Limited BETA = 14 weeks (~3.5 months) from today.** Three design partners signed before W14.

Critical paths:
- **Week 1**: B0.2 shadow-service decision; if blocked beyond week 2, BETA slips
- **Week 4**: Q-Sub backend (B3.2) starts; if it slips, B3 is fixture-only at BETA
- **Week 7**: Claude Design brief #2 (AI letter) lands; if it slips, BETA has no AI-letter UI
- **Week 10**: Claude Design brief #8 (pre-flight) lands; if it slips, BETA has fixture pre-flight

If we accept that one or two surfaces stay on fixtures at BETA (with explicit "demo only" badges), the timeline holds even with kit slippage.

---

## 7. What I need from you to start B0 immediately

Five decisions, same as the GA plan but tightened to BETA scope:

1. **Demo project ID for BETA seed** — `id = 1`, code `OR-801`, pathway `510(k)`. Confirm or override.
2. **Shadow service strategy** — productize as sidecar (with SLO + health endpoint) or stub behind `VITE_LIVE_PREDICATE=0` flag.
3. **Q-Sub backend schedule** — confirm backend lead can start `/api/q-sub/*` routes in W5; otherwise PreSub stays on fixtures at BETA.
4. **Claude Design queue order** — confirm brief #2 (AI letter) and brief #8 (pre-flight) are top of queue; otherwise sequence slides.
5. **BETA design-partner pipeline** — who are the 3 customers? Are they signed? When?

Once 1-3 are decided, I can start B0 immediately. 4-5 affect critical-path timing, not what I work on first.

---

## 8. Estimated cost

For 14 weeks to BETA, with the team sized in the GA advisory (6 FTE):

- Engineering: 4 FTE × 14 weeks = ~$200-300k
- Design: 1 FTE × 14 weeks = ~$50-80k
- Backend: 1 FTE × 14 weeks (mostly Q-Sub + cover-letter §-pull + RTA consolidation) = ~$50-80k
- Quality/DevOps + RA SME: 1 FTE shared = ~$30-50k
- Pen test (third-party): ~$15-25k
- Validation kit drafting (RA consultant): ~$10-20k

**Total: $355-555k for limited BETA.** Materially less than the GA estimate because the foundations + dead-code retirement are already done and ~70% of the backend exists.
