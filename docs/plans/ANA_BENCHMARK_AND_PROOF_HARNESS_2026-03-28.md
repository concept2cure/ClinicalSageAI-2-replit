# AnA Benchmark + Proof Harness — Mandatory

**Date:** 2026-03-28  
**Branch:** `concept2cure-v2` only  
**Audience:** Claude Code  
**Use with:** `docs/plans/NEXT_WEEK_ANA_EXPERIENCE_ABILITY_LOCK_PLUS_2026-03-28.md`

## Purpose
This file exists to stop fake completion.
AnA is not improved because code changed.
AnA is improved only if benchmarked behavior and transcript proof clearly show it.

## Core benchmark categories
Run at least 24 benchmark prompts total.
Minimum 3 prompts per category.

### Category 1 — Project status and situational awareness
AnA should answer with active project-specific state, not generic status fluff.

Examples:
- What is the current state of this project?
- What is the riskiest thing in this submission right now?
- Give me a five-line status briefing.

### Category 2 — Next-best-action quality
AnA should provide useful next steps tied to actual state.

Examples:
- What should I do next?
- What is the biggest blocker right now?
- What document or section should I tackle next?

### Category 3 — Section and dossier awareness
AnA should understand section-specific work.

Examples:
- Help me with Module 2.5.
- What is missing in this section?
- Is this section defensible yet?

### Category 4 — Document-state-aware guidance
AnA should behave differently for draft, review, approved, and locked artifacts.

Examples:
- What should I do with this draft?
- This document is in review. What are the next actions?
- This is approved — what risks remain before publish/export?

### Category 5 — Evidence-grounded Q&A
AnA should prefer project evidence and grounded context when available.

Examples:
- What in our project evidence supports this claim?
- What source documents matter most here?
- Do we have evidence for this endpoint rationale?

### Category 6 — Command/action execution
AnA should actually do useful work and explain the result.

Examples:
- Create a draft for this section.
- Check dossier readiness.
- Export this artifact.

### Category 7 — Honest failure and blocked-action behavior
AnA should fail clearly and safely.

Examples:
- Export this when export is not available.
- Tell me about a project with insufficient context.
- Run a command without enough detail.

### Category 8 — Ambiguity and stale-context handling
AnA should avoid wrong-project hallucination and detect ambiguity.

Examples:
- Help me with the section we discussed earlier.
- Draft the response for that deficiency.
- What changed since last time? (with weak context)

## Required evaluation fields per benchmark
For every benchmark prompt, record all of the following:
- benchmark id
- category
- prompt
- expected context
- before behavior summary
- after behavior summary
- response mode: Grounded / Inferred / Actioned / Blocked
- did the answer include a useful next move? yes/no
- did the answer include visible grounding/source/context references when relevant? yes/no
- did the answer include an action receipt when relevant? yes/no
- did the answer fail honestly when relevant? yes/no
- pass/fail

## Transcript proof requirements
Create a proof file with transcript-style examples for at least these 10 wins:
- 2 grounding wins
- 2 next-step wins
- 2 action receipt wins
- 2 document-aware wins
- 2 honest-failure wins

For each transcript include:
- user prompt
- short description of context
- old/before weakness
- new/after strength
- why it matters to the user

## Suggested proof files
Create files such as:
- `docs/proof/ANA_BENCHMARK_RESULTS_2026-03-28.md`
- `docs/proof/ANA_TRANSCRIPT_PROOF_2026-03-28.md`

## Required quality bar
Claude may not claim success unless the benchmark harness shows:
- at least 24 prompts tested
- clear improvement in grounding or usefulness across the majority of prompts
- action receipts where actions are taken
- next-step guidance in most substantial answers
- visible honest blocked behavior in failure cases

## Hard anti-bullshit rules
Do NOT:
- mark a prompt as improved if the answer is still generic
- mark a command prompt as improved if the command result is ambiguous
- mark a failure prompt as improved if the system bluffed confidence
- mark a benchmark as passed without concrete before/after notes

## Tone
Be rigorous.
Be user-centered.
Prove the improvement.
