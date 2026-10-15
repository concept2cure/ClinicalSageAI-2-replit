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

## Review (wf_0b1c1dfc-069): four findings, all fixed

The adversarial review of the change above found four ways a conversation held in one project still reached another project's documents.

1. **The by-id tools.** `read_project_document`, `catalog_project_document` and `place_project_document` loaded a document checked against the organization only. Search hands the model document ids, so a conversation in project A could read, catalog and place project B's documents. Now `catalog-scope.ts` `documentScopeRefusal` refuses a document of another project with `CROSS_PROJECT` before anything is read or written. With no project open, any document of the organization is allowed, as before (F5).
2. **Both searches were organization-wide.**
   - **`search_project_documents`:** `searchCatalog` takes `programId`, applied in its count and its results.
   - **`search_document_passages`:** the program filter is pushed into the vault SQL. `rag-filters.ts` `QueryFilters.programId` becomes `AND d.program_id = $n::uuid` on both arms of the vault reader, and the coverage figure is the open project's.
   - **Fail closed:** a corpus with no program column refuses the scope instead of searching wider, and `mergeFilters` keeps the scope through self-query.
   - **No post-filter:** the first fix, filtering the organization's top 25, silently missed an open-project passage ranked below that cutoff. The pushdown replaced it, and the post-filter is deleted.
3. **An open project with no program read the organization.** That is every project's documents, from a conversation that belongs to one. It is now refused `NO_PROJECT`.
4. **The non-stream chat path** (`routes/chat/send-message.ts`) passed only the integer `projectId`. A v2 project therefore looked like no project, and every catalog tool ran organization-wide. It now passes `projectRef` as the stream does (`turn-tool-context.ts`).

| File | Shows |
|---|---|
| `03-red-review.txt` | The project-scope suite with the review cases, run against 453593bad: 6 failures. The three by-id tools are not refused, neither search is scoped, and the unanchored project reads the organization. The passage case shown there ("keeps the open project's passages and drops another's") was written for the first, post-filter fix. It was rewritten for the pushdown to assert that the program reaches the search, and the pushdown's own red is in `04`. |
| `04-red-mutations.txt` | **Pushdown removed:** with `filters:` taken out of `searchDocumentPassages`, real PostgreSQL fails exactly the two scoped cases. The organization-wide control, which finds both projects' near-identical studies, passes either way, so the scope (not ranking) is what keeps the other project out. **Filter-builder mutations:** `mergeFilters` forgetting `programId`, and a corpus ignoring the scope, each fail their `rag-filters` case. |
| `05-green-review.txt` | **Unit and PGlite:** catalog, passage and placement tools, the RAG pipeline, router and filters, the vault services, the walk and the send-message suites, 670 tests. The two exact-argument passage assertions now expect `programId: null`. **Real PostgreSQL 16:** 9 files and 80 tests, covering catalog, placement, passages (three new two-project cases) and RAG tenant scope, on a database migrated to trunk. The lint ratchet and `tsc` both pass. |
