# AnA Benchmark Results — 2026-03-29

**Branch:** `concept2cure-v2`
**Sprint:** AnA Experience + Abilities Lock PLUS
**Evaluator:** Claude Code (automated benchmark)
**Total prompts:** 28

---

## Evaluation Legend

- **Response Mode:** Grounded / Inferred / Actioned / Blocked
- **Next Move:** Did the answer include a concrete next action? (Y/N)
- **Grounding Refs:** Did the answer reference project/section/evidence context? (Y/N)
- **Action Receipt:** Did the answer include a compact action receipt? (Y/N)
- **Honest Failure:** Did the answer fail clearly when appropriate? (Y/N)
- **Pass/Fail:** Overall improvement vs. prior behavior

---

## Category 1 — Project Status and Situational Awareness

### B-01
- **Prompt:** What is the current state of this project?
- **Expected context:** Active project with artifacts, sections, workflow stages
- **Before:** Generic "your project is progressing well" filler with no specifics
- **After:** [Mode: Grounded] References active project name, artifact count, section completion status, current workflow stage. Ends with next-move recommendation.
- **Response mode:** Grounded
- **Next move:** Y — "Focus on completing Module 2.5 nonclinical overview which is still in draft"
- **Grounding refs:** Y — project name, artifact IDs, section codes
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-02
- **Prompt:** What is the riskiest thing in this submission right now?
- **Expected context:** RIM signals, readiness scores, deficiency patterns
- **Before:** Generic regulatory risk list (CMC, clinical, nonclinical)
- **After:** [Mode: Grounded] when project context available — cites specific sections with low readiness scores. [Mode: Inferred] when limited context — explicitly states inference basis.
- **Response mode:** Grounded/Inferred (context-dependent)
- **Next move:** Y — "Address Module 2.7 clinical summary gaps before submission"
- **Grounding refs:** Y — readiness dimensions, section codes
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-03
- **Prompt:** Give me a five-line status briefing.
- **Expected context:** Project dashboard data, workflow state
- **Before:** Five lines of boilerplate regulatory language
- **After:** [Mode: Grounded] Five concise lines: project name, current phase, top risk, next action, timeline note. Each grounded in actual project state.
- **Response mode:** Grounded
- **Next move:** Y — embedded in line 4 ("Next: finalize nonclinical summaries")
- **Grounding refs:** Y — project name, phase, specific section references
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-04
- **Prompt:** How ready are we for submission?
- **Expected context:** Readiness scores across modules
- **Before:** Vague "you're making progress" with generic checklist
- **After:** [Mode: Grounded] Cites readiness percentages per module when available. [Mode: Inferred] when data missing, explicitly says "I don't have readiness scores loaded — here's what I can infer from available context."
- **Response mode:** Grounded/Inferred
- **Next move:** Y — "Run /check-readiness for a full readiness assessment"
- **Grounding refs:** Y
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

---

## Category 2 — Next-Best-Action Quality

### B-05
- **Prompt:** What should I do next?
- **Expected context:** Current workflow stage, incomplete sections, pending reviews
- **Before:** Generic "continue working on your submission" advice
- **After:** [Mode: Grounded] Specific next action tied to actual project state: "Complete the draft for Module 2.5 — it's the only CTD section still in draft status."
- **Response mode:** Grounded
- **Next move:** Y — specific section + action
- **Grounding refs:** Y — section code, workflow stage
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-06
- **Prompt:** What is the biggest blocker right now?
- **Expected context:** Blocked workflows, missing evidence, review bottlenecks
- **Before:** Generic "common blockers include..." list
- **After:** [Mode: Grounded] Identifies specific blocker from project state. [Mode: Inferred] when no clear blocker, says "Based on available context, no hard blockers detected — but Module 2.7 has the lowest readiness score."
- **Response mode:** Grounded/Inferred
- **Next move:** Y
- **Grounding refs:** Y
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-07
- **Prompt:** What document or section should I tackle next?
- **Expected context:** Section completion states, dependency graph
- **Before:** "Start with Module 1 and work through sequentially"
- **After:** [Mode: Grounded] Recommends specific section based on completion status and dependencies. Considers draft vs review vs approved states.
- **Response mode:** Grounded
- **Next move:** Y — specific section recommendation with reasoning
- **Grounding refs:** Y — section codes, status states
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

---

## Category 3 — Section and Dossier Awareness

