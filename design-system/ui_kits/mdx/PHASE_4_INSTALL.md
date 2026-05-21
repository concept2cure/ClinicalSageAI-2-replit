# PHASE 4 — install guide for Claude Code

> Single-file playbook for landing the six new MDX surfaces from `ui_kits/mdx/` into `client/src/concept2cure/mdx/` on the `concept2cure-v2` branch. Every step is concrete, every change is reversible, every checklist item is verifiable.

**Reading order for this turn:** this file → `HANDOFF.md > Phase 4` → `ui_kits/mdx/README.md` → the six `ui_kits/mdx/surfaces/*.jsx` files → the six `ui_kits/mdx/data/*.js` files → `ui_kits/mdx/surfaces.css` → `ui_kits/mdx/tokens-shim.css`. Do not touch any other surface during this phase.

---

## 0 · Pre-flight

### 0.1 Branch + scope
- Cut a branch off `concept2cure-v2` named `phase4-mdx-lifecycle`.
- Phase 4 is **additive** to MDX. Do **not** edit `K510Surface.tsx`, `PmaSurface.tsx`, `CerSurface.tsx`, `PrecedentSurface.tsx`, `Overview.tsx`, `Workbench.tsx`, `ProjectHome.tsx`, `PreSubManager.tsx`, or any editor under `editors/`. Those are out of scope.

### 0.2 What the kit ships vs. what you ship
- **Kit is the design.** The JSX files in `ui_kits/mdx/surfaces/*.jsx` are wrapped in IIFEs and read data from `window.*` globals — that's a Babel-standalone harness convention, not the production code shape.
- **Codebase is the implementation.** You convert each JSX file to TSX, drop the IIFE, swap `window.X` reads for ESM imports, and type the props and data shapes.

### 0.3 Tooling sanity
- ESLint + tsc both green before you start the port and after every surface lands.
- `pnpm dev` running with the `mdx` route mounted (`/mdx` per `MdxRoute.tsx`).
- `VITE_MDX_DATA_MODE=fixture` in `.env.local` while porting so you can render every surface with the kit data before any API exists.

---

## 1 · File-by-file landing plan

### 1.1 Surfaces — 6 files + 1 reusable
For each surface in the table below, copy the kit JSX, then make exactly the transformations listed in §2.

**Per-surface design commitment (option 4 — see §1.1.1)**

| Kit source                                  | Lands at                                                        | Layout choice    |
| ------------------------------------------- | --------------------------------------------------------------- | ---------------- |
| `ui_kits/mdx/surfaces/Engineering.jsx`      | `client/src/concept2cure/mdx/surfaces/EngineeringSurface.tsx`   | **doc-first**    |
| `ui_kits/mdx/surfaces/Udi.jsx`              | `client/src/concept2cure/mdx/surfaces/UdiSurface.tsx`           | **doc-first**    |
| `ui_kits/mdx/surfaces/Postmarket.jsx`       | `client/src/concept2cure/mdx/surfaces/PostmarketSurface.tsx`    | **doc-first**    |
| `ui_kits/mdx/surfaces/Analytics.jsx`        | `client/src/concept2cure/mdx/surfaces/AnalyticsSurface.tsx`     | hybrid           |
| `ui_kits/mdx/surfaces/Memory.jsx`           | `client/src/concept2cure/mdx/surfaces/MemorySurface.tsx`        | (no docs)        |
| `ui_kits/mdx/surfaces/Admin.jsx`            | `client/src/concept2cure/mdx/surfaces/AdminSurface.tsx`         | hybrid           |
| `ui_kits/mdx/documents-panel.jsx`           | `client/src/concept2cure/mdx/components/DocumentsPanel.tsx`     | shared component |

### 1.1.1 The doc-first vs hybrid distinction (why)
- **Doc-first** = page header's primary CTA opens a document. Metric cards count documents. `DocumentsPanel` is the primary zone (full width, large). Dashboards collapse into a "Situational awareness" accordion below the document workflow.
- **Hybrid** = page header's primary CTA performs an analytic action. Metric cards count situational signals. `DocumentsPanel` is inserted as a secondary zone (full width, but **after** the existing dashboards or near the top under metrics, depending on surface).
- Engineering / UDI / Postmarket are document-production workstreams — they exist to author the artifacts. Doc-first.
- Analytics / Admin are read-mostly control planes — the dashboards are the work; documents are scheduled exports / Part-11 compliance artifacts. Hybrid.
- Memory has no doc output of its own — atoms feed AnA's drafting across every other surface. The Memory surface uses the "Effects" feed in place of a documents panel; that feed shows which other-surface documents memory grounded today.

### 1.2 Data — 11 files
Each kit data file becomes a typed TS module. Keep the export names identical so surface imports don't need rewriting.

