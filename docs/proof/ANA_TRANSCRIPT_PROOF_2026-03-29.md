# AnA Transcript Proof — 2026-03-29

**Sprint:** AnA Experience + Abilities Lock
**Branch:** `concept2cure-v2`

This file provides transcript-style proof for 10 specific improvements, as required by the benchmark harness spec.

---

## Grounding Wins (2)

### Win 1: Project status with grounding transparency

**User prompt:** "What is the current state of this project?"

**Context:** User has an active IND project with readiness score 62%, 4 RIM signals, and workflow at Pre-IND phase.

**Old weakness:** AnA answers with correct information when enrichment works, but gives no indication of whether the answer is based on actual project data or general knowledge. If enrichment silently fails, the user gets generic advice presented as if it's project-specific.

**New strength:** Response metadata includes `grounding.mode: "grounded"`, `grounding.contextUsed: ["project intelligence", "readiness scores", "workflow status"]`, `grounding.confidence: "high"`. The UI renders a green "● Grounded" badge. Enrichment sources shown: "project-profile, readiness, workflow". Memory atom count: 4. If enrichment had failed, the badge would show "◐ Inferred" in amber, and the response would begin with "I don't have your specific project data loaded..."

**Why it matters:** Users in regulated industries need to know whether advice is based on their data or general knowledge. This is the difference between a trustworthy operator and a guessing machine.

---

### Win 2: Evidence Q&A with honest grounding

**User prompt:** "Do we have evidence for this endpoint rationale?"

**Context:** User is working on Module 2.5 Clinical Overview with claims/evidence data in project memory.

**Old weakness:** AnA answers with what sounds like project-specific analysis, but the user can't tell if it actually checked the evidence chain or is reasoning from general knowledge about endpoint rationales.

**New strength:** When evidence data exists in project memory: grounding mode is `grounded`, enrichment sources show `claims`, evidence chain strength and confidence scores are cited in the response. When NO evidence data exists: grounding mode is `inferred`, and AnA explicitly says "[MISSING] No project-specific evidence data is available for this endpoint. To build the evidence chain, you'll need to..." The `[KNOWN]`/`[INFERRED]`/`[MISSING]` evidence discipline labels are enforced by the persona.

**Why it matters:** In regulatory submissions, the distinction between "we have evidence" and "evidence typically exists" is the difference between a defensible filing and a deficiency letter.

---

## Next-Step Wins (2)

### Win 3: Forced next-move after status briefing

**User prompt:** "Give me a five-line status briefing."

**Context:** Active project with readiness at 45%, 3 critical gaps.

**Old weakness:** AnA gives a good 5-line briefing but ends with "Let me know if you'd like me to dive deeper into any of these areas" — a passive dead-end that puts the burden back on the user.

**New strength:** The next-move contract forces the response to end with: "**Next step:** Your Module 2.5 Clinical Overview is the highest-impact gap. Run /draft 2.5 to start building it, or /audit to check what's already there." This is concrete, project-specific, and actionable.

**Why it matters:** Users in regulatory workflows don't want to figure out what to do next — they want to be told. Every dead-end paragraph is a productivity loss.

---

### Win 4: Blocker identification with directed action

**User prompt:** "What is the biggest blocker right now?"

**Context:** Readiness data shows Module 3 Drug Substance section missing, safety narrative stale.

**Old weakness:** AnA lists blockers but doesn't prioritize or give a single clear directive. User still has to decide what to do.

**New strength:** Response identifies the #1 blocker with severity from readiness data, then ends with: "**Next step:** The Drug Substance section (3.2.S) is empty and blocking your Module 3 readiness. Start with /draft 3.2.S or upload your existing CMC data for me to review." The enrichment sources confirm `readiness` was loaded.

**Why it matters:** "Here are 5 problems" is information. "Here is the #1 problem and here's how to fix it" is operational guidance. The next-move contract forces the latter.

---

## Action Receipt Wins (2)

### Win 5: Artifact creation with visible receipt

**User prompt:** "Create a draft for Module 2.5 Clinical Overview."

**Context:** Active project, section code 2.5 in authoring context.

**Old weakness:** AnA generates the content, the guidance executor auto-saves it as an artifact, but the user sees no confirmation. The `executedActions` array is populated in the response payload but the UI rendering was minimal — just a small tool execution block. The user doesn't know if the artifact was actually created, what it was named, or where it was placed.

**New strength:** The command receipt renders as a compact card: "✓ create_artifact — Created Module 2.5 Clinical Overview draft". If the action failed: "✗ create_artifact — Failed: insufficient permissions". Grounding mode shows `actioned`. The receipt is visually distinct from the response content, making it impossible to miss.

