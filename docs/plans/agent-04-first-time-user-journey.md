# Agent 04 — First-Time User Journey & Onboarding

**Date:** 2026-03-27

---

## 1. What Current Onboarding Gets Wrong

### FirstRunExperience.tsx (582 lines)

**Problems:**
1. **Dr. Sage and AnA introduced as separate personas** (Steps 2 and 3). Users don't need two AI identities. This creates confusion before value.
2. **Screens 0-2 auto-advance after 6 seconds.** Users are forced to watch intro slides they didn't ask for. No escape hatch other than "Skip."
3. **Agent architecture exposed too early** (Step 6). Users see 11 agents grouped by "Planning, Drafting, Review, Assembly, Validation" phases before they've done anything useful. This is internal architecture, not user value.
4. **Automation level selection** (Supervised/Guided/Autonomous) before the user has any context for what that means.
5. **No project creation in onboarding.** The flow ends at "Launch Concept2Cure" — user lands on PlatformHome and still has to figure out what to do next.
6. **No first successful action.** User completes onboarding without having produced or started anything real.

### IndustryModeSelector.tsx (~300 lines)

**Problems:**
1. Collects industry + role + confirm, but it's unclear when this runs relative to FirstRunExperience. Possible duplicate.
2. Auto-advances after 300ms on each selection — too fast for a setup decision.

### QuickStartWizard.tsx (~400 lines)

**Problems:**
1. Another 5-step wizard collecting overlapping data (industry, submission type, product, regions, timeline).
2. Three competing onboarding flows with no clear orchestration.

### CTDProjectWizard.tsx (~500 lines)

**Strengths to preserve:**
1. Real project creation with meaningful fields.
2. CTD document upload with auto-detection.
3. Compliance validation against regulatory requirements.

**Problem:** Too heavyweight for first-run. Compliance validation should come later, not during initial project creation.

---

## 2. What to Delete

| Component | Action |
|-----------|--------|
| Dr. Sage persona introduction (FirstRunExperience Step 2) | Delete entirely. One AI identity: AnA. |
| AnA as separate persona introduction (FirstRunExperience Step 3) | Merge into Welcome step. AnA simply appears as the guide. |
| Auto-advance timer (6 seconds) | Delete. User controls pace. |
| Agent architecture selection (FirstRunExperience Step 6) | Delete. System handles agent orchestration internally. |
| Automation level picker | Delete from onboarding. Move to Setup > Preferences for power users. |
| `IndustryModeSelector.tsx` as standalone | Absorb its role/industry selection into the unified onboarding flow. |
| `QuickStartWizard.tsx` as standalone | Absorb its submission type/region/product fields into project creation step. |

---

## 3. What to Preserve

| Component | Reuse |
|-----------|-------|
| `NewProjectModal` fields (name, type, sponsor, product, region, goal) | Use for Step 3 project creation |
| `CTDProjectWizard` file upload | Optional in Step 3 ("Add starting files") |
| `FirstRunExperience` role selection (5 roles) | Simplify to Step 2 guided setup |
| `FirstRunExperience` submission type selection (8 types) | Use in Step 2 or Step 3 |
| `localStorage.concept2cure_first_run_complete` | Keep flag pattern for detecting first run |

---

## 4. New First-Time User Journey (7 Steps)

### Step 1: Welcome

**Screen:** Clean centered page. No auto-advance. No animation spam.

```
Welcome to Concept2Cure

[Create your first project]  ← primary CTA

Explore apps                 ← secondary link
Import existing materials    ← tertiary link
```

AnA appears at bottom: *"I'm AnA, your regulatory intelligence guide. Let's get you set up."*

**What happens:** User clicks primary CTA to proceed. Secondary links go to Apps page or file upload flow.

### Step 2: Guided Setup

**Screen:** Single compact form. No separate slides per question.

Fields:
- **Client track**: Pharma & Biotech / Medical Device & Diagnostics (radio)
- **Your role**: Regulatory Writer, Strategist, Quality/CMC, Clinical Operations, Executive (select)
- **Primary submission type**: 510(k), IND, NDA, BLA, PMA, De Novo, CER/MDR, MAA, CTA (cards)
- **Target agency / region**: FDA, EMA, PMDA, Health Canada, TGA, MHRA, Other (select)
- **Organization name**: text input (optional)

AnA shows a one-line summary as user fills in: *"Got it — you're a Regulatory Writer at [Org] working on a 510(k) submission for FDA."*

**Skip option:** "Skip setup — I'll configure later" → goes directly to Step 3 with defaults.

