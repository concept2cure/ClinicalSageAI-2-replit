Admin actions to enforce branch protection and required checks

Goal: Prevent merging to `main` until validation, security scans, and QA signoff pass.

Steps (GitHub web UI):
1. Go to Settings → Branches → Branch protection rules → Add rule
2. Branch name pattern: `main`
3. Check: Require status checks to pass before merging
   - Add these required checks (exact check names from workflows):
     - `validation` (from `.github/workflows/validation.yml`)
     - `security-scan` or `security-scan/pip-audit` (depends on how GitHub shows composite jobs)
     - `QA Signoff Check` (job name `check-qa-signoff` from `.github/workflows/qa-signoff.yml`)
4. Optionally check: Require branches to be up to date before merging
5. Click Save changes

Steps (CLI using `gh`):
# Note: Requires admin privileges
# Example: require the check 'validation' and 'check-qa-signoff'
gh api -X POST /repos/:owner/:repo/branches/main/protection -F required_status_checks='{"strict":true,"contexts":["validation","check-qa-signoff","security-scan"]}' -F required_pull_request_reviews='{"require_code_owner_reviews":true}'

Notes:
- The exact job names shown by GitHub in the branch protection UI may differ; when in doubt, open a PR and view the Checks tab to see the job names and use those exact names in branch protection.
- An admin must set these options; I cannot enable branch protection via workflow without admin token.
