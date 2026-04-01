# Human Beta Program v1

Generated: 2026-04-01

## Tester personas
1. **Founder/Operator** — validates truthfulness of end-to-end narrative.
2. **Regulatory author** — validates governed artifact draft/review workflow.
3. **Reviewer/QA** — validates provenance/review/audit access and continuity.

## Goals by persona
- Founder: can complete canonical click path without dead ends.
- Regulatory author: can create/open/edit governed artifact in project context.
- Reviewer/QA: can inspect review/provenance/audit surfaces and return safely.

## In scope
- Canonical route flow: `/` → `/concept2cure/login` → `/concept2cure` → `/concept2cure/project/:projectId`.
- Governed workspace interactions with seeded RC projects.
- AnA + references/vault access only where project context is preserved.

## Out of scope
- Legacy route-museum deep links.
- Non-canonical `/client-portal/*` pathways.
- New feature exploration not on beta allowlist.

## Program duration
- Initial cohort: 5 business days.
- Daily check-ins + end-of-week founder go/no-go review.

## Issue intake format
Use structured intake per issue:
- `id`: `BETA-YYYYMMDD-###`
- `persona`
- `seed_project`
- `route`
- `steps_to_reproduce`
- `expected`
- `actual`
- `severity`
- `evidence_links`

## Cadence
- Daily 15-minute triage.
- Mid-week risk sweep by release owner.
- Weekly founder decision on widen/pause.
