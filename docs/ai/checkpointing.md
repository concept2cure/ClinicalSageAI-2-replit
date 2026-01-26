# Checkpointing with Git Worktrees

Goal: Run multiple AI experiments in parallel without stashing or polluting working state.

## Why Worktrees

- Isolated experiments per agent
- No need for stashing
- Faster context switching

## Commands

Create a worktree from main (default):

- scripts/ai/worktree-new.sh feature-xyz

Create a worktree from a branch:

- scripts/ai/worktree-new.sh feature-xyz dev

Remove a worktree:

- scripts/ai/worktree-clean.sh feature-xyz

## Structure

Worktrees live under:

- .worktrees/<name>

## Safety

- Keep worktree names unique
- Prune unused worktrees regularly
