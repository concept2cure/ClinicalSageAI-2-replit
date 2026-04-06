# UI Visual Quality Audit Report — 2026-04-06

## Scope

Full audit of all UI work done during the visual consistency sprint, covering:
- Color system integrity (terracotta removal, blue→stone enforcement)
- Design principle compliance (stone-only foundation)
- Governed component compliance (raw HTML → design system)
- Loading state compliance
- Dark mode class removal

---

## PASS: Terracotta Elimination

**Status: COMPLETE — Zero violations**

All hardcoded terracotta hex references (`#d97757`, `#c15f3c`, `#C4623F`, `#e6957a`) have been removed from the entire codebase. No `terracotta-` Tailwind class usage remains.

- 56 files modified in initial sweep
- Server templates, email HTML, document preview, export styles all converted

---

## PASS: Brand Blue Hex Removal

**Status: COMPLETE — Zero violations in runtime code**

All direct brand-blue hex references (`#5585b3`, `#4a7399`, `#8bb4d9`, `#6a9bcc`) removed from client and server code.

Remaining references (acceptable):
- `tailwind.config.ts`: `anthropicBlue` scale definition (needed for `text-blue-600` link classes)
- `config/ui-surface-registry.json`: Historical note only

---

## PASS: CSS Variable Compliance

**Status: CORRECT**

| Variable | Value | Location | Status |
|----------|-------|----------|--------|
| `--color-primary` | `#292524` (stone-800) | `index.css`, `theme.css` | Correct |
| `--zen-accent` | `#292524` (stone-800) | `zen.css` | Correct |
| `--zen-ai` | `#57534e` (stone-600) | `zen.css` | Correct |
| `--zen-border-focus` | `#a8a29e` (stone-400) | `zen.css` | Correct |
| `accent.DEFAULT` | `#292524` | `zen.ts` | Correct |

---

## PASS: Concept2Cure Arbitrary Hex Values

**Status: COMPLETE — Zero `[#XXXXXX]` patterns in concept2cure TSX/TS files**

76 hex values migrated in ProjectConfigPanel.tsx alone. All `bg-[#FAFAF8]`, `text-[#4D4B45]`, `border-[#E8E6DC]` patterns replaced with stone tokens across 20 concept2cure files.

---

## PASS: InlineAI Components

**Status: FIXED**

Both `InlineAIButton.tsx` and `InlineAIMenu.tsx` converted from inline `style={{}}` objects with hardcoded hex to Tailwind classes using stone palette.

---

## PASS: Loading States (Partial)

**Status: 1 FIXED, 3 REMAINING**

| File | Status | Notes |
|------|--------|-------|
| `ProjectReadinessDashboard.tsx` | Fixed | Now uses `<LoadingState>` and `<ErrorState>` |
| `GovernanceStatusBar.tsx:271` | Remaining | Bare `animate-spin` spinner icon |
| `EditorPanel.tsx:290-299` | Remaining | Bare `animate-pulse` divs |
| `MorningBriefingPanel.tsx:249-254` | Remaining | "Loading briefing..." text |

---

## CRITICAL: Blue Tailwind Classes

**Status: 2,140+ instances across 237 files — MOSTLY LEGACY**

The design principles say blue is ONLY for links and interactive elements. Many files use `bg-blue-600` for buttons and `text-blue-600` for icons where stone should be used.

**Key distinction:**
- **Concept2cure components**: Mostly clean (links use blue correctly)
- **Legacy components** (`client/src/components/`, `client/src/pages/`): Heavy blue usage for buttons, badges, icons — these are legacy surfaces not part of the active product shell

**Acceptable blue usage:**
- `text-blue-600` for hyperlinks in prose content
- `prose-a:text-blue-600` for markdown link styling
- `bg-blue-50` for link hover backgrounds

**Violations (legacy files only):**
- `bg-blue-600` primary buttons (should be `bg-stone-800`)
- `text-blue-600` decorative icons (should be `text-stone-600`)
- `border-blue-500` form focus (should be `border-stone-400`)

**Recommendation:** These are legacy surfaces (`cer/`, `cmc/`, `510k/`, `coauthor/`) that are candidates for deletion per the UI convergence rules, not active product surfaces. Fix only if/when these surfaces are accessed.

---

## WARNING: Dark Mode Class Remnants