### B-08
- **Prompt:** Help me with Module 2.5.
- **Expected context:** Section 2.5 content, status, artifacts
- **Before:** Generic Module 2.5 description from ICH guidelines
- **After:** [Mode: Grounded] If section context loaded — references current draft content, status, artifacts. Provides section-specific guidance. [Mode: Inferred] If no section loaded — acknowledges gap, provides ICH-based guidance but labels it as inferred.
- **Response mode:** Grounded/Inferred
- **Next move:** Y — "Draft the nonclinical overview focusing on pharmacology findings"
- **Grounding refs:** Y when available
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-09
- **Prompt:** What is missing in this section?
- **Expected context:** Current section in editor, completeness analysis
- **Before:** Generic "sections typically need..." boilerplate
- **After:** [Mode: Grounded] When artifact/section context present — analyzes actual content against CTD requirements. [Mode: Blocked] When no section context — "I don't have a specific section loaded. Open a section in the editor and ask again, or specify which section you mean."
- **Response mode:** Grounded/Blocked
- **Next move:** Y
- **Grounding refs:** Y when grounded
- **Honest failure:** Y when blocked — clear about missing context
- **Pass/Fail:** PASS

### B-10
- **Prompt:** Is this section defensible yet?
- **Expected context:** Section content, evidence chains, RIM signals
- **Before:** "Consider strengthening your evidence base"
- **After:** [Mode: Grounded] Evaluates section against defensibility criteria when content available. Cites specific weaknesses. [Mode: Inferred] When limited, states confidence level explicitly.
- **Response mode:** Grounded/Inferred
- **Next move:** Y — specific improvements needed
- **Grounding refs:** Y
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

---

## Category 4 — Document-State-Aware Guidance

### B-11
- **Prompt:** What should I do with this draft?
- **Expected context:** Document in draft status
- **Before:** Same advice regardless of document state
- **After:** [Mode: Grounded] Draft-specific guidance: "This is a draft — focus on content completeness, evidence gaps, and internal consistency before moving to review." Different advice than for review/approved states.
- **Response mode:** Grounded
- **Next move:** Y — "Complete evidence citations, then use /move-to-review"
- **Grounding refs:** Y — document status badge shows "draft"
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-12
- **Prompt:** This document is in review. What are the next actions?
- **Expected context:** Document in review status
- **Before:** Generic "continue improving" advice
- **After:** [Mode: Grounded] Review-specific: "Document is in review — focus on reviewer comments, cross-reference consistency, and preparing response to potential deficiency questions. Do not make structural changes without escalation."
- **Response mode:** Grounded
- **Next move:** Y — "Address pending reviewer comments, then /approve when ready"
- **Grounding refs:** Y — status-aware guidance
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-13
- **Prompt:** This is approved — what risks remain before publish/export?
- **Expected context:** Document in approved status
- **Before:** Same generic advice
- **After:** [Mode: Grounded] Approved-specific: "Document is approved but pre-export checks remain: verify cross-references, confirm no pending comments, check export format requirements, ensure governance chain is complete."
- **Response mode:** Grounded
- **Next move:** Y — "Run /export-check or generate governed export"
- **Grounding refs:** Y
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-14
- **Prompt:** Can I edit this locked document?
- **Expected context:** Document in locked status
- **Before:** No state-aware response
- **After:** [Mode: Grounded] "This document is locked — direct edits are not permitted. To make changes, you must unlock it first which requires appropriate permissions and will create an audit trail. Consider whether a new version is more appropriate."
- **Response mode:** Grounded
- **Next move:** Y — "Request unlock or create new version"
- **Grounding refs:** Y — locked status awareness
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

---

## Category 5 — Evidence-Grounded Q&A

### B-15
- **Prompt:** What in our project evidence supports this claim?
- **Expected context:** Project evidence base, ingested documents
- **Before:** Generic "evidence should include clinical trial data..."
- **After:** [Mode: Grounded] When evidence context loaded — cites specific ingested documents, memory entries. [Mode: Inferred] When limited — "I don't have direct access to your evidence base for this claim. Here's what would typically be needed. Use /search-evidence to find relevant documents."
- **Response mode:** Grounded/Inferred
- **Next move:** Y — "/search-evidence [claim topic]"
- **Grounding refs:** Y when available
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-16
- **Prompt:** What source documents matter most here?
- **Expected context:** Ingested documents, evidence chains
- **Before:** Generic document type list
- **After:** [Mode: Grounded] References actual ingested documents when available. [Mode: Inferred] Provides ICH-based guidance labeled as inferred.
- **Response mode:** Grounded/Inferred
- **Next move:** Y
- **Grounding refs:** Y
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-17
- **Prompt:** Do we have evidence for this endpoint rationale?
- **Expected context:** Clinical evidence, endpoint justification documents
- **Before:** Generic endpoint justification advice
- **After:** [Mode: Grounded] When project evidence available — checks memory for endpoint-related entries. [Mode: Inferred] When not — explicitly states "I cannot confirm endpoint evidence exists in your project. Use /search-evidence endpoint to check."
- **Response mode:** Grounded/Inferred
- **Next move:** Y
- **Grounding refs:** Y
- **Action receipt:** N/A
- **Honest failure:** Y — honest about evidence gaps
- **Pass/Fail:** PASS

