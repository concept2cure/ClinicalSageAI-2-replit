---
name: CONCEPT2CURE-V2 and AnA 1.0 -repo-ops
description: Enforces branch management, git workflow, and repo governance rules for the ClinicalSageAI-2-replit repository. Trigger on any mention of git operations, branch management, committing, pushing, pull requests, repo workflow, concept2cure-v2, or any development task involving the ClinicalSageAI repo. Also trigger when the user says "start a session," "open the repo," "make changes," or references the project architecture (client/, server/, shared/schema/, migrations/).
---

# Repo Governance for ClinicalSageAI-2-replit

> These rules are NON-NEGOTIABLE and must be followed in every session.

## Branch Management — Read This First

MUST NOT create `claude/*` branches. All work goes through the established branch pipeline.

### Correct Branch Pipeline

```
concept2cure-v2 → (PR) → main
```

- **`main`** = live production app. NEVER commit directly to this branch.
- **`concept2cure-v2`** = the single development branch. ALL work happens here.
- **`claude/*` branches** = FORBIDDEN. Do not create them. Ever.

## Mandatory Steps at the Start of EVERY Session

Before writing a single line of code or making any change, always run these commands in order:

```bash
git branch --show-current
git checkout concept2cure-v2
git pull origin concept2cure-v2
echo "On concept2cure-v2 and up to date. Ready to work."
```

If `git checkout concept2cure-v2` fails, stop and tell the user — do NOT create a new branch.

## Forbidden Actions

| Action | Why It's Forbidden |
|--------|-------------------|
| `git checkout -b claude/*` | Creates orphaned branches that don't flow into the product |
| `git checkout -b feature/*` | Same problem — any new branch is forbidden |
| Committing directly to `main` | Bypasses the development pipeline |
| Opening a PR to `main` from any branch other than `concept2cure-v2` | Breaks the merge flow |
| Creating a branch without explicit user instruction | User has not approved ad-hoc branching |

## Allowed Git Operations

```bash
git checkout concept2cure-v2
git pull origin concept2cure-v2
git add <files>
git commit -m "feat: description of change"
git commit -m "fix: description of fix"
git commit -m "chore: description of maintenance"
git push origin concept2cure-v2
```

## Pull Request Rules

- **Head branch (from):** `concept2cure-v2`
- **Base branch (to):** `main`
- **Title format:** Conventional commit style, e.g. `feat: add CSR knowledge database schema`
- Never open a PR from a `claude/*` branch

## File Operation Rules

**NEVER** ask for confirmation before modifying, deleting, moving, or renaming existing files, or any git operations.

**ALWAYS** ask for confirmation before creating a file that has never existed before in the repository.

## Development Workflow Summary

```
1. git checkout concept2cure-v2
2. git pull origin concept2cure-v2
3. Make all code changes
4. git add <changed files>
5. git commit -m "type: description"
6. git push origin concept2cure-v2
7. (If user requests PR) Open PR: concept2cure-v2 → main
```

## Project Architecture

- **Frontend:** TypeScript + React (Vite) → `client/`
- **Backend:** Node.js/Express → `server/`
- **Shared schema:** Drizzle ORM → `shared/schema/`
- **Database migrations:** SQL files → `migrations/`
- **Startup script:** `scripts/startup.sh` handles DB seeding
- **Stack:** PostgreSQL + pgvector, deployed on Replit

## Quick Reference

```
ALWAYS:  git checkout concept2cure-v2 (first thing, every time)
ALWAYS:  git pull origin concept2cure-v2 (before making changes)
ALWAYS:  git push origin concept2cure-v2 (not main, not claude/*)
NEVER:   git checkout -b <anything>  (no new branches)
NEVER:   touch main branch directly
```
