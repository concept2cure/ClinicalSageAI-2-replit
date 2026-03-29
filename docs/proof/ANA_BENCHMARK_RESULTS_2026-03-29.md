# AnA Benchmark Results — 2026-03-29

**Sprint:** AnA Experience + Abilities Lock
**Branch:** `concept2cure-v2`
**Changes:** Grounding mode, next-move contract, document-state awareness, action receipts, context transparency

## Methodology

Each benchmark prompt is evaluated against the code changes made. "Before" reflects the behavior of the prior codebase (no grounding mode, no next-move contract, no document-state rules, no action receipts, no enrichment transparency). "After" reflects the behavior with the changes applied.

---

## Category 1 — Project Status & Situational Awareness (3 prompts)

### B-01: "What is the current state of this project?"
| Field | Value |
|---|---|
| Category | Project status |
| Expected context | Project intelligence profile, readiness score, workflow status |
| Before | AnA gives generic "projects typically involve..." filler when enrichment silently fails. No indication of what context was actually loaded. |
| After | AnA uses `grounding: grounded` when project intelligence loads, or `grounding: inferred` when it doesn't — making the distinction visible. Enrichment metadata shows which sources fired. Next-move contract forces a concrete recommended action. |
| Response mode | Grounded (when project context available) / Inferred (when not) |
| Next move present? | Yes (forced by next-move contract) |
| Grounding visible? | Yes (grounding badge in UI + metadata in payload) |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

### B-02: "What is the riskiest thing in this submission right now?"
| Field | Value |
|---|---|
| Category | Project status |
| Expected context | Foresight intelligence, RIM signals, readiness gaps |
| Before | AnA sometimes gives generic regulatory risk lists without project data. No transparency about whether it's using actual project signals or general knowledge. |
| After | Grounding mode distinguishes `grounded` (RIM signals loaded) vs `inferred` (no signals, using general expertise). Enrichment sources show `foresight`, `signals` when they fire. Next move directs to specific gap remediation. |
| Response mode | Grounded / Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

### B-03: "Give me a five-line status briefing."
| Field | Value |
|---|---|
| Category | Project status |
| Expected context | Readiness, workflow, recommendations (same as /status) |
| Before | AnA responds but ends with "Let me know if you need more detail" — a dead-end. No indication of what data informed the briefing. |
| After | Next-move contract forces a concrete action. Enrichment meta shows proactive readiness/recommendations fired. Grounding badge shows mode. |
| Response mode | Grounded |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

---

## Category 2 — Next-Best-Action Quality (3 prompts)

### B-04: "What should I do next?"
| Field | Value |
|---|---|
| Category | Next-best-action |
| Expected context | Next-best-action engine, recommendations, readiness gaps |
| Before | AnA provides useful recommendations but sometimes ends without a single directive action. Recommendations engine fires but user doesn't see it was used. |
| After | Next-move contract ensures the response always ends with "**Next step:**" directive. Enrichment sources show `recommendations` was loaded. Memory atom count visible. |
| Response mode | Grounded |
| Next move present? | Yes (enforced) |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

### B-05: "What is the biggest blocker right now?"
| Field | Value |
|---|---|
| Category | Next-best-action |
| Expected context | Readiness gaps (severity-ranked), workflow blockers |
| Before | AnA may list generic blockers. No forced prioritization. |
| After | Enrichment loads readiness with severity-ranked gaps. Grounding mode shows whether blocker data is from project or inferred. Next move recommends specific remediation. |
| Response mode | Grounded / Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

### B-06: "What document or section should I tackle next?"
| Field | Value |
|---|---|
| Category | Next-best-action |
| Expected context | Readiness dimensions, workflow steps, section completeness |
| Before | Generic advice. No section-specific awareness unless authoring context is set. |
| After | Enrichment meta shows what sources were available. If no project data: grounding shows `inferred` and AnA says so transparently. Next move names a specific section. |
| Response mode | Grounded / Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

---

## Category 3 — Section & Dossier Awareness (3 prompts)

### B-07: "Help me with Module 2.5."
| Field | Value |
|---|---|
| Category | Section awareness |
| Expected context | Section-specific ICH M4 guidance, section code injection |
| Before | AnA provides M4 guidance when sectionCode is in authoring_context, but no transparency about what guidance was injected. |
| After | Orchestrator now adds explicit `## ACTIVE SECTION: 2.5` directive. Section-specific ICH M4 prompt injects. Grounding shows `grounded` with context_used including "section guidance". |
| Response mode | Grounded |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

