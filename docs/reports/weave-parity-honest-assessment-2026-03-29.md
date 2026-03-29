# Weave.bio Parity Assessment — Honest Report

> Date: 2026-03-29
> Methodology: Code-level audit of ClinicalSageAI codebase + Weave.bio public product research
> Standard: "Does this actually work today?" — not "does code exist?"

---

## Executive Summary

**Overall parity: 6 of 10 Weave core capabilities at or above parity. 4 below.**

ClinicalSageAI has genuine strengths that Weave lacks (21 CFR Part 11 signatures, regulatory intelligence, multi-device/multi-agency). But the honest gaps are in the areas Weave markets hardest: **source traceability**, **real-time co-editing**, and **reviewer workflow visibility**.

---

## Capability-by-Capability Comparison

### 1. AI-Powered Document Drafting

| Dimension | Weave.bio | Concept2Cure | Verdict |
|-----------|-----------|--------------|---------|
| AI drafting from source data | ✅ AutoIND — 97% time savings (Takeda validated) | ✅ Claude Opus 4.6 with extended thinking, 7 AI endpoints live | **PARITY** |
| Inline AI autocomplete | ❓ Not specifically mentioned | ✅ AIAutocomplete extension, 1.5s debounce, ghost text | **C2C AHEAD** |
| Slash commands for AI | ❓ Not mentioned | ✅ 43 slash commands + 39 operational commands | **C2C AHEAD** |
| Source-grounded generation | ✅ Core differentiator — "every paragraph traceable" | ⚠️ Citation plugin exists, traceability marks exist, but not as deeply integrated as Weave's claim | **WEAVE AHEAD** |

**Honest take:** Both have real AI drafting. Weave's marketing is stronger on anti-hallucination/grounding. C2C's AI is real (not mocked) but hasn't been externally validated like Takeda pilot.

**Rating: PARITY (slight Weave edge on validation/marketing)**

---

### 2. Source Traceability

| Dimension | Weave.bio | Concept2Cure | Verdict |
|-----------|-----------|--------------|---------|
| Sentence-level source tracing | ✅ Standout feature — every claim links to source | ⚠️ TraceabilityMark extension exists, CitationPlugin exists, but per-sentence linking not automatic | **WEAVE AHEAD** |
| Connected Data Room | ✅ Smart repository with semantic search + AI metadata | ⚠️ Data room panel exists in inspector, source selection works, but no AI-extracted metadata | **WEAVE AHEAD** |
| Cross-reference automation | ✅ Auto-updates when source changes | ⚠️ Cross-reference panel exists, inconsistency detection exists, but not automatic | **WEAVE AHEAD** |

**Honest take:** This is Weave's single biggest differentiator. C2C has the UI components (traceability marks, citation search, data room panel) but the end-to-end "every sentence linked to source automatically" flow isn't there. The pieces exist but aren't stitched into one seamless experience.

**Rating: WEAVE AHEAD — this is the #1 gap**

---

### 3. Document Editor & Formatting

| Dimension | Weave.bio | Concept2Cure | Verdict |
|-----------|-----------|--------------|---------|
| Rich text editing | ✅ Integrated editor | ✅ TipTap with StarterKit, tables, highlights, colors, task lists | **PARITY** |
| Inline commenting | ✅ Side-by-side comments | ✅ CommentMark extension, comments panel with persistence | **PARITY** |
| Redline / track changes | ✅ Redline suggestions | ⚠️ ReviewMode concept exists but no true tracked-changes (insertions/deletions with accept/reject per change) | **WEAVE AHEAD** |
| Table/figure generation | ✅ AI-generated tables and figures | ⚠️ Tables supported in editor, but no AI table generation from data | **WEAVE AHEAD** |
| Glossary tooltips | ❌ Not mentioned | ✅ 50+ regulatory terms, inline tooltips | **C2C AHEAD** |
| Compliance scanning | ❌ Not mentioned as distinct feature | ✅ 40+ rules, real-time, wavy underlines | **C2C AHEAD** |

**Honest take:** Both editors are functional. C2C has more chrome (glossary, compliance scanner, slash commands). Weave has better tracked changes and table generation. Net wash with different strengths.

**Rating: PARITY (different strengths)**

---

### 4. Real-Time Collaboration

| Dimension | Weave.bio | Concept2Cure | Verdict |
|-----------|-----------|--------------|---------|
| Live co-editing | ✅ "Google Docs-like collaboration" | ⚠️ Socket.io presence + cursor tracking exists, but NO CRDT/OT — broadcast only | **WEAVE AHEAD** |
| Presence indicators | ✅ Implied | ✅ CollaborationPresence component, user cursors | **PARITY** |
| Conflict resolution | ✅ Implied (they market live co-editing) | ❌ No Y.js, no CRDT, no OT. Last-write-wins at best | **WEAVE AHEAD** |

