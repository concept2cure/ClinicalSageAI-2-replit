# Work Order: AnA 1.0 Conversation Fluidity & User Value Upgrade

**Owner:** Product + Frontend + AI Platform  
**Status:** Proposed  
**Priority:** P0 (High User Impact)  
**Target Window:** 2 sprints (10 working days)

---

## 1) Problem Statement

Users can complete tasks in AnA 1.0, but the interaction still feels less fluid than ChatGPT for day-to-day use.

Current friction points observed in usage:
- Users lose conversational momentum when responses stream in unevenly or while navigating earlier messages.
- Users are not always confident what AnA is doing while "thinking" (tool use, retrieval, draft generation).
- Users have to manually steer every next step, instead of receiving concise, context-aware follow-up options.
- Long-form outputs can feel heavy to scan without a clear "answer first, details second" structure.

---

## 2) Desired User Outcomes

After this work order ships, a user should be able to:
1. Ask a question and get a **fast first useful answer** in <3 seconds (where backend latency allows).
2. Understand **what AnA is doing now** and what will happen next.
3. Continue a conversation with less typing via **high-quality one-tap follow-ups**.
4. Stay oriented in long threads via **stable scrolling + clear jump controls + compact summaries**.
5. Convert answers into artifacts/actions without context switching.

---

## 3) Scope of Work (High-Impact Features)

## A. Response Experience (Perceived Speed + Clarity)
- Add **two-stage response rendering**:
  - Stage 1: short "Answer in one sentence" preview.
  - Stage 2: expanded rationale/citations/actions streamed in.
- Standardize answer template:
  - **Bottom line**
  - **What this means for your project**
  - **Recommended next action**

**Benefit to human user:** Immediate value before full generation completes.

## B. Interaction Momentum (Less Typing)
- Add **contextual follow-up chips** under every assistant response (max 3):
  - "Turn this into a draft"
  - "Compare options"
  - "Identify risk gaps"
- Chips should be generated from intent lens + project context + latest answer.

**Benefit:** Reduces cognitive load and prompt-writing overhead.

## C. Trust & Transparency
- Replace generic "Thinking..." with a lightweight status rail:
  - "Reading project context"
  - "Checking prior thread"
  - "Drafting recommendation"
- Show when external evidence/tools were used (and when not used).

**Benefit:** Users understand progress and trust results more.

## D. Long-Thread Usability
- Add **conversation minimap anchors** for long chats:
  - key milestones (question, recommendation, action taken).
- Add **thread summary refresh** button:
  - "Summarize last 10 turns" into a pinned recap card.

**Benefit:** Users can re-enter long threads quickly.

## E. Accessibility + Precision UX
- Keyboard-first behavior:
  - `Enter` send, `Shift+Enter` newline, `/` commands, `Cmd/Ctrl+K` quick action palette.
- Preserve cursor/input focus intelligently after send, jump, and chip click.
- Improve screen-reader labeling for streaming states and action cards.

**Benefit:** Faster operation and broader usability.

---

## 4) Out of Scope (This Work Order)

- Backend model/provider migration.
- New paid external dependencies.
- Major navigation redesign outside chat surface.

---

## 5) Implementation Plan

### Sprint 1 (Foundation)
1. Introduce two-stage response renderer and standardized answer sections.
2. Implement status rail state model and UI.
3. Add follow-up chip generation contract from existing context payload.
4. Instrument analytics events:
   - `ana_response_first_token_ms`
   - `ana_followup_chip_click`
   - `ana_jump_to_latest_click`

### Sprint 2 (Flow Optimization)
1. Add pinned thread recap card + summarize-last-10-turns action.
2. Add long-thread anchors/minimap.
3. Keyboard and accessibility pass.
4. Usability polish from QA feedback.

---

## 6) Acceptance Criteria

### Functional
- User sees first meaningful answer section before full detailed response completes.
- Every assistant answer includes up to 3 context-aware follow-up chips.
- Status rail updates reflect live processing state transitions.
- Recap card can summarize last 10 turns in <4 seconds.

### UX Quality
- No forced autoscroll when user is not near bottom.
- Jump-to-latest returns user to live stream and focuses composer.
- Follow-up chip interaction to first token <= 1.5s median (excluding provider latency).

### Reliability
- No regression in existing chat send/queue/thread behavior.
- All new controls degrade safely when context/tools unavailable.

---

## 7) Success Metrics (User Benefit)

Primary:
- **+20%** increase in multi-turn session completion rate.
- **-25%** reduction in prompt rewrites per task.
- **+15%** increase in artifact/action conversion from chat replies.

Secondary:
- **-30%** time-to-next-action after first assistant answer.
- Improved CSAT on "AnA is easy to work with" item.

---

## 8) Risks & Mitigations

- **Risk:** More UI controls increase clutter.  
  **Mitigation:** Progressive disclosure; cap chips to 3; hide advanced controls behind compact toggles.

- **Risk:** Status rail drifts from true backend state.  
  **Mitigation:** Drive statuses from explicit backend lifecycle events.

- **Risk:** Long-thread summary quality varies by domain.  
  **Mitigation:** Provide "refresh summary" + editable summary card.

---

## 9) Definition of Done

- Feature flags enabled for staged rollout.
- UX acceptance sign-off by product + QA.
- Telemetry dashboard published with baseline vs post-launch metrics.
- Documentation updated for support and onboarding teams.

