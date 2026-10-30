# G14 (server half), P-54: the old IND briefing-book assembler is retired

Row: D2 (W1). Decision P-54 (`docs/LAUNCH_DEFINITION_OF_DONE.md`): "The old IND briefing-book assembler goes. Its
replacement is `IndBriefingBookStart.tsx` … The server routes and service it called are deleted once a search shows
they have no caller." The screen half is `../2026-10-29/`.

## What already exists

| Piece | Path | State before this change |
|---|---|---|
| The briefing book, canonical | `client/src/concept2cure/v2/surfaces/IndBriefingBookStart.tsx`, on the IND screen (`IndLifecycle.tsx`, deliverable `briefing-book`) | It starts or opens the project's meeting-package document from the registry template (`US_PRE_IND`, `US_TYPE_A/B/C_MEETING`). It has the editor's sources, review and signature (5894e1aaa). |
| The old form assembler | `POST /api/ind-lifecycle/briefing-book` and `/briefing-book/pdf` (`server/routes/ind-lifecycle/documents.routes.ts`); `server/services/ind-lifecycle/ind-briefing-book-service.ts`; `renderBriefingBookPdf` (`ind-document-renderer.ts`) | Its one remaining caller was the PDF button in Agency Meetings. Launch scope already refused both routes in production (`launch-scope-api-gate.test.ts`, `ind-launch-claim.test.ts`). |
| Agency Meetings' briefing book | `client/src/concept2cure/v2/surfaces/AgencyMeetings.tsx`, reading `c2c_agency_meetings.briefing_book` | In a deployed organisation nothing writes that column. Only the laptop demo seed does (`scripts/seed/ga-demo.d/100-agency-meetings.mjs`). So the PDF button appeared only on seeded rows, and in production it called a refused route. |
| The AnA assembler | `server/services/ana/briefing-book-core.ts`, behind `assemble_briefing_book` | Out of catalog (`submission-twin`). Untouched; see below. |

Search for callers, 2026-10-30: `grep -rn "ind-briefing-book\|renderBriefingBookPdf\|briefing-book/pdf\|ind-lifecycle/briefing-book"`
over `server`, `client`, `shared`, `scripts`, `tests` and `e2e`. Before the change it found Agency Meetings, the
documents-recorded test case, the openapi entries, the fixture's route string, and comments. No script, e2e test or
other client calls the routes.

## What changed

- **Agency Meetings.** An FDA Pre-IND or Type A/B/C meeting's briefing book offers "Meeting package in the editor".
  With no book yet, it offers "Start the meeting package in the editor". Both open the IND screen (`ind-checklist`),
  whose default tab shows the meeting-package start. A meeting for another agency has no meeting-package template,
  so it is not offered one. The PDF button, its indication dialog and the render call are gone.
- **Deleted:**
  - `POST /api/ind-lifecycle/briefing-book` and `/briefing-book/pdf`, with `briefingValid` and their openapi
    entries;
  - `ind-briefing-book-service.ts` and its unit test;
  - `renderBriefingBookPdf`;
  - the `index.ts` export;
  - the briefing-book case of `documents-recorded.test.ts`.
- The IND fixture's `route` for the briefing-book card names the template read.

**Deletion record (working agreement).** The user outcome, an FDA meeting briefing book that a sponsor can write and
file, is delivered by `client/src/concept2cure/v2/surfaces/IndBriefingBookStart.tsx` (the editor's meeting-package
document). It is proven reachable by:
- `client/src/concept2cure/v2/__tests__/indLifecycleDeliverables.test.tsx`, for the IND screen;
- `client/src/concept2cure/v2/__tests__/agencyMeetingsNoFixtures.test.tsx` ("opens an FDA meeting's briefing book in
  the editor"), from Agency Meetings.

The deleted path rendered a PDF that nothing reviewed or signed, and production already refused it.

## Proof

- `green.txt`: five suites, 142 tests. They cover Agency Meetings, the IND deliverables, documents-recorded, the
  launch-scope gate and the IND launch claim.
- `mutation-no-meeting-package.txt`: with `hasMeetingPackage` returning false, the new Agency Meetings case fails.
  The file was then restored.
- Gates:
  - `ci:typecheck:no-regression` reported 0 errors;
  - `ci:launch-scope-api` reported no path refused;
  - the ESLint ratchet, `ci:server-error-leaks` and `ci:sql-interpolation` passed.

## Still owed

- **The AnA assembler** (`briefing-book-core.ts`, `assemble_briefing_book`). It sits behind an out-of-catalog
  surface, so converging or deleting it is the founder's call under RULE 2. That is unchanged from the screen half.
- **The meeting's own briefing-book JSON** (`c2c_agency_meetings.briefing_book`) has no writer in a deployed
  organisation. It converges with the meeting store in P-39 step 4 (`ha_interactions`).