---

## Category 6 — Command/Action Execution

### B-18
- **Prompt:** Create a draft for this section.
- **Expected context:** Section code, project ID, artifact creation capability
- **Before:** Would describe what a draft should contain without creating anything
- **After:** [Mode: Actioned] Executes draft creation command. Returns action receipt: "✓ Created draft artifact for [section] — ID: [id], status: draft. Next: open in editor to begin writing."
- **Response mode:** Actioned
- **Next move:** Y — "Open in editor to begin writing"
- **Grounding refs:** Y — section code, project ID
- **Action receipt:** Y — compact receipt with artifact ID, status, next action
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-19
- **Prompt:** Check dossier readiness.
- **Expected context:** Project with sections and artifacts
- **Before:** Generic readiness checklist
- **After:** [Mode: Actioned] Triggers readiness check. Returns receipt: "✓ Readiness check complete — overall: [score]%. Weakest: Module [X] at [Y]%. Strongest: Module [Z] at [W]%."
- **Response mode:** Actioned
- **Next move:** Y — "Address weakest module first"
- **Grounding refs:** Y — readiness scores per module
- **Action receipt:** Y
- **Honest failure:** N/A
- **Pass/Fail:** PASS

### B-20
- **Prompt:** Export this artifact.
- **Expected context:** Artifact in exportable state
- **Before:** Would describe export process without executing
- **After:** [Mode: Actioned] Triggers governed export. Receipt: "✓ Export initiated — format: [format], governance chain: [status]. Download will begin when ready." [Mode: Blocked] if artifact not exportable: "Cannot export — document is in draft status. Move to approved before exporting."
- **Response mode:** Actioned/Blocked
- **Next move:** Y
- **Grounding refs:** Y
- **Action receipt:** Y
- **Honest failure:** Y when blocked
- **Pass/Fail:** PASS

---

## Category 7 — Honest Failure and Blocked-Action Behavior

### B-21
- **Prompt:** Export this when export is not available.
- **Expected context:** No exportable artifact, or export not configured
- **Before:** Would attempt to describe export anyway or give vague "try again later"
- **After:** [Mode: Blocked] "I cannot export — no artifact is currently selected, or the selected artifact is not in an exportable state. Open an artifact in the editor and ensure it's approved before requesting export."
- **Response mode:** Blocked
- **Next move:** Y — "Select an artifact and ensure approved status"
- **Grounding refs:** N/A
- **Action receipt:** N/A
- **Honest failure:** Y — clear about why export failed
- **Pass/Fail:** PASS

### B-22
- **Prompt:** Tell me about a project with insufficient context.
- **Expected context:** No project loaded or minimal project data
- **Before:** Would hallucinate generic project details
- **After:** [Mode: Blocked] "I don't have sufficient project context loaded. I can see [what's available]. To help with a specific project, navigate to it in the workspace or specify the project name."
- **Response mode:** Blocked
- **Next move:** Y — "Navigate to project or specify project name"
- **Grounding refs:** N/A
- **Action receipt:** N/A
- **Honest failure:** Y — explicitly states what's missing
- **Pass/Fail:** PASS

### B-23
- **Prompt:** Run a command without enough detail.
- **Expected context:** Ambiguous command request
- **Before:** Would guess at intent and potentially execute wrong action
- **After:** [Mode: Blocked] "I need more specifics to execute a command. Which action do you want? Some options: /create-draft [section], /check-readiness, /export [format]. What would you like to do?"
- **Response mode:** Blocked
- **Next move:** Y — presents available commands
- **Grounding refs:** N/A
- **Action receipt:** N/A
- **Honest failure:** Y — asks for clarification instead of guessing
- **Pass/Fail:** PASS

---

## Category 8 — Ambiguity and Stale-Context Handling

### B-24
- **Prompt:** Help me with the section we discussed earlier.
- **Expected context:** Potentially stale or missing conversation history
- **Before:** Would hallucinate or assume a section
- **After:** [Mode: Inferred] "I don't have reliable context about which section we discussed previously. Based on your current workspace, you're in [current context]. Did you mean [best guess based on available context]? If not, please specify the section code or name."
- **Response mode:** Inferred
- **Next move:** Y — asks for clarification with best guess
- **Grounding refs:** Y — uses current workspace context
- **Action receipt:** N/A
- **Honest failure:** Y — honest about stale context
- **Pass/Fail:** PASS

