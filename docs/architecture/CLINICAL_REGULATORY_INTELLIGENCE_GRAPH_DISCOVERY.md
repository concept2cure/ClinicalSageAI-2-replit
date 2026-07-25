# Clinical-Regulatory Intelligence Graph — Discovery

**Phase 0 deliverable.** Required by the controlling work order §16.3 and §19 before broad
implementation.

| | |
| --- | --- |
| Repository | `concept2cure/ClinicalSageAI-2-replit` |
| Base branch | `concept2cure-v2` @ `2a5b46d` |
| Feature branch | `feature/clinical-regulatory-intelligence-graph` |
| Controlling document | `Concept2Cure_Clinical_Regulatory_Intelligence_Graph_Claude_Code_Work_Order.pdf` |
| UI target | `Clinical-Regulatory Intelligence Graph — v2 UI Integration.dc.html` (Claude Design kit, phase 7) |

---

## 0. Work-order review — what survives contact with the codebase

The work order was drafted against a repository read, not against this repository's
conventions. It was checked path by path. **Its factual claims hold up: every one of the
26 code paths it cites exists at the path it gives.** That is unusual and worth saying
plainly — the architecture it proposes is not speculative.

Six things in it are nonetheless wrong, imprecise, or under-specified for this platform,
and the implementation departs from the work order on each. Each departure is recorded
here rather than made silently. §0.5 is the one worth reading if you read only one: the
outcome conflation the work order flags in one file exists in a second place it never
names.

### 0.1 The "completion-as-success defect" is real but narrower than stated

Work order §2 and Appendix A call `corpus/precedent-benchmark-reader.ts` defective for
treating completion as regulatory success, and §4.2 asks for the label repaired.

What the code actually does (`precedent-benchmark-reader.ts:26–33`):

```ts
if (s.includes('complete') || s === 'successful' || s === 'approved') return true;
```

And `precedent-benchmark.ts:200` already carries an honest disclosure:

> "…This reflects registry status (completed vs terminated/withdrawn), **not regulatory
> approval**."

So the *presentation* is already honest. The defect is structural, in two specific places:

1. `statusToOutcome` collapses four distinct dimensions the work order §4.2 requires be
   kept separate — operational status (`complete`), statistical result (`successful`),
   and regulatory outcome (`approved`) — into **one boolean**. A trial that completed and
   a trial that was approved are indistinguishable downstream.
2. The type surface (`successes`, `successRate`) names an operational rate as a success
   rate, so any *new* consumer inherits the conflation even though the existing consumer
   is careful.

**Departure:** do not "repair the label" as the work order says. The label is fine. Split
the dimension in the type, keep the existing honest note, and leave the computation and
its callers untouched until a caller needs the regulatory dimension. Recorded as
`ADR-CRIG-002`.

### 0.2 The registry entry the design kit specifies is not a valid registry entry

The Claude Design handoff (`CLAUDE_CODE_INSTRUCTIONS.md` §4) gives this for
`shared/constants/ui-surface-registry.ts`:

```ts
{ id: 'crl-library', label: 'FDA CRL library', icon: 'gavel',
  navTier: 'biopharma', readiness: 'routes-ready', notes: '…' }
```

Three problems against the real `UiSurface` interface (`ui-surface-registry.ts:72–102`):

- `navTier: 'biopharma'` is not a `NavTier`. The union is `'global' | 'project' |
  'specialist' | 'admin'`. `biopharma` is a *client-type rail group*, a different axis
  (`registryModel.NAV_GROUP_OF`). The kit conflated the two.
- `layoutMode`, `group`, `uiKit`, `apiPrefixes`, `anaToolFamilies`, `sharedContract`,
  `discoveryCatalog`, `compliance` are all required and all absent.
- `readiness: 'routes-ready'` asserts "REST is mounted and tested". At the moment the
  surface lands that is false.

**Departure:** the entry is written to the real interface, `navTier: 'specialist'`
(matching `precedent-intelligence`, which it is modelled on), and readiness is reported
honestly as `kit-only` until the routes are mounted and tested — then `routes-ready`.

### 0.3 "Phase 7 is the last thing you build" is not achievable as literally written

