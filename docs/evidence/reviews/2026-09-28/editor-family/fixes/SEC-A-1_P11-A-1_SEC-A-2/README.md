# SEC-A-1, P11-A-1 / SEC-A-8, SEC-A-2: a citation or comment could land on another document, unaudited

**Findings:** periodic review 2026-09-28, editor family. Each was confirmed by
its verifier (`../../verification.md`).

| ID | Grade | What was wrong |
|---|---|---|
| SEC-A-1 | blocker | "Re-read source" re-baselined the citation named in the body, looked up by tenant alone. Both authorization layers check the section in the path. So an editor of any one unlocked section could rewrite a citation's stored checksum on any document in the tenant, frozen or approved ones included, with no audit row. The rail's "recorded at cite time" then became false. |
| P11-A-1 / SEC-A-8 | high | No citation act (cite, cite-source, uncite, re-read, re-read all) reached the document's audit trail. The uncite DELETE and the overwrites destroyed the cite-time checksum with no before-image. A second cite of the same source silently reset its checksum. |
| SEC-A-2 | high | A comment took its `doc_id` and its parent from the request body. A member with a grant on one document could plant comments and audit rows on another, including a frozen one, and change that document's freeze outcome. |

SEC-A-9 (revert audited after COMMIT) was fixed the same day by another lane,
in `59b0d8f9`. This lane left the revert handler as trunk has it.

## The change

- **refresh-token binds the citation to the path section.**
  `refreshSourceCitation(orgId, { sectionId, citationId }, client)` looks the
  citation up by id, section and tenant. Another section's citation is "not
  found", and nothing is written.
- **Every citation write runs with its audit row in one transaction:** cite,
  cite-source, uncite, refresh-token and refresh-all.
  - `auditCitationWrite` writes the row. It takes the document from the section
    row, never from the URL or body, and records the citation before and after,
    with `previous_sha256` and `sha256`.
  - The operations are `CITATION_ADDED`, `CITATION_UPDATED`,
    `CITATION_REMOVED` and `CITATION_REFRESHED`.
  - A failed audit write rolls the change back.
  - refresh-all is one transaction, with one row per citation whose checksum
    moved. It also refuses a frozen document inside the router.
- **A second cite of the same source keeps its recorded checksum.** Only the
  citation text updates, and only when new text is sent.
- **A comment's document comes from its section.** A body `doc_id` that
  differs is a 400. A parent must be on the same section and tenant. The
  comment and its audit row commit together.

## Shown failing first

- `server/routes/__tests__/authoringWritesBoundAndAudited.pglite.integration.test.ts`
  (new, 20 tests). It runs the real router, with real JWTs and per-user
  permissions on, over the real DDL in PGlite.
  - A recording shim requires every write and its audit row to run on the
    transaction client between BEGIN and COMMIT.
  - A test-only trigger makes the audit insert fail, to prove the change rolls
    back with it.
- `source-usage.pglite.integration.test.ts`: two new tests (re-cite keeps the
  checksum; a re-read through another section is refused).

Results:
- `red-vitest.txt`: 18 of 20 route tests fail on the unfixed code, and the two
  that pass are regression guards.
  - SEC-A-1: `expected 200 to be 404`, and the frozen document's checksum was
    rewritten.
  - P11-A-1: no audit row.
  - Fail-closed: the change committed without its audit row.
  - SEC-A-2: `expected 201 to be 400`.
- `green-vitest.txt`: 20 of 20 and 33 of 33, and 25 neighbouring suites (320
  tests) pass. The lead re-ran the route, service and figure-reference suites
  in the shared tree: 67 of 67.
- `mutants.txt`: 27 of 28 caught. Removing `FOR UPDATE` cannot be shown on one
  PGlite session, because there is no second writer.
- `ci-scripts.txt`: the router scans exit 0: canvas-path,
  discarded-audit-write, lineage-save-gate, no-mock-in-prod-routes, and docx
  and pdf canonicality.
- `eslint-*.txt`: `authoring.router.ts` 28 warnings before and after, none in
  these handlers.

## Not done here

- **`DocumentWorkbench.tsx` (another lane holds it):**
  - Labels for the four new operations in `AUDIT_EVENT_LABELS`:
    - `CITATION_ADDED`: "source cited";
    - `CITATION_UPDATED`: "citation text changed";
    - `CITATION_REMOVED`: "citation removed";
    - `CITATION_REFRESHED`: "source re-read; recorded checksum updated".
  - Citations added to the Audit rail's empty-state list.
  - The second-cite toast ("Source re-resolved against its current content.")
    is now false. It should say the recorded checksum is unchanged.
- **Existing data:** comments already filed under the wrong document remain.
  `SELECT c.id FROM authoring_comments c JOIN authoring_sections s ON
  s.id = c.section_id AND s.tenant_id = c.tenant_id WHERE c.doc_id IS DISTINCT
  FROM s.doc_id` finds them.
- **Still open:**
  - Freeze never sets `authoring_citations.frozen_at`.
  - `GET /docs/:docId/citations` is readable tenant-wide. With the section
    binding it no longer opens a write.
- **Behaviour change:** refresh-all on an unknown document is a 404, where it
  used to answer `{ ok: true, refreshed: 0 }`.
