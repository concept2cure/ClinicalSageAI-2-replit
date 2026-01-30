# Logging Migration Checklist

Purpose: provide a clear, staged plan for reviewers and contributors to migrate from ad-hoc `console.*` usage to the pino-based `logger`.

Checklist

1. Run codemod dry-run (review results):
   - `node scripts/migrate-logging-to-pino.mjs --dir . > scripts/codemod-dry-run-report.txt`
   - Open PR with the report for team review (done: PR #54).

2. Apply codemod incrementally, directory-by-directory:
   - Start with non-critical directories (example: `scripts/`, `worker/`, `tests/`).
   - Open a small PR per directory that applies the codemod and updates imports where needed.
   - Add tests that assert behavior for changed files where practical.

3. Add imports & adapters:
   - For files that had `console.*` and now call `logger.*`, add `import logger from 'server/utils/logger'` or the appropriate adapter.
   - Prefer small, focused changes to reduce review work.

4. Update documentation and developer guidance:
   - Add a migration guide, usage examples, and how to format structured logs.
   - Add a linter rule or codeowners guidance to avoid regressions.

5. Final sweep and opt-in enforcement:
   - Run a repository-wide search for `console.` and resolve remaining acceptable cases.
   - Optionally add an ESLint rule to disallow `console.*` in committed code.

Communications plan

- Announce the migration RFC in the team channel with a link to the dry-run PR and checklist.
- Invite early reviewers and request that reviewers scan the dry-run report and review small apply-PRs.
- Schedule a short pairing session to address any thorny imports or patterns.

Notes

- The initial codemod is intentionally conservative and does not add imports.
- For complex replacements (format strings, template usage, grouped logs), prefer small manual refactors.