The work order §15 orders the UI last, after ingestion (phase 4), retrieval (phase 5) and
AnA tools (phase 6). `CLAUDE_CODE_INSTRUCTIONS.md` §0 restates it: *"If you find yourself
writing a `.tsx` file before the shared contracts exist, stop."*

That is the right instinct and it is honoured — contracts land before surfaces. But taken
literally it also forbids the thing the platform most needs, which is a surface that
renders the **honest empty state** for a corpus that has not been ingested yet. This
repository already has a first-class idiom for exactly that (`useLiveRows` → `EmptyState`,
no fixture; `dataConnect.tsx:162–178` explicitly retires the fixture fallback for
regulated surfaces).

**Departure:** phase 7 UI is built against the phase-1 contracts and ships rendering
loading / error / empty-corpus / results. With no ingestion, users see "no findings
ingested yet" — which is true — not a fabricated corpus. This is a stricter reading of the
work order's honesty rules than its own phase order, not a looser one.

### 0.4 The kit's illustrative data must not reach a fixture

`CLAUDE_CODE_INSTRUCTIONS.md` §7 is correct and is treated as binding: `NDA 212345`,
`+14.2% (95% CI 3.1–25.3)`, `trace 7f2c-91ab`, the quoted letter text and every NCT id in
the kit are **placeholders demonstrating required shape**.

**Consequence:** `client/src/concept2cure/v2/fixtures/clinical-regulatory-evidence.ts`
contains **types only — zero data**. It is the one file in `fixtures/` with no fixture in
it, deliberately. A reviewer looking for the kit's numbers in the codebase will not find
them.

### 0.5 The §4.2 outcome conflation has a second site the work order missed

While landing the phase-1 tables, two of the eight names the work order specifies
turned out to be **already taken** — and one of them matters well beyond naming.

`shared/schema.ts:16022` already defines `regulatory_outcomes`, belonging to the
Regulatory Outcome Optimizer:

```ts
export const regulatoryOutcomes = pgTable('regulatory_outcomes', {
  csrId: integer('csr_id'),          // ← keyed to a CSR, not an application
  decision: text('decision').notNull(),  // ← free text, no allowed values
  // …no verified_at, no verified_by, no epistemic status
});
```

This is the **same defect §4.2 describes in `precedent-benchmark-reader`, in a
second place the work order does not mention**. An "outcome" row here is keyed to
a CSR, carries a free-text `decision` with no constrained vocabulary, and has
nothing recording whether a human ever confirmed it. Nothing structurally
prevents a decision derived from trial data from being read as a regulatory
outcome — which is precisely the conflation the whole work order exists to
remove.

`evidence_sources` (line ~17230) also exists, as the Evidence Fabric's document
registry. It is close in spirit, but its `organization_id` is `NOT NULL`, so it
**cannot represent globally-readable public FDA evidence at all**.

**Departure:** do not widen either table. Both have live consumers, and the work
order forbids destructive migration. The new domain uses
`clinical_evidence_sources` and `regulatory_application_outcomes`, and the new
table is built so the old defect cannot recur — a resolved outcome without
`verified_at` fails a CHECK constraint. The existing `regulatory_outcomes` is
reclassified **transitional** in §1, with migration deferred to phase 8
(prediction governance), where its consumers are already in scope.

### 0.6 The work order asks for a graph; this platform should not get one

§3.2 says the graph "does not require introducing a graph database … implement typed
relational edges in PostgreSQL unless an ADR proves the current database cannot meet the
access patterns."

Agreed, and no ADR is needed to prove it — the access patterns here are
metadata-constrained filter-then-rank over `lumen_data_atoms`, which is what
`advancedRAGPipeline` already does. Recorded as `ADR-CRIG-001` (accept the constraint, no
graph store).

---

## 1. Current-state component map

What exists today, and what each component becomes under the target architecture.

