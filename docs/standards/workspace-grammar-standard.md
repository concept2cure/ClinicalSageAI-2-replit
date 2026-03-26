# Canonical Workspace Grammar Standard

> Version 1.0.0 — Established 2026-03-24
> This is the law for the core biotech workflow. Not a suggestion.

## Canonical Primitives

All core workflow surfaces MUST use these primitives from `@/components/ui/workspace-primitives`.

### Primitive Decision List

| Primitive | Status | Source | Purpose |
|-----------|--------|--------|---------|
| `WorkspaceHeader` | **NEW** | workspace-primitives.tsx | Canonical sub-page header (h-11, back, breadcrumb, status, actions) |
| `WorkspaceHeaderRich` | **NEW** | workspace-primitives.tsx | Multi-line section header (title + secondary info + actions) |
| `PageTitleHeader` | **NEW** | workspace-primitives.tsx | Dashboard-level title (h1, badges, description) |
| `WorkspaceCanvas` | **NEW** | workspace-primitives.tsx | Content area wrapper (flex-1, overflow, max-width, padding) |
| `WorkspaceTabBar` | **NEW** | workspace-primitives.tsx | Tab navigation with counts and ARIA roles |
| `WorkspaceActionBar` | **NEW** | workspace-primitives.tsx | Left/right action layout for toolbars |
| `WorkspaceStatusStrip` | **NEW** | workspace-primitives.tsx | Progress bar + summary for readiness |
| `WorkspaceStatusBadge` | **NEW** | workspace-primitives.tsx | Status pill (colored icon + label) |
| `SectionPanel` | **NEW** | workspace-primitives.tsx | Card with optional header (replaces inline rounded-xl cards) |
| `InspectorPanel` | **NEW** | workspace-primitives.tsx | Right-rail inspector wrapper (w-72, border-l) |
| `SecondaryInfoItem` | **NEW** | workspace-primitives.tsx | Dot-separated metadata in headers |
| `WORKFLOW_STATUS_CONFIG` | **NEW** | workspace-primitives.tsx | Single source of truth for status colors/icons |
| `STATUS_ICON_MAP` | **NEW** | workspace-primitives.tsx | Icon + color map for tree/list status indicators |
| `EmptyState` | **KEEP** | statesV2.tsx | Empty collection display |
| `LoadingState` | **KEEP** | statesV2.tsx | Loading indicator |
| `ErrorState` | **KEEP** | statesV2.tsx | Error with retry |
| `DataStateWrapper` | **KEEP** | statesV2.tsx | 5-state async wrapper |
| `Spinner` | **KEEP** | spinner.tsx | Inline loading |
| `Tabs` | **KEEP** | tabs.tsx | Radix tabs (for non-workflow contexts) |
| `Card` | **KEEP** | card.tsx | Generic card (non-workflow contexts) |
| `Sheet` | **KEEP** | sheet.tsx | Slide-out drawer (Radix) |
| `Dialog` | **KEEP** | dialog.tsx | Modal dialog (Radix) |
| `Badge` | **KEEP** | badge.tsx | Generic badge (non-workflow contexts) |

### Deprecated Patterns (DO NOT USE in core workflow)

| Pattern | Replacement |
|---------|-------------|
| `const STATUS_CONFIG = { ... }` in workflow files | `WORKFLOW_STATUS_CONFIG` from workspace-primitives |
| `const STATUS_ICON = { ... }` in workflow files | `STATUS_ICON_MAP` from workspace-primitives |
| Inline `<div className="flex items-center gap-3 px-4 h-11 border-b ...">` | `<WorkspaceHeader>` |
| Inline `<div className="flex-1 flex flex-col min-h-0 overflow-y-auto">` + `<div className="max-w-3xl mx-auto">` | `<WorkspaceCanvas>` |
| Inline tab bars with `-mb-px border-b-2` buttons | `<WorkspaceTabBar>` |
| Inline `<div className="rounded-xl border border-zinc-200 bg-white">` with title header | `<SectionPanel>` |
| `<Loader2 className="animate-spin" />` | `<Spinner>` from spinner.tsx |
| Inline empty state divs | `<EmptyState>` from statesV2.tsx |

## Shell Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ ZenApp (master shell)                                           │
│  ├── ZenSidebar (left rail — project list, settings)            │
│  ├── Content Area (flex-1)                                      │
│  │    ├── ProjectHomeDashboard  → WorkspaceCanvas + PageTitleHeader
│  │    ├── DossierMap            → WorkspaceHeader + WorkspaceCanvas + SectionPanel
│  │    ├── SectionWorkspace      → WorkspaceHeaderRich + WorkspaceTabBar
│  │    ├── SubmissionReadiness   → WorkspaceHeader + WorkspaceCanvas + WorkspaceStatusStrip
│  │    ├── PlatformHome          → WorkspaceCanvas
│  │    └── ProjectWorkspaceShell → 3-column layout (file tree | editor | inspector)
│  ├── AnaPersistentPanel (right drawer — Claude.ai style chat)   │
│  └── DrSageGlobalLayer (operator overlay)                       │
└─────────────────────────────────────────────────────────────────┘
```

## Enforcement

1. **ESLint**: `no-restricted-imports` blocks deprecated `@/components/ui/states`, `LoadingOverlay`, `ThinkingDots`
2. **Grep script**: `scripts/check-workspace-grammar.sh` checks for local STATUS_CONFIG, inline headers, Loader2 animate-spin
3. **Code review**: New core workflow surfaces must use workspace-primitives — no new local layout patterns without explicit approval
