# D2 / D5: regulatory documents generated and recorded nowhere, no longer served

**Row:** D2 (launch scope), with the D5 principle that a governed record
exists for every regulated document the system produces.
**Lane:** `…session_01E8btkB8mcLirW4rNvsMNxK`. **Date:** 2026-09-29.

## What was wrong

`POST /api/biotech-artifacts/*` (`server/routes/biotech-artifacts.ts`, service
`server/services/biotech-artifact-generator.ts`) generates regulated
documents from the request body and returns them. It records none of them:
there is no vault document, no version, no audit row, and no record of who
generated what, when, or from which inputs. It covers:

- pharmacovigilance: an E2B(R3) ICSR, a PSUR, a CIOMS form, an expedited
  safety report;
- clinical operations: a protocol synopsis, and monitoring-visit, deviation
  and enrollment reports;
- eCTD: a cover letter and a validation report.

`artifacts-center` (a launch surface) claimed the prefix, so all of it
answered in production. Its only caller is its own route. No screen, AnA tool
or MCP tool calls the generator service. Pharmacovigilance and clinical
operations are outside the launch catalog.

An earlier note in this lane judged these routes harmless because they touch
no database. The owner corrected that on 2026-09-29, and rightly. For a
regulated document, touching no database is the defect: an ICSR or cover
letter the system produced must be a recorded, versioned, audited document.

## What changed, and why not add the write here

`artifacts-center` no longer claims `/api/biotech-artifacts`. Production
refuses it (unclaimed paths are refused by default since stage 3).

Persisting from this route instead was considered and not done:

- the launch product already has the recorded path for regulated documents
  (Authoring → Vault, with version and audit row);
- a second document store here would be the parallel path the working
  agreement forbids;
- the apps these generators serve are not in the release.

**Condition for bringing them back:** when pharmacovigilance or clinical
operations ship, their generators write through the Vault record, the same
way Authoring does. They do not return an unrecorded document.

| Proof | Red | Green |
|---|---|---|
| Real-registry gate test, production default: the ICSR, PSUR, monitoring report, cover letter and catalog routes refused | 1 failed of 26: `/api/biotech-artifacts/pv/icsr` served (`gate-red.txt`) | 26/26 (`gate-green.txt`) |
| `ci:launch-scope-api`: no launch screen loses a call | | 266 paths, none refused (`ci-gate-green.txt`) |

## Open

Other endpoints may produce a regulated document without recording it. This
one was found while auditing broad API claims, not by a sweep for that
defect. A sweep for "returns a generated regulated document and writes no
vault or audit record" is the next check worth running across launch
routes.
