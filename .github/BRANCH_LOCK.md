# 🔒 BRANCH LOCK - READ THIS FIRST

## ACTIVE DEVELOPMENT BRANCH
```
concept2cure-v2
```

**This is the ONLY branch where development happens.**

## Why Single Branch Development?
- Prevents work fragmentation across 30+ branches
- Stops agents from creating duplicate implementations
- Ensures all work is in ONE place
- Makes it impossible to lose work
- Eliminates merge conflicts from parallel branches
- Creates single source of truth

## For Humans:
- Always check out `concept2cure-v2` before starting work
- Never create feature branches unless absolutely necessary
- All PRs should target `concept2cure-v2` → `main` (when ready for production)
- If you need to create a branch, ask the project lead first

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
- PRs to other branches will be flagged/auto-closed
- Agent-created branches will be deleted weekly
- Only `main` and `concept2cure-v2` are permanent branches

## Exception Process:
If you believe you need a separate branch:
1. Stop and document WHY `concept2cure-v2` won't work
2. Get explicit approval from @concept2cure
3. Create branch FROM `concept2cure-v2`
4. Merge back TO `concept2cure-v2` (not main)
5. Delete branch immediately after merge

---

**Last Updated**: January 26, 2026  
**Policy Owner**: @concept2cure  
**Status**: ENFORCED - Do not bypass without approval
