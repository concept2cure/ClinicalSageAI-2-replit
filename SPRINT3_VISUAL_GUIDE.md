# Sprint 3: Trust & Velocity - Visual UI Guide

Screenshots and visual descriptions of the fully implemented CERv2 Workbench UI.

---

## 🎨 Design System Overview

### Color Palette
```
Primary (Indigo):
  indigo-50  #EEF2FF  Light backgrounds
  indigo-100 #E0E7FF  Badges, pills
  indigo-600 #4F46E5  Buttons, links
  indigo-700 #4338CA  Hover states

Success (Green):
  green-50   #F0FDF4  Success backgrounds
  green-600  #16A34A  Success text/icons

Warning (Amber):
  amber-50   #FFFBEB  Warning backgrounds
  amber-600  #D97706  Warning text/icons

Danger (Rose):
  rose-50    #FFF1F2  Error backgrounds
  rose-600   #E11D48  Error text/icons

Neutral (Slate):
  slate-50   #F8FAFC  Panel backgrounds
  slate-200  #E2E8F0  Borders
  slate-600  #475569  Body text
  slate-900  #0F172A  Headings
```

### Typography Scale
```
Headings:
  H1: text-2xl font-bold (24px)
  H2: text-xl font-semibold (20px)
  H3: text-lg font-semibold (18px)

Body:
  Large: text-base (16px)
  Medium: text-sm (14px)
  Small: text-xs (12px)

Labels:
  Large: text-sm font-medium
  Medium: text-xs font-semibold
  Small: text-[11px] font-semibold uppercase
```

### Spacing System (8px Grid)
```
gap-1:  4px   (0.25rem)
gap-2:  8px   (0.5rem)  ← Primary unit
gap-3:  12px  (0.75rem)
gap-4:  16px  (1rem)    ← Common spacing
gap-6:  24px  (1.5rem)  ← Section spacing
gap-8:  32px  (2rem)
gap-12: 48px  (3rem)
```

---

## 📸 Component Screenshots

### 1. Audit Timeline (Rich Event Cards)

```
┌─────────────────────────────────────────────────────────────┐
│ Audit Timeline                               [Refresh]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Filter Bar ─────────────────────────────────────────┐   │
│ │ [🔍] Action ▾  Entity Type ▾  From: [____] To: [____] │ 2  │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─ EXPORT_GENERATED ──────────────────────────────────┐   │
│ │ 📥 Export Generated · EVIDENCE      Jan 18, 12:34 PM│   │
│ │ Export generated: claims-matrix-2026-01-18.xlsx      │   │
│ │                                                       │   │
│ │ Filename: claims-matrix-2026-01-18.xlsx              │   │
│ │ Size: 45.6 KB                                        │   │
│ │ SHA256: abc123de...                                  │   │
│ │ Evidence Set: xyz789ab...                            │   │
│ │                                         [Download]   │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─ EVIDENCE_LINKED_BULK ──────────────────────────────┐   │
│ │ 🔗 Evidence Linked Bulk · CLAIM     Jan 18, 11:20 AM│   │
│ │ Bulk linked 3 evidence files to claim claim-abc      │   │
│ │                                                       │   │
│ │ Count: 3 items linked                                │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─ UPLOAD ─────────────────────────────────────────────┐   │
│ │ ⬆ Upload · EVIDENCE                 Jan 18, 10:15 AM│   │
│ │ Uploaded evidence/study-protocol.pdf                 │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Visual Notes:
- EXPORT cards: Purple bg (purple-50), purple border (purple-200)
- LINKED_BULK cards: Green bg (green-50), green border (green-200)
- UPLOAD cards: Blue bg (blue-50), blue border (blue-200)
- UNLINKED cards: Red bg (red-50), red border (red-200)
- All cards have shadow-sm, hover:shadow-md transition
- Icons are colored to match card theme
- Download button: indigo-600 bg, white text, rounded-lg
```

---

### 2. Evidence Library (Multi-Select + Bulk Actions)

```
┌─────────────────────────────────────────────────────────────┐
│ Evidence Library                    Folder: smoke-test · 3  │
│                                                             │
│ [🔍 Search evidence...]                                     │
│                                                             │
│ ┌─ Evidence Table ─────────────────────────────────────┐   │
│ │ [☑] NAME              SIZE      ACTIONS                │   │
│ │ ─────────────────────────────────────────────────────  │   │
│ │ [☑] evidence_1.md      2 KB     [Download]            │   │
│ │     smoke-test                                         │   │
│ │                                                         │   │
│ │ [☑] evidence_2.md      2 KB     [Download]            │   │
│ │     smoke-test                                         │   │
│ │                                                         │   │
│ │ [☐] evidence_3.md      2 KB     [Download]            │   │
│ │     smoke-test                                         │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│         ┌─ Bulk Actions (Floating) ──────────────┐         │
│         │  2   2 items selected  │  [Link to...]  │         │
│         │                        [Unlink] [Delete]│         │
│         └──────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘

Visual Notes:
- Checkboxes: indigo-600 when checked
- Selected rows: indigo-100 bg, indigo-300 border
- Bulk action bar: white bg, shadow-2xl, rounded-2xl
- Count badge: indigo-100 bg, indigo-700 text, rounded-full
- Link button: indigo-600 bg, white text
- Delete button: rose-50 bg, rose-600 text
- Floating bar animates in from bottom with slide-up transition
```