| Kit source                                  | Lands at                                                        | Owns                                |
| ------------------------------------------- | --------------------------------------------------------------- | ----------------------------------- |
| `ui_kits/mdx/data/engineering.js`           | `client/src/concept2cure/mdx/data/engineering.ts`               | DHF · trace · risks · ECRs · NCs    |
| `ui_kits/mdx/data/engineering-docs.js`      | `client/src/concept2cure/mdx/data/engineering-docs.ts`          | 12 reg artifacts (Design Plan→SBOM) |
| `ui_kits/mdx/data/udi.js`                   | `client/src/concept2cure/mdx/data/udi.ts`                       | devices · labels · symbols · MRI    |
| `ui_kits/mdx/data/udi-docs.js`              | `client/src/concept2cure/mdx/data/udi-docs.ts`                  | IFUs · package labels · GUDID file  |
| `ui_kits/mdx/data/postmarket.js`            | `client/src/concept2cure/mdx/data/postmarket.ts`                | signals · MDRs · CAPAs · trends     |
| `ui_kits/mdx/data/postmarket-docs.js`       | `client/src/concept2cure/mdx/data/postmarket-docs.ts`           | MDR reports · CAPAs · FSCAs · PSURs |
| `ui_kits/mdx/data/analytics.js`             | `client/src/concept2cure/mdx/data/analytics.ts`                 | KPIs · phases · blockers · usage    |
| `ui_kits/mdx/data/analytics-docs.js`        | `client/src/concept2cure/mdx/data/analytics-docs.ts`            | Portfolio reports · velocity dossiers |
| `ui_kits/mdx/data/memory.js`                | `client/src/concept2cure/mdx/data/memory.ts`                    | atoms · categories · effects · ingest |
| `ui_kits/mdx/data/admin.js`                 | `client/src/concept2cure/mdx/data/admin.ts`                     | members · roles · grants · SSO      |
| `ui_kits/mdx/data/admin-docs.js`            | `client/src/concept2cure/mdx/data/admin-docs.ts`                | Part 11 audit exports · access reports |

### 1.3 Hooks — 6 new files
Author one hook module per surface. They follow the `useK510.ts` template — fetch + adapter + null-on-error fallback.

| Hook (new)                                                                           | Endpoint (new)                |
| ------------------------------------------------------------------------------------ | ----------------------------- |
| `client/src/concept2cure/mdx/hooks/useEngineering.ts`                                | `GET /api/mdx/engineering/:programId` |
| `client/src/concept2cure/mdx/hooks/useUdi.ts`                                        | `GET /api/mdx/udi`            |
| `client/src/concept2cure/mdx/hooks/usePostmarket.ts`                                 | `GET /api/mdx/postmarket`     |
| `client/src/concept2cure/mdx/hooks/useAnalytics.ts`                                  | `GET /api/mdx/analytics?pathway=:p` |
| `client/src/concept2cure/mdx/hooks/useMemory.ts`                                     | `GET /api/mdx/memory`         |
| `client/src/concept2cure/mdx/hooks/useAdmin.ts`                                      | `GET /api/mdx/admin`          |

Each hook MUST mirror the contract of `useFetchJson`'s consumer pattern and degrade to fixture on the surface side:

```ts
const live = useEngineering(programId);
const dhf   = live.dhf   ?? ENG_DHF;
const trace = live.trace ?? ENG_TRACE;
// ...etc
```

### 1.4 CSS — one merge
- `ui_kits/mdx/surfaces.css` → append into `client/src/concept2cure/mdx/app.css`, **respecting the banner order** (Engineering → UDI → Postmarket → Analytics → Memory → Admin). Each banner in the kit file matches the banner style already in `app.css`.

### 1.5 Tokens — one promotion
- Open `design-system/colors_and_type.css`.
- Find the section labelled `Raw Claude scales (paste-Claude-CSS compatibility)`.
- Add **immediately after** `--bg-300`:
  ```css
  --border-100:              #e8e6dc;   /* default frame (= bg-200) */
  --border-200:              #d1cfc0;   /* divider-strong (= bg-300) */
  --error-text:              #8a2929;   /* deeper error for body copy on cream */
  ```
- Delete `ui_kits/mdx/tokens-shim.css` after the promotion. Remove the `<link rel="stylesheet" href="tokens-shim.css">` from any harness still using it.

### 1.6 Nav — one edit, one delete, **one rename**
- Open `client/src/concept2cure/mdx/data/nav.ts`.
- In `MDX_STUBS`, delete the six keys `engineering`, `udi`, `postmarket`, `analytics`, `memory`, `admin`. The object becomes `export const MDX_STUBS: Record<string, StubInfo> = {};` and the type is unchanged.
- **Rename the `memory` nav entry** in `MDX_NAV_V2` — the existing label is `'Claude Memory'`. Change it to `'AnA Memory'`. AnA is the product's assistant; "Claude" is the underlying model and should not appear as a feature name.
- Append the six per-surface AnA suggestions to `MDX_SUGGESTIONS` — copy verbatim from `ui_kits/mdx/data/nav.js`.

### 1.7 App route table — six new arms
- Open `client/src/concept2cure/mdx/App.tsx`.
- Find the surface switch (line ~205 in current code, immediately after the editor `if` ladder and `MDX_STUBS` fall-through).
- Add six `case` arms (see §6 for exact code).
- Update `HERE_LABEL` for the six new ids — copy from `ui_kits/mdx/app.jsx` HERE_LABEL.

