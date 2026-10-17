# Company documents verification

Validated on 2026-10-17 with Node 22.23.3 on `concept2cure-v2`. See the [control contract](../../design/COMPANY_DOCUMENTS.md) and [report presentation contract](../../design/COMPANY_REPORT_BRANDING.md).

The synchronized release candidate is recorded in [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md). The checks below retain the initial feature verification.

## Initial feature checks

- **496 tests across 39 files pass**, exit 0. Exact files: [final-test-files.json](final-test-files.json); output: [final-tests-green.txt](final-tests-green.txt). The run includes profile/settings controls, legal copy and placement, real PGlite tenant/project/source checks, packaging/readiness, actual PDF/DOCX output and Admin/Submission UI regressions.
- Full-program TypeScript gate: `npm run ci:typecheck:no-regression -- --incremental`, unchanged zero baseline. The cache retains diagnostics for the whole program. Final result: [typecheck-green.txt](typecheck-green.txt).
- `NODE_OPTIONS=--max-old-space-size=8192 npm run build` passes. The vendor bundle size warning is nonfatal: [build-green.txt](build-green.txt).
- ESLint on all 65 changed code files exits 0, with 121 warnings, primarily complexity and function length: [eslint.txt](eslint.txt). `git diff --check` passes.

To repeat the focused run after activating the cloud Node runtime:

```bash
source /workspace/.cloud-setup/activate.sh
python3 - <<'PY'
import json, os, subprocess
with open('docs/evidence/COMPANY-DOCUMENTS/final-test-files.json') as f:
    paths = json.load(f)
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=4096')
raise SystemExit(subprocess.call(['node_modules/.bin/vitest', 'run', '--config', 'vitest.config.ts', *paths], env=env))
PY
```

## Live workflow

The final development server uses the local PostgreSQL database through the non-superuser `app_service` role with RLS enforced. Live checks verify health, frontend HTML, database/schema/storage readiness, password login, the authenticated account and workspace projects. AI is unconfigured; its expected readiness refusal is retained rather than bypassed. AI behavior is outside this feature's verification.

An authenticated save/read/export check changed the local company profile, verified the incremented revision and stale-write refusal, inspected actual A4 landscape Word XML and original body text, then restored the original profile through the audited endpoint. This retained its revision history without leaving sample branding configured.

Final read-only API checks download both company and submission correspondence Word files. Company identity appears in the manual company template; the saved disabled submission preference produces a neutral template. Both contain the supplied body and one content section. No company settings change during this check. Browser verification loads Admin → Settings, updates the unsaved designer preview and opens the legal library, with no page errors or failed API reads. Transient account-switch state is additionally covered by the UI regression suite. [Live smoke](live-smoke.txt), [downloads](live-downloads.txt) and [browser result](browser-result.json) retain sanitized outcomes only.

## Regression proof

- [Report branding red](report-branding-red.txt) / [green](report-branding-green.txt): actual PDF company identity, page overflow, layout and original governed content.
- [Word layout red](letterhead-docx-red.txt) / [green](letterhead-docx-green.txt): actual OOXML physical geometry and letterhead fidelity.
- [Canonical placement red](canonical-placement-red.txt) / [green](canonical-placement-green.txt): removing the canonical legal guard lets an expired registered PDF persist through ordinary `upsertLeaf`; the test fails. Restored guard refuses without leaf or audit writes. [Compatibility](canonical-compatibility-green.txt) preserves ordinary drafts and existing filing rules.
- [Submission scope red](company-legal-scope-red.txt): removing target context from the existing transmission check makes all three agency/country/submission-type mismatch tests fail. The final combined green run includes the restored production checks and proves that already placed approved bytes cannot bypass current legal applicability.

Original legal files remain immutable Vault versions. Scope metadata does not establish an agency's legal requirements or acceptance. Report branding does not automatically attach legal documents, and copied originals require independent target-project approval.
