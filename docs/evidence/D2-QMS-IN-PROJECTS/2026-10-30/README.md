# Quality from a project, and from the notices that reach people (D2, 2026-10-30)

Founder request, 2026-10-30: "Get QS on the main page left rails and also a selection from within Projects and connected to talking and messaging and other up stream or down stream dependencies". Design, with its **What already exists** section: `docs/design/QMS_IN_PROJECTS_2026-10-30.md`.

## The rail

Quality is already on the main rail. It is the "Work areas" entry after CMC / Module 3 and, since Codex's `b602ecad97`, Risk-based monitoring (`registryModel.ts`, `RAIL_CORE`), placed on 2026-10-22 (`1528c78303`) and pinned by `shellNav.test.tsx`. No work was needed. A deployment that does not show it is older than that change, or its entitlement verdicts lock `quality`.

## QP1: messaging (landed in `0d60fcd14b`)

A training task's notice opens the training reader. The notice door's task-id fix makes the reminders of every source-task open again. Evidence: `docs/evidence/MR-12/2026-10-29-training-assignment/slice4b-*`.

## QP2: a project's quality records, from the project

**What changed:**
- **Server.** `GET /qms/changes`, `GET /qms/nonconforming` and the register `GET /qms/documents` take `?program_id=`, admitted as a write's project is (`mdx-qms-context.ts` `queryProject`, through `admitProject`).
  - The register's project is the one a document's authored copy was created in.
  - Another organization's project is 404, never an empty list; a malformed id is 422. At trunk the parameter was silently ignored, and every list returned the whole organization's records.
  - The CAPA list already filtered by project.
- **Client.** Project home's Review step gains **Quality** (`ProjectHome.tsx` `ProjectQuality`): open CAPAs, open change controls, nonconforming product awaiting disposition, and the controlled documents authored in the project by status.
  - Each count is read by the project with its own failure ("Could not be read", never 0), with Try again.
  - One door, "Manage quality records in Quality" (`STEP_DOORS.quality`, section 9 of the IA document), opens Quality.
  - It is offered only when Quality is in the release.

**Tests:** red first (`qp2-red.txt`: 4/4 database cases, 3/4 client cases; the fourth is a guard). Green (`qp2-green.txt`): 4/4 and 41/41, door names included.

**Not done:**
- **QP3:** Quality opened from a project, scoped to it. Until then the door's name says it opens Quality, not this project's records.
- **QP4:** a controlled document shows the change controls that reference it.
