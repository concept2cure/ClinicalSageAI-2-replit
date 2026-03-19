# CLAUDE.md — Claude Code Instructions for Concept2Cure.RI-2-replit

> This file is automatically read by Claude Code at the start of every session.
> These rules are NON-NEGOTIABLE and must be followed in every session.

---

## 🚨 CRITICAL: Branch Management — Read This First

Claude Code MUST NOT create its own `claude/*` branches. All work goes through the established branch pipeline.

### ✅ Correct Branch Pipeline

```
concept2cure-v2  →  (PR)  →  main
```

- **`main`** = live production app. NEVER commit directly to this branch.
- **`concept2cure-v2`** = the single development branch. ALL work happens here.
- **`claude/*` branches** = FORBIDDEN. Do not create them. Ever.

---

## 🔒 Mandatory Steps at the Start of EVERY Session

Before writing a single line of code or making any change, always run these commands in order:

```bash
# Step 1 — Check what branch you are on
git branch --show-current

# Step 2 — If NOT on concept2cure-v2, switch to it immediately
git checkout concept2cure-v2

# Step 3 — Pull the latest changes from the remote
git pull origin concept2cure-v2

# Step 4 — Confirm you are ready
echo "✅ On concept2cure-v2 and up to date. Ready to work."
```

**If `git checkout concept2cure-v2` fails**, stop and tell the user — do NOT create a new branch.

---

## ❌ Forbidden Actions

| Action | Why It's Forbidden |
|--------|-------------------|
| `git checkout -b claude/*` | Creates orphaned branches that don't flow into the product |
| `git checkout -b feature/*` | Same problem — any new branch is forbidden |
| Committing directly to `main` | Bypasses the development pipeline |
| Opening a PR to `main` from any branch other than `concept2cure-v2` | Breaks the merge flow |
| Creating a branch without explicit user instruction | User has not approved ad-hoc branching |

---

## ✅ Allowed Git Operations

```bash
# Switch to the correct branch (always do this first)
git checkout concept2cure-v2

# Pull latest
git pull origin concept2cure-v2

# Stage changes
git add <files>

# Commit (use conventional commits format)
git commit -m "feat: description of change"
git commit -m "fix: description of fix"
git commit -m "chore: description of maintenance"

# Push to the correct branch only
git push origin concept2cure-v2
```

---

## 📋 Pull Request Rules

When the user asks you to open a PR:

- **Head branch (from):** `concept2cure-v2`
- **Base branch (to):** `main`
- **Title format:** Use conventional commit style, e.g. `feat: add CSR knowledge database schema`
- **Never** open a PR from a `claude/*` branch

---

## 📁 File Operation Rules

### NEVER ask for confirmation before:
- Modifying existing files
- Deleting files
- Moving or renaming files
- All git operations (add, commit, push, pull)

### ALWAYS ask for confirmation before:
- Creating a file that has never existed before in the repository

---

## 🔄 Development Workflow Summary

```
1. git checkout concept2cure-v2
2. git pull origin concept2cure-v2
3. Make all code changes
4. git add <changed files>
5. git commit -m "type: description"
6. git push origin concept2cure-v2
7. (If user requests PR) Open PR: concept2cure-v2 → main
```

---

## 🧱 Project Architecture Notes

- **Frontend:** TypeScript + React (Vite), lives in `client/`
- **Backend:** Node.js/Express, lives in `server/`
- **Shared schema:** Drizzle ORM, lives in `shared/schema/`
- **Database migrations:** SQL files in `migrations/`
- **Startup script:** `scripts/startup.sh` handles DB seeding
- **Stack:** PostgreSQL + pgvector, deployed on Replit

---

## ⚡ Quick Reference Card

```
ALWAYS:  git checkout concept2cure-v2 (first thing, every time)
ALWAYS:  git pull origin concept2cure-v2 (before making changes)
ALWAYS:  git push origin concept2cure-v2 (not main, not claude/*)
NEVER:   git checkout -b <anything>  (no new branches)
NEVER:   touch main branch directly
```