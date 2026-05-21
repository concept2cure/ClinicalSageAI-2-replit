# PHASE 6 — install guide for Claude Code

> Diagnostic-client surfaces. Companion to `PHASE_4_INSTALL.md` and `PHASE_5_INSTALL.md`. Land Phase 6 **only if you sign a diagnostic client** — these surfaces don't affect medtech-only customers. Read after Phase 4 + Phase 5.

---

## 0 · Scope

| # | Surface                         | Layout         | Wire endpoint                       |
|---|---------------------------------|----------------|-------------------------------------|
| 1 | IVD pathway                     | doc-first      | `GET /api/mdx/ivd/:programId`       |
| 2 | EU IVDR                         | doc-first      | `GET /api/mdx/ivdr/:programId`      |
| 3 | Companion diagnostic (CDx)      | doc-first + paired timeline | `GET /api/mdx/cdx/:programId` |
| 4 | LDT compliance (FDA 2024 rule)  | doc-first + phase tracker   | `GET /api/mdx/ldt`            |

A new rail group `diagnostics` sits between `workbench` and `intelligence`. The four diagnostic items live there.

---

## 1 · Files

### Surfaces (4 files)
| Kit source                       | Lands at                                                |
|----------------------------------|---------------------------------------------------------|
| `ui_kits/mdx/surfaces/Ivd.jsx`   | `client/src/concept2cure/mdx/surfaces/IvdSurface.tsx`   |
| `ui_kits/mdx/surfaces/Ivdr.jsx`  | `client/src/concept2cure/mdx/surfaces/IvdrSurface.tsx`  |
| `ui_kits/mdx/surfaces/Cdx.jsx`   | `client/src/concept2cure/mdx/surfaces/CdxSurface.tsx`   |
| `ui_kits/mdx/surfaces/Ldt.jsx`   | `client/src/concept2cure/mdx/surfaces/LdtSurface.tsx`   |

### Data (4 files)
| Kit source                       | Lands at                                                |
|----------------------------------|---------------------------------------------------------|
| `ui_kits/mdx/data/ivd.js`        | `client/src/concept2cure/mdx/data/ivd.ts`               |
| `ui_kits/mdx/data/ivdr.js`       | `client/src/concept2cure/mdx/data/ivdr.ts`              |
| `ui_kits/mdx/data/cdx.js`        | `client/src/concept2cure/mdx/data/cdx.ts`               |
| `ui_kits/mdx/data/ldt.js`        | `client/src/concept2cure/mdx/data/ldt.ts`               |

### Hooks (4 new)
- `useIvd(programId)` → `GET /api/mdx/ivd/:programId` — `{ kpis, analytical, clinical, refmats, documents }`
- `useIvdr(programId)` → `GET /api/mdx/ivdr/:programId` — `{ kpis, rules, nbTimeline, documents }`
- `useCdx(programId)` → `GET /api/mdx/cdx/:programId` — `{ kpis, timeline, concordance, xref, documents }`
- `useLdt()` → `GET /api/mdx/ldt` — `{ phases, kpis, inventory, milestones, documents }`

### Nav additions (`mdx/data/nav.ts`)
Add a new group + four rail entries:

```ts
// Append to MDX_NAV_GROUPS, between 'workbench' and 'intelligence':
{ id: 'diagnostics', label: 'Diagnostics' },

// Append to MDX_NAV_V2:
{ id: 'ivd',  label: 'IVD Pathway',          icon: 'flask',  group: 'diagnostics' },
{ id: 'ivdr', label: 'EU IVDR',              icon: 'globe',  group: 'diagnostics' },
{ id: 'cdx',  label: 'Companion Diagnostic', icon: 'atom',   group: 'diagnostics' },
{ id: 'ldt',  label: 'LDT Compliance',       icon: 'beaker', group: 'diagnostics' },
```

Append AnA suggestions to `MDX_SUGGESTIONS` (copy from kit).

### App.tsx routing
Add four case arms:

```tsx
case 'ivd':   surface = <IvdSurface  onAskAna={askAna} onOpenEditor={openEditor} />; break;
case 'ivdr':  surface = <IvdrSurface onAskAna={askAna} onOpenEditor={openEditor} />; break;
case 'cdx':   surface = <CdxSurface  onAskAna={askAna} onOpenEditor={openEditor} />; break;
case 'ldt':   surface = <LdtSurface  onAskAna={askAna} onOpenEditor={openEditor} />; break;
```

### dataMode registry
Append:

```ts
{ id: 'ivd',  label: 'IVD pathway',           defaultMode: 'fixture', expectedLiveBy: '2026-11-01' },
{ id: 'ivdr', label: 'EU IVDR',               defaultMode: 'fixture', expectedLiveBy: '2026-11-15' },
{ id: 'cdx',  label: 'Companion diagnostic',  defaultMode: 'fixture', expectedLiveBy: '2026-12-01' },
{ id: 'ldt',  label: 'LDT compliance',        defaultMode: 'fixture', expectedLiveBy: '2026-10-15' },
```

