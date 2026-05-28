# PHASE 10 — Biopharma domain shell + Projects detail · install guide

> The Biotech and Pharma counterpart to MDX. Lands the `biopharma` rail item and the unified `projects/:id` detail page. Companion to Phases 1, 4, 5, 6, 7, 9.

---

## 0 · Why this phase

After Phases 7 (PDEV/IND) and 9 (universal authoring), the biopharma stack still had two gaps that left half the customer base on legacy or `null` routes:

1. **`biopharma` rail item is `null`-href in `ui_kits/home/data.jsx`.** Every biopharma client clicks Biotech and Pharma → nothing happens. PDEV exists but it's *one workstream inside* biopharma (IND), not the domain shell.
2. **`projects` rail item points to `ana_ri/index.html`** — the chat-first *reference* shell, not a real product surface. Phase 2 (Projects detail) was deferred indefinitely. With Phase 9 authoring shipped, this is now the obvious next gap: clients need a project-level home that ties together the conversation thread, recent drafts, team, evidence and audit.

Phase 10 fills both. Two kits, one install.

---

## 1 · Scope

| Kit                   | Surface                                                | Lands at                                                          |
|-----------------------|--------------------------------------------------------|-------------------------------------------------------------------|
| `ui_kits/biopharma/`  | Biopharma domain shell · 10 nav items + 6 surfaces     | `/biopharma` and `/biopharma/:tab` in v2                          |
| `ui_kits/projects/`   | Single-project detail · header + workstreams + thread + drafts + aside | `/projects/:projectId` (replaces `ana_ri/` reference link)        |

### Biopharma surfaces (10 nav items)

| Nav id     | Status      | Notes |
|------------|-------------|-------|
| overview   | shipped     | KPI strip + pathway tiles + portfolio table + AnA briefing |
| ind        | shipped     | Filtered table + stage strip — but **delegates to PDEV** for activity-level work. The rail item carries the `PDEV` chip to signal this. |
| nda        | shipped     | Filtered table + stage strip |
| bla        | shipped     | Filtered table + stage strip |
| maa        | shipped     | EU centralized · CHMP procedure aware |
| jnda       | shipped     | Japan · PMDA bridging-aware |
| lifecycle  | shipped     | Approved-portfolio table + variation/PSUR/PMR KPIs |
| pediatric  | empty-state | KPI strip only; full workbench is Phase 10.1 |
| orphan     | empty-state | KPI strip only; full workbench is Phase 10.1 |
| meetings   | shipped     | Pre-IND / Type A-D / EoP2 / Pre-NDA / Pre-BLA / CHMP SA / PMDA meeting calendar |

Every row click in any pathway table hands off to `/authoring/?doc=<docType>&agency=<agency>&program=<programId>` — the rule pack is pre-set so the user lands in authoring with the right outline.

### Projects detail (one screen)

| Block | Notes |
|-------|-------|
| Top bar | Logo · breadcrumbs (Projects › Biotech and Pharma › `<code> <title>`) · Star · Share · Open in authoring · Ask AnA |
| Header card | Code, title, indication, sponsor, filed date, PDUFA, status pill, readiness bar, pathway · agency · lead · team count · next milestone |
| Workstreams | 8 modules (CMC / Nonclinical / Clinical / Summaries / Admin / Pediatric / Risk · REMS / Orphan + breakthrough) — each is a card with status + section count + readiness |
| Conversation with AnA | Project-grounded thread (user + AnA turns with provenance chips), full composer with slash menu + model picker + send |
| Recent drafts | Table — 7 most recent · status pills (review / drafted / approved / locked) · owner · timestamp · click opens authoring |
| Aside · Team | Member chips with role + presence |
| Aside · Pinned evidence | 3 evidence cards (CSR / Guidance / Precedent) — click opens vault |
| Aside · Activity | Audit feed of the last 5 entries · "Open log" → Phase 5 audit surface |

---

## 2 · Files