### 1.8 dataMode registry — six new rows
- Open `client/src/concept2cure/mdx/lib/dataMode.ts`.
- Append to `MDX_SURFACE_REGISTRY`:
  ```ts
  { id: 'engineering', label: 'Device engineering',     defaultMode: 'fixture', expectedLiveBy: '2026-09-01' },
  { id: 'udi',         label: 'UDI and labeling',       defaultMode: 'fixture', expectedLiveBy: '2026-09-15' },
  { id: 'postmarket',  label: 'Post-market vigilance',  defaultMode: 'fixture', expectedLiveBy: '2026-10-01' },
  { id: 'analytics',   label: 'Analytics',              defaultMode: 'fixture', expectedLiveBy: '2026-10-15' },
  { id: 'memory',      label: 'AnA memory',          defaultMode: 'fixture', expectedLiveBy: '2026-10-15' },
  { id: 'admin',       label: 'Admin and access',       defaultMode: 'fixture', expectedLiveBy: '2026-09-01' },
  ```

### 1.9 Stub component — leave it alone
- `mdx/_stubs/ComingSoon.tsx` and `mdx/surfaces/InDesignSurface.tsx` stay in the codebase. After Phase 4 they have **zero** rail items routing to them, but other phases may use them later. Do not delete.

---

## 2 · JSX → TSX transformation (do this per surface file)

### 2.1 Unwrap the IIFE
The kit wraps every file in `(() => { ... })();`. Drop those two lines.

### 2.2 Replace `window.X` destructures with ESM imports
Kit pattern (top of file):
```js
const { I, AskAnaChip } = window;
const { ENG_DHF, ENG_TRACE, ENG_RISKS, ENG_RISK_SEVERITY, ENG_RISK_PROB, ENG_RISK_ACCEPT, ENG_ECRS, ENG_ISSUES } = window;
```
Becomes (TSX):
```tsx
import * as React from 'react';
import { I } from '../icons';
import { AskAnaChip } from './AskAnaChip';
import {
  ENG_DHF, ENG_TRACE, ENG_RISKS,
  ENG_RISK_SEVERITY, ENG_RISK_PROB, ENG_RISK_ACCEPT,
  ENG_ECRS, ENG_ISSUES,
} from '../data/engineering';
import { useEngineering } from '../hooks/useEngineering';
import type { Program } from '../data/programs';
```

### 2.3 Type the props
Each surface's props are documented in the kit JSX file's signature. Examples:

```ts
// Engineering, takes program context
export interface EngineeringSurfaceProps {
  program: Program | null;
  onAskAna: (text: string, opts?: { tool?: string }) => void;
}

// Cross-program surfaces (UDI / Postmarket / Analytics / Memory / Admin)
export interface CrossProgramSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
}
```

### 2.4 Wire the hook + fallback
At the top of the surface body, replace any direct `ENG_*` reads with the live hook + fixture fallback:

```tsx
export function EngineeringSurface({ program, onAskAna }: EngineeringSurfaceProps) {
  const programId = program?.id ?? null;
  const live = useEngineering(programId);
  const sourceDhf    = live.dhf    ?? ENG_DHF;
  const sourceTrace  = live.trace  ?? ENG_TRACE;
  const sourceRisks  = live.risks  ?? ENG_RISKS;
  const sourceEcrs   = live.ecrs   ?? ENG_ECRS;
  const sourceIssues = live.issues ?? ENG_ISSUES;
  // ...then use `sourceDhf` etc. throughout the JSX in place of bare ENG_*
}
```

Apply the same pattern to every surface; the variable names map 1:1 to the data exports.

### 2.5 Remove default-export at the bottom
The kit ends each surface with `window.EngineeringSurface = EngineeringSurface;`. Delete that line.

---

## 3 · Data file transformation (do this per data file)

### 3.1 Drop the IIFE + drop the window globals
The kit data file is shaped like:
```js
(() => {
const ENG_DHF = [ /* … */ ];
// …
// Window globals (kit harness only — codebase uses ESM imports)
window.ENG_DHF = ENG_DHF;
window.ENG_TRACE = ENG_TRACE;
// …
})();
```
Becomes:
```ts
// engineering.ts
export const ENG_DHF: DhfSection[] = [ /* … same rows … */ ];
// …
```

### 3.2 Type each export
Each kit array is documented by its inline comments — write the TS interface that matches. Example for `engineering.ts`:

```ts
export type DhfStatus = 'draft' | 'review' | 'ready' | 'blocked';
export interface DhfSection {
  id: string;
  num: string;       // "01" .. "09"
  label: string;
  ver: string;
  owner: string;     // initials
  updated: string;   // relative ago
  status: DhfStatus;
  meta: string;
}

export type RiskState = 'verified' | 'in-progress' | 'open';
export type ControlClass = 'design' | 'information' | 'protective';
export interface RiskRecord {
  id: string;
  hazard: string;
  situation: string;
  harm: string;
  severity: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  probBefore: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  controlClass: ControlClass;
  control: string;
  verif: string;
  probAfter: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  residual: string;     // `${sev}${prob}` lookup key
  state: RiskState;
  owner: string;
}

export type Acceptability = 'ok' | 'alarp' | 'unacceptable';
export const ENG_RISK_ACCEPT: Record<string, Acceptability> = { /* … */ };
```

