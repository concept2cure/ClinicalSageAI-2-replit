# URS-001 — User Requirements Specification: Projects

| Field | Value |
|---|---|
| Document ID | URS-001 |
| Version | 0.3 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Verified by | OQ-001 (`tests/validation/oq/projects/run.mjs`) |

**App:** Projects

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | Drafted from `server/routes/c2c/projects.ts`, `server/routes/c2c/project-intake.ts`, `server/routes/taskManagement.routes.ts`, `server/routes/program-journey.routes.ts`, `server/services/entitlements/navigation-entitlements.ts` and the `Projects`, `ProjectHome`, `TaskBoard`, `FilingsCatalog` surfaces. |
| 0.2 | 2026-09-23 | W3 | URS-PROJ-010 added. Under RLS no sign-in reached the audit trail, and no requirement asked for it, so no OQ step could see it (VSR-001 §13, F-19). |
| 0.3 | 2026-09-23 | W3 | URS-PROJ-011 added. Logout answered "Tokens invalidated." while the token went on opening the API, the session check and the collaboration socket for the rest of its lifetime. No requirement asked that signing out end anything, so no OQ step could see it (VSR-001 §13.9, F-21). |

## 1. Intended use

Projects is where a regulatory user opens a **program** (an IND, NDA, BLA, CTA, 510(k) … — `VALID_PROGRAM_TYPES`, `server/routes/c2c/project-intake.ts:21`), sees its home, its filings catalog and its journey, and raises tasks against it. Program intake is the root of every governed record downstream (documents, vault filings, submissions), so its attribution and validation rules are Part 11 relevant.

## 2. Requirements

Column key — *Part 11*: §11.10(d) access control · §11.10(e) audit trail · §11.50/70/200 e-signature · none. *Risk*: high / medium / low (VMP-001 §3.1).

| URS id | Requirement | Part 11 | Risk | Source |
|---|---|---|---|---|
| URS-PROJ-001 | Only an authenticated user of an organisation can read or create programs; an anonymous request is refused with 401/403 and no data. Interactive login is via `/concept2cure/login`; in a development install a Demo Access control may substitute the password factor and must be absent when `NODE_ENV=production`. | §11.10(d) | high | `server/bootstrap/register-inline-routes.ts:846` (authMiddleware), `server/auth/dev-auth-policy.ts`, `client/src/concept2cure/auth/ZenLogin.tsx:189` |
| URS-PROJ-002 | Program creation validates its inputs: `name` and `programType` are required, `programType` must be in the controlled vocabulary, and the product class is derived from the filing type and may not be contradicted by the client; invalid input is refused with 400 naming the field. | none | medium | `server/routes/c2c/projects.ts:465-520` |
| URS-PROJ-003 | A created program is persisted under the creating organisation with a UUID id, is listed for that organisation and readable by id, and the intake reports what else it created (scaffolded document, canonical submission). | none | high | `server/routes/c2c/projects.ts:384, 813-817, 849` |
| URS-PROJ-004 | Program creation is attributable: the activity feed shows who created it and when, the write is entered in the hash-chained audit log, and the organisation's audit ledger surface shows governed writes. | §11.10(e) | high | `server/routes/c2c/projects.ts:1165`, `server/services/audit/chain.ts:182`, `server/routes/audit-trail-ledger.routes.ts:160` |
| URS-PROJ-005 | The Projects and Project Home surfaces render the organisation's programs and the open program without runtime errors. | none | medium | `client/src/concept2cure/v2/surfaces/Projects.tsx`, `ProjectHome.tsx`, `shellProject.ts` |
| URS-PROJ-006 | A task can be created with a title, module and priority; it is persisted for the organisation, listed on the task board and its creation is written to the governed ledger. | §11.10(e) | medium | `server/routes/taskManagement.routes.ts:79, 172`, `server/routes/taskBoard.routes.ts` |
| URS-PROJ-007 | The Program Journey read model and the Filings Catalog surface answer honestly for a new organisation (empty state or explained unavailability; never fixture data, never a silent 500). | none | low | `server/routes/program-journey.routes.ts:51`, `client/src/concept2cure/v2/surfaces/FilingsCatalog.tsx` |
| URS-PROJ-008 | With launch scope enforced, the navigation payload marks every out-of-catalog surface as not entitled with source `launch-scope`, the six launch apps are entitled, and a deep link to an out-of-catalog surface renders the "not in this release" gate rather than the surface. | §11.10(d) | medium | `shared/constants/launch-scope.ts`, `server/services/entitlements/navigation-entitlements.ts:259`, `client/src/concept2cure/v2/LaunchScopeGate.tsx` |
| URS-PROJ-009 | A program id that does not belong to the caller's organisation (or does not exist) answers 404 — never 200 with another tenant's data, never 500. | §11.10(d) | high | `server/routes/c2c/projects.ts:849`, `server/routes/c2c/project-vault.ts:828-845` |
| URS-PROJ-010 | Every sign-in attempt by a user of an organisation is entered in that organisation's hash-chained audit log and shown on its audit ledger: a wrong password, the second-factor challenge a correct password receives, a wrong code, and the session a verified code opens. A refused attempt reads as refused, never as a sign-in. | §11.10(e) | high | `server/routes/auth.ts`, `server/services/audit/auth-event-audit.ts`, `server/routes/audit-trail-ledger.routes.ts` |
| URS-PROJ-011 | Signing out ends the session. Once a user signs out, the token that session used opens nothing for the rest of its lifetime: the API refuses it with 401 and the session check reports the user signed out. The sign-out is entered in the organisation's hash-chained audit log and shown on its audit ledger. | §11.10(d) §11.10(e) | high | `server/routes/auth.ts` (`/logout`), `server/services/token-revocation.ts` (`verifyLiveToken`), `server/middleware/auth.ts`, `server/auth.ts` |

## 3. Assumptions and constraints

- Full tenant isolation (RLS on a non-superuser role) is qualified under row D3 against staging; URS-PROJ-009 checks only the application-layer scoping.
- The Program Journey store is provisioned by the migration set; on an installation where the runtime role lacks the grant (IQ-DEV-001) URS-PROJ-007 cannot be verified.
- URS-PROJ-011 is verified through the HTTP API (OQ-PROJ-17). Two further refusals of a signed-out token are proven by automated tests, not by this protocol: the realtime collaboration channels (`server/services/collab/__tests__/collab-governance.pglite.integration.test.ts`), and a server instance other than the one that signed the session out, which learns of it only from the database (`tests/db/sign-in-audit-trail.dbtest.ts`).

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