```
ui_kits/biopharma/
├── index.html
├── styles.css        # bp-* prefixed; inherits colors_and_type.css
├── Icons.jsx         # Lucide-style stroke; lift into icons.tsx
├── data.jsx          # BIO_NAV, BIO_PATHWAYS, BIO_STAGES, BIO_PROGRAMS, BIO_SUGGESTIONS
├── surfaces.jsx      # Rail + TopBar + TabBar + all 10 surface components
└── App.jsx           # mount + nav switch + openProgram handoff

ui_kits/projects/
├── index.html
├── styles.css        # pj-* prefixed; inherits colors_and_type.css
└── App.jsx           # single file — header + streams + thread + drafts + aside, all fixtures inline
```

Both kits use only tokens from `colors_and_type.css`. Single accent (`--accent-main-100`).

---

## 3 · v2 destinations

### Biopharma
```
client/src/concept2cure/biopharma/
├── App.tsx                            ← from ui_kits/biopharma/App.jsx + surfaces.jsx
├── BiopharmaRoute.tsx                 ← mounts under /biopharma
├── app.css                            ← merge ui_kits/biopharma/styles.css
├── data/
│   ├── nav.ts                         ← BIO_NAV_GROUPS, BIO_NAV
│   ├── pathways.ts                    ← BIO_PATHWAYS, BIO_STAGES
│   ├── programs.ts                    ← BIO_PROGRAMS shape; hook to live `regulatory_programs` rows
│   └── suggestions.ts                 ← BIO_SUGGESTIONS
├── shell/{Rail,TopBar,TabBar}.tsx     ← split surfaces.jsx into shell components
└── surfaces/{Overview,Pathway,Lifecycle,Pediatric,Orphan,Meetings}.tsx
```

### Projects
```
client/src/concept2cure/projects/
├── ProjectDetail.tsx                  ← from ui_kits/projects/App.jsx
├── ProjectDetailRoute.tsx             ← mounts under /projects/:projectId
├── project.css                        ← merge ui_kits/projects/styles.css
└── components/
    ├── ProjectHeader.tsx
    ├── ProjectWorkstreams.tsx
    ├── ProjectThread.tsx              ← uses useAnaChat({ projectId, screenName: 'Project detail' })
    ├── ProjectDrafts.tsx
    └── ProjectAside.tsx               ← Team + Pinned evidence + Activity feed
```

---

## 4 · Hooks Phase 10 introduces

```ts
// Biopharma
useBiopharmaPrograms()                     // GET /api/biopharma/programs
useBiopharmaProgram(programId)             // GET /api/biopharma/programs/:id
useBiopharmaMeetings({ within: '90d' })    // GET /api/biopharma/meetings?within=90d

// Projects detail (universal — used by MDX, biopharma, PDEV alike)
useProject(projectId)                      // GET /api/c2c/projects/:id
useProjectWorkstreams(projectId)           // GET /api/c2c/projects/:id/workstreams (computed: pct + status per module)
useProjectDrafts(projectId, { limit: 7 }) // GET /api/c2c/projects/:id/drafts?limit=7
useProjectTeam(projectId)                  // GET /api/c2c/projects/:id/team
useProjectEvidence(projectId)              // GET /api/c2c/projects/:id/evidence?pinned=1
useProjectActivity(projectId, { limit: 5 })// GET /api/c2c/projects/:id/activity?limit=5
```

The project conversation thread reuses `useAnaChat` from MDX, passing `projectId` and `screenName: 'Project detail'`. No new chat infrastructure.

---

## 5 · Database deltas

Biopharma needs **no new tables.** It is pure UI over `regulatory_programs` (the existing program registry) — the same table MDX queries. Each row's `program_type` field decides whether it shows up in biopharma (`IND` | `NDA` | `BLA` | `MAA` | `JNDA`) or MDX (`510K` | `PMA` | `CER`).

Projects detail needs **one new table** for the pinned-evidence concept:

```sql
CREATE TABLE c2c_project_pinned_evidence (
  id            bigserial PRIMARY KEY,
  project_id    uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,
  evidence_kind text NOT NULL,           -- 'artifact' | 'vault_doc' | 'rim_precedent' | 'guidance'
  evidence_ref  text NOT NULL,
  pinned_by     uuid NOT NULL REFERENCES users(id),
  pinned_at     timestamptz NOT NULL DEFAULT now(),
  reason        text,                    -- optional pin note
  UNIQUE (project_id, evidence_kind, evidence_ref)
);
```

