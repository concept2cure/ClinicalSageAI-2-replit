# Last 20 PR Wiring Audit (2026-03-28)

## Scope
- Audits the latest **20 merged pull requests** reachable from `HEAD` using merge commits matching `Merge pull request #...`.
- Evaluates structural merge/wiring signals: PR-side commit lineage, changed-file presence at current `HEAD`, test-file involvement, and downstream touches.

## Method
1. Enumerate PR merges: `git log --merges --oneline --grep='Merge pull request #' -n 20`.
2. For each merge commit, collect:
   - PR branch commit count (`git rev-list --count <merge>^1..<merge>^2`),
   - changed files (`git diff --name-only <merge>^1 <merge>`),
   - missing-file count at `HEAD`,
   - test-file count in diff,
   - downstream touch count for up to 20 changed files (`git rev-list --count <merge>..HEAD -- <files>`).
3. Assign a structural wiring assessment from these signals.

## Summary Verdict
- 20/20 audited PRs have **zero missing changed files at HEAD**.
- This report is a **structural wiring audit**; runtime behavior still requires CI/integration execution in a provisioned environment.

## PR-by-PR Results

| PR | Merge SHA | PR-side commits | Files | Tests in PR | Missing files | Downstream touches | Wiring assessment |
|---|---|---:|---:|---:|---:|---:|---|
| #285 | `5ef98e0b` | 2 | 5 | 0 | 0 | 5 | ✅ Structurally wired and actively touched downstream. |
| #292 | `94f7857e` | 2 | 3 | 1 | 0 | 0 | ✅ Structurally wired with test coverage in PR diff. |
| #291 | `139af47a` | 2 | 6 | 1 | 0 | 4 | ✅ Structurally wired with test coverage in PR diff. |
| #290 | `63f33cd2` | 1 | 37 | 6 | 0 | 4 | ✅ Structurally wired with test coverage in PR diff. |
| #289 | `f29a11b6` | 2 | 37 | 4 | 0 | 6 | ✅ Structurally wired with test coverage in PR diff. |
| #288 | `d7496049` | 1 | 64 | 11 | 0 | 0 | ✅ Structurally wired with test coverage in PR diff. |
| #287 | `8ac98904` | 1 | 39 | 6 | 0 | 0 | ✅ Structurally wired with test coverage in PR diff. |
| #286 | `929e48b5` | 2 | 15 | 3 | 0 | 10 | ✅ Structurally wired with test coverage in PR diff. |
| #284 | `fe4bf21a` | 2 | 6 | 0 | 0 | 5 | ✅ Structurally wired and actively touched downstream. |
| #283 | `7892db76` | 2 | 2 | 0 | 0 | 38 | ✅ Structurally wired and actively touched downstream. |
| #282 | `26eaa16f` | 1 | 2 | 0 | 0 | 1 | ✅ Structurally wired and actively touched downstream. |
| #281 | `8bf1130c` | 1 | 5 | 5 | 0 | 0 | ✅ Structurally wired with test coverage in PR diff. |
| #279 | `6b4e4664` | 1 | 27 | 2 | 0 | 22 | ✅ Structurally wired with test coverage in PR diff. |
| #278 | `72da674b` | 1 | 3 | 0 | 0 | 1 | ✅ Structurally wired and actively touched downstream. |
| #275 | `9194cc68` | 2 | 6 | 1 | 0 | 58 | ✅ Structurally wired with test coverage in PR diff. |
| #276 | `6b588c9f` | 1 | 13 | 1 | 0 | 28 | ✅ Structurally wired with test coverage in PR diff. |
| #274 | `3371f0a7` | 1 | 10 | 0 | 0 | 52 | ✅ Structurally wired and actively touched downstream. |
| #273 | `a5974cb8` | 1 | 4 | 0 | 0 | 62 | ✅ Structurally wired and actively touched downstream. |
| #271 | `dd4013a6` | 2 | 5 | 1 | 0 | 50 | ✅ Structurally wired with test coverage in PR diff. |
| #270 | `53bd1ac1` | 2 | 3 | 0 | 0 | 52 | ✅ Structurally wired and actively touched downstream. |

## Usage
- Regenerate this report with:
  - `node scripts/audits/generate-last-pr-wiring-audit.mjs --limit 20 --date 2026-03-28 --output docs/audits/LAST_20_PRS_WIRING_AUDIT_2026-03-28.md`
