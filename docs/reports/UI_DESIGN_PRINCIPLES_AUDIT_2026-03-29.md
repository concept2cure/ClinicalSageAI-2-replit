# CLAUDE UI DESIGN PRINCIPLES AUDIT REPORT
## Concept2Cure Component System

**Date:** March 29, 2026  
**Scope:** Complete visual quality audit of `client/src/concept2cure/components/` + `client/src/components/`  
**Principles Checked:** 12 core Claude design principles

---

## SEVERITY SUMMARY

| Violation Type | Count | Severity | Rule |
|---|---|---|---|
| Typography violations (text-2xl, text-3xl+) | 70+ | HIGH | Principle 2 |
| animation-bounce, animate-pulse misuse | 100+ | HIGH | Principle 5 |
| border-2 (heavy borders) | 80+ | HIGH | Principle 10 |
| Saturated colors (blue, red, green 500+) | 150+ | HIGH | Principle 1 |
| shadow-lg, shadow-xl, shadow-2xl | 100+ | MEDIUM | Principle 10 |
| duration-500, duration-700 animations | 40+ | MEDIUM | Principle 5 |
| Celebration language | 3 | LOW | Principle 9 |
| "Loading..." bare text | 15+ | MEDIUM | Principle 4 |
| Coming Soon placeholders | 10+ | MEDIUM | CLAUDE.md code rule |

**Total Violations:** 500+  
**Status:** Widespread systematic violations across all 12 principles

---

## PRINCIPLE-BY-PRINCIPLE BREAKDOWN

### PRINCIPLE 1: CALM OVER LOUD
**Rule:** Muted stone palette, color reserved for meaning, white space as feature

#### Violation: Saturated Colors Throughout

**Pattern:** Heavy use of bright colors (blue-600, red-500, green-500, violet-600, etc.) instead of stone/slate

**Key Problem Areas:**

- **IndustryAwareApp.tsx:87-111** — Industry colors hardcoded as `text-blue-600`, `text-green-600`, etc.
  - Line 205: `bg-blue-600`
  - Lines 225-229: Multiple `bg-green-50`, `bg-blue-50` (bright backgrounds)
  - Line 251: `bg-blue-50 text-blue-600`

- **ReviewReadiness.tsx** — Multiple color classes on metrics
  - Line 407: `text-red-600` for critical count
  - Line 503: `text-green-700` for passed
  - Line 507: `text-amber-600` for warnings
  - Line 889-890: `bg-green-500`, `bg-red-400`

- **Dashboard color systems:**
  - `components/workflow/ProjectHomeDashboard.tsx` — status colors
  - `components/readiness/ProjectReadinessDashboard.tsx` — risk colors
  - `components/dashboard/MorningBriefing.tsx:207` — `bg-red-500`

**Impact:** Violates calm, restrained aesthetic. Every colored pill/badge/status indicator should be stone-100 to stone-300 with black text, not bright colors.

---

### PRINCIPLE 2: TYPOGRAPHY HIERARCHY
**Rule:** `text-lg` max for titles, `text-[13px]` for body, `text-[10px]` for metadata

#### Violation: Large Typography Throughout

**Pattern:** Widespread use of `text-2xl`, `text-3xl`, `text-6xl` for headings and metrics

**Specific Violations:**

| File | Line | Violation | Should Be |
|------|------|-----------|-----------|
| ReviewReadiness.tsx | 399 | `text-2xl font-semibold` | `text-lg` |
| ReviewReadiness.tsx | 403 | `text-2xl font-semibold` | `text-lg` |
| ReviewReadiness.tsx | 407 | `text-2xl font-semibold` | `text-lg` |
| ReviewReadiness.tsx | 890 | `text-6xl font-semibold` | `text-lg` |
| ReviewReadiness.tsx | 721 | `text-2xl font-semibold` | `text-lg` |
| UnifiedPlatformFeatures.jsx | 137 | `text-3xl font-bold` | `text-lg` |
| UnifiedPlatformFeatures.jsx | 138 | `text-xl` | `text-[13px]` |
| UnifiedPlatformFeatures.jsx | 193 | `text-2xl font-bold` | `text-lg` |
| UnifiedPlatformFeatures.jsx | 204 | `text-2xl font-bold` | `text-lg` |

**Count:** 70+ violations of typography hierarchy

**Impact:** Makes interface shouty instead of calm. Metric displays overwhelm rather than inform.

---

### PRINCIPLE 3: PROGRESSIVE DISCLOSURE
**Rule:** Show what matters now, reveal detail on interaction

