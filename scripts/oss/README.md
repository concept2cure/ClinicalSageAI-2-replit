# OSS Supervisor Audit Script

This folder contains control-tower tooling used by a lead/supervisor agent to audit swarm workstream outputs before merge.

## Script
- `supervisor-audit.mjs`
- `create-checkpoint.mjs`
- `lib/uat-aggregate.mjs` (shared session aggregation helpers for UAT/scorecard scripts)

## What it checks
1. Required control docs exist.
2. No-break regulated surfaces still exist.
3. OSS feature-flag registry exists and includes required keys.
4. Required validation scripts (`typecheck`, `test`, `test:ana`) exist in `package.json`.

## Usage
```bash
npm run oss:supervisor:audit
```

## Intent
This is a lightweight guardrail to prevent “parallel chaos” and ensure each workstream remains contract-first and governance-safe.


### Create a supervisor checkpoint template
```bash
npm run oss:checkpoint -- <workstream-id> "<summary>"
```


## Internal shared module
- `lib/uat-aggregate.mjs` centralizes UAT aggregation logic for scorecard/metrics scripts.