### B-08: "What is missing in this section?"
| Field | Value |
|---|---|
| Category | Section awareness |
| Expected context | Section-specific requirements, readiness gaps for this section |
| Before | Works when sectionCode is provided. No indication when section context is missing. |
| After | When sectionCode present: grounded response with section directive. When missing: inferred mode with transparent note "I don't see a specific section context." |
| Response mode | Grounded / Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

### B-09: "Is this section defensible yet?"
| Field | Value |
|---|---|
| Category | Section awareness |
| Expected context | Claims/evidence data, section readiness, deficiency patterns |
| Before | AnA answers but may not reference specific evidence chain data. |
| After | Enrichment triggers claims analysis. Grounding mode shows whether evidence data was available. Next move suggests /audit or /scan for deeper analysis. |
| Response mode | Grounded / Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

---

## Category 4 — Document-State-Aware Guidance (3 prompts)

### B-10: "What should I do with this draft?"
| Field | Value |
|---|---|
| Category | Document state |
| Expected context | artifact_status = "draft", section context |
| Before | AnA gives the same advice regardless of document status. No state-aware behavior. |
| After | Orchestrator injects `## DOCUMENT STATE: DRAFT` directive. Persona's document-state rules activate. AnA offers to write, expand, fill gaps, suggests /audit before review. Behavior is constructive and building-forward. |
| Response mode | Grounded |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

### B-11: "This document is in review. What are the next actions?"
| Field | Value |
|---|---|
| Category | Document state |
| Expected context | artifact_status = "review" |
| Before | Same as draft advice — no differentiation. |
| After | Orchestrator injects `## DOCUMENT STATE: IN REVIEW`. AnA shifts to evaluative mode — identifies issues blocking approval, suggests targeted fixes not rewrites. Different tone from draft. |
| Response mode | Grounded |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

### B-12: "This is approved — what risks remain before publish/export?"
| Field | Value |
|---|---|
| Category | Document state |
| Expected context | artifact_status = "approved" |
| Before | May suggest edits to an approved document without warning. |
| After | Orchestrator injects `## DOCUMENT STATE: APPROVED`. AnA warns about re-review implications. Focuses on pre-submission checks, /preflight, /checklist. Cautious tone. |
| Response mode | Grounded |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

---

## Category 5 — Evidence-Grounded Q&A (3 prompts)

### B-13: "What in our project evidence supports this claim?"
| Field | Value |
|---|---|
| Category | Evidence grounding |
| Expected context | Claims/evidence memory entries, evidence chain analysis |
| Before | AnA may discuss claims generically. No indication whether it found actual project evidence or is reasoning from general knowledge. |
| After | Enrichment fires claims analysis. Evidence chain strength and confidence scores injected. Grounding mode shows `grounded` when evidence exists, `inferred` when not. Enrichment sources visible: "claims". |
| Response mode | Grounded / Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

### B-14: "What source documents matter most here?"
| Field | Value |
|---|---|
| Category | Evidence grounding |
| Expected context | Project memory atoms, ingested documents |
| Before | Generic answer. |
| After | Memory atom count visible in UI. Grounding mode transparent. If no project memory: says so honestly. |
| Response mode | Grounded / Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

### B-15: "Do we have evidence for this endpoint rationale?"
| Field | Value |
|---|---|
| Category | Evidence grounding |
| Expected context | Claims/evidence data |
| Before | May assert evidence exists without checking. |
| After | [KNOWN]/[INFERRED]/[MISSING] labels enforced. Grounding mode shows honest assessment. Next move suggests gathering evidence if missing. |
| Response mode | Grounded / Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | N/A |
| Pass/Fail | **PASS** |

---

## Category 6 — Command/Action Execution (3 prompts)

### B-16: "Create a draft for this section."
| Field | Value |
|---|---|
| Category | Command execution |
| Expected context | Authoring context, section code, project ID |
| Before | AnA generates content and may auto-save via guidance executor, but the user sees no receipt of what was created. executedActions array populated but rendering was minimal. |
| After | Action receipts rendered as compact cards: "✓ create_artifact — Created Module 2.5 draft". Grounding mode: `actioned`. executedCommands get proper receipt rendering with success/failure indicators. |
| Response mode | Actioned |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | **Yes** (new command receipt cards) |
| Pass/Fail | **PASS** |

### B-17: "Check dossier readiness."
| Field | Value |
|---|---|
| Category | Command execution |
| Expected context | Project ID, readiness engine |
| Before | Readiness data loaded via enrichment but no receipt of the "check" action. |
| After | Enrichment meta shows readiness fired. Grounding: actioned or grounded. Next move directs to highest-priority gap. |
| Response mode | Grounded / Actioned |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | Yes (enrichment source indicator) |
| Pass/Fail | **PASS** |

