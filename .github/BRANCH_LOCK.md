# 🔒 BRANCH LOCK - READ THIS FIRST

## ACTIVE DEVELOPMENT BRANCH

```
concept2cure-v2
```

**This is the ONLY branch anywhere.** All development, commits, automation,
agent work, and product history belong directly on this branch.

## Why Single Branch Development?

- Prevents work fragmentation across 30+ branches
- Stops agents from creating duplicate implementations
- Ensures all work is in ONE place
- Makes it impossible to lose work
- Eliminates merge conflicts from parallel branches
- Creates single source of truth

## For Humans:

- Always check out `concept2cure-v2` before starting work
- Never create feature, agent, release, mirror, or worktree branches
- Any review or release artifact must describe commits already on `concept2cure-v2`

## For AI Agents (Copilot, Codespace, etc.):

- You MUST work on `concept2cure-v2`
- DO NOT create other branches (`copilot/*`, `codex/*`, `feature/*`)
- DO NOT suggest branching strategies
- If asked to branch, confirm with user first
- Read `.github/COPILOT_INSTRUCTIONS.md` for complete rules

## Branch History (Why This Policy Exists):

- **Problem**: Agents created 30+ branches (`codex/*`, `copilot/*`) causing chaos
- **Result**: Work was scattered, duplicated, lost, and constantly rebuilt
- **Solution**: Single branch (`concept2cure-v2`) with strict enforcement

## Enforcement:

- CI/CD runs only on `concept2cure-v2`
- Any other branch is non-canonical and must not carry product work
- Agent-created branches will be deleted when detected

## Exception Process:

There is no separate-branch exception. Keep all work directly on
`concept2cure-v2`.

---

**Last Updated**: January 26, 2026
**Policy Owner**: @concept2cure
**Status**: ENFORCED - Do not bypass without approval
