# Phase 10.2 — Biopharma surface refresh · install guide for Claude Code

> Companion to `PHASE_10_INSTALL.md`, `PHASE_10_1_INSTALL.md`, `MUTATION_PRIMITIVES_BRIEF.md`, `PHASE_9_SCHEMA_MIGRATION_BRIEF.md`. This delta covers everything shipped to `ui_kits/biopharma/` after the Phase 10 rebuild — six features, all additive, all CSS- or component-level (no breaking schema changes).

---

## 0 · What this delta ships

Six features layered onto the existing biopharma kit. Read in order — each builds on the last.

| # | Feature | File(s) | Lands as |
|---|---------|---------|----------|
| 1 | **Density toggle** in topbar (Compact / Comfortable / Spacious) — persists to localStorage; CSS-only compression | `styles.css`, `shell.jsx`, `app.jsx` | client preference (`users.preferences->>'density'`) |
| 2 | **Collapsible rail group headers** with smart defaults — workstream open, lifecycle/intelligence/system collapsed | `shell.jsx`, `styles.css` | localStorage (`biopharma.rail.collapsedGroups`) |
| 3 | **Persistent AnA dock** with agentic governed actions — 400px when open, 32px seam when closed; ⌘\\ toggles | `AnaDock.jsx`, `styles.css`, `app.jsx` | covered by `PHASE_10_1_INSTALL.md` (this delta wires the UI, that brief wires the backend) |
| 4 | **Client-type IA** — `clientType: 'medtech' \| 'biotech' \| 'pharma'` filters rail + tabs + Overview content | `data.jsx`, `shell.jsx`, `app.jsx` | `organizations.client_type` (extension) |
| 5 | **Start-of-day Overview** (Claude.ai pattern) — greeting + composer with drop zone + 4 starters + Today queue + collapsed dashboard | `surfaces.jsx`, `styles.css` | uses Phase 9 + Phase 10.1 endpoints |
| 6 | **`<SurfaceComposer>` pattern** rolled out to every pathway surface — IND first, then NDA · BLA · MAA · JNDA · Lifecycle · Pediatric · Orphan · PV · Meetings | `surfaces.jsx`, `styles.css` | same backend; pure UI |

After this delta lands, **every biopharma surface uses the same template:** greeting + state-of-this-surface + composer + starters + Today queue + collapsed dashboard.

---

## 1 · Files

```
ui_kits/biopharma/
├── data.jsx           # + CLIENT_TYPES config (medtech | biotech | pharma)
├── shell.jsx          # + collapsible rail groups · + clientType filter · + density topbar
├── AnaDock.jsx        # persistent dock (already in PHASE_10_1)
├── surfaces.jsx       # + SurfaceComposer component · + Overview redesign · + per-surface Today queues
├── styles.css         # + density modes · + dock CSS · + start-of-day CSS · + tenant switcher
└── app.jsx            # + clientType state · + density state · + dock open/close · + ⌘\ shortcut
```

Lands at `client/src/concept2cure/biopharma/` 1:1 per the file map in `PHASE_10_INSTALL.md §2`.

---

## 2 · Database deltas

This delta is **mostly UI-only.** Three additive columns + one config row:

```sql
-- 1) Client type — biotech vs pharma vs medtech (medtech tenants stay on /mdx).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'pharma'
  CHECK (client_type IN ('medtech', 'biotech', 'pharma'));

-- 2) User preferences — density + rail collapse state + dock open state per user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Stored keys: density ('compact' | 'comfortable' | 'spacious'),
--              rail_collapsed_groups (text[]),
--              ana_dock_open (boolean),
--              ana_agentic_mode (text per domain — also lives in c2c_ana_agentic_prefs).
```

No new tables. Everything heavier (per-surface threads, action ledger) lives in `PHASE_10_1_INSTALL.md`.

---

## 3 · Wiring

### 3.1 Client-type config (`CLIENT_TYPES` in `data.jsx`)

Each tenant type defines:
- `workstream[]` — allowed rail items in the workstream group
- `lifecycle[]` — allowed rail items in the lifecycle group
- `overview.greetingState` — first-line state-of-portfolio summary
- `overview.starters[]` — 4 conversational starters for the Overview composer
- `redirectTo` (medtech only) — redirects to `/mdx`

In v2 the shell reads `org.client_type` from session context and passes it as a `domainConfig` prop to `<Rail>` + `<TopBar>` + `<TabBar>` + `<Overview>`. The kit harness exposes a top-bar switcher for review only — **strip it in v2**.

### 3.2 SurfaceComposer pattern

Every pathway surface now wraps its dashboard in `<SurfaceComposer>`:

```tsx
<SurfaceComposer
  scope="this IND"                                            // free-text for the composer placeholder
  kicker="IND / CTA · §312"                                   // small uppercase label above the title
  title="BX-115 · IND 178902"                                  // headline
  stateLine="3 HAQs open, 3 predicted, 48% clinical Module 5 ready."  // one-line state of this surface
  starters={['Triage every open and predicted HAQ', '...']}    // 4 surface-aware prompts
  queue={[                                                     // Today queue — 3-5 tasks
    { ico: 'globe', title: '3 open HAQs', sub: '...', tone: 'warn', action: 'Pre-draft now', cmd: '/respond ...' },
    ...
  ]}
  primary={<>Submit IND amendment · Draft with AnA</>}         // primary buttons
  onAskAna={askAna}
  dashboardLabel="Reference data · modules, FDA interactions, contradictions, blockers"
>
  {/* The existing dashboard goes here — collapsed by default, expand to scan */}
  <div className="bp-modules-strip">...</div>
  <div className="bp-split-1-1">...</div>
</SurfaceComposer>
```