| Component | Path | Verified | Classification |
| --- | --- | --- | --- |
| Canonical study design model | `server/services/study-design/study-design-types.ts` | ✅ 430 ln | **Canonical** — extend via adapters |
| Structured evidence prior | `server/services/study-design/csr-evidence-source.ts` | ✅ 219 ln | **Canonical** — generalize |
| CSR corpus writer | `server/services/corpus/drizzle-corpus-writer.ts` | ✅ | **Canonical** — adapter projects from it |
| Precedent benchmark | `server/services/corpus/precedent-benchmark-reader.ts` | ✅ 93 ln | **Transitional** — see §0.1 |
| CSR deterministic extraction | `server/services/csr-intelligence-library.ts` | ✅ | **Canonical** — first stage |
| ICH E3 / CDISC semantic map | `server/services/clinical-intelligence-service.ts` | ✅ 1478 ln | **Canonical** — CRL findings map into it |
| Deficiency taxonomy | `server/services/ana-ri/deficiency-taxonomy.ts` | ✅ 832 ln | **Canonical** — do not fork |
| AnA orchestration | `server/services/ana-ri/orchestrator.ts` | ✅ | **Canonical** — integrate |
| AnA enrichment + CRL triggers | `server/services/ana-ri/context-enrichment.ts` | ✅ 1711 ln | **Canonical** — extend, do not fork |
| CSR predictive flow | `csr-knowledge-extractor.ts`, `csr-foresight-orchestrator.ts` | ✅ | **Transitional** — govern before CRL influence |
| Outcome optimizer table | `shared/schema.ts:16022` `regulatory_outcomes` | ✅ | **Transitional** — second §4.2 conflation site; see §0.5 |
| Evidence Fabric sources | `shared/schema.ts:17230` `evidence_sources` | ✅ | **Canonical (other domain)** — `organization_id` NOT NULL, cannot hold public evidence |
| Canonical retrieval | `enhancedEmbeddingService.ts`, `advancedRAGPipeline.ts` | ✅ | **Canonical** — reuse exclusively |
| Legacy design agent | `server/services/study-design-agent-service.ts` | ✅ | **Legacy** — migrate callers, do not extend |
| Shared evidence domain | `server/services/clinical-regulatory-evidence/` | ❌ absent | **New** — this workstream |

### 1.1 CRL/RTF intent already exists

`context-enrichment.ts:284` already carries the trigger set the work order asks for:

```ts
const CRL_RTF_TRIGGERS = [
  /\b(?:complete response|crl|refuse to file|rtf|deficiency letter)\b/i, …
];
```

and `enrichWithCRLRTF` is already composed into `risk`, `simulate`, `review`, `brief`,
`scan` and `haq` commands. The work order §10's "add an enrichment source rather than
another chatbot" is therefore an *extension of a live path*, not new plumbing. This is the
single strongest argument against a separate CRL agent, and it is load-bearing.

---

## 2. UI conventions the surfaces must obey

Established by reading the surfaces the kit says to model on. These are not negotiable
house style; the design-system CI gate enforces several of them.

| Convention | Contract | Precedent |
| --- | --- | --- |
| Fixture-free reads | `useLiveData` / `useLiveRows` → `{data, loading, error, empty}`; **no fixture** | `PrecedentEngine.tsx:120` |
| Legacy fixture reads | `useLive(path, fixture)` + `<SampleTag sample />` | `CsrWorkflow`, `RegulatoryWorkspace` |
| Envelope | `{ data }` via `ok()`; `useLive` puts the whole body on `.data`, so `{success,data}` sits at `raw.data.data` | `api-response.ts:39` |
| Four honest states | loading · error · empty · results — never a fabricated stand-in | `PrecedentEngine.tsx:237–258` |
| Answer-first | surface opens with `<AnswerLead>` before any table | `AnswerLead.tsx` |
| Icons | `lucide-react` through `v2/icons.tsx` only | design-system CI gate |
| Styling | `.c2c-v2`-scoped stylesheets; no inline styles | `styles/surfaces-v2.css` |
| Tenant scope | org id from JWT-bound request context only, never body/query/header; fail closed | `csr-workflow-routes.ts:102–113` |

`dataConnect.tsx:162–178` states the direction explicitly: the `live ?? fixture` +
"Sample data" convention **is being retired** for regulated surfaces. New surfaces in this
workstream therefore use the fixture-free helpers only.