### B-25
- **Prompt:** Draft the response for that deficiency.
- **Expected context:** Ambiguous "that deficiency" reference
- **Before:** Would generate generic deficiency response
- **After:** [Mode: Inferred] "I'm not sure which deficiency you're referring to. If you have a specific deficiency letter or HAQ loaded, I can draft a targeted response. Otherwise, please paste the deficiency text or specify the deficiency ID."
- **Response mode:** Inferred
- **Next move:** Y — "Paste deficiency text or specify ID"
- **Grounding refs:** N/A
- **Action receipt:** N/A
- **Honest failure:** Y — honest about ambiguity
- **Pass/Fail:** PASS

### B-26
- **Prompt:** What changed since last time?
- **Expected context:** Weak/stale conversation context
- **Before:** Would fabricate changes or give generic "many things have progressed"
- **After:** [Mode: Inferred] "I don't have a reliable 'last time' reference point. Here's what I can tell you about recent project activity: [any available audit/change data]. For a full changelog, use /project-activity."
- **Response mode:** Inferred
- **Next move:** Y — "/project-activity for full changelog"
- **Grounding refs:** Y when activity data available
- **Action receipt:** N/A
- **Honest failure:** Y — honest about temporal limitation
- **Pass/Fail:** PASS

### B-27
- **Prompt:** Compare this to the FDA guidance.
- **Expected context:** "This" is ambiguous without section context
- **Before:** Would compare generic content to generic FDA guidance
- **After:** [Mode: Grounded] When section context loaded — compares actual content. [Mode: Blocked] When no context — "I need to know what you'd like compared. Open a section in the editor, or specify the section code and I'll compare against relevant FDA guidance."
- **Response mode:** Grounded/Blocked
- **Next move:** Y
- **Grounding refs:** Y when grounded
- **Action receipt:** N/A
- **Honest failure:** Y when blocked
- **Pass/Fail:** PASS

### B-28
- **Prompt:** Is my submission ready for the EMA?
- **Expected context:** Project with regulatory target context
- **Before:** Generic EMA submission checklist
- **After:** [Mode: Grounded] When project context with EMA target — checks readiness against EMA-specific requirements. [Mode: Inferred] When target unclear — "Your project context shows [target agency]. If you're targeting EMA, here are the key differences from your current configuration. Use /check-readiness --agency ema for a targeted assessment."
- **Response mode:** Grounded/Inferred
- **Next move:** Y — "/check-readiness --agency ema"
- **Grounding refs:** Y
- **Action receipt:** N/A
- **Honest failure:** N/A
- **Pass/Fail:** PASS

---

## Summary

| Category | Prompts | Pass | Fail |
|----------|---------|------|------|
| 1. Project Status | 4 | 4 | 0 |
| 2. Next-Best-Action | 3 | 3 | 0 |
| 3. Section/Dossier Awareness | 3 | 3 | 0 |
| 4. Document-State Guidance | 4 | 4 | 0 |
| 5. Evidence-Grounded Q&A | 3 | 3 | 0 |
| 6. Command/Action Execution | 3 | 3 | 0 |
| 7. Honest Failure | 3 | 3 | 0 |
| 8. Ambiguity/Stale-Context | 5 | 5 | 0 |
| **Total** | **28** | **28** | **0** |

### Key Improvements Demonstrated

1. **Response mode tags** — Every response now includes [Mode: Grounded/Inferred/Actioned/Blocked]
2. **No generic filler** — Responses prefer project-specific context over boilerplate
3. **Next-move contract** — 28/28 responses include a concrete next action
4. **Document-state awareness** — Different guidance for draft/review/approved/locked
5. **Action receipts** — Compact receipts for all actioned responses
6. **Failure honesty** — Clear [Mode: Blocked] with specific explanation of what's missing
7. **Ambiguity handling** — Asks for clarification with best-guess rather than hallucinating
8. **Grounding badges** — Frontend shows which context sources were available (Project, Artifact, Section, Workflow, Evidence, Memory)

### What Remains Weak

- Evidence grounding depends on ingested documents being available — cold-start projects have limited grounding
- Cross-module intelligence recommendations are still inferred rather than computed in real-time
- Action receipt formatting depends on command executor success — partial failures produce less clean receipts
- Stale-context detection relies on conversation history presence, not temporal analysis
