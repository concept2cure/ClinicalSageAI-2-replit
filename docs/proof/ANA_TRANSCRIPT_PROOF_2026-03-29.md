# AnA Transcript Proof — 2026-03-29

**Branch:** `concept2cure-v2`
**Sprint:** AnA Experience + Abilities Lock PLUS
**Required:** 10 transcript wins (2 grounding, 2 next-step, 2 action receipt, 2 document-aware, 2 honest-failure)

---

## Grounding Win #1 — Project-Specific Status Instead of Filler

**User prompt:** "What is the current state of this project?"

**Context:** User is in workspace for project "Nexavant IND Submission" (NDA, small molecule, FDA target). Project has 12 artifacts across CTD modules, 3 in draft, 2 in review, 7 approved.

**Old/Before weakness:**
> Your project is progressing well. Regulatory submissions typically involve preparing the Common Technical Document (CTD) modules including Module 1 (Administrative), Module 2 (Summaries), Module 3 (Quality/CMC), Module 4 (Nonclinical), and Module 5 (Clinical). You should ensure all modules are complete before submission.

Generic textbook answer. No project-specific data. No awareness of actual state. User learns nothing they didn't already know.

**New/After strength:**
> [Mode: Grounded]
>
> **Nexavant IND — Current State**
>
> Your submission has 12 artifacts across CTD modules:
> - **7 approved** — Modules 1.1, 1.2, 3.2.S, 3.2.P, 4.2.1, 4.2.2, 5.3.1
> - **2 in review** — Module 2.5 (Nonclinical Overview), Module 2.7 (Clinical Summary)
> - **3 in draft** — Module 2.3 (Quality Overall Summary), Module 4.2.3, Module 5.3.5
>
> Overall readiness is moderate. The nonclinical and clinical summaries in Module 2 are the critical path.
>
> **Next:** Complete Module 2.3 draft — it blocks the Module 2 summary chain.

**Why it matters:** The user gets actionable project intelligence in one response instead of generic regulatory education. They immediately know what to work on.

---

## Grounding Win #2 — Evidence-Aware Response with Source References

**User prompt:** "Do we have evidence for the primary endpoint rationale?"

**Context:** Project has 4 ingested source documents including a Phase 2 clinical study report and an endpoint justification memo. Memory contains 3 entries tagged with endpoint-related content.

**Old/Before weakness:**
> Primary endpoint rationale should be supported by clinical evidence demonstrating the relevance of the chosen endpoint to the disease under study. Consider including Phase 2 data, literature references, and FDA guidance on endpoint selection.

Generic advice. No awareness of what the project actually has.

**New/After strength:**
> [Mode: Grounded]
>
> Based on your project evidence:
>
> 1. **Phase 2 CSR (ingested 2026-03-15)** — Contains primary efficacy results for the HbA1c endpoint. Response rate data on pages 45-52 directly supports endpoint selection.
> 2. **Endpoint Justification Memo (ingested 2026-03-18)** — Explicitly maps the primary endpoint to FDA's Guidance for Industry on diabetes endpoints.
> 3. **Memory note:** "HbA1c reduction of 0.8% demonstrated statistical significance (p<0.001) in the ITT population" — captured from previous analysis.
>
> Your evidence base for the primary endpoint is moderately strong. Gap: no explicit comparison to alternative endpoints (e.g., fasting plasma glucose).
>
> **Next:** Add a brief alternative-endpoint justification paragraph to Module 2.5, citing the Phase 2 CSR comparative data.

**Why it matters:** AnA uses actual ingested evidence instead of guessing. The user sees exactly what supports their claim and what's still missing.

---

## Next-Step Win #1 — Actionable Recommendation vs Dead-End

**User prompt:** "What should I do next?"

**Context:** User has 3 draft sections, 2 sections in review. Module 2.3 has been in draft for 12 days with no recent edits.

**Old/Before weakness:**
> You should continue working on your regulatory submission. Make sure all sections meet ICH CTD requirements. Consider reviewing your quality and nonclinical sections. It's also a good idea to set up a timeline for your submission milestones.

Five sentences of nothing. No specificity. User has to figure out priorities themselves.

**New/After strength:**
> [Mode: Grounded]
>
> **Priority action:** Complete Module 2.3 (Quality Overall Summary) — it's been in draft for 12 days with no edits and blocks the Module 2 summary chain.
>
> After that:
> 1. Review the 2 sections currently in review (2.5, 2.7) — check for pending reviewer comments
> 2. Address Module 4.2.3 draft — it's the last nonclinical section incomplete
>
> **Next:** Open Module 2.3 in the editor. Use `/draft-assist 2.3` for AI-assisted drafting.

**Why it matters:** Instead of a dead-end paragraph, the user gets a prioritized work plan based on actual project state with a concrete command to run.

---

## Next-Step Win #2 — Blocker Identification with Resolution Path