Pattern was applied to IND in this delta. Apply the same template to the remaining 9 surfaces (NDA · BLA · MAA · JNDA · Lifecycle · Pediatric · Orphan · PV · Meetings) before this PR closes.

### 3.3 AnA dock integration (per-surface threading)

The dock reads `activeNav` and switches its thread per (user, domain, surface). Per `PHASE_10_1_INSTALL.md §3` the backend store is `c2c_ana_conversations.domain` + `c2c_ana_actions` ledger + `c2c_ana_agentic_prefs`.

### 3.4 Density modes

Pure CSS — no JS refactor of any surface. Three modes:
- **Compact** — table sub-labels hidden, KPI sub-lines hidden, kickers hidden, status pills 9.5px, card-head padding 8px
- **Comfortable** (default) — current spacing
- **Spacious** — extra padding, soft card shadow on every card

Toggle persists per user via `users.preferences->>'density'`.

---

## 4 · Routes Phase 10.2 consumes (no new routes — these exist from prior phases)

```
POST /api/c2c/actions/*                 # mutations — every Today-queue button + composer slash command
POST /api/ana-ri/stream                 # AnA dock — chat
GET  /api/c2c/documents/:id             # surface state for the Today queue
GET  /api/regulatory-correspondence/correspondence?inbound=1   # inbound HAQs for IND/NDA surfaces
GET  /api/biopharma/programs/:id        # active program context for the surface
GET  /api/biopharma/predicted-haqs?programId=…                  # Moat #2 — pre-submission HAQ simulator
GET  /api/c2c/documents/:id/sections/:key/gates                # Moat #1 — inline compliance gates
GET  /api/users/me/preferences          # density + rail collapse + dock state
PUT  /api/users/me/preferences          # update them
```

If any of these endpoints don't exist yet, the surface degrades to fixture state (per the existing `live ?? fixture` pattern in MDX).

---

## 5 · Acceptance

- [ ] Density toggle in topbar; Compact / Comfortable / Spacious all visibly compress / expand surfaces.
- [ ] State persists across reload via `users.preferences`.
- [ ] Rail groups (Lifecycle / Intelligence / System) collapse by default; click header to expand. Workstream group always expanded.
- [ ] Tenant-type switcher visible in the kit; backend reads `organizations.client_type` instead in v2.
- [ ] Medtech tenants redirect to `/mdx`.
- [ ] Biotech sees IND · BLA · MAA · JNDA · Precedent + Orphan in lifecycle.
- [ ] Pharma sees IND · NDA · MAA · JNDA · Lifecycle · Precedent + no Orphan in lifecycle.
- [ ] Overview leads with greeting + composer + 4 starters + Today queue.
- [ ] Composer accepts file drag-drop; drop fires `/api/vault/classify` (per Phase 10.6 brief) or falls back to a "Drop received" toast.
- [ ] Each pathway surface uses `<SurfaceComposer>` with a 3-5 item Today queue + 4 surface-scoped starters.
- [ ] Existing dashboard content moves below the composer and collapses by default.
- [ ] AnA dock is persistent across every surface; ⌘\\ toggles open/closed.
- [ ] Dock thread switches per surface (Overview → IND keeps both threads).
- [ ] No regression in MDX kit (delta is biopharma-scoped).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 6 · Out of scope

- **Per-surface backend wiring** (`/api/biopharma/predicted-haqs`, `/api/c2c/documents/:id/sections/:key/gates`) — these are moat-level deliverables; ship the UI now, wire the backend in moat phases.
- **Custom surface composers per-tenant** — every tenant sees the same surfaces, scoped by `clientType`. No tenant-specific layouts.
- **Voice-driven dock composer** — Phase 10.5 candidate.

---

## 7 · Order of operations for Claude Code

1. Read this file end-to-end.
2. Confirm `c2c_ana_conversations` + `c2c_ana_actions` exist (from `PHASE_10_1_INSTALL.md` + `MUTATION_PRIMITIVES_BRIEF.md`). If not, **stop and ship those first**.
3. Port `data.jsx` → `client/src/concept2cure/biopharma/data/clientTypes.ts` (TS, one export per `CLIENT_TYPES` key).
4. Port `surfaces.jsx > SurfaceComposer` → `client/src/concept2cure/biopharma/shell/SurfaceComposer.tsx` (TS, generic).
5. Port `surfaces.jsx > Overview` → `client/src/concept2cure/biopharma/surfaces/Overview.tsx`.
6. Port `surfaces.jsx > IndSurface` → `client/src/concept2cure/biopharma/surfaces/IndSurface.tsx`. **This is the reference implementation**; the remaining 9 surfaces follow the same template.
7. Apply the same template to NDA · BLA · MAA · JNDA · Lifecycle · Pediatric · Orphan · PV · Meetings.
8. Merge `styles.css` deltas into `_shared/app.css` under the `BIOPHARMA SURFACES` banner.
9. Drop the kit-only tenant-type switcher; in v2 it reads from `organizations.client_type` automatically.
10. Run acceptance checklist (§5).
