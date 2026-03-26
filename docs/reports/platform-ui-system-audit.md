# ClinicalSageAI Platform UI System Audit

> **Date**: 2026-03-25
> **Scope**: Shell architecture, navigation, design tokens, component library, routing, layout wrappers
> **Methodology**: 5 parallel deep-dive audits across the full client codebase

---

## Executive Summary

ClinicalSageAI has a **sophisticated, well-architected app shell** (ZenApp) with clear layout mode management and good separation of concerns. However, the **design token system is critically fragmented across 4+ competing sources**, creating maintenance risk and visual inconsistency. The component library (shadcn/ui + enterprise layer) is solid at ~75% consistency but lacks key primitives (DataTable, unified modals). Dead code from previous consolidation phases remains in the layout layer.

**Overall Design System Maturity: 6.5/10**

| Dimension | Score | Status |
|-----------|-------|--------|
| Shell Architecture | 9/10 | Excellent — ZenApp layout mode system works well |
| Component Library | 7/10 | Good foundation, needs DataTable + consolidation |
| Design Token System | 3/10 | **CRITICAL** — 4 competing sources of truth |
| Navigation & Routing | 8/10 | Clean wouter-based, clear auth patterns |
| Color Consistency | 4/10 | Blue vs terracotta conflicts across systems |
| Spacing Consistency | 5/10 | gap-2 overused, p-4 vs p-5 inconsistency |
| Icon System | 9/10 | Lucide React exclusive, well-applied |
| Form System | 8/10 | react-hook-form + shadcn well-integrated |
| Dead Code | 4/10 | 7+ dead layout components, legacy portal |
| Documentation | 3/10 | Storybook configured but empty |

---

## 1. Shell & Layout Architecture

### Primary Shell: ZenApp (113KB)

**File**: `client/src/concept2cure/ZenApp.tsx`

ZenApp is the single authenticated shell for the entire application. It manages:

- **40+ layout modes** via state machine (projects, regulatory-workspace, documents, section-workspace, editor, review, etc.)
- **Sidebar** (ZenSidebar) — 260px expanded, 60px collapsed
- **Main Chat** (ZenChat) — Claude.ai-style interface
- **Tool Panels** — slide from right, 600px lg / 400px md / full sm
- **Command Palette** (⌘K) — global action search
- **Persistent AI** (AnaPersistentPanel) — always available
- **Project Switcher** — modal overlay
- **Dr. Sage** — help/guide copilot layer

**Navigation Flow**:
```
URL Path → Project ID extraction → Layout Mode determination
    ↓
Active Project → Authoring Context resolution
    ↓
Child surfaces (workspace/editor/dossier) → Context callbacks
```

**Keyboard Shortcuts**: ⌘K (command palette), ⌘N (new chat), ⌘, (settings), ⌘E (edit project), Escape (close panel)

### Secondary Shell: ProjectWorkspaceShell

**File**: `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`

3-column layout:
- **Left Rail** (220px, collapsible): files | dossier | templates | outline
- **Center** (flex): DocumentListPane or EditorPanel
- **Right Inspector**: provenance/compare/audit (when document open)

### Legacy Shell: PortalFrame (portal-v2)

**File**: `client/src/portal-v2/layouts/PortalFrame.tsx`

Separate navigation system with TopBar, SidebarNav, MobileNav. **Disconnected from ZenApp** — creates parallel UX.

---

## 2. Routing Architecture

**Router**: wouter (lightweight React router)

### Route Map (22 top-level routes)

| Route Pattern | Shell | Layout |
|---------------|-------|--------|
| `/` | ZenApp | Projects list |
| `/projects/:id` | ZenApp | Project workspace |
| `/projects/:id/sections/:code` | ZenApp | Section workspace |
| `/projects/:id/documents/:docId` | ZenApp | Document editor |
| `/regulatory-workspace` | ZenApp | Regulatory dashboard |
| `/documents` | ZenApp | Document browser |
| `/review` | ZenApp | Review interface |
| `/login`, `/signup` | ZenAuthLayout | Centered ~400px form |
| `/legal/*` | LegalPageLayout | max-w-4xl, prose |
| `/reset-password` | Standalone | Minimal |
| `/proof/:id` | Standalone | Certificate viewer |
| `/onboarding` | Standalone | Wizard |