---

## 3. Schema and tenancy map

`shared/schema.ts` is 19,721 lines. The seven entities the work order §4 requires were
checked against it; none exist yet under these names, and all seven can be represented
without displacing an existing table.

| Required entity | Status | Migration note |
| --- | --- | --- |
| `clinical_evidence_sources` | new | source identity, checksum, version, visibility, provenance. Prefixed — `evidence_sources` is taken (§0.5) |
| `clinical_study_identities` | new | NCT / sponsor / protocol / product linkage + confidence |
| `study_result_observations` | new | effect, SE/CI, p, n, transformations, source span |
| `regulatory_applications` | new | application type/number, sponsor, dates |
| `regulatory_findings` | new | finding, category, discipline, CTD/E3/design mapping, epistemic status |
| `regulatory_application_outcomes` | new | CRL / resubmission / approval / withdrawal / unresolved, verified only. Prefixed — `regulatory_outcomes` is taken (§0.5) |
| `evidence_relationships` | new | typed edges (§4.1 vocabulary) |
| `design_lessons` | new | derived, reversible, governed |

**No destructive change.** `csr_reports` / `csr_details` are read through an adapter and
projected; the corpus writer's NCT-idempotent upsert is untouched.

**Tenancy.** Existing RLS + org-scoping patterns are reused as-is. Public FDA evidence is
global read-only; client CSR/protocol/SAP stays tenant+project private; a lesson derived
from private evidence inherits that privacy. Visibility filters apply **before** ranking
(§8.1) and fail closed when context is missing.

---

## 4. Service contracts

Facade only — no surface calls an adapter directly.

```
server/services/clinical-regulatory-evidence/
  index.ts               public facade, stable contract
  types.ts               source · observation · finding · outcome · relationship · lesson
  source-service.ts      identity, checksum, version, visibility, provenance
  study-linker.ts        NCT / protocol / sponsor / product / application linkage
  csr-adapter.ts         projection from csr_reports / csr_details
  crl/source-adapter.ts  official FDA/openFDA discovery + pagination
  crl/document-processor.ts   PDF/text/page handling
  crl/finding-extractor.ts    deterministic ⨯ AI reconciliation
  crl/taxonomy-mapper.ts      deficiency · CTD · ICH E3 · design-node mapping
  relationship-service.ts     typed edges
  retrieval-adapter.ts        lumen_data_atoms writes + constrained retrieval
  coverage-service.ts         denominators, missingness, freshness, verification
  design-risk-service.ts      comparison + regulatory stress selection
  trace-service.ts            evidence chain + calculation trace
```

### 4.1 Routes

Seven reads plus one action, all `ENABLE_CLINICAL_REGULATORY_GRAPH`-gated, all org-scoped.

| Route | Serves |
| --- | --- |
| `GET /api/clinical-regulatory-evidence/coverage` | coverage strip |
| `GET /api/clinical-regulatory-evidence/findings` | CRL library list · CSR findings panel |
| `GET /api/clinical-regulatory-evidence/findings/:id` | CRL library detail |
| `GET /api/clinical-regulatory-evidence/outcome` | CSR regulatory-outcome card |
| `GET /api/clinical-regulatory-evidence/design-evidence` | study-design evidence panel |
| `GET /api/clinical-regulatory-evidence/trace/:traceId` | evidence-chain report |
| `POST /api/clinical-regulatory-evidence/stress-test` | stress run (delegates to the existing simulator) |

Filters are the §8.1 constraint set and are applied **before** ranking:
`applicationType, discipline, category, ctdSection, ichE3Section, designNode,
verification, indication, phase, modality, endpointClass, control`.

---

## 5. The seven display states

Work order §13.2. These are the reason the UI exists; an implementation that drops one is
wrong even if it looks right.

1. Source verified
2. Extracted, not human reviewed
3. Inferred mapping
4. Potential study link
5. Contradictory evidence present
6. Insufficient structured evidence
7. Stale source / recalculation required

Plus four framing rules that are equally binding:

