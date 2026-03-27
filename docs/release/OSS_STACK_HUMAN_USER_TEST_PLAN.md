# OSS Stack Human User Test Plan

## Goal
Validate that OSS-stack changes improve real regulatory workflows for human users without weakening governance.

## Cohorts
- Regulatory writer/reviewer
- QA/compliance reviewer
- Program manager / submission lead

## Test phases

### Beta UAT (minimum 10 sessions)
- Focus: usability + governance safety + citation trust.
- Required scenarios:
  1. Ingest document, inspect extracted structure.
  2. Run evidence retrieval and verify citations.
  3. Attempt export with/without review approval.
  4. Observe long-running task state transitions.

### GA UAT (minimum 25 sessions)
- Focus: operational confidence and production realism.
- Required scenarios include beta set + pilot behavior checks for flagged paths.

## Exit criteria
- No critical governance bypass defects.
- >= 90% successful completion on core tasks.
- Mean user trust score >= 4/5 for citation reliability and review gating.
- All critical findings resolved and checkpointed by supervisor.