Do the equivalent for `udi.ts`, `postmarket.ts`, `analytics.ts`, `memory.ts`, `admin.ts`. Use the kit's inline comments — they document the meaning of every field.

### 3.3 Keep export names verbatim
`ENG_DHF`, `UDI_DEVICES`, `PV_SIGNALS`, `ANL_KPIS`, `MEM_ATOMS`, `ADM_MEMBERS` etc. must keep their names. Surfaces import them by name.

---

## 4 · Hook file authoring (do this per surface)

### 4.1 Pattern (template — engineering)

```ts
// hooks/useEngineering.ts
import { useFetchJson } from './useFetchJson';
import type {
  DhfSection, TraceRow, RiskRecord,
  EcrRow, NcRow,
} from '../data/engineering';

interface EngineeringPayload {
  dhf:    DhfSection[];
  trace:  TraceRow[];
  risks:  RiskRecord[];
  ecrs:   EcrRow[];
  issues: NcRow[];
}

export interface UseEngineeringResult {
  dhf:    DhfSection[] | null;
  trace:  TraceRow[]   | null;
  risks:  RiskRecord[] | null;
  ecrs:   EcrRow[]     | null;
  issues: NcRow[]      | null;
  loading: boolean;
  error:   string | null;
  refresh: () => void;
}

export function useEngineering(programId: string | null): UseEngineeringResult {
  const url = programId ? `/api/mdx/engineering/${encodeURIComponent(programId)}` : null;
  const { data, loading, error, refresh } = useFetchJson<EngineeringPayload>(url);
  return {
    dhf:    data?.dhf    ?? null,
    trace:  data?.trace  ?? null,
    risks:  data?.risks  ?? null,
    ecrs:   data?.ecrs   ?? null,
    issues: data?.issues ?? null,
    loading, error, refresh,
  };
}
```

### 4.2 Per-surface specifics

#### `useEngineering(programId)`
- URL: `GET /api/mdx/engineering/${programId}` — programId is the regulatoryPrograms UUID. Pass `null` to skip.
- Response: `{ dhf, trace, risks, ecrs, issues }`. No adapter — server returns the kit shape directly.
- Read note: The risk acceptability lookup (`ENG_RISK_ACCEPT`) is org policy, not per-program. Fetch separately from `/api/mdx/risk-policy` if you need it dynamic; otherwise hard-code from the kit constant.

#### `useUdi()`
- URL: `GET /api/mdx/udi` — no params (cross-program).
- Response: `{ devices, labels, symbols, issues, mri }`.
- Issues are server-computed from label artifacts × symbol glossary × MRI matrix; don't compute client-side.

#### `usePostmarket()`
- URL: `GET /api/mdx/postmarket` — cross-program.
- Response: `{ metrics, signals, mdrs, capas, pms, trends }`.
- The `vs` field on signals (`'+340%'`, `'new'`, `'—'`) is a server-side rollup, not derived client-side.

#### `useAnalytics(pathway)`
- URL: `GET /api/mdx/analytics?pathway=${pathway}` — pathway is `'all' | 'k510' | 'pma' | 'cer'`.
- Response: `{ kpis, phases, blockers, reviewers, usage, pace }`.
- Pace is always 24 months; peer cohort data joins `fda_510k_decisions` / `fda_pma_approvals` server-side.

#### `useMemory()`
- URL: `GET /api/mdx/memory` — cross-org (atoms are org-wide).
- Response: `{ categories, atoms, ingest, effects }`.
- New tables (see §7).

#### `useAdmin()`
- URL: `GET /api/mdx/admin`. Requires admin role (RBAC at API).
- Response: `{ kpis, members, roles, grants, sso, apiKeys, audit, settings }`.
- Every mutation route under `/api/mdx/admin/*` MUST emit an entry into `audit_logs` with `actor_role='admin'` or `action LIKE 'admin.%'`.

### 4.3 Don't introduce `useAdapter*` helpers
Phase 4 endpoints return the kit shape directly — no adapter layer needed (unlike `useK510Predicates` which adapts a shadow service). If a backend constraint forces a different server shape later, add the adapter then.

---

## 5 · CSS merge

### 5.1 Where each kit block goes
`ui_kits/mdx/surfaces.css` is ordered for direct append. Open `client/src/concept2cure/mdx/app.css` and **paste each banner block at the bottom of the file in this order**:

1. `ENGINEERING SURFACE`
2. `UDI SURFACE`
3. `POSTMARKET (VIGILANCE) SURFACE`
4. `ANALYTICS SURFACE`
5. `MEMORY SURFACE`
6. `ADMIN SURFACE`

The kit file's banners use the same `═══` style as `app.css`'s banners. Don't reformat.