- **Every count carries a denominator.** "18 of 31", never a bare percentage.
- **Explicit vs inferred is always distinguishable** — different columns, different
  rendering (solid chip vs italic "inferred"). Never merged in the DTO.
- **"Historical FDA precedent suggests"**, never "FDA will require".
- **Insufficient evidence is an answer**, emitted literally, not softened.
- **Application-, facility-, CMC- and labeling-level findings are never attributed to a
  study.**
- **No numeric confidence without a documented method.**

---

## 6. ADRs

| ADR | Decision |
| --- | --- |
| `ADR-CRIG-001` | Typed relational edges in PostgreSQL. No graph database. Access patterns are metadata-constrained filter-then-rank, already served by `advancedRAGPipeline`. |
| `ADR-CRIG-002` | Do not relabel `precedent-benchmark`. Split the conflated outcome dimension in the type; leave the honest note and the callers alone. See §0.1. |
| `ADR-CRIG-003` | The six §10 AnA tools are **read-only reasoning and are not governed actions**. Only writing into a regulated artifact is governed, via the existing `promote_artifact` / `save_document_version`. Adding a governed action for *reading* evidence would train users to click through e-signature prompts that carry no meaning. |
| `ADR-CRIG-004` | New surfaces use the fixture-free `useLiveData`/`useLiveRows` helpers exclusively. The `live ?? fixture` + `SampleTag` path is not extended to this workstream. |

---

## 7. Risks and open conflicts

| Risk | Assessment |
| --- | --- |
| Imported CRL text is prompt-injection capable | Work order §14. All extraction goes through the AI Gateway with strict schemas; letter text is untrusted input, never instruction. |
| Extraction conflict silently indexed | `conflict: true` blocks retrieval, indexing **and** export until a human resolves it. Enforced in the retrieval adapter, not only in the UI. |
| Inferred mapping presented as FDA's own words | Separate columns end to end; the DTO cannot represent a merged value. |
| Cross-tenant leakage via the shared graph | Visibility filter before ranking; fail closed on missing context. Release gate: zero known cross-tenant retrieval. |
| CRL ingestion silently recalibrating predictions | Work order §12. No wire from ingestion to `csr-foresight-orchestrator` recalibration. Phase 8 gate. |
| Scope: phases 2–6, 8–9 | Ingestion, retrieval, prediction governance and legacy retirement are **not** delivered in this pass. See §8. |

---

## 8. What phase 1 lands, and what it does not

**Landing now** — contracts, the facade, the routes, and the phase-7 UI rendering honest
empty states against them:

- `server/services/clinical-regulatory-evidence/{types,index,coverage-service}.ts`
- `shared/schema.ts` — the eight entities, and `migrations/20260725_clinical_regulatory_evidence.sql`
  (verified against a real PostgreSQL 16: applies clean, re-applies idempotently,
  and all eight honesty CHECK constraints reject their fabrication)
- `server/routes/clinical-regulatory-evidence-routes.ts` (7 reads + 1 action, flag-gated)
- `client/src/concept2cure/v2/fixtures/clinical-regulatory-evidence.ts` — **types only**
- `client/src/concept2cure/v2/surfaces/CrlLibrary.tsx` — the one new surface
- Registry edits: `ui-surface-registry`, `surfaceViews`, `registryModel`, `surfaceCtx`
- `csr-workflow` + `protocol-dev` + `report-engine` extensions
- `ENABLE_CLINICAL_REGULATORY_GRAPH` flag; flag off restores the current UI exactly
- Tests: `crlLibrary.test.tsx`, extended `navTargets` / `surfaceRouting`

**Explicitly not landing** — each needs its own phase and its own release gate:

- Phase 2 CSR convergence (adapter, extraction expansion, AI reconciliation)
- Phase 4 FDA CRL ingestion (source adapter, PDF processing, finding extraction)
- Phase 5 canonical retrieval (typed atoms, constrained retrieval)
- Phase 6 AnA tool registration (the six §10 tools)
- Phase 8 prediction governance
- Phase 9 legacy retirement of `study-design-agent-service.ts`

Until phase 4 lands, every surface in this workstream renders "no findings ingested yet".
That is the correct behaviour, not a gap.