**Honest take:** C2C can show who's viewing a document and broadcast changes. But two people editing the same paragraph simultaneously will produce conflicts. Weave claims full Google-Docs-style co-editing. This is a real gap.

**Rating: WEAVE AHEAD — #2 gap. Cannot claim "collaboration" without CRDT.**

---

### 5. Templates & eCTD Structure

| Dimension | Weave.bio | Concept2Cure | Verdict |
|-----------|-----------|--------------|---------|
| eCTD templates | ✅ Modules 1, 2, 3, 5 | ✅ Modules 1-5, 117+ templates, ICH M4 hierarchy | **C2C AHEAD** |
| Module 4 coverage | ❌ Not mentioned | ✅ Present in hierarchy | **C2C AHEAD** |
| Template customization | ❓ Unclear | ⚠️ Templates are hardcoded, no user-editable template builder | **UNCLEAR** |
| Submission-type mapping | ❓ IND-focused | ✅ IND, NDA, BLA, 510(k), PMA, ANDA | **C2C AHEAD** |

**Honest take:** C2C has broader template coverage (all modules, multiple submission types, multiple device pathways). Weave is IND-focused. Clear C2C advantage.

**Rating: C2C AHEAD**

---

### 6. Version Control

| Dimension | Weave.bio | Concept2Cure | Verdict |
|-----------|-----------|--------------|---------|
| Version history | ✅ With restore | ✅ Full history, SHA-256 hashing, rollback | **PARITY** |
| Visual diff | ❓ Not specifically mentioned | ✅ Word-level and line-level diff (diffWords/diffLines library) | **C2C AHEAD** |
| Regulatory impact review | ❌ Not mentioned | ✅ AI-powered version impact assessment via AnA RI | **C2C AHEAD** |
| Integrity verification | ❌ Not mentioned | ✅ SHA-256 hash chain, tamper detection | **C2C AHEAD** |

**Rating: C2C AHEAD**

---

### 7. Review & Approval Workflow

| Dimension | Weave.bio | Concept2Cure | Verdict |
|-----------|-----------|--------------|---------|
| Reviewer assignment | ✅ Within Dossier Manager | ⚠️ UI exists (ReviewerAssignment.tsx is polished) but backend persistence for reviewer state NOT wired | **WEAVE AHEAD** |
| Section status tracking | ✅ Visible lifecycle stages | ✅ Draft → Review → Verify → Publish lifecycle with stage pill | **PARITY** |
| Approval gates | ❓ Not explicitly mentioned | ✅ Quality gate checks before status advancement (word count, placeholders, structure) | **C2C AHEAD** |
| Review comments | ✅ Inline comments persist | ✅ Comments panel with API persistence | **PARITY** |

**Honest take:** The reviewer assignment UI is beautiful but the backend doesn't persist reviewer assignments to a database table. The status lifecycle works. Comments persist. But you can't say "assign Dr. Smith as reviewer" and have it stick across sessions without backend work.

**Rating: WEAVE SLIGHTLY AHEAD — #3 gap. UI is there, backend wiring needed.**

---

### 8. E-Signatures & 21 CFR Part 11

| Dimension | Weave.bio | Concept2Cure | Verdict |
|-----------|-----------|--------------|---------|
| Electronic signatures | ❌ NOT mentioned anywhere in public materials | ✅ Full workflow: 6 signature types, 4 meanings, password verification, SHA-256, MFA support | **C2C FAR AHEAD** |
| 21 CFR Part 11 compliance | ❌ Not claimed | ✅ §11.50, §11.70, §11.100 compliance, dual authentication, audit trail | **C2C FAR AHEAD** |
| Signature certificate | ❌ | ✅ Visual certificate with tamper detection | **C2C FAR AHEAD** |

**Honest take:** This is C2C's clearest competitive advantage. Weave has no public Part 11 story. C2C has a complete, working e-signature system with hash chains and audit trails. For regulated pharma, this matters enormously.

**Rating: C2C FAR AHEAD — this is C2C's #1 differentiator**

---

### 9. Export

| Dimension | Weave.bio | Concept2Cure | Verdict |
|-----------|-----------|--------------|---------|
| DOCX export | ✅ Mentioned | ✅ Working endpoint with generator | **PARITY** |
| PDF export | ❓ Not specifically mentioned | ✅ PDFKit-based with compression | **C2C AHEAD** |
| eCTD XML backbone | ❓ "eCTD-formatted output" | ⚠️ Client-side XML generation (basic) | **UNCLEAR** |
| Veeva integration | ✅ Import/export | ❌ Not implemented | **WEAVE AHEAD** |
| Export governance | ❌ Not mentioned | ✅ All exports logged, rate-limited, audit trail | **C2C AHEAD** |

**Rating: PARITY (different strengths)**

