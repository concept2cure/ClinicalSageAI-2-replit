# PF-10 S7 (D2; vault MISSED-2): AnA's document catalog tools stay in the open project

Two rules apply: a conversation belongs to one project (founder decision, 2026-09-26), and a cross-project reference is refused by default (PF-11).

## The defect

`server/services/ana/document-catalog-tools.ts` (behind `ana.document_catalog`) took whatever program the model named:

- **`list_project_documents`** listed another program's documents on request. For a v2 project it listed the whole organization: the open project is a `regulatory_programs` UUID, so `ctx.projectId` is null, and the tool fell back to org-wide.
- **`file_chat_upload_to_vault`** filed a chat upload into whichever program the model named; the ingest checks only the organization. With a v2 project open and no `program_id`, it refused for want of a program.

A third copy of the project → program lookup, `document-catalog.service.ts` `resolveProgramForProject`, did the legacy half.

## The change

- **`resolveOpenProgram` moved to `server/services/c2c/program-access.ts`**, next to `programInOrganization`, the check it ends at. It is re-exported from `authoring-draft-tool.ts`, so there is one resolver.
- **`server/services/ana/catalog-scope.ts` `catalogScope`** is the scope rule:
  - **A project is open and has a program:** that program is the scope. Naming another is refused `CROSS_PROJECT`, and nothing is listed or ingested.
  - **No program is open:**
    - a read covers the organization (F5's default, as today), or the named program if it is the organization's (`PROGRAM_NOT_FOUND` otherwise);
    - a read naming a program while an unanchored project is open is refused `CROSS_PROJECT`;
    - a filing is refused `NO_PROJECT`, and the message points to the Data Room's audited adopt (PF-07, "Add to this project"). It says whether no project is open, or the open one has no program.
- **`resolveProgramForProject` and its mock are deleted.**

## Evidence

| File | Shows |
|---|---|
| `01-red.txt` | `document-catalog-tools-project-scope.test.ts` against HEAD, 7 failures. A v2 project lists the organization. Another program is listed and filed into. With no project open, a filing goes ahead. Filing into the open v2 project fails for want of a program. |
| `02-green.txt` | The new suite, the id-space suite (updated: filing needs an open project; with none, `NO_PROJECT`), the catalog-gated and placement/passage suites, the authoring and c2c services and the walk: 352 tests. The real-PostgreSQL catalog and vault dbtests: 52/52. `tsc` and the lint ratchet pass. |