---

### 3. Inspector Panel (Right Drawer)

```
┌─────────────────────────────────────┐
│ Inspector                       [X] │
├─────────────────────────────────────┤
│                                     │
│ 📄 Details                          │
│ ─────────────────────────────────   │
│ Name: evidence_1.md                 │
│ Type: EVIDENCE                      │
│ Folder: smoke-test                  │
│ Size: 2 KB                          │
│                                     │
│ Tags: [test] [sprint3]              │
│                                     │
│ 🔗 Linked Entities (2)              │
│ ─────────────────────────────────   │
│ ┌─ CLAIM ─────────────────────┐    │
│ │ claim-abc                     │    │
│ │ "Device is safe..."      [🗑️] │    │
│ └───────────────────────────────┘    │
│                                     │
│ ┌─ STANDARD_REQUIREMENT ──────┐    │
│ │ iso-13485-req-7.3              │    │
│ │ "Design validation..."   [🗑️] │    │
│ └───────────────────────────────┘    │
│                                     │
│ [+ Add Link]                        │
│                                     │
│ ┌─ Impact Preview ────────────┐    │
│ │ 📈 Linking will increase     │    │
│ │    Claims coverage from      │    │
│ │    62% → 66% (+4%)           │    │
│ └───────────────────────────────┘    │
│                                     │
│ 🕒 Recent Activity                  │
│ ─────────────────────────────────   │
│ ┌─ UPLOAD ────────────────────┐    │
│ │ Jan 18, 10:15 AM              │    │
│ │ Uploaded to smoke-test        │    │
│ └───────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘

Visual Notes:
- Fixed right side, 400px width
- White bg, border-left (slate-200)
- Scrollable content
- Section headers: text-sm font-semibold, slate-700
- Link cards: rounded-lg, border, hover:border-slate-300
- Trash icons: slate-400, hover:rose-600
- Impact preview: green-50 bg, green-200 border, TrendingUp icon
- Add link button: indigo-600 text, hover:indigo-700
```

---

### 4. Filter Bar Component

```
┌─────────────────────────────────────────────────────────────┐
│ ┌─ Filter Bar ─────────────────────────────────────────┐   │
│ │ [🔍 Search...]  [Status ▾]  [○ Linked]  [📅─📅]   2  [X] │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ Tags: [clinical] [regulatory] [technical] [preclinical]    │
│       ─────────   ──────────                                │
│       (selected)  (unselected)                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Visual Notes:
- Rounded-2xl white card, slate-200 border
- Search input: Focus ring (indigo-500)
- Dropdowns: Slate-200 border, indigo-600 text when selected
- Active filter count: indigo-100 bg, indigo-700 text, circle badge
- Clear button: X icon, slate-400, hover:slate-600
- Selected tags: indigo-100 bg, ring-2 ring-indigo-300
- Unselected tags: slate-100 bg, hover:slate-200
```

---

### 5. Workbench Overview (Clickable Tiles)

```
┌─────────────────────────────────────────────────────────────┐
│ Program Overview                                            │
│ Program ID: test-sprint3                                    │
│                                                             │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│ │ Claims coverage │ │ Standards sat.  │ │ Outcomes sub.   ││
│ │                 │ │                 │ │                 ││
│ │      62%        │ │      78%        │ │      45%        ││
│ │    5 / 11       │ │    14 / 18      │ │     3 / 5       ││
│ │              →  │ │              →  │ │              →  ││
│ └─────────────────┘ └─────────────────┘ └─────────────────┘│
│  (hover: indigo)     (hover: indigo)     (hover: indigo)   │
└─────────────────────────────────────────────────────────────┘

Visual Notes:
- Cards: rounded-xl, slate-200 border, white bg
- Hover: indigo-300 border, indigo-50 bg, arrow shifts right
- Arrow: slate-400 → indigo-600 on hover
- Percentage: text-2xl font-semibold slate-900
- Fraction: text-xs slate-600
- Cursor: pointer
- Transition: 200ms ease
```