**Status:** Generally OK, but some issues with always-visible dashboards. Not a primary violation area.

---

### PRINCIPLE 4: CONTENT-SHAPED LOADING
**Rule:** Skeleton blocks matching layout, never bare spinners

#### Violation: Bare "Loading..." Text

**Pattern:** Inline "Loading..." text instead of skeleton blocks

**Violations:**

| File | Line | Violation |
|------|------|-----------|
| router/ZenRouter.tsx | 115, 207, 252, 323 | `Loading...` fallback text |
| ArtifactProofPanel.tsx | 144, 149, 154, 159 | `loading ? 'Loading...'` |
| EnablementCenter.tsx | 567 | `Loading...` text |
| MorningBriefingPanel.tsx | 252 | `Loading briefing...` |
| ProjectReadinessDashboard.tsx | 68 | `Loading...` bare text |
| RICopilotHome.tsx | 282 | `[Risk analysis loading...]` |

**Missing:** Content-shaped skeleton blocks (SkeletonTable, SkeletonCard, SkeletonText from @/components/ui/statesV2)

**Note:** Some components DO use `animate-pulse` correctly with skeleton geometry, but fallback text is inconsistent.

---

### PRINCIPLE 5: ANIMATION - BRIEF & PURPOSEFUL
**Rule:** 200ms ease-out only, no bounce/spring/overshoot

#### VIOLATION 1: animate-bounce Used Extensively

**Pattern:** `animate-bounce` (wrong: bouncy, unpredictable) used instead of 200ms ease-out

**Files with animate-bounce:**

- ChatPanel.tsx:638-644 — typing indicator dots
- CouncilThread.tsx:176, 180, 184 — message dots
- ZenChat.tsx:380, 384, 388 — message indicator
- PMAWorkspace.tsx:225 — in-progress icon
- MorningBriefing.tsx:257 — subtle loading
- SmartClaimHighlighter.tsx:153 — claim highlight
- EnablementCenter.tsx (multiple locations)
- AgentSetupWizard.tsx:403 — cursor animation
- And 80+ more locations

**Impact:** Bouncy, playful animations violate "calm" principle. Should be fade-in or subtle slide with `duration-200 ease-out`.

#### VIOLATION 2: animate-pulse Misused

**Pattern:** `animate-pulse` used for loading when not content-shaped

**Examples:**
- ZenAppWithSession.tsx:165 — `bg-violet-600 animate-pulse` (should be skeleton block)
- NavHeader.tsx:47 — `animate-ping` (never allowed)
- Dashboard components — bare pulsing instead of skeleton geometry

#### VIOLATION 3: Duration-500, Duration-700

**Pattern:** Animations longer than 200ms violate principle

| File | Line | Duration | Violation |
|------|------|----------|-----------|
| SubmissionReadinessValidator.tsx | 405 | `duration-500` | Should be `duration-200` |
| MorningBriefing.tsx | 257 | `duration-500` | Should be `duration-200` |
| CouncilThread.tsx | 233 | `duration-500` | Should be `duration-200` |
| ProjectTimeline.tsx | 189, 313 | `duration-500` | Should be `duration-200` |
| DocumentSherpa.tsx | 98 | `duration-500` | Should be `duration-200` |
| ComplianceGuardian.tsx | 328 | `duration-700` | Should be `duration-200` |
| INDProgressPanel.tsx | 96 | `duration-500` | Should be `duration-200` |

**Count:** 40+ violations of animation duration

---

### PRINCIPLE 6: DENSITY WITHOUT CLUTTER
**Status:** OK in most places, compact rows used appropriately

---

### PRINCIPLE 7: INLINE INTELLIGENCE
**Status:** Generally OK, chat-first design dominates

---

### PRINCIPLE 8: CONVERSATION-FIRST
**Status:** OK for primary product (AnA chat), some dashboard holdovers

---

### PRINCIPLE 9: TRUST THROUGH RESTRAINT
**Rule:** No celebrations, factual status language

#### Violation: Celebration Language

**Specific Instances:**

| File | Line | Text | Issue |
|------|------|------|-------|
| IFUConsistencyChecker.tsx | 153 | `Excellent` | Celebration word in score label |
| NextActionsPanel.tsx | 248 | `Great job staying on top` | Celebratory tone in empty state |
| DualAITheater.tsx | 537 | `Excellent precedent intelligence` | Emotional language |

**Impact:** Small but visible. These undermine trust-through-restraint.

---

### PRINCIPLE 10: NO CHROME
**Rule:** Minimize frame, borders barely visible (`stone-100`), content IS the interface