### 20+ Compatibility Redirects
Demoted pages from Batch 1-3 cleanup redirect to active layout modes. Examples: `/analytics` → `/`, `/vault` → `/documents`.

### Pages Bypassing Main Shell
Auth pages, legal pages, password reset, proof certificate viewer, onboarding wizard — all use separate lightweight wrappers.

---

## 3. Design Token System — CRITICAL FRAGMENTATION

### Source 1: `tokens.ts` (TypeScript exports)

**File**: `client/src/design-system/tokens.ts` (411 lines)

Comprehensive, well-organized TypeScript token system:
- Color palette: neutral, primary (**blue #4361EE**), success, warning, error, info, accent
- Typography: Inter/Poppins sans, JetBrains Mono mono
- Spacing: 4px grid, 0-32 scale
- Shadows, transitions, z-index, breakpoints
- Semantic tokens (bg, text, border, interactive)

**Problem**: Primary color is **blue** — conflicts with zen/tailwind terracotta.

### Source 2: `tailwind.config.ts` (Anthropic Warm Remap)

**File**: `tailwind.config.ts` (291 lines)

Replaces ALL Tailwind default colors:
- warmNeutral (cream-based grays)
- **terracotta (#d97757)** — replaces blue/indigo as primary
- anthropicBlue (#6a9bcc) — secondary accent
- earthyGreen (#788c5d) — replaces green/emerald
- shadcn/ui semantic tokens (background, foreground, card, etc.)
- Fonts: heading=Poppins, body=Lora, ui=Poppins

**Problem**: `bg-blue-500` in Tailwind renders as **terracotta**, not blue.

### Source 3: `zen.css` (CSS Variables)

**File**: `client/src/concept2cure/design/zen.css` (500+ lines)

CSS custom properties layer:
- Canvas: --zen-canvas (#faf9f5)
- Ink: --zen-ink (#141413)
- **Accent: --zen-accent (#d97757)** — matches tailwind terracotta
- AI: --zen-ai (#6a9bcc)
- Status colors, borders, shadows, radius, transitions
- Layout: --zen-sidebar-collapsed (60px), --zen-sidebar-expanded (260px), --zen-header-height (48px)
- 50+ utility classes (.zen-shell, .zen-btn*, .zen-card*, .zen-input*, etc.)

### Source 4: `index.css` (Motion Variables)

**File**: `client/src/index.css`

```css
--motion-duration-fast: 120ms;   /* zen.css says 100ms */
--motion-duration-normal: 180ms; /* zen.css says 200ms */
--motion-duration-slow: 240ms;   /* zen.css says 300ms */
```

### Source 5: Scattered Component CSS

Undefined variables used in component CSS files:
```css
--color-surface        /* NEVER DEFINED */
--color-primary-dark   /* NEVER DEFINED */
--color-on-primary     /* NEVER DEFINED */
--color-text-secondary /* NEVER DEFINED */
```

**Files affected**: Breadcrumbs.css, UnifiedTopNavV5.css, TimelineSimulator.css, chart.tsx

### Token Conflict Summary

| Token | tokens.ts | tailwind.config.ts | zen.css | index.css |
|-------|-----------|---------------------|---------|-----------|
| Primary color | #4361EE (blue) | #d97757 (terracotta) | #d97757 (terracotta) | — |
| Fast transition | — | — | 100ms | 120ms |
| Normal transition | — | — | 200ms | 180ms |
| Slow transition | — | — | 300ms | 240ms |
| Font sans | Inter/Poppins | Poppins/Lora | — | — |
| Breakpoint xs | 475px | (Tailwind default) | — | — |

---

## 4. Component Library

### Foundation: shadcn/ui (58 components)

**Location**: `client/src/components/ui/`

Top usage:
| Component | Imports | Status |
|-----------|---------|--------|
| Button | 199 | ✅ Consistent |
| Badge | 152 | ✅ Consistent |
| Card | 135 | ✅ Consistent |
| Input | 109 | ✅ Consistent |
| Tabs | 84 | ✅ Consistent |
| Progress | 66 | ✅ Consistent |
| Label | 61 | ✅ Consistent |
| Textarea | 51 | ✅ Consistent |
| Alert | 37 | ✅ Moderate |
| Tooltip | 31 | ✅ Moderate |

### Enterprise Design Layer (7 components)

**Location**: `client/src/concept2cure/components/ui/`

- **EnterpriseCard** — rounded-xl, border-zinc-200, shadow-sm, bg-white
- **CardHeader** — icon slot, subtitle, right actions, size variants
- **CardSection** — content sections with optional tint
- **EnterpriseButton** — intent-based (primary, secondary, danger, ghost)
- **MetricCard** — label + value + icon + trend
- **ActionButton** — universal deliverable button (generate, export, run, save, submit)
- **InlineAIButton/InlineAIMenu** — AI actions in document context

Design rules codified: p-5 card padding, gap-4 sections, gap-2 items, text-zinc-900 headings, text-zinc-600 body, text-zinc-500 muted.

### Icon System

**Library**: Lucide React exclusively (405 files)
**No alternatives** (no react-icons, @heroicons, custom SVGs)
**Sizing**: w-4 h-4 (inline), w-5 h-5 (container), w-8 h-8 (large)

### Form System

**Library**: react-hook-form (170 files)
**Pattern**: Form → FormField → Controller + FormItem → FormLabel + FormControl + FormMessage
**Validation**: Zod schemas
**Status**: ✅ Well-standardized

### Toast System — MIXED

- shadcn/ui `toast.tsx` exists (1 import)
- **react-toastify** is the de-facto standard
- Both coexist — confusion risk

---

## 5. Inconsistencies Catalog

### SEVERITY 1 (Critical)

| Issue | Impact | Affected |
|-------|--------|----------|
| **4 competing token sources** | Maintenance nightmare, visual inconsistency | Entire frontend |
| **Primary color conflict** (blue vs terracotta) | Components render wrong colors | Any component using tokens.ts + Tailwind |
| **Undefined CSS variables** | Silent rendering failures | Breadcrumbs, TopNav, Timeline, Charts |

### SEVERITY 2 (High)

| Issue | Impact | Affected |
|-------|--------|----------|
| **7 dead sidebar/layout components** | Code bloat, developer confusion | `components/layout/` directory |
| **No DataTable component** | 6+ independent table implementations | All tabular views |
| **Mixed toast systems** | Inconsistent notification UX | Entire app |
| **Motion timing conflicts** (100ms vs 120ms) | Inconsistent animation feel | All animated elements |
| **Radix overrides with !important** | Breaks theming, accessibility risk | index.css lines 36-96 |
| **28 instances of border-gray-200** | Should be border-zinc-200 per design system | Scattered components |

### SEVERITY 3 (Medium)

| Issue | Impact | Affected |
|-------|--------|----------|
| **Card padding p-4 vs p-5** | Enterprise standard is p-5 but ~100 components use p-4 | Feature components |
| **~90 ad-hoc status badges** | Should use StatusPill component | Feature components |
| **40+ custom empty/loading/error states** | Centralized states.tsx exists but unused | Feature components |
| **portal-v2 parallel navigation** | Two disconnected nav systems | Portal users |
| **gap-2 overuse** (922 occurrences) | Tight spacing where gap-3/4 appropriate | Feature components |
| **No ConfirmDialog pattern** | 20+ one-off confirm dialogs | Destructive actions |

---

## 6. Dead Code Inventory

### Layout Components (DELETE)

| File | Status | Notes |
|------|--------|-------|
| `client/src/components/layout/Sidebar.tsx` | ❌ DEAD | Old NavItem pattern |
| `client/src/components/layout/SidebarUpdated.tsx` | ❌ DEAD | Never imported |
| `client/src/components/layout/UpdatedSidebar.tsx` | ❌ DEAD | Iteration |
| `client/src/components/layout/UpdatedSidebar.new.tsx` | ❌ DEAD | Iteration |
| `client/src/components/layout/NewSidebar.tsx` | ❌ DEAD | Experimental |
| `client/src/components/layout/MergedSidebar.tsx` | ❌ DEAD | Consolidation attempt |
| `client/src/components/layout/TopNavbar.tsx` | ❌ DEAD | Replaced by zen |

### Legacy Portal (EVALUATE)

| File | Status | Notes |
|------|--------|-------|
| `client/src/portal-v2/layouts/PortalFrame.tsx` | ⚠️ LEGACY | Separate shell |
| `client/src/portal-v2/layouts/TopBar.tsx` | ⚠️ LEGACY | Portal header |
| `client/src/portal-v2/layouts/SidebarNav.tsx` | ⚠️ LEGACY | Portal nav |
| `client/src/portal-v2/layouts/MobileNav.tsx` | ⚠️ LEGACY | Portal mobile |

---

## 7. Missing Components

| Component | Priority | Rationale |
|-----------|----------|-----------|
| DataTable\<T\> | **HIGH** | 6+ independent table implementations |
| ConfirmDialog | **HIGH** | 20+ one-off confirm patterns |
| DatePicker | HIGH | Calendar exists but no full picker |
| ComboBox | MEDIUM | Select limited; need search+select |
| IconButton | MEDIUM | 388+ inline icon classNames |
| PageLayout | MEDIUM | Consistent page frame |
| EmptyState (unified) | MEDIUM | 40+ custom implementations |
| FormSection | MEDIUM | Group related form fields |

---

## 8. Recommended Actions

### Phase 1: Consolidate Design Tokens (BLOCKING — do first)

1. **Make `tailwind.config.ts` the single source of truth** for all design tokens
2. Generate CSS variables from tailwind config at build time (PostCSS plugin)
3. Export TypeScript types from tailwind config (`declare module`)
4. **Deprecate `tokens.ts`** — it defines blue as primary, conflicting with the actual terracotta brand
5. **Align zen.css** to consume tailwind-generated CSS variables (not define its own)
6. Remove conflicting motion variables from `index.css`
7. Define all `--color-*` variables used in component CSS files or remove their usage

### Phase 2: Fix Component Gaps (HIGH)

1. **Create DataTable\<T\>** component with sorting/filtering/pagination (use existing Table primitive)
2. **Standardize toast** — pick react-toastify OR shadcn toast, not both
3. **Create ConfirmDialog** wrapping shadcn Dialog
4. **Migrate 28 border-gray-200** → border-zinc-200
5. **Remove Radix !important overrides** from index.css, use Radix theming API

### Phase 3: Clean Dead Code (MEDIUM)

1. **Delete 7 dead layout components** from `components/layout/`
2. **Evaluate portal-v2** — merge into ZenApp or explicitly document as separate product
3. **Consolidate states.tsx + statesV2.tsx** into single empty/loading/error system
4. **Migrate 90+ ad-hoc badges** to StatusPill

### Phase 4: Documentation & Testing (MEDIUM)

1. Expand Storybook with stories for all shadcn/ui + enterprise components
2. Add visual regression tests for color system
3. Document spacing scale (xs=2, sm=3, md=4, lg=6, xl=8)
4. Accessibility audit (WCAG AA) — Radix provides a11y but overrides may break it

---

## 9. File Reference

### Design System (Sources of Truth — to consolidate)
- `client/src/design-system/tokens.ts` — TS tokens (DEPRECATE)
- `tailwind.config.ts` — Tailwind theme (MAKE CANONICAL)
- `client/src/concept2cure/design/zen.css` — CSS variables (ALIGN)
- `client/src/index.css` — Global CSS entry (CLEAN UP)

### Shell Components (Active)
- `client/src/concept2cure/ZenApp.tsx` — Main shell (113KB)
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` — Workspace layout
- `client/src/concept2cure/components/sidebar/ZenSidebar.tsx` — Left navigation
- `client/src/concept2cure/components/chat/ZenChat.tsx` — Main chat
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` — Persistent AI
- `client/src/concept2cure/components/command/ZenCommandPalette.tsx` — Command palette

### Component Library
- `client/src/components/ui/` — 58 shadcn/ui primitives
- `client/src/concept2cure/components/ui/enterprise.tsx` — Enterprise design layer
- `client/src/concept2cure/components/ui/ActionButton.tsx` — Action buttons

### Dead Code (to delete)
- `client/src/components/layout/Sidebar.tsx`
- `client/src/components/layout/SidebarUpdated.tsx`
- `client/src/components/layout/UpdatedSidebar.tsx`
- `client/src/components/layout/UpdatedSidebar.new.tsx`
- `client/src/components/layout/NewSidebar.tsx`
- `client/src/components/layout/MergedSidebar.tsx`
- `client/src/components/layout/TopNavbar.tsx`

---

*Report generated from 5 parallel deep-dive audits covering shell architecture, navigation, design tokens, component library, routing, and layout wrappers.*
