---
name: karpathy-coding-discipline
description: Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria.
license: MIT
---

# Skill: Karpathy Coding Discipline

> Adapted from [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills)
> (MIT License, © 2026 Forrest Chang), derived from
> [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876)
> on LLM coding pitfalls. See `docs/karpathy-guidelines-examples.md` for worked examples.
>
> Project-specific additions (the C2C override on A.3) are marked inline.

## Description

Behavioral guidelines to reduce common LLM coding mistakes. Bias toward caution,
simplicity, and surgical scope on every code change. For trivial tasks, use judgment.

## Activation

This skill activates when:

- Writing, modifying, or refactoring any code in this repository
- Planning a multi-step implementation
- Responding to ambiguous or under-specified requests
- Touching files adjacent to the immediate task

## PART A — Karpathy Coding Discipline

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### A.1 Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### A.2 Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### A.3 Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

Test: Every changed line should trace directly to the user's request.

**C2C override on A.3 (project-specific):** "Don't delete pre-existing dead code"
does NOT apply to legacy shell surfaces that are superseded during convergence
work. The Replace-or-Delete Law (see "UI Convergence and Legacy Surface Deletion"
in `CLAUDE.md`) requires migration, demotion, or deletion of competing surfaces
within the same workstream. "Leaving it for now" is not surgical — it's a
convergence violation.

### A.4 Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.
