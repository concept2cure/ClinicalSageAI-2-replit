# Skill: Claude UI Design Principles

## Description

Anthropic-quality UI/UX design principles governing all Concept2Cure interface work. Every screen, component, and interaction must embody these principles. This is not a style guide — it is a design philosophy.

## Activation

This skill activates when:
- Creating or modifying any React component in `client/src/`
- Designing new UI flows, layouts, or interactions
- Reviewing UI code for quality
- Making decisions about information density, animation, color, or typography

## Core Philosophy

**The interface should feel like a conversation with a trusted colleague — calm, intelligent, and never in the way.**

Anthropic's Claude interface succeeds because it trusts the user. It doesn't shout, decorate, or overwhelm. It presents information with quiet confidence and gets out of the way. Every pixel earns its place.

## The 12 Principles

### 1. Calm Over Loud

- The UI should never feel urgent or anxious
- Muted stone palette (`stone-50` through `stone-900`) as the foundation
- Color is reserved for meaning: `emerald` = success/safe, `amber` = attention, `red` = critical, `blue` = interactive/link
- No gradients, no shadows deeper than `shadow-sm`, no glowing borders
- White space is a feature, not wasted space

### 2. Typography Hierarchy (Never Shout)

- `text-lg font-semibold` = page title (one per view)
- `text-[13px] text-stone-700` = body content (the workhorse)
- `text-[11px] text-stone-400 uppercase tracking-wide font-semibold` = section labels
- `text-[10px] text-stone-400` = metadata, timestamps, secondary info
- `font-mono` only for codes (CTD sections, version numbers)
- Never use `text-xl` or larger inside content areas — the content speaks, not the frame

### 3. Progressive Disclosure

- Show what matters now. Hide what matters later.
- Default state shows summary; interaction reveals detail
- Hover reveals secondary actions (edit, delete, copy)
- Inspector panels slide in on demand, not always visible
- Suggested actions appear contextually, not as permanent toolbars
- The best feature is one the user discovers exactly when they need it

### 4. Content-Shaped Loading

- Loading states must mirror the shape of the content they replace
- Use `animate-pulse` skeleton blocks matching the layout geometry
- Never use bare spinners for content areas — spinners are for inline actions only
- Skeleton → content transition should feel like the page "filling in", not replacing
- `staleTime` on queries prevents unnecessary flicker on re-navigation

### 5. Animation: Purposeful and Brief

- All transitions: `duration-200 ease-out` (200ms)
- Slide-in panels: `translate-x-4 → translate-x-0` with `opacity-0 → opacity-100`
- No bounce, no spring, no overshoot — Claude doesn't fidget
- Hover transitions: `transition-colors` only (no scale, no shadow changes)
- The user should barely notice animations — they smooth, they don't perform

### 6. Density Without Clutter

- Information density is a feature for professional tools — don't waste vertical space
- Compact rows: `py-1.5` to `py-2.5` with `text-[12px]` to `text-[13px]`
- Use `gap-2` to `gap-3` between items, not `gap-6`
- Cards and panels use `p-3` to `p-4`, not `p-6` to `p-8`
- Every element must earn its vertical space — if it's not informing a decision, remove it

### 7. Inline Intelligence

- Surface insights where the user is working, not in a separate dashboard
- Readiness scores appear on the project home, not behind a "View Analytics" button
- Recommendations appear as gentle nudges, not alert banners
- Risk signals are woven into context, not isolated in a risk register
- The AI should feel like it's thinking alongside the user, not reporting to them

### 8. Conversation-First

- The chat panel is the primary interface — everything flows through it
- Suggested prompts guide discovery of capabilities
- Results render inline as rich content (tables, badges, structured data)
- External actions (clicking a document, running analysis) can trigger chat context
- The UI frame exists to support the conversation, not the other way around

### 9. Trust Through Restraint

- Don't confirm what the user already knows ("Are you sure?" for low-risk actions)
- Don't celebrate routine operations (no confetti, no success modals)
- Toast for mutations, not for reads
- Status badges are factual, not emotional (`Draft` not `Needs Work`, `Review` not `Waiting for Approval!`)
- Error messages are precise and actionable, never vague ("Section 2.5 missing primary endpoint data" not "Something went wrong")

### 10. No Chrome

- Minimize the UI frame — borders, dividers, and containers should be nearly invisible
- `border-stone-100` for dividers (barely visible)
- `bg-white/80 backdrop-blur-sm` for elevated surfaces
- No card borders unless the card is interactive (hover state)
- The content IS the interface — reduce everything else to whispers

