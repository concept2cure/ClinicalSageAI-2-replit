# Exact-source GitHub validation: first five improvements

Validated source: `10222a0246bc9f6d6fca624b384ff0d273a8c8b0`.
Source tree: `d5939041d1783615c842cb8c6b58dc84e025f81a`.
Workflow: [C2C Agent — Validate & Audit, run 37578618429](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37578618429).
Typecheck job: `112653008577`, completed successfully on 2026-10-07 UTC.

- `npm ci`: success.
- `npm run ci:typecheck:no-regression`: success. This is the blocking
  repository gate, with the tracked error baseline at zero.
- Full repository ESLint: decoded job logs confirm
  `6258 problems (0 errors, 6258 warnings)`. The workflow uses `npm run lint ||
  true`, so its green step alone would not establish zero errors; the actual
  summary was inspected. Existing warnings are not newly waived or suppressed.
- Setup job: success. Regulatory validation, compliance check, prompt evaluation
  and security audit jobs on this workflow were skipped, not passed.

The same source also completed [Tier 5 Browser Smoke, run 37578618457](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37578618457)
successfully: from-scratch schema provisioning, authenticated browser smoke,
and the WO-06 governed golden journey steps were each marked success.
[CodeQL, run 37578618455](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37578618455)
also completed successfully.

This verifies the named source, not all launch rows, deployment, live agency
acceptance, or a later adoption patch. Main CI, other security workflows and
their queued/downstream jobs are not called complete by this receipt.

The source was followed by report-only repo-health commit
`1995c72c1ca43311f3ea4fcf78c257921d61f182`; its two report updates were preserved.
The next conversation-file adoption contract is tracked separately in
[ADOPTION-PLAN.md](ADOPTION-PLAN.md).
