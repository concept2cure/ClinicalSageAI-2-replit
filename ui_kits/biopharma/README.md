# Phase 10 — Biotech and Pharma (kit)

> Biopharma domain — the second top-level domain alongside MDX. Same rail / topbar / tabbar / AnA seam chassis (lifted from MDX), biopharma-specific data + workstream surfaces. This is what a second domain looks like in v2: shared chassis, swap data + workstreams.

## What this kit ships

**Hero surfaces (fully built):**
- **Overview** — portfolio table · KPI strip · cross-program blockers · recent activity feed
- **IND / CTA** — 5-module readiness strip · FDA interactions stream · cross-module contradictions registry · blockers table
- **NDA · 505(b)** — CTD module strip · pivotal studies table · FDA review clock (filing → mid-cycle → day 120 → PDUFA)
- **Pediatric · PIP / PSP** — plans table (FDA iPSP + EMA PIP) · PREA KPIs · upcoming milestones
- **Pharmacovigilance · PSUR** — signals table with PRR + status · aggregate-report cycle list

**Reusable pathway surface:**
- **BLA · 351(a)**, **MAA · EU centralized** — render via shared `<BiopharmaPathway>` component (same chassis, different `pathwayKey`)

**In-design stubs (Phase 10.1):**
- Precedent intelligence (biopharma-specific) · CMC · Clinical operations · Orphan · Biostatistics

**Shared chassis stubs:**
- Tasks, AnA Review, Vault, Validation, Submissions, Templates, Analytics, Memory, Conversations, Search, Notifications, Audit, Onboarding, Admin — these reuse MDX components verbatim in v2. The stub explains the share to reviewers.

## Why the chassis is lifted, not forked

In v2, the rail / topbar / tabbar / AnA seam is one component family that takes `domain="mdx"` or `domain="biopharma"` and reads the right data. This kit emulates that by:

1. Linking `../mdx/app.css` + `../mdx/surfaces.css` directly (no duplication).
2. Re-using `../mdx/icons.jsx` verbatim.
3. Writing a thin biopharma `shell.jsx` (Rail + TopBar + TabBar + AnaSeam) that reads `BIOPHARMA_NAV_GROUPS` / `BIOPHARMA_NAV_V2` aliased to MDX names — so the rail renders the biopharma rail items, but the chrome is identical.

No CSS divergence. No icon set divergence. Two domains share one chassis.

## Files

| File           | Purpose |
| -------------- | ------- |
| `index.html`   | Mount — loads MDX chassis CSS + biopharma deltas + biopharma scripts |
| `styles.css`   | Biopharma-specific surface CSS, all `.bp-*` prefixed |
| `data.jsx`     | Nav groups · nav items · programs · IND/NDA/Pediatric/PV fixtures · suggestions |
| `shell.jsx`    | Rail (lifted from MDX) · TopBar (biopharma breadcrumb) · TabBar (biopharma pathways) · AnaSeam |
| `surfaces.jsx` | All 7 surfaces (5 fully built + 1 reusable + 1 stub) in one file |
| `app.jsx`      | Composer + route table + AnA-toast handoff |

## What is intentionally static

- AnA toast surfaces the message; doesn't post to the gateway.
- ⌘K palette pulls the first surface suggestion as a stand-in.
- Workbench / Lifecycle / System surfaces show "shared chassis" stubs explaining the v2 share.
- Mode-switch links (e.g. "Draft with AnA") log to the toast — wiring lives in Phase 9 authoring.

## Surfaces

```
Overview
  ┌─────────────────────────────────────────────────────────────────┐
  │ Kicker · Title · meta                       [Start new program] │
  │ ─────────────────────────────────────────────────────────────── │
  │ 4 KPI cards: readiness · pending · PSURs · pediatric            │
  │ ─────────────────────────────────────────────────────────────── │
  │ Programs table                  │  Blockers · Recent activity   │
  └─────────────────────────────────────────────────────────────────┘

IND / CTA
  ┌─────────────────────────────────────────────────────────────────┐
  │ BX-115 · Phase II open-label    [Submit amendment]  [Draft AnA] │
  │ ─────────────────────────────────────────────────────────────── │
  │ 5 module cards: M1 · M2 · M3 · M4 · M5 with readiness           │
  │ ─────────────────────────────────────────────────────────────── │
  │ FDA interactions stream         │  Contradictions registry      │
  │ ─────────────────────────────────────────────────────────────── │
  │ Blockers table                                                   │
  └─────────────────────────────────────────────────────────────────┘

NDA · 505(b)
  ┌─────────────────────────────────────────────────────────────────┐
  │ BX-204 · NDA filing             [Export pack]  [File NDA]       │
  │ ─────────────────────────────────────────────────────────────── │
  │ 5 CTD module cards                                              │
  │ ─────────────────────────────────────────────────────────────── │
  │ Pivotal studies table           │  FDA review clock             │
  │                                 │  filed → mid-cycle → PDUFA    │
  └─────────────────────────────────────────────────────────────────┘

Pediatric · PIP/PSP
  ┌─────────────────────────────────────────────────────────────────┐
  │ Pediatric strategy             [+ Open pediatric plan]          │
  │ ─────────────────────────────────────────────────────────────── │
  │ 4 PREA KPI cards                                                │
  │ ─────────────────────────────────────────────────────────────── │
  │ Plans table (FDA iPSP + EMA PIP)                                │
  │ ─────────────────────────────────────────────────────────────── │
  │ Upcoming PREA milestones                                        │
  └─────────────────────────────────────────────────────────────────┘

Pharmacovigilance
  ┌─────────────────────────────────────────────────────────────────┐
  │ Safety surveillance            [Submit safety report]           │
  │ ─────────────────────────────────────────────────────────────── │
  │ Active signals · FAERS + EudraVigilance · PRR + status          │
  │ ─────────────────────────────────────────────────────────────── │
  │ Aggregate reports in cycle (PSUR + PBRER)                       │
  └─────────────────────────────────────────────────────────────────┘
```

## Where this lives in the rail

The home rail's `Biotech and Pharma` item (`ui_kits/home/data.jsx`) currently has `href: null`. Phase 10 wires it to this kit. No new rail item; one domain entry point.

## Acceptance (kit-level — full v2 contract in PHASE_10_INSTALL.md)

- [x] 7 surfaces render in a 1440-wide viewport without horizontal scroll.
- [x] Tab switching between Overview / IND / NDA / BLA / MAA / Precedent works.
- [x] Rail dispatch to all 27 nav items renders either a surface or a clear stub.
- [x] AnA toast fires on every Ask-AnA chip click.
- [x] CSS deltas (`.bp-*`) don't collide with any MDX selector.
- [x] No new design tokens introduced — all colors come from `colors_and_type.css`.