---

### 10. Post-Submission (HAQ Manager)

| Dimension | Weave.bio | Concept2Cure | Verdict |
|-----------|-----------|--------------|---------|
| HAQ response management | ✅ Launched Nov 2025, auto-extracts questions | ⚠️ HAQ workspace exists in nav (`'haq'` in ProjectNav), but not a full HAQ manager | **WEAVE AHEAD** |
| Multi-team response coordination | ✅ Cross-functional tracking | ❌ Not implemented | **WEAVE AHEAD** |

**Rating: WEAVE AHEAD — but this is new for Weave too (Nov 2025 launch)**

---

## Areas Where C2C Has No Weave Equivalent (Superiority)

These are capabilities Weave doesn't offer at all:

| Capability | C2C Status | Weave |
|------------|-----------|-------|
| Regulatory Intelligence Model (RIM) | ✅ REAL — 6 judgment models, 16 seed patterns, signal capture | ❌ Nothing |
| Foresight Predictive Analytics | ✅ REAL — 75KB engine | ❌ Nothing |
| Biostatistics Module | ✅ 7-module analysis engine | ❌ Nothing |
| Device/Combo Workflows | ✅ 510(k), PMA, CER, EU MDR | ❌ Pharma only |
| Multi-Agency Filing | ✅ FDA, EMA, PMDA, HC, TGA | ⚠️ FDA primary, EMA stated |
| Precedent Engine | ✅ CRL/RTF pattern detection | ❌ Nothing |
| Protocol Designer | ✅ 12 trial type templates | ❌ Nothing |
| CSR Builder | ✅ ICH E3 knowledge extraction | ❌ Not mentioned |

---

## Honest Parity Scorecard

| # | Capability | Status | Gap Severity |
|---|-----------|--------|-------------|
| 1 | AI Drafting | ✅ PARITY | — |
| 2 | Source Traceability | 🔴 BELOW | **HIGH** — #1 gap |
| 3 | Editor & Formatting | ✅ PARITY | — |
| 4 | Real-Time Collaboration | 🔴 BELOW | **HIGH** — #2 gap |
| 5 | Templates & eCTD | 🟢 ABOVE | — |
| 6 | Version Control | 🟢 ABOVE | — |
| 7 | Review Workflow | 🟡 BELOW | **MEDIUM** — #3 gap |
| 8 | E-Signatures / Part 11 | 🟢 FAR ABOVE | C2C's #1 differentiator |
| 9 | Export | ✅ PARITY | — |
| 10 | HAQ / Post-Submission | 🟡 BELOW | **LOW** — Weave just launched this |

### Score: 6/10 at or above parity. 4/10 below.

---

## The 3 Gaps That Must Close

### Gap #1: Source Traceability (HIGH)
**What's needed:** Automatic per-sentence source linking during AI drafting. When Claude generates a paragraph, each claim should auto-link to the source document/page that supports it. The TraceabilityMark and CitationPlugin exist but aren't stitched into the AI drafting pipeline.
**Effort estimate:** Medium-high. Requires AI gateway changes to return source attributions with every generation.

### Gap #2: Real-Time Collaboration (HIGH)
**What's needed:** Replace Socket.io broadcast-only with Y.js or Hocuspocus CRDT provider. TipTap has official Y.js integration (`@tiptap/extension-collaboration`). This is a known integration path.
**Effort estimate:** Medium. TipTap + Y.js is well-documented. Infrastructure change, not a rewrite.

### Gap #3: Reviewer Workflow Persistence (MEDIUM)
**What's needed:** Backend API endpoints for: assigning reviewers to artifacts, persisting reviewer status, fetching team members, sending review notifications. The UI (ReviewerAssignment.tsx) is complete — it just needs backend wiring.
**Effort estimate:** Low-medium. Standard CRUD endpoints + a database table.

---

## The Honest Bottom Line

**ClinicalSageAI is not a Weave clone that's behind.** It's a different product with a broader scope (devices, multi-agency, intelligence, biostat) that happens to overlap with Weave on document authoring.

**Where Weave wins:** They do one thing — regulatory document authoring — and they do it with polish. Source traceability and live co-editing are real, validated, and marketed. They have Takeda as a proof point.

**Where C2C wins:** Breadth. Part 11 signatures. Regulatory intelligence. Device pathways. Multi-agency. Compliance scanning. These are real, working features that Weave simply doesn't have.

**The risk:** If a prospect only cares about "can my team co-author an IND with AI and trace every sentence to source data?" — Weave wins that demo today. C2C needs Gap #1 and #2 closed to compete on that specific pitch.

**The opportunity:** If a prospect needs signatures, multi-agency, devices, intelligence, or compliance scanning — Weave can't help them. C2C owns that market.

---

*Report generated from code-level audit + public competitive research. No aspirational claims included.*