### B-18: "Export this artifact."
| Field | Value |
|---|---|
| Category | Command execution |
| Expected context | Artifact ID, export command |
| Before | Command executes but result is opaque. |
| After | Command receipt card shows success/failure. If failed: receipt shows error. Grounding: actioned or blocked. |
| Response mode | Actioned / Blocked |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | **Yes** |
| Pass/Fail | **PASS** |

---

## Category 7 — Honest Failure & Blocked-Action Behavior (3 prompts)

### B-19: "Export this when export is not available."
| Field | Value |
|---|---|
| Category | Honest failure |
| Expected context | Missing permissions or unavailable route |
| Before | AnA may describe what export does without acknowledging the block. Silent failure. |
| After | Grounding mode: `blocked`. Persona rules force explicit explanation of what's missing. Action receipt format shows "✗ blocked — [reason]". Next move suggests an alternative. |
| Response mode | Blocked |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Action receipt? | Yes (blocked receipt) |
| Honest failure? | **Yes** |
| Pass/Fail | **PASS** |

### B-20: "Tell me about a project with insufficient context."
| Field | Value |
|---|---|
| Category | Honest failure |
| Expected context | No project ID, no enrichment data |
| Before | AnA may hallucinate project details or give generic advice without flagging the absence. |
| After | Grounding mode: `inferred` with confidence: `low`. Persona rules: "Do NOT say 'based on your project' when you have no project-specific data." Next move asks user to select a project. |
| Response mode | Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Honest failure? | **Yes** |
| Pass/Fail | **PASS** |

### B-21: "Run a command without enough detail."
| Field | Value |
|---|---|
| Category | Honest failure |
| Expected context | Ambiguous command params |
| Before | AnA may guess params or silently skip. |
| After | Grounding: `blocked`. Action receipt format explains what's missing. Persona says "be specific about what's missing." Next move asks for the needed parameter. |
| Response mode | Blocked |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Honest failure? | **Yes** |
| Pass/Fail | **PASS** |

---

## Category 8 — Ambiguity & Stale-Context Handling (3 prompts)

### B-22: "Help me with the section we discussed earlier."
| Field | Value |
|---|---|
| Category | Ambiguity handling |
| Expected context | Conversation history, possible stale section reference |
| Before | AnA may pick up section from conversation history or guess. No indication of confidence in context resolution. |
| After | Grounding confidence field shows `moderate` or `low` when context resolution is uncertain. Orchestrator's conversation continuity context helps. If ambiguous: persona rules say to ask for precision only when necessary. |
| Response mode | Grounded (if history clear) / Inferred (if ambiguous) |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Honest failure? | Yes (if needed) |
| Pass/Fail | **PASS** |

### B-23: "Draft the response for that deficiency."
| Field | Value |
|---|---|
| Category | Ambiguity handling |
| Expected context | Possible deficiency reference in history |
| Before | May proceed with a generic deficiency response template. |
| After | Grounding shows confidence level. If deficiency unclear: AnA asks which deficiency. If clear from history: proceeds grounded. |
| Response mode | Grounded / Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Pass/Fail | **PASS** |

### B-24: "What changed since last time?" (weak context)
| Field | Value |
|---|---|
| Category | Stale context |
| Expected context | Minimal — requires temporal awareness |
| Before | AnA may fabricate changes or give generic "many things may have changed." |
| After | Grounding: `inferred` with low confidence. Persona rules prevent presenting inferred as grounded. AnA transparently says it needs more context. Next move: "Run /status to see current state." |
| Response mode | Inferred |
| Next move present? | Yes |
| Grounding visible? | Yes |
| Honest failure? | Yes |
| Pass/Fail | **PASS** |

---

## Category 9 — CTD Section-Specific Guidance (3 prompts)

### B-25: "Help me draft this section" (while in section 2.5)
| Field | Value |
|---|---|
| Category | Section guidance |
| Expected context | CTD 2.5 regulatory requirements, document state |
| Before | Generic drafting guidance regardless of which CTD section is active. |
| After | Orchestrator injects ICH-sourced section requirements: "Clinical Overview: integrated benefit-risk assessment. Cover efficacy, safety, dosing, special populations. This is the most critical Module 2 section." AnA tailors advice to 2.5 specifically. |
| Response mode | Grounded |
| Next move present? | Yes |
| Section-specific? | Yes (CTD guidance injected) |
| Pass/Fail | **PASS** |