Everything else aggregates over existing tables: workstreams join `c2c_document_sections` (from Phase 9) GROUP BY `module`; drafts ORDER BY `updated_at` from the same table; activity queries `audit_logs WHERE project_id = $1 ORDER BY occurred_at DESC LIMIT 5`; team queries `c2c_project_members` (exists today).

---

## 6 · Nav additions (home rail)

The home rail in `ui_kits/home/data.jsx` is updated in this batch:

```diff
- { id: 'biopharma',  label: 'Biotech and Pharma',  ..., href: null },
+ { id: 'biopharma',  label: 'Biotech and Pharma',  ..., href: '../biopharma/index.html' },

- { id: 'projects',   label: 'Projects',            ..., href: '../ana_ri/index.html' },
+ { id: 'projects',   label: 'Projects',            ..., href: '../projects/index.html' },
```

In v2 the same change lands in `client/src/concept2cure/home/data.ts` (or wherever the rail config is wired).

---

## 7 · Replaces (HANDOFF.md delete list)

Delete after Phase 10 ships and is verified:

- `client/src/concept2cure/ZenApp.tsx` biopharma branch (currently routes biopharma clients into the legacy industry pages under `components/pharma/` and `components/biologics/`).
- `client/src/concept2cure/components/biologics/` — full directory; superseded by `biopharma/surfaces/`.
- `client/src/concept2cure/components/pharma/` — full directory; superseded by `biopharma/surfaces/`.
- `client/src/concept2cure/IndustryAwareApp.tsx` biopharma fork.
- The `ana_ri/index.html` link from home rail. The kit stays in the design system as a reference for the chat-first interaction model — it is **not** a product surface.

---

## 8 · Acceptance

- [ ] Home rail `biopharma` resolves to `/biopharma` and renders all 10 nav items.
- [ ] Overview surface KPIs are computed from `regulatory_programs` (no hard-coded counts).
- [ ] Per-pathway surfaces filter `BIO_PROGRAMS` to the active pathway and show the stage strip with live counts.
- [ ] Clicking any portfolio row opens `/authoring/:documentId` with `(doc_type, agency)` pre-set from the program's pathway + agency.
- [ ] Home rail `projects` resolves to `/projects/:id` (with a sensible default project) rather than `ana_ri/`.
- [ ] Project detail renders header + workstreams + thread + drafts + aside without console errors.
- [ ] Conversation thread is wired to `useAnaChat({ projectId, screenName: 'Project detail' })`.
- [ ] Recent drafts table is fed by `useProjectDrafts` and a row click opens the doc in authoring.
- [ ] `c2c_project_pinned_evidence` table created; pinned-evidence aside reads from it.
- [ ] Audit feed reads from `audit_logs WHERE project_id = $1 LIMIT 5`.
- [ ] `BIO_PROGRAMS` fixture data is not imported in v2 — it's the shape contract for `regulatory_programs` rows, not a constant.
- [ ] No hard-coded colors / radii / fonts; all values via tokens.
- [ ] Legacy biopharma routes deleted (see §7).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 9 · Out of scope (Phase 10 explicitly does NOT do)

- **Pediatric / Orphan workbenches** — KPI strips only; the editorial surfaces ship in Phase 10.1.
- **Cross-domain global tasking + submission control tower** — they're a separate phase (proposed Phase 12).
- **The intelligence tier** (protocol, cmc, biostat, reporting) — Phase 11.
- **Auth / SSO / org switcher** — Phase 13.

---

## 10 · Note on consolidation pattern

Biopharma and MDX now share an identical shell pattern: `<Rail>` + `<TopBar>` + `<TabBar>` + per-tab surface, single accent, audit-grade tables, AnA briefing strip at the bottom of overview. When Phase 13 lands the auth, both domains' shells should be lifted into one shared `<DomainShell>` component with the rail nav as a prop. Phase 10 keeps them as parallel implementations to ship faster — the convergence is a Phase 13 cleanup.
