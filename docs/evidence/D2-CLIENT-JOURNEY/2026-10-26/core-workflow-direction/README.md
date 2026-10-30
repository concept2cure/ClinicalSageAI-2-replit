# D2 — core workflow direction, 2026-10-26

The founder reaffirmed that specialist apps should move into core workflow screens,
aligned to each project's needs. Standardized central services retain their identities;
Projects, Submission Center, Tasking, Vault, CMC, RBM, and Study and Protocol Design
were named as examples. This records the direction; it does not claim a screen migration
has already been completed.

## What already exists

- `.design/client-journey/INFORMATION_ARCHITECTURE.md` already owns P-47, the placement
  map and sequencing. It now records the dated direction, existing service owners,
  project-tailoring criteria and parity/safeguard requirements.
- `.design/client-journey/HANDOFF_2026-10-26.md` carries the same direction and points
  back to that canonical map. `AGENTS.md` makes it visible to subsequent sessions.
- `v2/catalogWorkflows.ts` groups feature administration under existing owners;
  `shared/navigation/callable-apps.ts` keeps the shared mention/legacy-handle vocabulary.
  Neither proves that every specialist feature is already integrated into a project screen.
- The existing project steps, work-package compiler, canonical editor, services and
  routing contracts supply the integration paths. Their source/permission, entitlement,
  provenance, approval/signature and dispatch checks must travel with the functions.

The continuation recommended shared homes for Authoring with Review/Approval,
Reporting & analytics, and organisation administration/access/audit. These are recorded
as recommendations using existing owners, not approvals to create new apps.

The map preserves A2.5 as the next UI slice; A6 later places clinical-study work on
Evidence. Every standalone removal still needs a reachable replacement and demonstrated
function parity. No parallel architecture plan or new service was created.

Validation: independent read-only review checked the direction, owner paths and current
consumer/history evidence; `git diff --check` passed. This documentation-only increment
does not require behavioral tests. Runtime workflow migrations remain in the canonical plan.