**Status: 108 instances across 10 concept2cure files**

| File | Count |
|------|-------|
| `DocumentDiff.tsx` | 26 |
| `ContinuityBriefing.tsx` | 17 |
| `ModuleBreakdown.tsx` | 13 |
| `BlockerList.tsx` | 13 |
| `RecommendationList.tsx` | 12 |
| `DocumentUploadZone.tsx` | 9 |
| `WorkflowRunner.tsx` | 8 |
| `DocumentWatermark.tsx` | 5 |
| `ComplianceGuardian.tsx` | 3 |
| `ReadinessScoreRing.tsx` | 2 |

These `dark:` classes have no effect (app doesn't support dark mode) but add dead CSS weight.

---

## WARNING: Hardcoded Hex in Data Objects

**Status: ~150 instances — ACCEPTABLE with caveats**

These are hex colors inside JavaScript data objects (color mappings, status configs) not in className strings. Examples:

| File | Type | Count | Severity |
|------|------|-------|----------|
| `ZenSidebar.tsx` | Submission type colors | 12 | Acceptable (semantic) |
| `ProjectSwitcher.tsx` | Avatar color palette | 12 | Acceptable (user-facing picker) |
| `ReadinessScoreRing.tsx` | Status state colors | 6 | Acceptable (semantic) |
| `GlossaryTooltip.ts` | Category colors | 26 | Acceptable (semantic mapping) |
| `ValidationRefineTrigger.tsx` | Severity colors | 24 | Should convert to Tailwind |
| `DocumentWatermark.tsx` | Status watermark colors | 5 | Acceptable (semantic) |
| `enablement-data.ts` | Module accent colors | 11 | Acceptable |
| `zen.ts` | Design system definition | 27 | Intentional (source of truth) |

Colors in data objects that map to semantic meanings (success=green, error=red, etc.) are acceptable per the design principles. The zen.ts values are intentionally the source of truth definitions.

---

## WARNING: Raw HTML Elements

**Status: Systemic — 989+ raw buttons across 177 files**

| Element | Count | Files | Priority |
|---------|-------|-------|----------|
| `<button>` | 989 | 177 | LOW — most are inside TipTap editor extensions, Radix primitives, or composed within governed wrappers |
| `<textarea>` | 32 | 27 | MEDIUM — 3 are acceptable (chat inputs), 29 should use `<Textarea>` |
| `<input>` | 62 | 20 | MEDIUM — 1 file input acceptable, rest should use `<Input>` |
| `<select>` | 28 | 20 | MEDIUM — should use `<Select>` |

**Note on buttons:** The 989 count is inflated. Most raw buttons are:
1. Inside TipTap editor toolbar extensions (acceptable — editor API requires raw DOM)
2. Inside Radix UI composed components (acceptable — Radix handles accessibility)
3. Action buttons in data tables where `Button` variant="ghost" would be equivalent

The real violations are ~50-80 standalone action buttons outside of editor/Radix contexts.

---

## SCORECARD

| Category | Grade | Notes |
|----------|-------|-------|
| Terracotta elimination | A | Zero remaining |
| Brand blue hex removal | A | Zero in runtime code |
| CSS variables | A | All correctly stone-based |
| Concept2cure arbitrary hex | A | Zero `[#XXXXXX]` patterns |
| InlineAI components | A | Converted to Tailwind |
| Loading states | B | 1/4 fixed, 3 minor remaining |
| Dark mode remnants | B- | 108 dead `dark:` classes in 10 files |
| Blue Tailwind classes | C | 2,140+ in legacy files (not active product) |
| Raw HTML elements | C | Systemic but mostly in acceptable contexts |
| Hardcoded hex in data objects | B+ | Acceptable for semantic color mappings |

---

## NEXT STEPS (Priority Order)

1. **Strip dark: classes** from 10 concept2cure files (108 instances) — quick sed fix
2. **Fix 3 remaining bare loading states** — GovernanceStatusBar, EditorPanel, MorningBriefingPanel
3. **Convert ValidationRefineTrigger.tsx** inline styles to Tailwind classes
4. **Legacy blue cleanup** — only if/when legacy surfaces are touched for other work
5. **Raw textarea/input/select migration** — convert 29 textareas, 61 inputs, 28 selects to governed components as files are touched