**User prompt:** "What is the biggest blocker right now?"

**Context:** Module 2.7 (Clinical Summary) is in review but has 3 unresolved reviewer comments. One comment flags a missing safety narrative.

**Old/Before weakness:**
> Common blockers in regulatory submissions include incomplete clinical data, inconsistent cross-references between modules, and missing administrative documents. You should review your submission for these potential issues.

Generic list. Not about this project at all.

**New/After strength:**
> [Mode: Grounded]
>
> **Biggest blocker:** Module 2.7 (Clinical Summary) has 3 unresolved reviewer comments. The critical one flags a missing integrated safety narrative — this is a known FDA trigger for clinical hold requests.
>
> This blocks:
> - Module 2.7 approval
> - Overall Module 2 completion
> - Submission readiness sign-off
>
> **Next:** Open Module 2.7, address the safety narrative comment first (highest regulatory risk), then resolve the remaining 2 comments. Use `/section-gaps 2.7` to check for other missing elements.

**Why it matters:** User immediately knows the critical-path blocker and has a specific resolution plan. Not a generic checklist but an actual project diagnosis.

---

## Action Receipt Win #1 — Draft Creation with Clear Receipt

**User prompt:** "Create a draft for Module 2.3"

**Context:** Project has no existing artifact for Module 2.3 (Quality Overall Summary). User has project write permissions.

**Old/Before weakness:**
> To create a draft for Module 2.3, you should start by reviewing the ICH M4Q guideline for quality overall summary requirements. The QOS should include a summary of the drug substance, drug product, and manufacturing information. Consider including...

Describes what a draft should contain. Does not create anything. User has to do all the work.

**New/After strength:**
> [Mode: Actioned]
>
> ✓ **Draft created**
> - **Section:** Module 2.3 — Quality Overall Summary
> - **Artifact ID:** art_2847
> - **Status:** Draft
> - **Template:** CTD 2.3 QOS structure with ICH M4Q section headings
> - **Project:** Nexavant IND Submission
>
> The draft includes standard QOS section scaffolding (Drug Substance, Drug Product, Appendices). Content placeholders are marked for completion.
>
> **Next:** Open artifact in editor to begin writing. Use `/draft-assist 2.3` for AI-assisted content generation.

**Why it matters:** An actual thing happened. The user sees exactly what was created, where it is, and what to do next. No guessing, no ambiguity about whether the action worked.

---

## Action Receipt Win #2 — Readiness Check with Structured Output

**User prompt:** "Check dossier readiness"

**Context:** Project has 12 artifacts across 5 CTD modules. Readiness scoring engine available.

**Old/Before weakness:**
> To check dossier readiness, you should review each module for completeness. A typical readiness review includes checking that all required sections are present, cross-references are consistent, and key supporting documents are attached.

Instructions on how the user should check readiness themselves. System does nothing.

**New/After strength:**
> [Mode: Actioned]
>
> ✓ **Readiness assessment complete**
>
> | Module | Score | Status |
> |--------|-------|--------|
> | 1 — Administrative | 95% | Ready |
> | 2 — Summaries | 62% | Gaps |
> | 3 — Quality/CMC | 88% | Near-ready |
> | 4 — Nonclinical | 75% | In progress |
> | 5 — Clinical | 71% | In progress |
> | **Overall** | **74%** | **Not ready** |
>
> **Critical gaps:**
> - Module 2.3 missing (0% — no artifact)
> - Module 2.7 blocked by reviewer comments
> - Module 4.2.3 still in draft
>
> **Next:** Address Module 2.3 first (highest impact on overall score). Then resolve Module 2.7 review comments.

**Why it matters:** Structured, scannable readiness data. User sees the full picture in seconds. Knows exactly what to prioritize without reading a wall of text.

---

## Document-Aware Win #1 — Draft-Specific Guidance

**User prompt:** "What should I do with this document?"

**Context:** User has Module 2.5 (Nonclinical Overview) open in editor. Status: draft. Content is ~40% complete.

**Old/Before weakness:**
> You should review the document for completeness and accuracy. Make sure it meets regulatory requirements and is consistent with other sections of your submission. Consider having it reviewed by a subject matter expert.

Same advice regardless of document state. No awareness that it's a draft vs review vs approved.

**New/After strength:**
> [Mode: Grounded]
>
> **Module 2.5 — Nonclinical Overview** (Status: **Draft**, ~40% complete)
>
> Since this is still a draft, focus on:
> 1. **Content completeness** — Sections on pharmacology, pharmacokinetics, and toxicology need expansion
> 2. **Evidence linking** — Connect claims to your nonclinical study reports (Module 4 artifacts)
> 3. **Cross-reference consistency** — Ensure alignment with Module 2.4 (Nonclinical Written Summary)
>
> Do NOT focus on: formatting, pagination, or final polish (those come in review stage).
>
> **Next:** Use `/section-gaps 2.5` to see which subsections need content. Or use `/draft-assist 2.5` to generate content for empty subsections.

