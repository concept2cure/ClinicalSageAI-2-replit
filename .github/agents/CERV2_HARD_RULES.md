# CERV2 Hard Rules (Truth > Vibes)

## 0) Repo + Branch Proof (required in every PR)
Paste verbatim:
- git remote -v
- git branch --show-current
- git status
If missing → PR is NON-COMPLIANT.

## 1) No sweeping deletions / no surprise refactors
Any PR containing unrelated mass deletions or global refactors is rejected.

## 2) No “done” without proof
Completion requires:
- GitHub PR with clean diff
- exact file paths changed
- screenshots or short clip proving behavior
- “How to verify” from clean checkout

## 3) Contract-first rule
- No inline /api/... in views
- All calls through CERV2 API client module
- Lists paginate by default (limit+cursor)

## 4) Auditability rule
Every mutation must emit an audit event AND UI must surface it:
- evidence upload
- link/unlink (bulk included)
- status change
- export generated (sha256 + evidence fingerprint)

## 5) Iteration commits required
Split work into commits:
- Iter 1 backend contracts + audit
- Iter 2 frontend contract + exports/audit truth UI
- Iter 3 throughput UX (filters/status/bulk link/inspector)

## 6) Proof checklist (must show)
- URL filters persist after reload
- Inline status edit produces visible audit event (no refresh)
- Bulk link 10×3 updates coverage + audit (no refresh)
- Inspector stays open during multi-select