### 5.2 Token references
Every color/font/radius/shadow in the kit CSS comes from a token. If you see a hex value or a pixel-radius literal in the kit CSS during the port, **stop and check** — there shouldn't be any. The two exceptions:
- The risk heatmap uses hand-tuned alpha-blended pastels (e.g. `#ecf1e4`) for the acceptability cells. These do not map to canonical scales. Keep them as literals. Same for the `mem-cat-*` and `mem-effect-*` chip backgrounds.
- The diverging-bar chart axis (`var(--text-400)`) uses a token; the dashed-track gradient does not — keep the inline `linear-gradient` as written.

### 5.3 Shared utilities at the top of the file
The kit prefixes the surface blocks with a small "Shared utilities" block (`.small-mono`, `.tone-*`, `.ll`). Paste this block once, immediately above the Engineering banner. If any of those class names already exist in `app.css` (they don't today, but if a later phase adds them), promote them into the existing definition instead of duplicating.

---

## 6 · App.tsx edit (exact code)

### 6.1 Imports — add at the top of `App.tsx`

```tsx
import { EngineeringSurface } from './surfaces/EngineeringSurface';
import { UdiSurface }         from './surfaces/UdiSurface';
import { PostmarketSurface }  from './surfaces/PostmarketSurface';
import { AnalyticsSurface }   from './surfaces/AnalyticsSurface';
import { MemorySurface }      from './surfaces/MemorySurface';
import { AdminSurface }       from './surfaces/AdminSurface';
```

### 6.2 HERE_LABEL — add six entries

```tsx
const HERE_LABEL: Record<string, string> = {
  // …existing entries…
  engineering:    'Device engineering',
  udi:            'UDI and labeling',
  postmarket:     'Post-market vigilance',
  analytics:      'Analytics',
  memory:         'AnA memory',
  admin:          'Admin and access',
  // …
};
```

### 6.3 Switch — six new case arms

Insert **inside the `else` branch** (the one beneath `MDX_STUBS[activeNav]`):

```tsx
case 'engineering':
  surface = <EngineeringSurface program={programForContext} onAskAna={askAna} />;
  break;
case 'udi':
  surface = <UdiSurface onAskAna={askAna} />;
  break;
case 'postmarket':
  surface = <PostmarketSurface onAskAna={askAna} />;
  break;
case 'analytics':
  surface = <AnalyticsSurface onAskAna={askAna} />;
  break;
case 'memory':
  surface = <MemorySurface onAskAna={askAna} />;
  break;
case 'admin':
  surface = <AdminSurface onAskAna={askAna} />;
  break;
```

### 6.4 programForContext — extend for engineering
Engineering scopes to a single device. Update `programForContext`:

```tsx
const programForContext = React.useMemo<Program | null>(() => {
  if (selectedProgram) return selectedProgram;
  if (activeNav === 'k510')         return programs.find(p => p.pathway === 'k510') ?? null;
  if (activeNav === 'pma')          return programs.find(p => p.pathway === 'pma')  ?? null;
  if (activeNav === 'cer')          return programs.find(p => p.pathway === 'cer')  ?? null;
  if (activeNav === 'engineering')  return programs[0] ?? null;                                // NEW
  if (activeNav === 'project-home') return programs[0] ?? null;
  return null;
}, [activeNav, selectedProgram, programs]);
```

The other five Phase 4 surfaces are cross-program — leave them out of `programForContext`.

### 6.5 askAna submissionType passthrough
Engineering doesn't have a submission type. Leave `submissionTypeForAna` unchanged — the existing ternary already returns `null` for `engineering` (it only matches `k510 / pma / cer`).

---

## 7 · Backend — endpoint + table contracts

### 7.1 New endpoints (six surface + six document endpoints)
| Method | Path                                                | Auth                    | Response                                                                                  |
| ------ | --------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| GET    | `/api/mdx/engineering/:programId`                   | program-scoped          | `{ dhf, trace, risks, ecrs, issues }`                                                     |
| GET    | `/api/mdx/engineering/:programId/documents`         | program-scoped          | `{ documents: Document[] }` — Engineering doc list (see `data/engineering-docs.ts`)        |
| GET    | `/api/mdx/udi`                                      | tenant-scoped           | `{ devices, labels, symbols, issues, mri }`                                               |
| GET    | `/api/mdx/udi/documents`                            | tenant-scoped           | `{ documents: Document[] }` — UDI label + submission docs                                  |
| GET    | `/api/mdx/postmarket`                               | tenant-scoped           | `{ metrics, signals, mdrs, capas, pms, trends }`                                          |
| GET    | `/api/mdx/postmarket/documents`                     | tenant-scoped           | `{ documents: Document[] }` — MDRs / CAPAs / FSCAs / PSURs                                 |
| GET    | `/api/mdx/analytics?pathway=:p`                     | tenant-scoped           | `{ kpis, phases, blockers, reviewers, usage, pace }`                                      |
| GET    | `/api/mdx/analytics/reports`                        | tenant-scoped           | `{ documents: Document[] }` — portfolio reports + dossiers                                 |
| GET    | `/api/mdx/memory`                                   | tenant-scoped           | `{ categories, atoms, ingest, effects }`                                                  |
| GET    | `/api/mdx/admin`                                    | role `admin`            | `{ kpis, members, roles, grants, sso, apiKeys, audit, settings }`                          |
| GET    | `/api/mdx/admin/documents`                          | role `admin`            | `{ documents: Document[] }` — Part 11 audit exports + access reports + SSO snapshots       |

The `Document` shape is in `ui_kits/mdx/data/engineering-docs.js` (header comment). Each surface gets its own document list via `useEngineeringDocuments()`, `useUdiDocuments()`, etc. — same `useFetchJson` pattern as everything else.

### 7.1.1 Editor variants Phase 4 introduces
The kit JSX passes `onOpenEditor(docId)` for every document row. The codebase must route each `editor` field to the right editor variant:

| `editor` field    | Route to (codebase)                                       | Schema source            |
| ----------------- | --------------------------------------------------------- | ------------------------ |
| `engineering`     | new `EngineeringEditor` (reuse `DocumentEditor` + new schemas) | `cerv2_510k_sections` (yes, that table spans pathways) |
| `label`           | **new `LabelEditor`** (artwork preview + structured text) | `c2c_label_artifacts`    |
| `data-submission` | new `DataSubmissionViewer` (GUDID / EUDAMED form, read-mostly) | `c2c_data_submissions` |
| `mdr-3500a`       | new `MdrEditor` (FDA Form 3500A schema)                   | `c2c_mdr_reports`        |
| `capa`            | new `CapaEditor` (6-stage workflow form)                  | `c2c_capa_records`       |
| `fsca` / `fsn`    | new `FscaEditor` (joint workflow)                         | `c2c_fsca_records`       |
| `psur`            | new `PsurEditor` (14-section EU MDR PSUR template)        | `c2c_psur_reports`       |
| `pms-plan`        | reuse `DocumentEditor` with PMS plan schema               | `c2c_pms_plans`          |
| `report-*`        | new `ReportViewer` (read-only viewer + PDF export)        | `c2c_reports`            |
| `audit-export`    | new `AuditExportViewer` (read-only, signed PDF)           | `c2c_audit_exports`      |
| `esig-manifest`   | reuse `AuditExportViewer` with manifest schema            | `c2c_audit_exports`      |
| `access-report`   | reuse `AuditExportViewer` with member-access schema       | `c2c_audit_exports`      |
| `sso-snapshot`    | reuse `AuditExportViewer` with SSO-config schema          | `c2c_audit_exports`      |

**Editor variants to author for Phase 4:** `LabelEditor` (artwork-aware), `MdrEditor` (Form 3500A), `CapaEditor` (6-stage), `FscaEditor`, `PsurEditor`, `ReportViewer`, `AuditExportViewer`. The first one (LabelEditor) is the most novel — it has a label-artwork preview pane plus structured field editing. The rest can reuse `DocumentEditor`'s tree-pane + section-editor pattern with new section schemas.

### 7.2 New tables (memory + admin)

```sql
-- c2c_memory_atoms — single source of truth for AnA memory
CREATE TABLE c2c_memory_atoms (
  id                text PRIMARY KEY,          -- 'm-2914'
  org_id            uuid NOT NULL,
  category          text NOT NULL,             -- persona | regulatory | pipeline | competitive | operational | preference | history
  importance        text NOT NULL,             -- critical | high | medium | low
  verified          boolean NOT NULL DEFAULT false,
  pinned            boolean NOT NULL DEFAULT false,
  scope             text[] NOT NULL DEFAULT '{}',
  title             text NOT NULL,
  body              text NOT NULL,
  source            text,
  supersedes        text REFERENCES c2c_memory_atoms(id),
  use_count         integer NOT NULL DEFAULT 0,
  last_used_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX c2c_memory_atoms_org_scope_idx ON c2c_memory_atoms (org_id, category, importance, verified);

-- c2c_memory_ingestion_jobs — drag-a-PDF → extract atoms
CREATE TABLE c2c_memory_ingestion_jobs (
  id                text PRIMARY KEY,          -- 'job-2018'
  org_id            uuid NOT NULL,
  source            text NOT NULL,             -- filename or URL
  state             text NOT NULL,             -- pending | in-progress | verified | failed
  proposed_count    integer NOT NULL DEFAULT 0,
  accepted_count    integer NOT NULL DEFAULT 0,
  rejected_count    integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

-- c2c_memory_effects — every grounding/catching/enforcement event
CREATE TABLE c2c_memory_effects (
  id                bigserial PRIMARY KEY,
  org_id            uuid NOT NULL,
  atom_id           text NOT NULL REFERENCES c2c_memory_atoms(id),
  conversation_id   text,                       -- foreign key to ana_conversations
  kind              text NOT NULL,              -- caught | grounded | enforced
  summary           text NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX c2c_memory_effects_atom_recent_idx ON c2c_memory_effects (org_id, atom_id, occurred_at DESC);

-- c2c_admin_audit — the admin subset of audit_logs (or a view)
CREATE OR REPLACE VIEW c2c_admin_audit AS
  SELECT id, occurred_at AS when_ts, actor_user_id, actor_role, action, target, sha256_chain
    FROM audit_logs
   WHERE actor_role = 'admin' OR action LIKE 'admin.%';
```

For admin members, roles, grants, SSO config, API keys — the codebase likely already has tables; check `c2c_org_members`, `c2c_roles`, `c2c_program_grants`, `c2c_sso_connections`, `c2c_api_keys`. Reuse those, don't duplicate.

### 7.3 Audit emission on every admin mutation
Every POST/PATCH/DELETE under `/api/mdx/admin/*` runs through the existing `auditWrite()` middleware. The middleware computes the SHA-256 chain. Don't roll your own.

### 7.4 Empty-state contract
If a tenant has zero data for a given surface (no devices in UDI registry, no atoms in memory, no audit entries), the endpoint returns the arrays empty (`[]`) — not 404. The surfaces render their own empty-state copy when arrays are `[]`. The surfaces fall back to fixture ONLY when arrays are `null` (load + error state).

---

## 8 · AnA wiring

### 8.1 `onAskAna` source
Every surface receives `onAskAna` from `App.tsx`:
```tsx
const anaChat = useAnaChat({ /* … */ });
const askAna = React.useCallback((text: string, opts: { tool?: string } = {}) => {
  const payload = opts.tool ? `>${opts.tool} ${text}`.trim() : text;
  void anaChat.send(payload);
  setAnaOpen(true);
}, [anaChat]);
```

No change to this code for Phase 4. Surfaces already call `onAskAna(text)` everywhere — the kit verifies the strings work as natural-language prompts.

### 8.2 New AnA tools (optional, additive)
The new surfaces hint at six new tools the orchestrator will eventually route to. Add to `ANA_TOOLS` in `mdx/data/nav.ts`:

```ts
{ id: 'rescore_risks',       group: 'Engineering', label: 'Re-score risk file',     desc: 'ISO 14971 re-eval after design change' },
{ id: 'open_ecrs',           group: 'Engineering', label: 'List open ECRs',         desc: 'Engineering change requests in flight' },
{ id: 'reconcile_udi',       group: 'UDI',         label: 'Reconcile FDA / EU UDI', desc: 'FDA GUDID vs EUDAMED diff per device' },
{ id: 'triage_signals',      group: 'Vigilance',   label: 'Triage this week',       desc: 'Cluster MAUDE/FAERS/EUDAMED signals' },
{ id: 'memory_supersede',    group: 'Memory',      label: 'Supersede atom',         desc: 'Replace an atom with a refined version' },
{ id: 'admin_audit_member',  group: 'Admin',       label: 'Audit member access',    desc: '90-day Part 11 PDF export per user' },
```

These are not yet wired to the orchestrator; they appear as suggestion chips in `MDX_SUGGESTIONS` (already added). Wire them when the orchestrator supports them.

### 8.3 Don't change `useAnaChat`
The chat hook handles SSE streaming + module_context payload — out of scope for Phase 4.

---

## 9 · Sequence — recommended landing order

Do not parallelize. Each surface lands on `main` cleanly before the next starts.

1. **Shim retirement** (§1.5) — promote tokens, delete shim. Single commit.
2. **Nav + dataMode** (§1.6, §1.8) — empty `MDX_STUBS`, register six new dataMode rows. App still routes to `<InDesignSurface stub={null}>` for the six ids until step 3 lands, so render that as an empty fragment temporarily (one extra null check in `InDesignSurface.tsx` — `if (!stub) return null;` is already there).
3. **Engineering** — port data → port surface → author hook → render with fixture → flip `expectedLiveBy` row in dataMode when the API ships. Commit.
4. **UDI** — same loop. Commit.
5. **Postmarket** — same loop. Commit.
6. **Analytics** — same loop. Commit.
7. **Memory** — same loop, plus the three new tables (§7.2). Commit.
8. **Admin** — same loop. Commit.

Each step ends with `pnpm typecheck && pnpm lint && pnpm test` green and the surface loading with **fixture data** in the running app at `/mdx`.

---

## 10 · Acceptance — verifiable checklist

Run through this before opening the PR.

### Routing
- [ ] Visiting each of `engineering` / `udi` / `postmarket` / `analytics` / `memory` / `admin` from the rail renders the real surface, not `<InDesignSurface>`.
- [ ] `MDX_STUBS` is `{}` and the type annotation reflects that.
- [ ] No console errors, no React key warnings, no missing-key warnings on any of the six routes.
- [ ] Each surface's `data-screen-label` resolves to a unique string (no duplicates with K510/PMA/CER).

### Tokens + tone
- [ ] No literal hex codes in any of the six new TSX files except the four palette exceptions called out in §5.2.
- [ ] No literal font-family or font-size strings; every type spec resolves to a token.
- [ ] Claude orange (`--accent-100` / `#d97757`) appears at most once per visible viewport on each surface. Verify with devtools.
- [ ] Body copy renders at 13px on every surface. Page title at 28px serif.
- [ ] No emoji, no `!`, no `?` in any user-facing string except the AnA `✻` sparkle (allowed).

### Data + hooks
- [ ] With `VITE_MDX_DATA_MODE=fixture`, every surface renders the kit fixture and is fully interactive.
- [ ] With `VITE_MDX_DATA_MODE=both`, surfaces hit their endpoint and fall back to fixture on 502/network error.
- [ ] With `VITE_MDX_DATA_MODE=live` and endpoints returning `[]`, surfaces render their own empty-state copy (not fixture).
- [ ] Each hook is cancellable on unmount (smoke-test: rapidly switch surfaces, no "setState on unmounted component" warnings).

### Admin specifics
- [ ] Every mutation on `/api/mdx/admin/*` writes an `audit_logs` row.
- [ ] The admin audit pane at the bottom of the Admin surface reads the latest 24h from `c2c_admin_audit`.
- [ ] SHA-256 chain reconstruction passes for every audit row shown (smoke-test against the chain verifier).

### Memory specifics
- [ ] `c2c_memory_atoms` + `c2c_memory_ingestion_jobs` + `c2c_memory_effects` migrations are checked in under `migrations/`.
- [ ] Atom verification flow (the Verify button on each unverified atom) calls `POST /api/mdx/memory/atoms/:id/verify` and re-fetches.

### Style merge
- [ ] `app.css` ends with six new banners in the order listed in §5.1.
- [ ] `surfaces.css` and `tokens-shim.css` are removed from the kit (`ui_kits/mdx/`) once promotion is verified to canonical.

### CI / cleanup
- [ ] `pnpm typecheck` green.
- [ ] `pnpm lint` green.
- [ ] `pnpm test` green; add unit tests per hook that mock the endpoint and assert the `null → fixture → loaded` flow.
- [ ] Legacy stub copy (the six entries in `MDX_STUBS`) is **deleted**, not commented out.

---

## 11 · Guardrails — what NOT to change

- The rail icon set (`icons.tsx`) — Phase 4 introduces no new glyphs beyond what's already there (`pin`, `upload`, `key`, `link`, `shield`, `trendingDown` already exist in the codebase icons module; verify before porting).
- `AnaRail.tsx` / `CmdK.tsx` / `TopBar.tsx` / `TabBar.tsx` / `Rail.tsx` — no edits.
- `useAnaChat` — out of scope.
- `MDX_NAV_V2` order, ids, labels, icons, groups — frozen **except** the `memory` label rename from `'Claude Memory'` to `'AnA Memory'` (§1.6).
- Any file under `client/src/concept2cure/legacy/` (if it exists) — out of scope; it's tagged for deletion in a future phase, not this one.

### 11.1 Naming rule — AnA vs Claude
**AnA is the product feature; Claude is the underlying model.**
- Features, surfaces, and user-facing strings always say **AnA** ("AnA Memory", "AnA suggested this", "Ask AnA").
- Model names appear only in model-attribution chrome where the user expects to see the model name — e.g. `AnA · Claude Sonnet 4.5` in `AnaRail.tsx`'s model citation, or `Claude {modelName}` in the mode chip.
- Do not let the rename in §1.6 leak into the model citation strings — those are correct as written.
- Audit other surfaces for stray "Claude" usage in feature naming before the PR opens. Known existing offenders to fix during the port:
  - `data/nav.ts` — `MDX_STUBS.memory.title` (`'Claude memory'` → `'AnA memory'`) and `.desc` (`"shared Claude context"` → `"shared AnA context"`). Both deletable when the stub is removed in §1.6.
  - `workbench/Workbench.tsx` — "Ask Claude" buttons in ValidationSurface, SubmissionsSurface, VaultSurface. Rename to "Ask AnA" while you're touching the workbench (low-risk, label-only). Out of formal Phase 4 scope but tag a follow-up if you don't pick it up here.

---

## 12 · Open questions

If anything in this guide is ambiguous when you reach it, **stop and add an entry under `HANDOFF.md > Open questions`** with your initials and the date. Don't resolve unilaterally.

Specific calls likely to come up:
- **Risk acceptability policy.** Org-wide or pathway-specific? Today the kit treats it as a single org-level lookup (`ENG_RISK_ACCEPT`). If a tenant ever needs per-pathway policy (e.g. lower ALARP bar for Class III implants), that's a future-phase data model change.
- **UDI issuing agency multi-tenancy.** The kit lists GS1, HIBCC, ICCBBA as agencies. If a tenant uses a non-listed agency, surface that as a config in `c2c_org_settings`, not hard-coded.
- **Memory atom scopes.** The kit uses string-array scopes (`['mdx', 'k510']`). If/when scopes get a hierarchical model, atoms migrate but the surface doesn't.
- **Admin role builder mutation.** The kit shows roles as read-only cards; the Edit scopes button hands off to AnA. If we ship a direct role editor instead, this is a follow-up Phase 4.1.

---

End of guide. When all of §10 is checked, open the PR with title **"Phase 4 · MDX lifecycle + system surfaces"** and tag the designer.