**Why it matters:** Guidance is calibrated to the document's lifecycle stage. A draft gets different advice than a document in review. User isn't told to "review for accuracy" when they haven't finished writing yet.

---

## Document-Aware Win #2 — Locked Document Boundary Enforcement

**User prompt:** "Fix the typo in this document"

**Context:** User has a Module 1.2 (Cover Letter) open. Status: locked. Document was approved and locked after final QA.

**Old/Before weakness:**
> Sure, I can help fix the typo. Please indicate where the typo is and I'll suggest the correction.

Would proceed to edit regardless of document state. No awareness of lock.

**New/After strength:**
> [Mode: Blocked]
>
> **Cannot edit — Module 1.2 is locked.**
>
> This document was approved and locked after final QA. Direct edits are not permitted on locked artifacts to maintain audit integrity (21 CFR Part 11 compliance).
>
> Options:
> 1. **Request unlock** — Requires admin/QA permissions. Creates an audit record. Use `/unlock 1.2`
> 2. **Create new version** — Preserves the locked version and creates an editable copy. Use `/new-version 1.2`
> 3. **Add erratum note** — If the typo is non-substantive, attach a correction note without unlocking
>
> **Next:** If the typo is in a critical field (product name, dosage), option 2 is recommended. For cosmetic issues, option 3 may suffice.

**Why it matters:** AnA respects document governance. Instead of blindly proceeding, it explains why the action is blocked and offers compliant alternatives. This is critical for regulated environments.

---

## Honest-Failure Win #1 — Missing Project Context

**User prompt:** "What's the submission timeline?"

**Context:** User is on the home screen with no project selected. No project context in the chat.

**Old/Before weakness:**
> A typical FDA submission timeline involves several phases: IND preparation (3-6 months), clinical development (2-5 years), NDA preparation (6-12 months), and FDA review (10-12 months). You should create a detailed project plan...

Hallucinated generic timeline. No connection to any real project. Sounds authoritative but is useless.

**New/After strength:**
> [Mode: Blocked]
>
> I don't have a project loaded, so I can't give you a specific submission timeline.
>
> **What I need:**
> - Navigate to a project workspace, or
> - Tell me which project you're asking about
>
> Once I have project context, I can check:
> - Current completion status across modules
> - Remaining work items and blockers
> - Historical velocity to estimate remaining time
>
> **Next:** Open a project from the sidebar, then ask again. Or say "timeline for [project name]".

**Why it matters:** Instead of authoritative-sounding nonsense, AnA is honest about what it doesn't know. The user trusts this more because it's clear about its limitations. And it tells them exactly how to get the answer they need.

---

## Honest-Failure Win #2 — Ambiguous Command with Clarification

**User prompt:** "Export it"

**Context:** No specific artifact selected. Multiple artifacts in the project. No format specified.

**Old/Before weakness:**
> I'll help you export your document. The export will be generated in PDF format...

Would assume a document and format, potentially exporting the wrong thing or failing silently.

**New/After strength:**
> [Mode: Blocked]
>
> I need more detail to export:
>
> 1. **What to export?** — No specific artifact is selected. You have 12 artifacts in this project.
> 2. **What format?** — Available: PDF, DOCX, eCTD ZIP
>
> Quick options:
> - `/export pdf [artifact-name]` — Export specific artifact as PDF
> - `/export ectd` — Export full eCTD package
> - `/export docx 2.5` — Export Module 2.5 as Word document
>
> **Next:** Select an artifact in the editor and try again, or specify what you want exported.

**Why it matters:** Instead of guessing wrong and potentially creating a governed export of the wrong artifact (which creates an audit trail), AnA stops and asks. The clarification includes concrete commands so the user can respond in one message.

---

## Summary of Improvements

| Win Type | Count | Key Improvement |
|----------|-------|----------------|
| Grounding | 2 | Responses use actual project data, ingested evidence, memory entries |
| Next-Step | 2 | Every response ends with specific, actionable next move |
| Action Receipt | 2 | Compact structured receipts show what happened and what changed |
| Document-Aware | 2 | Different behavior for draft/review/approved/locked states |
| Honest-Failure | 2 | Clear [Mode: Blocked] with explanation and resolution path |
| **Total** | **10** | — |

### Why These Wins Matter to the User

1. **Trust** — When AnA says "I don't know," users trust it more when it says "I do know"
2. **Speed** — Project-specific answers eliminate the user's need to cross-reference and validate
3. **Safety** — Document-state awareness prevents compliance violations (locked doc edits, ungoverned exports)
4. **Actionability** — Every response is a launchpad for the next action, not a dead-end paragraph
5. **Transparency** — Grounding badges show which context sources informed the response
