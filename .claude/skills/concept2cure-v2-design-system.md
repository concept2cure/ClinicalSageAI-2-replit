---
name: Concept2cure-V2 and ANA 1.o -design-system
description: >
  Enterprise design system for the TrialSage.AI / Concept2Cure platform, modeled after
  Anthropic's own product design standards. Covers visual identity, typography, color
  system, spacing scale, component patterns, iconography, motion, and dark/light theming
  for a life sciences regulatory SaaS. Trigger on: UI design, design system, component
  library, theming, color palette, typography, spacing, CSS variables, Tailwind config,
  brand identity, style guide, visual consistency, "make it look professional," "match
  the design," "design tokens," dashboard layout, card component, modal, sidebar, navbar,
  or any TrialSage/Concept2Cure frontend styling context. Also trigger when the user
  asks to build, style, or redesign any TrialSage UI element.
---

# TrialSage Design System

Enterprise-grade visual identity for TrialSage.AI — a regulatory intelligence platform
serving pharma, biotech, CRO, and medical device companies. This system follows the
design philosophy Anthropic applies to its own products: function first without losing
soul, warm and human, technically refined, and never generic.

## I. Design Philosophy

TrialSage serves professionals whose decisions have life-or-death consequences. The UI
must communicate three things simultaneously:

1. **Regulatory credibility** — This platform understands FDA/EMA/ICH standards
2. **Operational clarity** — Dense data presented without cognitive overload
3. **Modern intelligence** — AI-powered, not legacy enterprise software

The aesthetic direction is **Clinical Precision meets Warm Intelligence**: clean lines,
generous whitespace, confident typography, and a color system that signals trust without
feeling sterile. Think: what if Anthropic built a regulatory platform.