**Why it matters:** In a governed document system, users need to know that actions actually happened. Silent artifact creation undermines trust. Visible receipts make the system legible.

---

### Win 6: Command execution with success/failure clarity

**User prompt:** "/readiness" (check dossier readiness)

**Context:** Active project with readiness engine data.

**Old weakness:** Readiness data fires through enrichment and AnA discusses the scores, but there's no indication that a live service was called. The enrichment sources are logged to console but not shown to the user.

**New strength:** Enrichment sources badge shows "readiness" in the metadata bar. Memory atom count shows how many knowledge atoms were used. The grounding badge shows "● Grounded" confirming the answer is based on live data. If the readiness engine had failed, the enrichmentMeta would show `sourcesFailed: ["readiness"]` and the grounding badge would show "◐ Inferred".

**Why it matters:** Users need to distinguish between "AnA checked and here's the real score" vs "AnA is estimating based on general patterns." The enrichment transparency makes this visible.

---

## Document-Aware Wins (2)

### Win 7: Draft-mode constructive behavior

**User prompt:** "What should I do with this section?"

**Context:** Authoring context has artifact_status = "draft", section code = "2.5".

**Old weakness:** AnA gives the same advice regardless of document status. A draft gets the same response as a locked document. No state-awareness.

**New strength:** The orchestrator injects `## DOCUMENT STATE: DRAFT` into the system prompt. The persona's document-state rules activate draft-mode behavior: constructive, building-forward. AnA offers to write, expand, fill gaps. Suggests running /audit or /scan before moving to review. Does NOT suggest verification or export actions (those are for later states).

**Why it matters:** A regulatory document has a lifecycle. Advice that ignores where the document is in that lifecycle is either premature or outdated. Draft-mode behavior focuses energy where it belongs: building.

---

### Win 8: Locked-mode immutability respect

**User prompt:** "Can you fix the wording in paragraph 3?"

**Context:** Authoring context has artifact_status = "locked".

**Old weakness:** AnA proceeds to suggest edits without acknowledging the document is immutable. May even attempt to execute an update command that would fail silently.

**New strength:** The orchestrator injects `## DOCUMENT STATE: LOCKED`. AnA responds: "This document is locked and cannot be edited. To make changes, you'll need to create a new version. Would you like me to create a new version with the wording improvement?" Grounding: `blocked` (action blocked by document state). No edit commands attempted.

**Why it matters:** In 21 CFR Part 11 regulated environments, attempting to edit a locked document is not just unhelpful — it's a compliance concern. Respecting immutability builds trust.

---

## Honest-Failure Wins (2)

### Win 9: Missing project context acknowledged

**User prompt:** "What is our submission readiness score?"

**Context:** No project_id provided, no active project selected.

**Old weakness:** AnA may respond with a generic "submission readiness typically involves checking completeness, consistency..." without flagging that it has no actual project data. The response sounds project-specific but isn't.

**New strength:** Enrichment returns early with `hasProjectContext: false` in the metadata. The persona's grounding rules activate: "Do NOT say 'based on your project' when you have no project-specific data." Grounding mode: `blocked` or `inferred` with confidence `low`. Response says: "I don't have an active project loaded to check readiness. Select a project or tell me which one you're working on." Next move: "Select your project from the sidebar, then try /readiness again."

**Why it matters:** The most dangerous failure mode is confident-sounding answers based on nothing. Users in regulated environments can't afford to act on hallucinated readiness scores. Honest blocking is better than confident guessing.

---

### Win 10: Command blocked with specific explanation

**User prompt:** "Export this artifact."

**Context:** No artifact selected, no artifact_id in context.

**Old weakness:** AnA describes what export does and how it works, without acknowledging that no artifact is selected and no export can actually happen. The user leaves thinking they exported something.

**New strength:** Grounding mode: `blocked`. Response: "I can't export right now — no artifact is currently selected. Open the artifact you want to export, then run /export or ask me to export it." The action receipt format shows: "✗ export — No artifact selected." Next move: "Open the artifact you want to export from the dossier map."

**Why it matters:** Silent non-execution is worse than a visible error. When the user asks for an action and nothing happens, they lose trust. A clear blocked receipt with a path forward maintains trust and momentum.

---

## Summary

| Category | Win Count | Key Theme |
|---|---|---|
| Grounding | 2 | Users see whether answers are based on real data or inference |
| Next-step | 2 | Every response ends with a concrete, project-specific action |
| Action receipt | 2 | Command execution is visible and legible |
| Document-aware | 2 | Behavior adapts to document lifecycle stage |
| Honest failure | 2 | Blocking is explicit, not silent; missing context acknowledged |
| **Total** | **10** | **AnA is more grounded, more directed, more honest, more state-aware** |
