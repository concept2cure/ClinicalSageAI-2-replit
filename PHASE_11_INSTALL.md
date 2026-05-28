# PHASE 11 — Intelligence cluster · install guide

> Protocol · CMC · Biostat · Reports under one shell. Closes the four `null`-href rail items in the Intelligence tier of the home rail. Companion to Phases 1, 4–10.

---

## 0 · Why this phase

The home rail (`ui_kits/home/data.jsx`) has 5 Intelligence-tier items. Today:

| Rail id     | Status before Phase 11                       | Status after Phase 11 |
|-------------|----------------------------------------------|------------------------|
| protocol    | `null` href — legacy or void                 | Shipped → `intelligence/?tab=protocol` |
| cmc         | `null` href — legacy or void                 | Shipped → `intelligence/?tab=cmc` |
| biostat     | `null` href — legacy or void                 | Shipped → `intelligence/?tab=biostat` |
| quality     | already shipped (MDX-scoped, Phase 5)        | unchanged — biopharma reuses the MDX surface for now |
| reporting   | `null` href — Analytics exists but is MDX    | Shipped → `intelligence/?tab=reporting` |

All four surfaces serve the same audience (biopharma scientific + operational leads) and share an information shape — KPI strip + library + active work table + handoff to authoring. One shell, four surfaces.

---

## 1 · Surfaces

| Surface     | KPI strip                                                    | Main work                                                  | Hand-off |
|-------------|--------------------------------------------------------------|------------------------------------------------------------|----------|
| Protocol    | Active · Templates · Endpoint library · Amendments in flight | Active protocols table + endpoint library + amendments     | Authoring (rule pack = `protocol:ich`) |
| CMC         | Active packages · Stability programs · Batches · Open deviations | CMC packages table (DS/DP/site/shelf/stability/finding) + stability programs + spec library | Authoring (rule pack = `mod3:ich`) |
| Biostat     | Active SAPs · Power studies · TLF queue · Interim analyses   | SAP table + TLF queue + interim analyses + sample-size calculator | Authoring (`mod2:ich` for SAP narratives) |
| Reports     | Programs tracked · Avg readiness · Forecast conf · Precedent matches | Readiness bar chart + precedent-likelihood model output + timeline forecast table | None — read-only |

Each surface ends with an **AnA suggestion strip** of 3 scoped prompts pulled from `INT_SUGGESTIONS[<tab>]`.

---

## 2 · Files

```
ui_kits/intelligence/
├── index.html       # mount + script order
├── styles.css       # in-* prefixed; inherits colors_and_type.css
├── data.jsx         # INT_NAV, INT_SUGGESTIONS, PROTOCOLS, ENDPOINTS, AMENDMENTS, CMC_PACKAGES, STABILITY, SAPS, SAMPLE_SIZE, TLF_QUEUE, INTERIMS, REPORT_KPIS, REPORT_BARS, FORECAST, PRECEDENT_MODELS
├── surfaces.jsx     # Icons + Rail + TopBar + AnaStrip + 4 surfaces
└── App.jsx          # mount + nav switch
```

Lands in v2 at `client/src/concept2cure/intelligence/`. One file per export becomes one TS module; the `Rail`/`TopBar` split into `shell/*.tsx`; the four surfaces into `surfaces/{Protocol,Cmc,Biostat,Reports}.tsx`.

---

## 3 · Hooks Phase 11 introduces

```ts
// Protocol
useProtocols({ portfolio })                  // GET /api/intelligence/protocols
useProtocolDetail(protocolId)                // GET /api/intelligence/protocols/:id
useEndpointLibrary({ indication? })          // GET /api/intelligence/endpoint-library
useProtocolAmendments({ status? })           // GET /api/intelligence/protocol-amendments

// CMC
useCmcPackages({ portfolio })                // GET /api/intelligence/cmc/packages
useCmcStabilityPrograms({ portfolio })       // GET /api/intelligence/cmc/stability
useCmcSpecLibrary()                          // GET /api/intelligence/cmc/specs

// Biostat
useSaps({ portfolio })                       // GET /api/intelligence/biostat/saps
useSampleSize({ alpha, power, delta, sd })   // GET /api/intelligence/biostat/sample-size?…
useTlfQueue({ portfolio })                   // GET /api/intelligence/biostat/tlf-queue
useInterimAnalyses({ portfolio })            // GET /api/intelligence/biostat/interims

// Reports (read-only — no mutations)
useReportKpis({ portfolio })                 // GET /api/intelligence/reports/kpis
useReportReadiness({ portfolio })            // GET /api/intelligence/reports/readiness
useReportForecast({ portfolio })             // GET /api/intelligence/reports/forecast
useReportPrecedentModels()                   // GET /api/intelligence/reports/precedent-models
```

None of these are mutation endpoints in Phase 11. Mutation lives in Authoring (Phase 9) — the link buttons in each surface deep-link there.

---

## 4 · Database deltas

**No new tables in Phase 11.** Every dataset aggregates over existing rows:

- `useProtocols` joins `regulatory_programs` (program · indication) with `c2c_documents WHERE doc_type='protocol'`.
- `useEndpointLibrary` reads from `c2c_endpoint_library` (already exists from Phase 5 templates work) GROUPed by therapeutic area.
- `useCmcPackages` joins `c2c_documents WHERE doc_type='mod3'` with `c2c_manufacturing_sites` (already exists).
- `useCmcStabilityPrograms` reads from `c2c_stability_studies` (already exists).
- `useSaps` joins `regulatory_programs` with `c2c_documents WHERE doc_type IN ('protocol','sap')`. SAPs surface as a doc subtype.
- `useSampleSize` is a stateless compute endpoint — closed-form for continuous + binomial outcomes; no persistence.
- `useTlfQueue` reads from `c2c_tlf_builds` (new minor table — see migration below).
- `useReportReadiness` queries the cross-portfolio readiness rollup (already exists from Phase 4 analytics).
- `useReportForecast` is a model output endpoint — reads from `c2c_forecast_snapshots` (minor table).

Two minor tables for the queues:

```sql
CREATE TABLE c2c_tlf_builds (
  id              text PRIMARY KEY,
  project_id      uuid NOT NULL REFERENCES regulatory_programs(id),
  what            text NOT NULL,
  due_at          timestamptz NOT NULL,
  pct_complete    integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'queued',  -- queued | building | review | locked
  owner_id        uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE c2c_forecast_snapshots (
  id              bigserial PRIMARY KEY,
  project_id      uuid NOT NULL REFERENCES regulatory_programs(id),
  milestone       text NOT NULL,
  target_date     date NOT NULL,
  forecast_date   date NOT NULL,
  confidence      numeric(3,2) NOT NULL,
  model_version   text NOT NULL,
  snapshot_at     timestamptz NOT NULL DEFAULT now()
);
```

---

## 5 · Nav additions (home rail)

```diff
- { id: 'protocol',  label: 'Protocol and Study Design', ..., href: null },
+ { id: 'protocol',  label: 'Protocol and Study Design', ..., href: '../intelligence/index.html?tab=protocol' },
- { id: 'cmc',       label: 'CMC Module',                ..., href: null },
+ { id: 'cmc',       label: 'CMC Module',                ..., href: '../intelligence/index.html?tab=cmc' },
- { id: 'biostat',   label: 'Biostatistics',             ..., href: null },
+ { id: 'biostat',   label: 'Biostatistics',             ..., href: '../intelligence/index.html?tab=biostat' },
- { id: 'reporting', label: 'Reports',                   ..., href: null },
+ { id: 'reporting', label: 'Reports',                   ..., href: '../intelligence/index.html?tab=reporting' },
```

In v2 the four routes are `/intelligence/protocol`, `/intelligence/cmc`, `/intelligence/biostat`, `/intelligence/reports`.

---

## 6 · Replaces (HANDOFF.md delete list)

Phase 11 closes the rail-level holes — there's not much legacy to delete because these surfaces never had a real UI. What it does retire:

- The 4 `null`-href entries above (rail entries that opened nothing).
- Any `<ComingSoon>` stubs in v2 routed under `/intelligence/*`.
- `client/src/concept2cure/intelligence/Placeholder.tsx` (if it exists; it doesn't in the current tree — guard against future addition).

It does **not** retire `mdx/surfaces/Analytics.tsx` (Phase 4 MDX analytics) — that's portfolio-scoped to MDX and still needed. Reports (Phase 11) is the org-wide superset.

---

## 7 · Acceptance

- [ ] Home rail entries for protocol / cmc / biostat / reporting all resolve to `intelligence/` with the right `?tab=` param honored.
- [ ] Each surface fetches live data via its hook with the fixture shape as the contract.
- [ ] Sample-size calculator card recomputes on input change (closed-form, client-side OK; server compute endpoint is for audit only).
- [ ] Two new tables (`c2c_tlf_builds`, `c2c_forecast_snapshots`) created.
- [ ] Bar-chart fill colors use the same accent + tone tokens as Phase 4 analytics (no new colors).
- [ ] No mutation routes; no `audit_logs` writes from Phase 11 surfaces.
- [ ] All four surfaces' "Open in authoring" buttons deep-link with a rule pack pre-set.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 8 · Out of scope

- **Quality and Lifecycle** rail item — already shipped MDX-scoped in Phase 5; Phase 11 does not re-do it.
- **Cross-portfolio mutation flows** (e.g. trigger a stability study from CMC, request a SAP review from Biostat) — Phase 11.1 if needed; for now the link buttons deep-link to authoring + project detail.
- **Real precedent-likelihood model serving infra** — Phase 11 ships the *consumption* surface; the model serving layer (`server/services/precedent-models/`) is already in place per the design system audit but is currently silent. Phase 11.1 wires the live output.

---

## 9 · Note on shell convergence

The intelligence kit's shell is **the third copy** of the same pattern (after MDX and Biopharma). After Phase 13 (auth), all three should converge on a shared `<DomainShell>` component with rail nav as a prop. Phase 11 keeps the parallel implementation to ship faster — the convergence work is logged on the Phase 13 docket already.