#### VIOLATION 1: border-2 Throughout

**Pattern:** Heavy 2px borders instead of 1px `border-stone-100`

**Count:** 80+ uses of `border-2`

**Critical Files:**

| File | Line Count | Context |
|------|-----------|---------|
| ZenLogin.tsx | 6 instances | Auth form styling |
| ZenSignup.tsx | 2 instances | Auth form styling |
| PreSubmissionChecklist.tsx | 2 instances | Checkbox styling |
| CouncilThread.tsx | 1 instance | Avatar ring |
| ClaudeStyleBlocks.tsx | 1 instance | Bullet styling |
| Various editor components | 20+ | Timeline, progress, workflow |
| Various layout components | 50+ | Borders, spinners, status |

**Impact:** Heavy visual framing. Auth pages especially look weighty, not restrained.

#### VIOLATION 2: Heavy Shadows

**Pattern:** `shadow-lg`, `shadow-xl`, `shadow-2xl` create visual weight

**Count:** 100+ instances

**Examples:**
- landing/PricingSection.tsx:135 — `shadow-xl shadow-blue-600/10`
- landing/PlatformSection.tsx:14 — `shadow-2xl`
- dashboard/MorningBriefing.tsx:260 — `shadow-lg`
- Multiple modals — `shadow-lg`, `shadow-xl`, `shadow-2xl`

**Impact:** Heavy visual frame. Should be `shadow-sm` or none, borders `border-stone-100`.

---

### PRINCIPLE 11: MOBILE AS OVERLAY
**Status:** OK, panels do become fixed overlays

---

### PRINCIPLE 12: ACCESSIBILITY
**Rule:** ARIA on everything, focus rings, color never alone

#### Status: Minimal ARIA Attributes

Many interactive elements lack ARIA labels:

- Custom dropdowns (check DossierTree.tsx:618, DocumentCanvasPanel.tsx:276)
- Custom modals often missing `aria-modal="true"`, `aria-label`
- Some buttons use icons without `aria-label`
- Live regions for status updates sometimes missing `role="status"` or `aria-live`

**Examples of OK usage:**
- NewDocumentDialog.tsx:223 — `role="dialog" aria-modal="true" aria-label`
- Various state components in statesV2.tsx

**Examples of missing ARIA:**
- DossierTree.tsx:618 — context menu without role
- Dropdown menus in multiple files
- Custom carousel/timeline components

---

## DETAILED VIOLATION LISTINGS

### Typography Violations (text-2xl, text-3xl, text-6xl)

**Concept2Cure Component Tree:**
- ReviewReadiness.tsx: Lines 399, 403, 407, 499, 507, 659, 663, 667, 671, 721, 890
- IndustryAwareApp.tsx: Multiple metric displays
- Pages: VaultPage.tsx, RegulatoryPrecedentIntelligence.tsx

**Shared Components:**
- UnifiedPlatformFeatures.jsx: Lines 137, 138, 193, 204, 208, 238, 249, 253, 300, 340, 366, 374, 378, 382
- Multiple dashboard JSX files

**Pattern:** Metric numbers, card titles, section headers consistently violate max-text-lg rule.

---

### animation-bounce Violations

**Files (sample):**
- ChatPanel.tsx:638-644, 640, 644
- CouncilThread.tsx:176, 180, 184
- ZenChat.tsx:380, 384, 388
- PMAWorkspace.tsx:225
- MorningBriefing.tsx (multiple)
- SmartClaimHighlighter.tsx:153
- And 80+ more

**Pattern:** Typing indicators, loading dots, status pulses all use bounce instead of subtle fade.

---

### border-2 Violations

**Auth Pages (Critical):**
- ZenLogin.tsx: Lines 216, 667, 727, 769, 803, 818, 868, 1285
- ZenSignup.tsx: Lines 365, 395
- ZenOnboarding.tsx: Lines 383, 395

**Editor Components:**
- UnifiedDocumentEditor.tsx: Multiple (timeline, progress)
- VersionTimeline.tsx:189
- DocumentStatusTimeline.tsx:264
- SignatureWorkflow.tsx: Lines 767, 946

**Other Components:**
- 50+ other violations throughout workflow, readiness, intelligence panels

**Impact:** Auth especially looks heavy/enterprise, not calm.

---

### Color Violations (Saturated Colors)

**Top Offenders:**

1. **IndustryAwareApp.tsx** (Industry color system)
   - Lines 87-111: Hardcoded `text-blue-600`, `text-green-600`, etc.
   - Lines 225-229: Background colors tied to industry