### 11. Mobile as Overlay

- Desktop: side panels are inline (`relative`), content reflows
- Mobile: panels become `fixed` overlays with `z-50` and backdrop
- Touch targets: minimum `44px` height for mobile interactive elements
- Grid layouts: `grid-cols-1 sm:grid-cols-2` for responsive density
- Navigation collapses to icons at small breakpoints

### 12. Accessibility as Default

- Every interactive element needs `aria-label` (especially icon-only buttons)
- Loading states: `role="status"` + `aria-live="polite"` + `aria-busy="true"`
- Errors: `role="alert"` + `aria-live="assertive"`
- `data-testid` on every stateful component
- Focus rings: `focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none`
- Color never carries meaning alone — always pair with icon or text

## Visual Language Reference

### Color Palette (Semantic)

| Token | Usage |
|-------|-------|
| `stone-50` to `stone-100` | Backgrounds, skeleton fills |
| `stone-400` | Secondary text, icons, timestamps |
| `stone-500` to `stone-600` | Body text, descriptions |
| `stone-700` to `stone-900` | Primary text, titles |
| `emerald-50/600` | Success states, approved badges |
| `amber-50/600` | Warning states, review badges |
| `red-50/600` | Error states, critical badges |
| `blue-50/600` | Interactive, links, primary actions |

### Component Sizing

| Context | Padding | Text Size | Gap |
|---------|---------|-----------|-----|
| Page header | `px-4 sm:px-6 py-4` | `text-lg` | `gap-2.5` |
| Section header | `mb-2.5` | `text-[11px] uppercase` | `gap-1.5` |
| List item | `px-3 py-2` | `text-[13px]` | `gap-3` |
| Badge | `px-1.5 py-0.5` | `text-[10px]` | `gap-1` |
| Button (sm) | `px-2 py-1` | `text-[11px]` | `gap-1` |
| Card | `p-3` to `p-4` | Mixed | `gap-2` |

### Interaction Patterns

| Pattern | Implementation |
|---------|----------------|
| Hover reveal | `opacity-0 group-hover:opacity-100 transition-opacity` |
| Panel slide-in | `translate-x-4 → translate-x-0` + `opacity`, 200ms |
| Skeleton → content | `animate-pulse` blocks matching layout, `staleTime` prevents flicker |
| Button loading | `<InlineLoading>` replaces label, button disabled |
| Toast feedback | Success: default. Error: `variant: 'destructive'`. No modal confirmations. |
| Suggested action | Rounded chip/card, `border-stone-150 hover:border-stone-300`, icon + text |

## Anti-Patterns (Will Be Rejected)

| Anti-Pattern | Why It Fails | Use Instead |
|-------------|-------------|-------------|
| Primary-colored headers/banners | Shouts at the user | `stone-100` background with `text-stone-900` |
| Success modals/celebrations | Patronizing for routine ops | Toast notification |
| "Are you sure?" for low-risk actions | Breaks flow, implies distrust | Just do it (undo if needed) |
| Animated progress bars that bounce | Anxiety-inducing | Calm `transition-all duration-500` fill |
| Multiple exclamation marks or emoji | Unprofessional for regulated industry | Factual, calm language |
| Full-page loading spinners | Blocks entire viewport | Content-shaped skeletons |
| Alert banners that persist | Banner blindness | Inline contextual nudges |
| Nested modals | Disorienting | Slide-in inspector panels |
| Tabs within tabs | Navigation confusion | Flat layout with sections |
| Sidebar navigation > 6 items | Cognitive overload | 5 items max, group intelligently |

## Implementation Checklist

Before shipping any UI change:

- [ ] Follows stone palette — no unauthorized colors
- [ ] Text hierarchy uses only the documented sizes
- [ ] Interactive elements have hover states with `transition-colors`
- [ ] Loading uses content-shaped skeletons, not spinners
- [ ] Animations are 200ms, ease-out, no bounce
- [ ] Mobile layout uses overlay pattern for panels
- [ ] Every icon-only button has `aria-label`
- [ ] Every stateful element has `data-testid`
- [ ] White space is intentional — nothing feels cramped or wasteful
- [ ] Intelligence surfaces inline, not behind navigation
- [ ] No new modals — use inspector panels or inline expansion
- [ ] Reads the room: dense for power users, breathable for orientation
