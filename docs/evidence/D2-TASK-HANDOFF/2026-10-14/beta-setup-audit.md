# Beta setup and human acceptance audit

2026-10-14; W1 / D2. Source audited at `6ffcb425284d68c159fbfc8c4af78e52b589504a`.
This is a documentation/source audit, not a deployed human acceptance result.
Scope follows the approved
[task drawer handoff contract](../../../design/TASK_DRAWER_HANDOFF_2026-10-14.md).

## Observed gap

The prior beta checklist called `RC-BIO-001` and `RC-DEV-001` seeded projects and
instructed operators to open them. Its cited
[rc-beta-seed.ts](../../../../scripts/seed/rc-beta-seed.ts) defines a static object
and writes JSON to stdout; it imports no database writer and provisions no
accounts, memberships, projects, documents or tasks. A descriptor label cannot
establish that an authorized person has persisted work to open.

The prior program also prescribed `/concept2cure/project/:projectId`. Current
[V2 routing](../../../../client/src/concept2cure/v2/routing.ts) resolves the first
segment as a registered surface; the
[alias table](../../../../client/src/concept2cure/v2/registryModel.ts) has no
`project` alias. Existing Projects/workspace selection establishes the actual
program context. This audit does not assert that any deployed database lacks
those records; it establishes that the cited script and guessed URL are not
provisioning or acceptance evidence.

The older `tests/e2e/rc-beta-path.e2e.ts` uses development login, descriptor URLs
and optional click/URL/body checks. It is not proof of the current two-person
saved-content review, exact task selection or live signing ceremony. It remains
unchanged by this documentation-only correction.

## Correction

[Checklist](../../../testing/HUMAN_BETA_CHECKLIST_V1.md) and
[program](../../../testing/HUMAN_BETA_PROGRAM_V1.md) now require actual authorized
accounts and current access, ordinary configured authentication/MFA, an existing
authorized organization and a UI-created or selected project, saved Authoring
work and native Tasks records.
Operators record actual IDs and observed outcomes. Program UUIDs and numeric
project identifiers are explicitly distinct. The documented entry uses existing
Projects/workspace controls, with no invented deep link, fixture fallback, seed
writer or credential supplied by this change.

The task scenario compares displayed exact IDs despite duplicate titles/filters,
repeats same-screen selection, preserves active editor/forms/signing work,
refuses missing or unavailable targets without substitution, and checks actor/org
replacement and late responses. Existing review, transition and signing controls
remain explicit acts; opening a task makes no approval or completion claim.
Other workflow/review queues retain their existing destinations.

## Qualification

These three Markdown files contain acceptance instructions, not completed test
verdicts. No human run, test-data provisioning, account creation, signature or
production mutation was performed for this audit. Required conditions that cannot
be exercised must be marked blocked or not executed. Actual deployed human
reports must retain environment/release, actor/org/program/document/task and
outcome identifiers. Source/PGlite and synthetic-browser evidence stays separate
from deployed PostgreSQL/RLS, MFA, storage/scanning and regulated intended use.

Verification for this docs-only correction is a source comparison, relative-link
existence check and whitespace review. Runtime task handoff checks and final
release/hosted results belong to the control tower's evidence, not this audit.