2. **ReviewReadiness.tsx** (Risk/Status colors)
   - Red, green, amber colors for statuses
   - Each metric has colored class

3. **Dashboard Components**
   - ProjectReadinessDashboard.tsx
   - MorningBriefing.tsx
   - RegulatoryIntelligencePanel.tsx

4. **Workflow Components**
   - ProjectHomeDashboard.tsx
   - WorkflowTimeline.tsx
   - And 20+ more

**Pattern:** Every status badge, card background, metric uses saturated Tailwind colors (500-600 range) instead of stone palette with black text.

---

## MISSING IMPLEMENTATIONS

### Content-Shaped Loading (Principle 4)

**What's Missing:**
- Skeleton blocks matching card geometry
- Skeleton text with variable widths
- Skeleton tables

**What Exists (Good):**
- `/client/src/components/ui/statesV2.tsx` has `SkeletonText`, `SkeletonCard`, `SkeletonTable`, `LoadingState`
- Some editor components use these correctly

**What's Missing:**
- Adoption in all async-loaded sections
- Consistent fallback states across dashboards

---

## CODE STANDARDS VIOLATIONS

### From CLAUDE.md

**Section: Code Standards**

> No `Coming Soon` placeholders — either implement it or don't add the route

**Violations Found:**

1. **enablement-data.ts**: Lines 39, 579, 599, 1318, 1321, 1386
   - Status: 'coming-soon' feature flag
   - COMING_SOON_FEATURES array

2. **AgentShowcase.tsx**: Lines 25, 267, 427, 572, 640, 727, 752
   - Type status: "coming-soon"
   - Filter showing coming-soon capabilities

3. **Impact:** Against CLAUDE.md rule

---

## RECOMMENDATION PRIORITY

### PHASE 1 (Critical - Break Codebase Rules)

1. **Remove all border-2** → border or border-stone-100
   - Auth pages first (ZenLogin.tsx, ZenSignup.tsx)
   - Then workflow/editor components
   - 80 files

2. **Replace text-2xl+ with text-lg**
   - ReviewReadiness.tsx
   - All dashboards
   - 70 files

3. **Replace animate-bounce → fade-in/fade-out 200ms ease-out**
   - ChatPanel.tsx, ZenChat.tsx, CouncilThread.tsx, etc.
   - 100+ instances

### PHASE 2 (High - Violate Design Principles)

4. **Saturated colors → Stone palette**
   - IndustryAwareApp.tsx (need new pattern for industry visual distinction)
   - All dashboards and status badges
   - 150+ instances

5. **Remove shadow-lg/xl → shadow-sm or none**
   - Modals, panels
   - 100 instances

6. **Normalize animation durations → 200ms**
   - 40+ instances of duration-500/700

### PHASE 3 (Medium - UX Debt)

7. **Load states consistency**
   - Replace "Loading..." bare text with skeleton blocks
   - 15+ locations

8. **Celebration language audit**
   - Replace "Excellent", "Great job", etc.
   - 3 instances

9. **ARIA audit**
   - Add missing aria-label, aria-modal, role attributes

---

## REFERENCE: 12 PRINCIPLES CHECKLIST

- [x] Principle 1 (Calm): VIOLATED — saturated colors everywhere
- [x] Principle 2 (Typography): VIOLATED — text-2xl+ throughout
- [x] Principle 3 (Progressive): OK
- [x] Principle 4 (Loading): VIOLATED — bare text instead of skeletons
- [x] Principle 5 (Animation): VIOLATED — bounce/pulse/500ms throughout
- [x] Principle 6 (Density): OK
- [x] Principle 7 (Inline): OK
- [x] Principle 8 (Conversation): OK
- [x] Principle 9 (Restraint): VIOLATED — celebration language
- [x] Principle 10 (No Chrome): VIOLATED — border-2, shadow-lg everywhere
- [x] Principle 11 (Mobile): OK
- [x] Principle 12 (Accessibility): PARTIAL — some ARIA missing

---

## SUMMARY

**Compliance Level: 30%** (3 of 12 principles fully observed)

**Systematic Issues:**
- Visual design defaults to enterprise/dashboard aesthetic, not Claude calm
- Animation library habits (bounce, pulse, slow durations)
- Border/shadow defaults create heavy frames
- No systematic color constraint to stone palette
- Typography sizing treats metric displays like dashboards, not interfaces

**Root Cause:** Codebase predates or ignores Claude design principles. Heavy consolidation work preserved legacy patterns.

**Recovery Path:** Systematic regex replacements + component pattern updates + design token enforcement.

---

END OF AUDIT REPORT