LDT defaults to fixture longest because the FDA 2024 rule deliverables roll out through 2028 — the schema will keep evolving.

---

## 2 · Editor variants Phase 6 introduces

| `editor` field    | Routes to                          | Notes |
|-------------------|------------------------------------|-------|
| `engineering`     | existing `DocumentEditor`          | Reuse for analytical/clinical reports, PER, classification memos, concordance reports, joint plans, alignment docs, LDT policies and De Novo packets |
| `data-submission` | existing `DataSubmissionViewer`    | Reuse for EUDAMED IVD module file and LDT registration/listing packets |

**No new editor variants required for Phase 6.** All diagnostic docs reuse what Phase 4/5 already authored.

---

## 3 · Backend — endpoint contracts

### `GET /api/mdx/ivd/:programId`
```ts
{
  kpis: KPI[];               // 4 cards: analytes, studies, refmats, CLIA categorization
  analytical: Study[];       // CLSI EP09/EP05/EP17/EP06/EP07 studies
  clinical: ClinicalStudy[]; // sens/spec, PPV/NPV, ROC, intended-population
  refmats: ReferenceMaterial[]; // ISO 17511 traceability hierarchy
  documents: Document[];     // 8 IVD regulatory artifacts (kit fixture)
}
```

### `GET /api/mdx/ivdr/:programId`
```ts
{
  kpis: KPI[];
  rules: Rule[];             // Annex VIII rule trace (5 rules; `selected: true` on the one that classifies)
  nbTimeline: Milestone[];   // 5 notified-body engagement milestones
  documents: Document[];     // 6 IVDR artifacts: PER, classification, NB app, tech doc, EUDAMED IVD, CDx alignment
}
```

### `GET /api/mdx/cdx/:programId`
```ts
{
  kpis: KPI[];
  timeline: PairedMilestone[];   // 10 milestones; each has drugDate, deviceDate (one may be '—')
  concordance: ConcordanceRow[]; // CDx vs CTA — PPA, NPA, OPA per population
  xref: XrefRow[];               // NDA ↔ PMA document alignment matrix
  documents: Document[];         // 5 CDx artifacts
}
```

### `GET /api/mdx/ldt`
```ts
{
  phases: Phase[];           // 4 FDA 2024 rule phases (P1 → P4)
  kpis: KPI[];
  inventory: Ldt[];          // per-LDT — phase, risk, plan, mdrCount
  milestones: Milestone[];   // per-LDT phase milestones
  documents: Document[];     // 6 LDT compliance artifacts
}
```

Field shapes are documented in each kit data file's header comments. Match the field NAMES exactly.

---

## 4 · Database deltas