### Anti-Patterns (Never Do This)
- Generic SaaS blue (#007bff or Bootstrap primary)
- Purple-on-white AI gradients
- Inter, Roboto, Arial, or system font stacks as primary
- Rounded-everything with pastel cards (Notion-clone aesthetic)
- Emoji as icons
- Dense enterprise gray-on-gray (Oracle/SAP aesthetic)
- Cookie-cutter dashboard templates

## II. Color System

### Design Tokens (CSS Custom Properties)

```css
:root {
  /* ── Primary: Deep Teal — regulatory trust + modern intelligence ── */
  --ts-primary-50:  #f0fdf9;
  --ts-primary-100: #ccfbef;
  --ts-primary-200: #99f6df;
  --ts-primary-300: #5ceacb;
  --ts-primary-400: #2dd4b3;
  --ts-primary-500: #14b89a;
  --ts-primary-600: #0d947e;
  --ts-primary-700: #0f7666;
  --ts-primary-800: #115e53;
  --ts-primary-900: #134e45;
  --ts-primary-950: #042f2b;

  /* ── Accent: Warm Amber — human warmth, call-to-action energy ── */
  --ts-accent-50:  #fffbeb;
  --ts-accent-100: #fef3c7;
  --ts-accent-200: #fde68a;
  --ts-accent-300: #fcd34d;
  --ts-accent-400: #fbbf24;
  --ts-accent-500: #f59e0b;
  --ts-accent-600: #d97706;
  --ts-accent-700: #b45309;
  --ts-accent-800: #92400e;
  --ts-accent-900: #78350f;

  /* ── Neutral: Warm Slate — not cold gray, slightly warm undertone ── */
  --ts-neutral-50:  #f8fafc;
  --ts-neutral-100: #f1f5f9;
  --ts-neutral-200: #e2e8f0;
  --ts-neutral-300: #cbd5e1;
  --ts-neutral-400: #94a3b8;
  --ts-neutral-500: #64748b;
  --ts-neutral-600: #475569;
  --ts-neutral-700: #334155;
  --ts-neutral-800: #1e293b;
  --ts-neutral-900: #0f172a;
  --ts-neutral-950: #020617;

  /* ── Semantic ── */
  --ts-success:  #059669;
  --ts-warning:  #d97706;
  --ts-error:    #dc2626;
  --ts-info:     #0284c7;

  /* ── Regulatory Status (domain-specific) ── */
  --ts-status-approved:  #059669;
  --ts-status-pending:   #d97706;
  --ts-status-rejected:  #dc2626;
  --ts-status-draft:     #64748b;
  --ts-status-submitted: #0284c7;

  /* ── Surface & Background ── */
  --ts-bg-primary:   #ffffff;
  --ts-bg-secondary: #f8fafc;
  --ts-bg-elevated:  #ffffff;
  --ts-bg-sidebar:   #0f172a;
  --ts-border:       #e2e8f0;
  --ts-border-focus: #14b89a;

  /* ── Typography ── */
  --ts-text-primary:   #0f172a;
  --ts-text-secondary: #475569;
  --ts-text-tertiary:  #94a3b8;
  --ts-text-inverse:   #f8fafc;
  --ts-text-link:      #0d947e;
}
```

### Dark Mode Override

```css
[data-theme="dark"] {
  --ts-bg-primary:   #0f172a;
  --ts-bg-secondary: #1e293b;
  --ts-bg-elevated:  #1e293b;
  --ts-bg-sidebar:   #020617;
  --ts-border:       #334155;
  --ts-text-primary:   #f1f5f9;
  --ts-text-secondary: #94a3b8;
  --ts-text-tertiary:  #64748b;
}
```

### Color Usage Rules
- **Primary teal** for navigation, active states, primary buttons, links
- **Accent amber** ONLY for CTAs and urgent attention — use sparingly
- **Neutrals** carry 80% of the interface; the color ramp must feel warm, not sterile
- **Semantic colors** for system feedback only — never decorative
- **Regulatory status colors** are sacred — never use green for anything except approved/success

## III. Typography

### Font Stack

```css
:root {
  --ts-font-display: 'Söhne', 'DM Sans', -apple-system, sans-serif;
  --ts-font-body: 'Söhne', 'DM Sans', -apple-system, sans-serif;
  --ts-font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
  --ts-font-document: 'Source Serif 4', 'Merriweather', Georgia, serif;
}
```

If Söhne is unavailable (it's Anthropic's licensed font), fall back to DM Sans
which shares its warmth and geometric clarity. Never fall back to Inter or Roboto.

### Type Scale (rem-based, 16px root)

| Token               | Size   | Weight | Line Height | Use Case                        |
|---------------------|--------|--------|-------------|---------------------------------|
| `--ts-text-display` | 2.25rem| 600    | 1.2         | Page titles, hero headers       |
| `--ts-text-h1`      | 1.875rem| 600   | 1.25        | Section headers                 |
| `--ts-text-h2`      | 1.5rem | 600    | 1.3         | Card headers, panel titles      |
| `--ts-text-h3`      | 1.25rem| 600    | 1.35        | Subsection headers              |
| `--ts-text-h4`      | 1.125rem| 600   | 1.4         | Widget titles, labels           |
| `--ts-text-body`    | 0.9375rem| 400  | 1.6         | Default body text (15px)        |
| `--ts-text-sm`      | 0.8125rem| 400  | 1.5         | Secondary text, metadata (13px) |
| `--ts-text-xs`      | 0.75rem| 400    | 1.5         | Captions, timestamps (12px)     |
| `--ts-text-mono`    | 0.8125rem| 400  | 1.6         | NCT IDs, eCTD paths, code       |

### Typography Rules
- Body text is 15px, not 14 or 16
- Use font-weight 600 (semibold) for headers, never bold (700) except hero/display
- Letter-spacing: -0.01em for display, 0 for body, +0.02em for uppercase labels
- Line-height for body text is always 1.6
- Monospace for ALL regulatory identifiers: NCT numbers, eCTD section paths, RCW codes, CFR references

## IV. Spacing Scale

8px base grid. Every spacing value is a multiple of 4 or 8.

```css
:root {
  --ts-space-0:  0;
  --ts-space-1:  0.25rem;  /* 4px  */
  --ts-space-2:  0.5rem;   /* 8px  */
  --ts-space-3:  0.75rem;  /* 12px */
  --ts-space-4:  1rem;     /* 16px */
  --ts-space-5:  1.25rem;  /* 20px */
  --ts-space-6:  1.5rem;   /* 24px */
  --ts-space-8:  2rem;     /* 32px */
  --ts-space-10: 2.5rem;   /* 40px */
  --ts-space-12: 3rem;     /* 48px */
  --ts-space-16: 4rem;     /* 64px */
}
```

### Spacing Rules
- Card internal padding: `--ts-space-6` (24px)
- Gap between cards: `--ts-space-4` (16px)
- Section separation: `--ts-space-10` or `--ts-space-12`
- Sidebar width: 260px collapsed, 280px expanded
- Content max-width: 1280px with `--ts-space-8` horizontal padding
- Form field spacing: `--ts-space-4` between fields, `--ts-space-2` label-to-input

## V. Component Patterns

### Buttons
- Primary: bg primary-600, text white, hover primary-700, rounded-lg (8px)
- Secondary: bg transparent, border neutral-300, text neutral-700, hover neutral-100
- Ghost: bg transparent, text primary-600, hover primary-50
- Danger: bg error, text white — ONLY for destructive actions
- Minimum touch target: 44px height
- Horizontal padding: 16px minimum, 24px for prominent CTAs
- Font weight: 500 (medium), not bold
- Transition: 150ms ease on background-color and box-shadow

### Cards
- Default: bg white, border 1px neutral-200, rounded-xl (12px), shadow-sm
- Elevated: Same + shadow-md on hover (transition 200ms)
- Status: Left border 3px using regulatory status color
- Selected: border-color primary-500, ring 2px primary-100
- Cards always have consistent internal padding (24px)

### Data Tables
- Header row: bg neutral-50, text --ts-text-sm in uppercase with letter-spacing +0.05em
- Row height: 48px minimum
- Alternating row stripes: subtle neutral-50 every other row
- Sticky header on scroll
- Monospace for all ID columns
- Status columns use pill badges with regulatory status colors
- Pagination: bottom-right, showing "1–25 of 1,247 results"

### Navigation
- Sidebar (primary nav): dark background (neutral-900), white text, 260px wide
- Active state: left 3px border in primary-400, bg neutral-800
- Icons: Lucide React, 20px, neutral-400 default, primary-400 active
- Collapsible with smooth 200ms transition

### Forms
- Label: --ts-text-sm, font-weight 500, --ts-text-secondary
- Input: 44px height, 12px horizontal padding, neutral-200 border, neutral-50 bg
- Focus: primary-500 border, 3px primary-100 ring, transition 150ms
- Error: error border + inline error text below in --ts-text-xs

## VI. Iconography
- Library: Lucide React (primary), Heroicons (supplementary)
- Size: 16px inline, 20px navigation, 24px feature/hero
- Stroke: 1.5px
- Color: inherits text color via currentColor

## VII. Motion & Interaction
- All hover/focus state changes: 150ms ease
- Panel open/close, sidebar toggle: 200ms ease
- Page transitions, modal open: 300ms ease-out
- Never use bounce, elastic, or playful easing

## VIII. Responsive Breakpoints
- sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px
- Sidebar collapses to icon-only at < lg
- Data tables switch to card view at < md
- Dashboard grid: 3-col at xl, 2-col at lg, 1-col at md and below

## IX. Accessibility Baseline
- WCAG 2.1 AA minimum
- Contrast ratio: 4.5:1 for body text, 3:1 for large text and UI components
- Focus visible: 3px ring in primary-100 on all interactive elements
- Skip-to-content link on every page
- ARIA landmarks: main, navigation, complementary, banner
- All form inputs have associated label elements
- Status changes announced via aria-live="polite"