---

### 6. Empty States

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                       📭 (slate-400)                         │
│                                                             │
│                   No items yet                              │
│                                                             │
│          Get started by uploading your first file.          │
│                                                             │
│                    [Upload Evidence]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Variants:
- Default: Inbox icon, slate colors
- Search: SearchX icon, indigo-400
- Error: AlertCircle icon, rose-400
- Info: FileQuestion icon, blue-400
```

---

### 7. Loading States

```
Spinner:
┌─────────────────────────────────────┐
│                                     │
│           ⟳ (spinning)              │
│                                     │
│           Loading...                │
│                                     │
└─────────────────────────────────────┘

Skeleton List:
┌─────────────────────────────────────┐
│ ▢▢▢  ████████████                   │
│      ██████                          │
│                                     │
│ ▢▢▢  ████████████                   │
│      ██████                          │
│                                     │
│ ▢▢▢  ████████████                   │
│      ██████                          │
└─────────────────────────────────────┘

Skeleton Cards:
┌──────────────┐ ┌──────────────┐
│ ████████████ │ │ ████████████ │
│              │ │              │
│ ██████████   │ │ ██████████   │
│ ████████     │ │ ████████     │
│ ███████      │ │ ███████      │
└──────────────┘ └──────────────┘

Visual Notes:
- Skeleton: slate-200 bg, pulse animation
- Spinner: indigo-600, animate-spin
- Message: text-sm slate-600
```

---

### 8. Keyboard Shortcuts Modal

```
┌─────────────────────────────────────┐
│ Keyboard Shortcuts            [X]   │
├─────────────────────────────────────┤
│                                     │
│ Close inspector         [Esc]       │
│ Focus search            [⌘ K]       │
│ Show shortcuts          [⌘ /]       │
│ Save current work       [⌘ S]       │
│ Navigate fields         [Tab]       │
│ Navigate backwards      [⇧ Tab]     │
│ Submit form             [Enter]     │
│ Navigate lists          [↑ ↓]       │
│                                     │
├─────────────────────────────────────┤
│  Press [Esc] to close               │
└─────────────────────────────────────┘

Visual Notes:
- Modal: rounded-2xl, shadow-2xl, centered
- Backdrop: black/50 with backdrop-blur
- kbd tags: slate-100 bg, slate-300 border, mono font
- List: space-y-3, text-sm
- Close button: slate-400 hover:slate-600
```

---

## 🎯 Interaction Patterns

### Hover States
All interactive elements have hover feedback:
- **Buttons:** Background darkens (600 → 700)
- **Cards:** Shadow increases (sm → md)
- **Links:** Color darkens, underline appears
- **Icons:** Color shifts (400 → 600)
- **Table rows:** Background lightens (transparent → slate-50)

### Focus States
Keyboard-accessible elements have focus rings:
- **Inputs:** ring-2 ring-indigo-500
- **Buttons:** ring-2 ring-indigo-500 ring-offset-2
- **Cards:** ring-2 ring-indigo-300

### Active States
Pressed/selected elements have distinct styles:
- **Buttons:** Transform scale(0.98)
- **Checkboxes:** bg-indigo-600, white checkmark
- **Selected rows:** indigo-100 bg, indigo-300 border

### Transitions
Smooth animations for premium feel:
- **Fast (150ms):** Button hover, icon color changes
- **Normal (200ms):** Card hover, dropdown open
- **Slow (300ms):** Panel slide-in, modal fade-in

---

## 📱 Responsive Behavior

### Breakpoints
```
sm:  640px   Mobile landscape
md:  768px   Tablet
lg:  1024px  Desktop
xl:  1280px  Large desktop
2xl: 1536px  Ultra-wide
```

### Adaptive Layouts
- **Mobile:** Single column, inspector becomes bottom sheet
- **Tablet:** Two columns (list + inspector side-by-side)
- **Desktop:** Three panes (nav + list + inspector)

---

## ♿ Accessibility Features

### WCAG AA Compliance
- **Color Contrast:** All text meets 4.5:1 ratio
- **Focus Indicators:** Visible on all interactive elements
- **ARIA Labels:** Buttons, drawers, modals properly labeled
- **Keyboard Navigation:** All features accessible via keyboard

### Screen Reader Support
- **Semantic HTML:** Proper heading hierarchy (h1 → h6)
- **Alt Text:** All icons have aria-label attributes
- **Live Regions:** Loading states announce via aria-live
- **Skip Links:** Main content accessible from header

---

**This visual guide documents the complete Sprint 3 UI implementation.**

For interactive testing, run:
```bash
npm run dev
```

Then navigate to:
```
http://localhost:5000/cerv2/programs/test-sprint3
```