### Step 3: Create First Project

**Screen:** Project creation form (reuse `NewProjectModal` fields).

Fields:
- **Project name** (required)
- **Sponsor / company** (optional)
- **Product / device name** (optional)
- **Submission type** (pre-filled from Step 2)
- **Add starting files** (optional drag-drop, simplified from CTDProjectWizard)

AnA: *"Give your project a name and we'll set up your workspace."*

**What happens:** Project created via existing API. User proceeds to Step 4.

### Step 4: Land in Project Overview

**Screen:** Project Overview tab (enhanced `ProjectHomeDashboard`).

Shows:
- Project summary card (name, type, region, sponsor)
- Readiness snapshot (all zeros — fresh project)
- Next recommended actions (context-dependent, see Step 6)
- Quick links to Work, Vault, Review, Submit

AnA: *"Here's your project home. Let me show you around."*

### Step 5: AnA-Guided Tab Tour

**Mechanism:** AnA sends a message explaining the 5 project tabs. Optional tooltip highlights on each sidebar tab.

AnA message:
> *"Your project has five areas:*
> - **Overview** — where your project stands right now
> - **Work** — where you create and edit documents
> - **Vault** — where you store files and evidence
> - **Review** — where quality and compliance are checked
> - **Submit** — where you finalize and export your package
>
> *Let's start with something useful."*

**Duration:** One message. User can dismiss or proceed. No forced walkthrough.

### Step 6: First Successful Action

AnA suggests a context-appropriate first action based on submission type and client track.

| Client Track | Submission Type | Suggested First Action |
|-------------|-----------------|----------------------|
| Pharma/Biotech | IND | "Create your Clinical Overview" → launches Clinical Overview app |
| Pharma/Biotech | NDA/BLA | "Start your Module 2.5 Clinical Overview" → launches Clinical Overview app |
| Pharma/Biotech | Any | "Upload your source documents" → opens Vault |
| Device/Diagnostics | 510(k) | "Open your 510(k) Workspace" → launches 510(k) app |
| Device/Diagnostics | PMA | "Open your PMA Workspace" → launches PMA app |
| Device/Diagnostics | CER/MDR | "Create your CER scaffold" → launches CER Generator app |
| Any | Any | "Draft your first section" → opens Work tab |

AnA: *"Based on your 510(k) submission, I'd recommend starting with your predicate comparison. Want me to set that up?"*

**What happens:** User clicks suggested action. App launches inside project context. First governed artifact draft created.

### Step 7: Confidence Checkpoint

**Screen:** Summary card after first action is initiated.

```
You're all set ✓

Your project is created and your first [document/workspace] is ready.

[Continue in Work]
[Open Vault]
[Explore Apps]
[Back to Overview]
```

AnA: *"You're off to a great start. I'm always here — just type or use ⌘K."*

**What happens:** `localStorage.concept2cure_first_run_complete = 'true'` is set. User proceeds to normal product usage.

---

## 5. Track-Specific Differences

| Aspect | Pharma & Biotech | Device & Diagnostics |
|--------|-----------------|---------------------|
| Submission types shown | IND, NDA, BLA, MAA, CTA | 510(k), PMA, De Novo, CER/MDR |
| Default first action | Clinical Overview or Protocol Rationale | 510(k) Workspace or CER Generator |
| Template defaults | CTD Module 2-5 focused | CTD Module 1 + performance data focused |
| Recommended apps | Evidence Memo, Protocol Rationale, Clinical Overview, Module 3 Builder | 510(k) Workspace, PMA Workspace, CER Generator, Risk-Benefit Analysis |
| Overview widgets | Clinical milestones, IND timeline | Device clearance path, predicate status |

---

## 6. Implementation File Targets

| File | Change |
|------|--------|
| `client/src/concept2cure/components/enablement/FirstRunExperience.tsx` | **Major rewrite.** Replace 7-step Dr. Sage/AnA/agents flow with 7-step value-first flow. |
| `client/src/concept2cure/ZenAppWithSession.tsx` | May need adjustment to first-run detection and routing. |
| `client/src/concept2cure/components/onboarding/IndustryModeSelector.tsx` | **Absorb** role/industry into Step 2 of new flow. May become unused. |
| `client/src/concept2cure/components/wizard/QuickStartWizard.tsx` | **Absorb** submission/region/product into Steps 2-3. May become unused. |
| `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx` | **Enhance** for Step 4 landing: readiness snapshot, next actions, guided tour integration. |