```sql
-- IVD analytical studies (per program × CLSI EP guideline)
CREATE TABLE c2c_ivd_analytical_studies (
  id              text PRIMARY KEY,
  program_id      uuid NOT NULL REFERENCES regulatory_programs(id),
  study_type      text NOT NULL,   -- accuracy | imprecision | lod | linearity | interference | comparison | matrix | specificity
  clsi_ref        text,            -- 'EP09-A3' etc.
  state           text NOT NULL,
  n_samples       integer,
  target          text,
  result          text,
  pass            boolean,
  owner_id        uuid,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- IVD clinical studies
CREATE TABLE c2c_ivd_clinical_studies (
  id              text PRIMARY KEY,
  program_id      uuid NOT NULL,
  study_type      text NOT NULL,   -- sens-spec | ppv-npv | roc | intended-population
  n_subjects      integer,
  target          text,
  result          text,
  pass            boolean,
  population      text,
  state           text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Reference material / calibrator hierarchy (ISO 17511)
CREATE TABLE c2c_ivd_reference_materials (
  id              text PRIMARY KEY,
  program_id      uuid NOT NULL,
  analyte_code    text NOT NULL,
  hierarchy_level text NOT NULL,   -- 'Primary' | 'Manufacturer master' | 'Manufacturer working' | etc.
  source          text NOT NULL,
  state           text NOT NULL,   -- qualified | conditional | expired
  expires_at      date
);

-- IVDR classification trace per program (Annex VIII)
CREATE TABLE c2c_ivdr_classifications (
  id              bigserial PRIMARY KEY,
  program_id      uuid NOT NULL,
  rule            text NOT NULL,   -- 'Rule 1' .. 'Rule 5'
  applies         boolean NOT NULL,
  selected        boolean NOT NULL DEFAULT false,
  rationale       text
);

-- IVDR notified-body engagement milestones
CREATE TABLE c2c_ivdr_nb_milestones (
  id              bigserial PRIMARY KEY,
  program_id      uuid NOT NULL,
  body            text NOT NULL,   -- 'BSI' | 'TÜV SÜD' | etc.
  milestone       text NOT NULL,
  scheduled_for   date,
  state           text NOT NULL    -- complete | in-progress | scheduled | idle
);

-- CDx paired timeline + concordance + cross-reference
CREATE TABLE c2c_cdx_pairings (
  id              text PRIMARY KEY,
  drug_program    text NOT NULL,   -- 'KEYTRUDA-9 NDA 219842'
  device_program  uuid NOT NULL,
  nda_id          text,
  pma_id          text
);
CREATE TABLE c2c_cdx_milestones (
  id              bigserial PRIMARY KEY,
  pairing_id      text NOT NULL REFERENCES c2c_cdx_pairings(id),
  milestone       text NOT NULL,
  drug_date       date,
  device_date     date,
  state           text NOT NULL
);
CREATE TABLE c2c_cdx_concordance (
  id              bigserial PRIMARY KEY,
  pairing_id      text NOT NULL,
  population      text NOT NULL,
  n               integer NOT NULL,
  cdx_positive    integer NOT NULL,
  cta_positive    integer NOT NULL,
  ppa             numeric(5,2),
  npa             numeric(5,2),
  opa             numeric(5,2)
);
CREATE TABLE c2c_cdx_xref (
  id              bigserial PRIMARY KEY,
  pairing_id      text NOT NULL,
  drug_doc        text NOT NULL,
  device_doc      text NOT NULL,
  alignment       text NOT NULL,   -- aligned | review | misaligned
  last_sync       timestamptz,
  issues          integer NOT NULL DEFAULT 0
);

-- LDT inventory + phase milestones (FDA 2024 rule)
CREATE TABLE c2c_ldt_inventory (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL,
  lab_id          text NOT NULL,
  name            text NOT NULL,
  risk            text NOT NULL,   -- high | med | low
  phase           text NOT NULL,   -- P1 | P2 | P3 | P4 | EDX
  grandfathered   boolean NOT NULL DEFAULT false,
  plan            text,
  mdr_count       integer NOT NULL DEFAULT 0,
  last_mdr_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE c2c_ldt_milestones (
  id              bigserial PRIMARY KEY,
  ldt_id          text NOT NULL REFERENCES c2c_ldt_inventory(id),
  milestone       text NOT NULL,
  due_date        date,
  state           text NOT NULL
);
```

---

## 5 · Sequence

1. **Database migrations** — all new tables (§4).
2. **IVD surface** — most fundamental of the diagnostic surfaces; analytical performance studies + clinical performance studies + ref-material hierarchy. Ship first; the other three reference its docs.
3. **IVDR surface** — depends on IVD-shaped data (PER ↔ clinical perf studies). Ship second.
4. **CDx surface** — paired timeline is the novel UI piece. Pair with a drug-program record (manual entry first; auto-link to a drug NDA in a follow-up phase).
5. **LDT surface** — independent of the other three (cross-tenant lab inventory).

Each surface lands behind `defaultMode: 'fixture'` until the corresponding hook + endpoint are live.

---

## 6 · Acceptance checklist

- [ ] The 4 diagnostic rail entries appear under a new "Diagnostics" group between Workbench and Intelligence.
- [ ] IVD analytical-study table accepts CLSI references (EP05/EP06/EP07/EP09/EP14/EP17) and shows pass/fail vs CLSI targets.
- [ ] IVDR Annex VIII rule trace renders 5 rules with the selected rule highlighted.
- [ ] IVDR notified-body timeline renders 5 milestones with state pills.
- [ ] CDx paired timeline renders both drug and device tracks; joint milestones show a connecting line.
- [ ] CDx concordance table flags PPA/NPA/OPA < 95% in warning color.
- [ ] CDx cross-reference matrix flags "misaligned" rows with an issues count.
- [ ] LDT phase tracker shows 4 FDA phases + an enforcement-discretion category, current phase highlighted.
- [ ] LDT inventory filters by phase when a phase card is clicked.
- [ ] Every Phase 6 doc routes to either `engineering` or `data-submission` editor (no new editor variants).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 7 · What Phase 6 still doesn't cover

From the original gap inventory — outstanding for Phase 7+:
- AnA review queue (Workbench tab — distinct from Notifications)
- Q-Sub briefing-document editor (extends PreSubManager)
- IEC 62304 SaMD dedicated workspace (partial coverage in Engineering)
- Clinical study management workspace
- Global search
- Onboarding / migration importer
- AnA conversation history archive

Phase 7 is the workspace-level deepening (clinical-study, SaMD workspace, AnA review queue). Phase 8 is global search + onboarding + archive.