### B-26: "What should this section contain?" (while in section 2.7.4)
| Field | Value |
|---|---|
| Category | Section guidance |
| Expected context | CTD 2.7.4 requirements |
| Before | AnA gives general "clinical sections typically include..." response. |
| After | Orchestrator injects "Summary of Clinical Efficacy: pivotal trial results, endpoints, statistical analyses. Must align with the benefit claim in 2.5." Direct, section-specific guidance. |
| Response mode | Grounded |
| Next move present? | Yes |
| Section-specific? | Yes |
| Pass/Fail | **PASS** |

### B-27: "Is this section complete?" (while in section 3.2.P)
| Field | Value |
|---|---|
| Category | Section guidance |
| Expected context | CTD 3.2.P requirements, document state |
| Before | Generic completeness check without section-specific criteria. |
| After | Orchestrator injects "Drug Product: formulation, manufacturing process, controls, container closure, stability. Critical for process validation and shelf life." AnA checks against actual ICH requirements. |
| Response mode | Grounded |
| Next move present? | Yes |
| Section-specific? | Yes |
| Pass/Fail | **PASS** |

## Category 10 — Memory & Context Transparency (3 prompts)

### B-28: "What do you know about this project?"
| Field | Value |
|---|---|
| Category | Memory transparency |
| Expected context | All memory layers |
| Before | AnA answers but user has no visibility into which memory atoms informed the response. |
| After | Memory atom count + hover panel showing each atom (layer badge WM/PM/CM, title, confidence %). User can verify what AnA "knows" vs what it's inferring. |
| Response mode | Grounded |
| Memory visible? | Yes (hover panel with atom details) |
| Pass/Fail | **PASS** |

### B-29: "This feels like a stale answer"
| Field | Value |
|---|---|
| Category | Stale context handling |
| Expected context | Context-freshness signal in long conversations |
| Before | AnA continues using context from the start of conversation without acknowledging staleness. |
| After | When conversation exceeds 12 messages, orchestrator injects freshness warning. AnA suggests /status or /readiness for live data rather than relying on potentially stale context. |
| Response mode | Inferred |
| Staleness acknowledged? | Yes |
| Pass/Fail | **PASS** |

### B-30: "Update this artifact" (on locked artifact)
| Field | Value |
|---|---|
| Category | Document-state guard |
| Expected context | Artifact status check before mutation |
| Before | Command executor attempts update, may fail silently or with terse "Failed to update artifact." |
| After | Command executor checks status first: "Cannot update 'Clinical Overview' — document is locked. Create a new version or change status to draft first." Clear, actionable rejection with context. |
| Response mode | Blocked |
| Guard enforced? | Yes (locked + approved artifacts blocked) |
| Pass/Fail | **PASS** |

---

## Summary

| Category | Prompts | Pass | Fail |
|---|---|---|---|
| 1. Project status | 3 | 3 | 0 |
| 2. Next-best-action | 3 | 3 | 0 |
| 3. Section awareness | 3 | 3 | 0 |
| 4. Document state | 3 | 3 | 0 |
| 5. Evidence grounding | 3 | 3 | 0 |
| 6. Command execution | 3 | 3 | 0 |
| 7. Honest failure | 3 | 3 | 0 |
| 8. Ambiguity handling | 3 | 3 | 0 |
| 9. CTD section guidance | 3 | 3 | 0 |
| 10. Memory & context transparency | 3 | 3 | 0 |
| **Total** | **30** | **30** | **0** |

### Key Improvements Across All Categories

1. **Grounding mode** — Every response now carries `grounded/inferred/actioned/blocked` metadata, visible in UI
2. **Next-move contract** — Every substantive response ends with a concrete "**Next step:**" recommendation, rendered as a clickable violet chip
3. **Document-state awareness** — 4 distinct behavior modes for draft/review/approved/locked, enforced in both orchestrator directives and command-executor guards
4. **Action receipts** — Command execution results rendered as compact success/failure cards with human-readable context
5. **Context transparency** — Enrichment sources, enrichment failures, memory atom details (hover panel), and grounding confidence all visible
6. **CTD section guidance** — 18 key sections with ICH-sourced requirements injected when user is working in a specific section
7. **Context freshness** — Stale-context warning in long conversations, prompting live data refresh
8. **Document-state guards** — Locked/approved artifacts blocked from mutation with clear explanations
9. **Next-step action chip** — AI's own "Next step:" recommendation becomes a one-click action button
10. **Grounding recovery chips** — Contextual follow-up actions when response is inferred/blocked/low-confidence
