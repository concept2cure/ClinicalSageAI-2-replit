# Contributing Guidelines

Welcome to the Concept2Cure.RI-2 repository! This document outlines the best practices for working with our Git repository. Following these guidelines helps keep our codebase stable, maintainable and easy to collaborate on.

## 1. Initialize & Configure Git

Ensure your local Git is configured with your name and email, and that you are operating inside a cloned copy of the repository. Use a `.gitignore` to avoid committing dependencies, build outputs, logs and local environment files.

## 2. Branching Strategy

- **main** – Contains stable production-ready code.
- **develop** – Used to integrate work before it is released.
- **feature/*** – Branches for new features, e.g. `feature/ingest-api`.
- **bugfix/*** – Branches for hotfixes or urgent bug fixes.

Create a branch off of `develop` for your work and give it a descriptive name (e.g. `feature/add-auth-middleware`). When finished, open a pull request (PR) targeting `develop`.

## 3. Commit Messages

Write clear and descriptive commit messages. Use [Conventional Commits](https://www.conventionalcommits.org) syntax:

```

type(scope): short description

Longer description explaining what changed and why (optional)

````

Types include `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore` and `security`. Our repository enforces this format via a `commit-msg` hook.

Keep commits small and logical – each commit should focus on a single change or related set of changes.

## 4. Pull Before You Push

Before pushing your branch, always pull the latest changes from the remote branch you’re targeting to reduce merge conflicts. Resolve any conflicts locally before pushing.

## 5. Pre‑commit and Pre‑push Hooks

We use scripts in `scripts/` to install Git hooks that automatically run linters, tests and safety checks before commits and pushes. To install these hooks:

1. **Ensure you have a `.git/hooks/pre-commit` script present.** If it doesn’t exist (for example, on a fresh clone) you can create one manually or run:

   ```sh
   node scripts/setup-protection.js
````

This will generate a `pre-commit` hook that calls the repository’s protection script.

2. **Once a `pre-commit` hook exists**, run:

   ```sh
   bash scripts/setup-pre-commit-hooks.sh
   ```

   This script configures the existing `pre-commit` hook to be executable, installs a `pre-push` hook to prevent pushing broken code, and a `commit-msg` hook to validate commit messages.

Please run these scripts after cloning the repo to ensure all checks run locally.

## 6. Code Reviews via Pull Requests

Open a PR from your feature or bugfix branch targeting `develop`. Assign reviewers and include a description explaining the change and any context needed for review. Automated checks will run on the PR. Do not merge your own PR; request review and approval from at least one team member.

## 7. Tags & Releases

Use semantic versioning for releases. Tag release commits on `main` using `git tag -a vX.Y.Z -m "Release summary"` and push the tags. This allows others to easily check out a stable release.

## 8. Keep the Repository Clean

Avoid committing large or generated files (e.g. `node_modules`, build outputs, compiled assets). If you accidentally commit sensitive data or large binaries, contact the maintainers so they can be removed from history.

## 9. Backup Regularly

Push your work to the remote repository frequently. Even if you’re the sole contributor, remote backups protect against data loss.

By following these practices we ensure a smooth workflow and a clean, maintainable codebase. Thank you for contributing!
