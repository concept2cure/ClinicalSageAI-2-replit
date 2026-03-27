# OSS Stack GA Human Testing Runbook

## Purpose
Operational runbook for executing supervised user testing and recording GA readiness evidence.

## Inputs
- `docs/evals/OSS_STACK_GOLDEN_TASKS.md`
- `docs/evals/OSS_STACK_SCORING_RUBRIC.md`
- `docs/evals/oss_stack_scorecard.template.json`
- `docs/evals/oss_stack_scorecard.beta.sample.json`
- `docs/evals/oss_stack_human_sessions.template.json`
- `docs/evals/oss_stack_regulatory_uat_catalog.json`
- `docs/evals/oss_stack_medical_writing_checklist.json`

## Execution steps
1. Run scripted eval checks:
   - `npm run oss:reg:check -- docs/evals/oss_stack_regulatory_uat_catalog.json`
   - `npm run oss:medwrite:check -- docs/evals/oss_stack_medical_writing_checklist.json docs/evals/oss_stack_regulatory_uat_catalog.json`
   - `npm run oss:medwrite:check -- docs/evals/oss_stack_medical_writing_checklist.json docs/evals/oss_stack_regulatory_uat_catalog.json docs/evals/medical_writing_drafts/fda_510k_pass_sample.md fda_510k`
   - `npm run oss:eval:check`
   - `npm run oss:ga:check -- docs/evals/oss_stack_scorecard.template.json`
  - `npm run oss:ga:check -- docs/evals/oss_stack_scorecard.beta.sample.json`
2. Execute supervised user sessions and update scorecard fields.
   - `npm run oss:uat:metrics -- docs/evals/oss_stack_human_sessions.template.json`
3. Sync UAT aggregates into scorecard:
   - `npm run oss:scorecard:sync -- docs/evals/oss_stack_scorecard.template.json docs/evals/oss_stack_human_sessions.template.json docs/evals/oss_stack_scorecard.template.json`
4. Re-run GA check with updated scorecard.
5. Attach outputs to checkpoint + PR for supervisor decision.

## Required GA evidence packet
- Weighted score and per-category scores
- Hard-fail condition status
- Human session counts and outcomes
- Critical defect status
- Core task success rate
- Citation trust mean
