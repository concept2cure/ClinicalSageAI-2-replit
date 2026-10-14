# Agent Rules

## 1. Testing & Dependency Resolution
- Ensure all dependencies are defined in `requirements.txt` or equivalent.
- Run automated tests after each code change to verify functionality.
- Use version constraints in dependency declarations to avoid breaking changes.

## 2. Work Preservation & Anti-Destruction Rules
- Code changes should be committed in small, atomic chunks.
- Use only `concept2cure-v2`, as required by root `AGENTS.md` and `CLAUDE.md`. Do not create another branch, alternate worktree, or PR.
- Coordinate non-overlapping file ownership, synchronize with `origin/concept2cure-v2`, and commit and push verified increments directly with the normal hooks.
- Keep implementation, tests, contracts and non-secret evidence in the canonical repository.

## 3. Concept2Cure GitHub Codespaces & Compliance Rules
- All code should comply with the organization’s coding standards and best practices.
- Use GitHub Codespaces for development to ensure a consistent development environment.
- For local editor human testing, follow [the Codespaces handoff](../docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md); no deployment environment is required.
- Adhere to license agreements when using third-party libraries or resources.
