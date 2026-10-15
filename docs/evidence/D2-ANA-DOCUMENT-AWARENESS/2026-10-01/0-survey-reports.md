### tool-registration
**AnA tool pipeline survey: `draft_authoring_document` traced end to end, and what a new read-only tool needs**

**Answer to the key question: yes.** A new read-only tool can keep its definition and handler in new files. Two existing `.ts` files each need two lines, and two JSON registers each need one entry. The repo already does this for `document-spine.ts` (`COMMIT_DOCUMENT_REVISION`), `biotech-program.ts` and `document-catalog-tools.ts`. Without the JSON entries the tool still works at runtime, but it is treated as a write and CI fails (details in §5 and §7).

## 1. Definition
- `server/services/ana/document-surface-tool-defs.ts:141-167` holds `DRAFT_AUTHORING_DOCUMENT`, a plain `AnaTool` object (`name`, `description`, `input_schema`). The header at `:7-10` says the defs are pure objects and the handlers live in `AnaToolExecutor.ts`.

## 2. How definitions are collected (`AnaToolDefinitions.ts`)
- The definition is imported at `:77-94` (`DRAFT_AUTHORING_DOCUMENT` at `:85`) and listed in `ALL_ANA_TOOLS_RAW` at `:1870`, entry at `:1888`.
- Whole tool modules are added as arrays, e.g. `...NAVIGATION_TOOLS` (`:2696`) and `...PROTOCOL_INDUSTRY_TOOLS` (`:2751`).
- `ALL_ANA_TOOLS` removes duplicate names, first one wins (`:2760-2762`).
- `getAllEnabledTools()` (`:2894-2896`) adds the Anthropic-hosted tools (web search, web fetch, code execution), which are switched on by environment flags (`:2864-2888`).

## 3. Handler registry and dispatch (`AnaToolExecutor.ts`)
- `ToolContext` is defined at `:233-340`. `ToolHandler` (`:344`) is `(input, ctx?) => Promise<string>`, and handlers are stored in a map at `:346`.
- `registerToolHandler` (`:532-570`) wraps every handler. Before the handler runs, the wrapper checks, in order:
  - launch scope (`:453`);
  - sub-agent depth: below the person's own turn, only `read`-class tools run (`:463`);
  - approved model for tools that store model-written content (`:473`);
  - `refuse`-class tools (`:479`);
  - `confirm`-class tools without a person's yes, which return a proposal instead (`:483-491`);
  - editor role for `confirm`-class tools (`:516-530`);
  - `foreignProgramRefusal` and `foreignRecordRefusal` (`tool-record-scope.ts`).
- It also records telemetry and a report-only check that required inputs were sent (`:351-363`).
- `getToolHandler` is at `:599` and `getRegisteredToolNames` at `:608`.
- The `draft_authoring_document` handler (`:20529-20535`) is one line. It lazily imports `services/authoring/authoring-draft-tool.ts`, whose `draftAuthoringDocumentTool` (`:103-157`):
  - requires org and user (`:108`);
  - resolves the open program with `resolveOpenProgram` (`:111`) and refuses without one (`:35-36`);
  - records provenance from `threadId`, `turnId` and `model` (`:114-117`);
  - writes through `createDocumentFromDraft`.
- **Handlers in their own modules.** These modules export a register function that receives `registerToolHandler`, so they never import the executor at runtime. They are wired at `:15634` (agentic workflow), `:15638` (biotech program), `:15642` (document spine) and `:15646` (document catalog). The function type is `RegisterFn` (`document-tools-shared.ts:129-132`). Example: `document-spine.ts:392` (definition) and `:417-423` (`registerDocumentSpineHandlers`).
- Dispatch paths:
  - the stream route looks up the handler with `getToolHandler(toolUse.name)` (`routes/ana-ri/stream.ts:2008`) and calls it at `:2050-2062`;
  - `executeAgenticLoop` (`AnaToolExecutor.ts:15882`; dispatch at `:15941-15964`) serves the `/api/chat` route (`routes/chat/send-message.ts`) and the other non-streaming callers;
  - the confirmation route runs a confirmed tool in `runConfirmedTool` (`routes/ana-ri/utility.ts:226-247`);
  - MCP calls handlers only by explicit name (`server/mcp/tools/runtime.ts:96-110`), so a new tool is not exposed there automatically.

## 4. What context a tool receives (`turn-tool-context.ts`)
- One builder per way a tool runs:
  - `turnToolContext` (`:57-59`) for a tool dispatched in the turn;
  - `heldToolContext` (`:78-82`) for a call held for confirmation;
  - `confirmedToolContext` (`:90-98`) for the confirmed run.
- Project fields (`:38-44`):
  - `projectId` is `Number(raw)`, so it is null for a program UUID;
  - `projectRef` is the raw string;
  - the `threadId`, `turnId` and `model` fields are built at `:46-54`.
- On the stream, a handler receives `organizationId`, `userId`, `projectId`, `projectRef`, `threadId`, `turnId` (the run id), `model`, `servingModel`, `liveDrive`, `lockedScreens`, `turnState` and `signal` (`stream.ts:2050-2062`).
- The stream does **not** pass `surface`, `documentType` or `organizationUuid`. Only the `/api/chat` loop adds `organizationUuid` (`AnaToolExecutor.ts:15854-15863`).
- **There is no field for the open authoring document or section** (not found). `authoring_context` reaches only the system prompt, through `buildAuthoringContextBlock` (`services/ana-ri/context-blocks.ts:79-118`). That block carries `artifactId`, `sectionCode` and `sectionTitle`, not an `authoring_documents` id. A new read tool must therefore take the document id as input, or resolve it from `projectRef`.

## 5. Read / confirm / refuse tiers
- **Register:** `tool-authorization.register.json` has 783 entries: 571 `read`, 158 `confirm`, 21 `conditional`, 17 `refuse`, 15 `self`, 1 `command`.
  - Draft's entry (`:1770-1774`) is `"class":"confirm"`.
  - The classes are explained in `tool-authorization.ts:12-24`. `toolAuthorizationOf` (`:166-178`) treats an **unlisted tool as `confirm`, flagged unclassified** (`:168`). A read tool missing from the register would therefore ask the person to confirm every call.
- **Gate:** `governed-tool-gate.ts`, `classifyToolCall` (`:98-128`) and `classifyRegisteredTool` (`:143-152`):
  - `read`, `self` and `command` come back UNGOVERNED;
  - `refuse` comes back REFUSED;
  - everything else comes back NEEDS_APPROVAL, at the `reason` tier for tools that require a stated reason, otherwise `confirm` (`:139-141`).
  - The stream applies it in `settleApprovals` (`stream.ts:1760-1820`) and holds the call with `heldToolContext` (`:1854`).
- **Model-written content:** `governed-write-tools.ts:37-64`, where draft is listed at `:41-42`. `governed-write-gate.test.ts:62-67` fails if any tool input property matches `FREE_TEXT_FIELD` (`:33-34`: `content`, `text`, `body`, `html`, `summary_text`, …) and the tool is in neither map. **A read tool that avoids those property names needs no change here.**

## 6. Which tools are offered on a turn
- **Not every tool, every turn.** `governedToolsetFor` (`governed-toolset.ts:71-88`) removes:
  - launch-scope hidden-app tools (`:75`);
  - the tenant's `anaToolPolicy.deny` list (`:86`);
  - hosted tools the tenant has not opted into (`:123-127`);
  - the seven `CATALOG_GATED_TOOLS` when `ana.document_catalog` is off (`:146-157`; the list is in `document-tools-shared.ts:23-31`).
- Then `selectToolsForTurn` (`tool-selection.ts:141-183`) keeps at most 50 tools (`:148`):
  - the always-on set (`:25-43`) and pinned tools are kept first;
  - the remaining slots go to tools whose name (3 points) or description (1 point) shares words with the message plus the context hints (`:124-133`, `:161-168`).
- **`draft_authoring_document` is not always-on.** It reaches the model only because words like "draft" or "document" score against its name.
- Callers:
  - the stream pins `selected_tools`, the `invokedAppPins` tools and `SELF_DRIVE_TOOLS` (`stream.ts:1583-1615`);
  - `/api/chat` pins `selected_tools` and `SELF_DRIVE_TOOLS` (`send-message.ts:809-822`);
  - voice pins `selectedTools` (`ana-realtime.ts:137-141`);
  - deep investigation pins nothing (`deep-investigation.ts:223-229`).
- **Lens:** `intent_lens` only becomes a word in the relevance score (`stream.ts:1607`); it is otherwise used for the persona (`:797-800`, `:848`).
- **Defect:** at the same line, `asStr(authoring_context)` is always undefined because `authoring_context` is an object, so the open document never influences which tools are offered.
- `ANA_TOOL_SELECTION_DISABLED=1` turns selection off (`:146`).

## 7. CI and test gates that list tools
| Gate | Requires |
|---|---|
| `tool-registry-consistency.test.ts:37-72` | every definition has a handler and vice versa; no new duplicate names; `input_schema.type === 'object'` with `properties` |
| `tool-authorization.test.ts:25-41` | the register covers the registry exactly (more than 700 entries) |
| `ana-launch-scope.test.ts:33-36` | every enabled tool is in `ana-launch-scope.inventory.json` `tools.inScope` or `hiddenApp` (at runtime an unlisted tool is treated as in scope: `ana-launch-scope.ts:62-63`) |
| `governed-reason-not-invented.test.ts:339-344, 531-542` | scans **only** `server/services/ana/*.ts` files exporting `export function register\w*Handlers(register`; each `register('literal_name', handler)` needs a string-literal name and an inline function, a local function, or a wrapper whose last argument is the handler; otherwise "registered tools the scan never read" fails |
| `governed-write-gate.test.ts:62` | the free-text rule in §5 |
| `catalog-gated-tools.test.ts:20-29` | only if the handler calls `requireCatalog` |
| `tool-selection-routing.test.ts:18-55` | fixed prompt-to-tool cases within the top 50; a new tool with a broad description can push an existing expected tool out |
| `ci:canvas-path` (`scripts/ci/check-canvas-path.mjs:74, 140-157`; run in `ci.yml:358-359`) | the literal `draft_authoring_document` in a `name:` under `server/services/ana` **and** quoted in `AnaToolExecutor.ts`; it does not check new tools, but **draft's handler must not move out of the executor** |
| ESLint ratchet (`ci:eslint-ratchet`, baseline `totalWarnings` 6411, may only shrink) | the new file must add zero warnings: at most 500 lines, functions at most 100 lines, complexity at most 15 (`eslint.config.js:231-235`) |

Not enforced by CI:
- `docs/ana-capability-manifest.json` is regenerated by hand with `npm run manifest:ana` (`package.json:84`).
- `TOOL_LABELS` (`agentic-loop.ts:675`; draft's label at `:743`) is optional: an unlisted tool falls back to a label made from its name (`:669-672`, `:792-798`).
- `RECORD_SCOPES` (`tool-record-scope.ts:109-120`) is optional. Any input named `program_id`, `programId` or `device_program_id` is already checked against the caller's organization automatically (`:30`, `:57`).

## 8. The smallest set of changes for a new read-only tool
Create `server/services/ana/<x>-tools.ts` containing `export const X_TOOLS: AnaTool[]` and `export function registerXHandlers(register: RegisterFn)` with literal `register('x', …)` calls. Import only *types* from `AnaToolExecutor.js`, because the executor imports `AnaToolDefinitions`, so a runtime import would be circular. Then:

1. **`AnaToolDefinitions.ts`**: add one import line near `:494`, and `...X_TOOLS,` at the end of `ALL_ANA_TOOLS_RAW` (before `:2752`).
2. **`AnaToolExecutor.ts`**: add one import line near `:210`, and `registerXHandlers(registerToolHandler);` after `:15646`.
3. **`tool-authorization.register.json`**: one entry per tool, `{"class":"read","writes":"none","site":"<x>-tools.ts:<line>"}`.
4. **`ana-launch-scope.inventory.json`**: add the name to `tools.inScope`, which is kept sorted (600 entries).

Optional changes, each to an existing file:
- `ALWAYS_ON_TOOLS` (`tool-selection.ts:25`), or pins in `stream.ts:1587` and `send-message.ts:810`, if the tool must be offered whatever the wording.
- A label in `agentic-loop.ts:675`.
- A persona line in `services/ana-ri/persona.ts`.
- A case in `tool-selection-routing.test.ts`.

For reading, the authoring store is read inline in `authoring.router.ts`; I found no reusable read service in `services/authoring/`:
- `GET /docs/:docId` (`:1649`), scoped by tenant, with `callerDocumentAccess` at `:1683`;
- `GET /docs/:docId/sections` (`:1699`).

A handler would have to repeat the `tenant_id` scoping and per-document access check that these routes apply.

### long-document-store
# Authoring store for very long documents (read-only survey)

**Short answer:** The authoring store is flat. Each document holds a list of sections, and no column links a section to a parent section. Hierarchy exists only in the dotted `code` values and in a separate governed outline (`c2c_document_sections`, built from a rule pack). An IND is one governed filing in that outline, with at most one authoring document bound to it. Every read of an authoring document returns the content of all its sections at once. No route pages through sections, returns an outline without content, or reads one section by id.

## 1. Schema

**`authoring_documents`** is created at `db/migrations/20260725_authoring_document_loop_tables.sql:35-57`.
- Columns: `id UUID PK`, `title NOT NULL`, `module`, `product_code`, `locale`, `status DEFAULT 'draft'`, `created_by`, `template_id`, `submitted_at`, `current_workflow_id`, `approved_at`, `frozen_at`, `locked_at`, `locked_by`, `version`, `tenant_id INT NOT NULL`, `created_at`, `updated_at`. One index, on `tenant_id` (:56).
- Columns added later, all nullable:
  - `client_program_id UUID` and index `authoring_documents_program_idx`: `migrations/20260727_authoring_document_program_scope.sql:82-92`. A same-organization foreign key, `authoring_documents_program_same_org_fk`, is added in `migrations/20260926b_program_same_org_keys.sql:134-137`.
  - `c2c_document_id text`, a foreign key to `c2c_documents(id)` with `ON DELETE SET NULL`, plus a partial index: `migrations/20260728_authoring_document_governed_binding.sql:60-75`. The header (:27-31) says existing rows are not backfilled.
  - `provenance JSONB` holding `{source: ana|seed|import, …}`: `migrations/20260921_authoring_document_provenance.sql:50-54`.
- The order in the migration set is at `scripts/db/migration-set.mjs:174, 357, 365`. The authoring tables themselves come in through `scripts/db/authoring-subsystem.mjs:137-138`.

**`authoring_sections`** is created at `20260725_…loop_tables.sql:59-72`.
- Columns: `id UUID PK`, `doc_id UUID NOT NULL`, `code TEXT` (nullable), `title`, `content TEXT` (no size cap), `order_index INT DEFAULT 0`, `track_changes`, `tenant_id`, `created_at`, `updated_at`.
- **No hierarchy column was found**: no `parent_id`, `level`, `depth` or `module`. **No index on `code`** was found either; the only index is `(doc_id, tenant_id)` (:71-72).
- Keys and constraints:
  - Composite foreign key `(doc_id, tenant_id) → authoring_documents(id, tenant_id) ON DELETE CASCADE` (:186-188).
  - `UNIQUE (id, tenant_id)` (:179-181).
  - `UNIQUE (id, doc_id, tenant_id)` at `db/migrations/20260727_authoring_object_permissions.sql:138-147`.
  - **No uniqueness on `(doc_id, code)`.** Duplicate codes are only reported after the fact, by `sectionStructureIssues` (`shared/regulatory/section-code.ts:200-224`).

**Related tables:**
- `doc_revisions` (:76-85): full content on every revision.
- `authoring_comments` and `authoring_citations` (:87-116).
- `frozen_documents` (:120-131): the whole document is stored as one `frozen_content TEXT` per version.

**What the columns hold in practice:**
- **Status** uses mixed case: `'draft'`, `IN_REVIEW`, `APPROVED`, `FROZEN`. Reads compare with `upper()` (`server/routes/authoring.router.ts:1335-1368`).
- **`module`** defaults to `'M3'` in `createDocument` (`server/services/authoring/authoring-documents.ts:475`) and to `'M2'` in the from-draft path (`authoring-from-draft.ts:241`).
- **`product_code`**: the from-draft path puts `documentType` here (`authoring-from-draft.ts:242`).
- **`order_index`**:
  - `POST /sections` computes the position from the code with `sectionInsertIndex`, locks the rows with `FOR UPDATE`, and shifts later rows down by one (`authoring-documents.ts:584-608`).
  - From-draft uses the array position (`authoring-from-draft.ts:253`).
  - Template seeds use the template's own `ordering` (`authoring-documents.ts:117-141`).
  - CTD order rules (numbers compare as numbers; Module 3 parts sort S, P, A, R) are in `shared/regulatory/section-code.ts:127-160`.

## 2. How a multi-module IND is represented

**Governed side (the system of record):**
- `c2c_rule_packs.required_sections` is a JSON list of `{key, parent_key, label, mandatory, path_order}` (`migrations/20260528_phase9_document_schema.sql:37-50`).
- `c2c_documents` holds one row per filing, with `project_id`, `doc_type`, `agency` and `rule_pack_version` (:53-82).
- `c2c_document_sections` holds the sections (:88-119). It has a real `parent_key` hierarchy, `path_order`, `UNIQUE(document_id, section_key)`, and content as JSONB.
- The IND × FDA pack `ich-m4-v2.1` has **92 nodes** covering M1 to M5, with dotted keys such as `1.14.4.1`, `3.2.S.4` and `5.3.5.1`, and roots `M1`–`M5` (`migrations/20260901_ind_fda_m1_v2_3_outline.sql:68-75`). Version `ich-m4-v2.2` has the same 92 nodes with different mandatory flags (`migrations/20260902_…:68`).
- **Scaffold:** creating a project inserts one `c2c_documents` row and every section from the pack (`server/services/c2c/scaffold-project-documents.ts:153`, `:179-189`). It picks the newest pack that has not been superseded (:130-135).

**Authoring side:**
- **The whole filing is one governed document, not one document per module.** A project can hold many authoring documents, but only one is bound to the filing (`authoring-documents.ts:160-179`, `resolveBinding` :180-226). Every other document is created in the project unbound, with the reason stated. The binding itself is resolved in `server/services/c2c/governed-document-binding.ts`.
- **A bound authoring document is not seeded from the rule pack.** Seeding happens only from a template (`authoring-documents.ts:92-150`); nothing in `server/services/authoring` reads `required_sections`.
- **Sections in the two stores are matched by string.** `authoring_sections.code === c2c_document_sections.section_key`:
  - `findSectionForNode` (`client/src/concept2cure/v2/useFilingOutline.ts:225-231`).
  - `commitSectionToFiling` updates the governed section by `section_key`, inside the save's transaction (`server/services/c2c/commit-section-to-filing.ts:241-250`). It is called at `authoring.router.ts:2084, 2375, 3695`.
  - Changing a section's code on a bound document is refused (`authoring.router.ts:1876-1891`).
- **Content shapes differ.** Authoring stores HTML in TEXT; the governed store holds `{"text": …}` as JSONB (`commit-section-to-filing.ts` header, around :45-50).

## 3. Filing outline on the client

- `useFilingOutline(projectId)` (`useFilingOutline.ts:166-212`) works in two steps:
  1. It calls `GET /api/c2c/documents?projectId=` and takes `documents[0]` (:175).
  2. It calls `GET /api/c2c/documents/:id/outline`, then builds the tree from `parent_key` and `path_order` (:105-135).
- The outline route (`server/routes/c2c/documents.ts:292-372`) **returns no content**. It merges the rule pack with each section's live `status`, `draft_source`, `version` and `has_content` flag. This is the only light outline route found, and it covers the governed store only.
- `DocumentWorkbench` binds tree nodes only against the **active** authoring document's sections (`client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3184-3197`, hook used at :768). A node whose text sits in another authoring document shows as "not started".
- `nodeHasDraft` checks both stores (`useFilingOutline.ts:258-264`).

## 4. Read routes (`/api/authoring`, mounted at `server/bootstrap/register-inline-routes.ts:319`)

| Route | Returns | Scaling |
|---|---|---|
| `GET /docs` (`authoring.router.ts:1273-1395`) | Document rows plus `section_count` and `SUM(LENGTH(s.content))` | No LIMIT, no pagination. It joins every section to compute the total length. The section join has no tenant predicate (:1315). |
| `GET /docs/:docId` (:1649-1696) | Document metadata, counts, `provenance`, `access` | No content. The SELECT (:1655) **leaves out `client_program_id` and `c2c_document_id`**. |
| `GET /docs/:docId/sections` (:1699-1758) | **Every section with full `content`**, plus counts and `structure` | No limit or offset. This is the scaling problem. |
| `GET /sections/:id/history` (:2211), `/sources` (:2855), `/citations` (:2962), `/tokens` (:4781) | Data for one section | Per section. |
| `GET /docs/:docId/audit` (:6472) | Audit rows | Default 100, maximum `AUDIT_READ_MAX_ROWS = 500` (:6469). Audit export maximum is 10000 (:6470). |
| `GET /stats` (:4006) | Organization-wide counts | Joins every section, comment and revision. |

**Not found:**
- `GET /sections/:sectionId`, a single-section read.
- An authoring outline route without content.
- Pagination: no `OFFSET`, `cursor` or `limit` on docs or sections.
- Search over section text.

The only single-section content read is in the governed store: `GET /api/c2c/documents/:id/sections/:key` (`documents.ts:376-415`).

**Client callers that load all sections:**
- `DocumentWorkbench.loadSections` (`DocumentWorkbench.tsx:1424-1430`).
- `DocumentCanvas.readDocumentRecord`, which reads the document and all its sections in parallel (`DocumentCanvas.tsx:152-157`).
- The workbench's target lookup, which loads the full sections of up to `docs.slice(0, 8)` documents to find one section (`DocumentWorkbench.tsx:1583-1585`).
- Freeze and e-sign hash every section row through `computeDocHash` (`authoring.router.ts:586`, `4314`, `4481`).

## 5. Compile and export

- **`POST /docs/:docId/export`** (:5667-5815) exports one document as docx, pdf or xml.
  - It refuses (409) unless the document is LOCKED, APPROVED or FROZEN.
  - It loads every section ordered by `order_index` and renders through `renderAuthoringExport` (`server/services/authoring/authoring-export.ts`).
  - **No multi-document or project-level export was found.**
- **`POST /docs/:docId/file-to-vault`** (:5820): one document becomes one vault file (pdf or docx).
- **`POST /docs/:docId/send-to-packager`** (:4711-4770): exports one document and posts it to `/api/regulatory/ectd/:seqId/leaf` with **`module: 3` hardcoded**.
- **Place into filing** (`client/src/concept2cure/v2/surfaces/AuthoringPlaceIntoFiling.tsx:247-273`):
  1. It snapshots the whole authoring document into one `coauthor_documents` row (`server/services/coauthor/coauthor-snapshot.ts`).
  2. It writes one `submission_leaves` row at a single `sectionCode` with `PUT /api/submissions/sequences/:seqId/leaves`.
  - One authoring document therefore becomes one leaf.
- **eCTD compile** (`server/routes/ectd-compile.ts:480`) uses `submission_leaves` (the spine path) or the legacy `project_sections` store (:300-315).
  - The leaf resolver can read `c2c_document_sections`, `coauthor_documents` and others (`server/services/ectd/leaf-document-tables.ts:31-36`; `leaf-source-resolver.ts:734-760`).
  - **It never reads `authoring_sections` directly.** Authoring text reaches a package only through a coauthor snapshot, or through `commitSectionToFiling` into the governed sections.

## 6. Sizes and limits in code

| Limit | Location |
|---|---|
| From-draft: at most `MAX_DRAFT_SECTIONS = 200` per document | `authoring-from-draft.ts:121-131` |
| Provenance strings: at most 2000 characters | `authoring-from-draft.ts:72` |
| JSON request body on `/api`: `2mb` (effective cap on one section save) | `server/startup/middleware.ts:182` |
| Inline image: 8 MB | `authoring.router.ts:7187` |
| `MAX_ACCEPTED_MACHINE_TEXT_CHARS = 400_000` | `server/services/authoring/revision-ledger.ts:209` |
| Export list nesting: `MAX_LIST_DEPTH = 4` | `server/export/authoring-section-content.ts:243` |
| `section.content` itself | TEXT, no cap |

The comment on the 400,000 constant says the batch-draft accept refuses content past 400k. **No code enforcing that was found.**

## 7. Existing AnA access, for context

- `draft_authoring_document` creates documents (`server/services/ana/document-surface-tool-defs.ts:142`).
- `read_governed_document` (:89-101; handler at `AnaToolExecutor.ts:20316`) reads the **governed** store: the outline with no `section_key`, or one section with `max_chars` (default 6000, maximum 30000). Its outline comes from `c2c_document_sections` rows, not from the rule pack.
- `list_governed_documents` defaults to 25 rows, maximum 100.
- **No AnA tool reads `authoring_sections` was found.** `authoring-canonical-bridge.ts:158-175` loads all sections of one document, for snapshots.
- The Vault tools are described only, as asked. The Vault tree walks the same `parent_key` and `path_order` outline (`useFilingOutline.ts:96-98`, which cites `server/routes/c2c/project-vault.ts`).

### document-stores
AnA cannot read the main editor's store at all today. No tool lists, reads or searches `authoring_documents` / `authoring_sections`. The editor sends AnA the open document's id and section code, but there is nothing she can call to read that content. She can open a specific authoring document and section only by title-matching on screen. There is no id-based route to the editor, and the documented cross-document route drops the section code. Details follow, store by store.

## 1. Content stores: can AnA read, search and navigate to them?

**A. `authoring_documents` / `authoring_sections` (DocumentWorkbench, DocumentCanvas)**
- **Read:** no tool. AnA's only references to these tables are:
  - `draft_authoring_document`, which writes (`document-surface-tool-defs.ts:141-167`, handler `AnaToolExecutor.ts:20529`).
  - The internal bridge snapshot (`authoring-canonical-bridge.ts:158-176`), which is not a tool.
  - A grep for any `list_/read_/get_/search_` tool on authoring/section/canvas/editor finds none.
- **Search:**
  - `search_all_documents` covers only `concept2cure_artifacts`, `c2c_documents` and `tmf_artifacts`, by title (`AnaToolExecutor.ts:20753-20788`).
  - `project_knowledge_search` searches `lumen_data_atoms` (Data Room atoms), not authoring sections (`advancedRAGPipeline.ts:590-617`; `vault/document-passage-search.ts:9-13`).
  - No indexer embeds `authoring_sections`.
- **Indirect read:**
  - For a document bound to a governed filing (`c2c_document_id` set; `migrations/20260728_authoring_document_governed_binding.sql`), section saves, reverts and accepted drafts are mirrored into `c2c_document_sections` by `commitSectionToFiling` (`server/services/c2c/commit-section-to-filing.ts:111`, called at `authoring.router.ts:2375` and `:3695`). Those sections can then be read with `read_governed_document`.
  - Documents AnA drafts herself are unbound: `authoring-draft-tool.ts` passes no binding.
- **Project scope in the table:** `client_program_id` (required for new documents since PF-07; `migrations/20260727_authoring_document_program_scope.sql:8-19,82-92`). The REST list filters by `programId` (`authoring.router.ts:1298`).
- **Structure is flat:** `code`, `title`, `order_index`, `content`, with no parent column (`db/migrations/20260725_authoring_document_loop_tables.sql:59-70`). Any module/section/subsection hierarchy can only be derived from `code`.
- **Context sent with each turn:** DocumentWorkbench sends `authoring_context` with `artifactId = activeDocId`, `sectionCode`, `sectionTitle`, `moduleCode` and `artifactStatus` (`DocumentWorkbench.tsx:1153-1173`; `useAnaChat.ts:827-841`).
  - The server turns these into prompt XML only (`context-blocks.ts:79-115`; `stream.ts:816,870-873`). No section content is loaded.
  - `ToolContext` has no document or section field (`AnaToolExecutor.ts:233-339`).
  - The only tool that takes an `artifact_id` is `read_vault_document`, which reads `concept2cure_artifacts`, a different id space.
- **Edits:** AnA has no tool to propose an edit to an existing section.
  - The only way in is a person clicking "Insert into open section", which inserts AnA's whole answer as tracked suggestions through `insertSuggestion` (`ConversationThread.tsx:169-195`; `DocumentWorkbench.tsx:1197` and `:4483`; `RichSectionEditor.tsx:135,1497`).
  - It is not anchored to a passage and not tool-driven.
- **Legacy commands reachable through `execute_platform_command`:**
  - `draft_section` reads `doc_sections`, not `authoring_sections`, with no tenant predicate (`ana-ri/command-executor.ts:3468-3490`).
  - `freeze_document` and `submit_document` query `authoring_documents.organization_id`, a column that does not exist (it is `tenant_id`). Both refuse anyway (`command-executor.ts:3544` and `:3680-3700`).

**B. `c2c_documents` / `c2c_document_sections` (governed filings)**
- **Tools:**
  - `list_governed_documents` (def `document-surface-tool-defs.ts:72`, handler `AnaToolExecutor.ts:20281`): org-scoped only (`WHERE d.org_id = $1`). It returns `project_id` but cannot filter by project.
  - `read_governed_document` (def `:88`, handler `:20316-20368`).
- **Outline vs content:** with no `section_key` it returns the outline (`section_key`, `parent_key`, `label`, `status`, `mandatory`, `version`, in `path_order`). With a key it returns one section, truncated to 6000 characters by default and 30000 at most (`:20120-20133`).
- **Search:** title-only through `search_all_documents`. There is no content search.
- **Gaps:**
  - No project scoping.
  - No "read many sections" call, so a whole IND means one call per section.
  - No content search.

**C. `coauthor_documents` (EctdCoauthor)**
- **Read:** no tool.
  - `classify_submission_document` and `extract_submission_document` take a coauthor `document_id` and run the ingestion pipeline (`submission-center-tool-defs.ts:231-258`; handlers `AnaToolExecutor.ts:9566,9592`). Both write and are audited. Neither returns the document's content.
  - `place_into_sequence` can point a leaf at one (`:867`).
- **Grounding in the surface:** the EctdCoauthor AnA pane only appends `(eCTD §X)` to the typed question (`EctdCoauthor.tsx:676-680`). The surface reads the store through `/api/coauthor/documents` (`:291`).
- **Search:** none. **Scope:** org only (`organization_id`; `server/db/pglite-harness.ts:394-403`).

**D. QMS controlled documents (`qms_documents`)**
- **Write/refuse only:**
  - `create_qms_document` (`AnaToolExecutor.ts:14131`).
  - `revise_qms_document` (`:14211`).
  - `approve_qms_document` and `retire_qms_document` are refused as e-signatures (`:14191`, `:14268`).
  - `ack_training` (`:14285`).
- **Read, list, search:** not found. `global_search` claims to cover QMS documents (`qms-labeling-analytics-tool-defs.ts:339`), but its handler queries only `regulatory_programs` and `concept2cure_artifacts` titles (`AnaToolExecutor.ts:14786-14800`).
- **Scope:** org only.

**E. Protocol documents (`protocol_documents` / `protocol_sections`)**
- **Tools:**
  - `create_protocol_document` (def `notifications-study-memory-tool-defs.ts:371`, handler `AnaToolExecutor.ts:11960`) returns `{id, sectionsSeeded}` only.
  - `update_protocol_section` (def `:393`, handler `:11993`) needs a numeric `section_id`.
  - `review_protocol_completeness` (`:12071`).
  - `finalize_protocol_document` checks only and never signs (`:12088`).
  - `export_protocol_document` (def `:907`, handler `:11300`) returns the full assembled document plus Markdown, untruncated.
- **Gaps:**
  - No list tool for protocol documents (only `list_protocol_templates`, `:11254`, and `review_protocol_portfolio`, which covers IACUC/IRB).
  - The export's section query does not select `id` (`protocol-export-service.ts:37`). So AnA cannot discover the `section_id` that `update_protocol_section` requires.
  - Org-scoped only; there are no project columns in the protocol services.

**F. Labeling documents (`labeling_documents`)**
- **Write only:** `create_labeling_document` (`AnaToolExecutor.ts:14656`), `add_labeling_translation` and `add_labeling_symbol` (`:14692`, `:14735`). There is no read, list or search tool.
- `create_labeling_document` is classified `hiddenApp` (outside launch) in `ana-launch-scope.inventory.json`.

**G. `concept2cure_artifacts` (side-panel and Document Studio drafts)**
- **Writer:** `artifactVersionStore.ts:1-15`. **Spine:** `commit_document_revision` (`document-spine.ts:393,424`).
- **Read tools:**
  - `list_vault_documents` (`AnaToolExecutor.ts:20135`): org-wide, title/status/CTD filters, no project filter.
  - `read_vault_document` (`:20210`): full text truncated at 6000 characters by default, 30000 at most; returns `evidence_source_id`.
  - `get_document_versions` (`:20253`) and `compare_vault_versions`.
  - `list_artifacts` (`command-executor.ts:909`, project-scoped) and `search_artifacts` (`:2163`) through `execute_platform_command`.
- **Search:** title only (`search_all_documents`, `global_search`). There is no section/outline concept; content is one blob.

**H. Vault / project documents (`vault.documents`) — described only; another session is changing this**
- **Tools:** `list_project_documents`, `read_project_document` (windowed, with read receipts and coverage), `catalog_project_document`, `search_project_documents` (over comprehension summaries), `search_document_passages` (passage RAG), `place_project_document`, `file_chat_upload_to_vault` (`document-catalog-tool-defs.ts:20-230`; handlers `document-catalog-tools.ts:128-623`).
- **Scope:** program-scoped through `catalogScope`.
- **Gate:** at HEAD every one of these tools is behind `requireCatalog`, which checks the `isDocumentCatalogEnabled` feature flag (`document-tools-shared.ts:99-111`; `vault/document-catalog.service.ts:43-49`).

**I. Uploaded chat files (`file_uploads`)**
- **Tools:**
  - `inspect_uploaded_document` (def `document-intake-tool-defs.ts:19`, handler `AnaToolExecutor.ts:4799`): PDF outline, bookmarks and page census.
  - `read_uploaded_document` (def `:42`, handler `:4850`): paged by `offset`/page range, default 30k characters, 80k maximum, with an outline.
  - `ocr_document_pages`, `read_spreadsheet`.
  - `search_large_document` (`evidence-literature-tool-defs.ts:1789`, handler `:1656`).
  - `remember_document_in_project` (`:1826`, handler `:1717`).
- **Scope:** org only (`uploaded-file-access.ts:1-24`).
- **Discovery:** through the current turn's attachments, or the `chatUploads` array of `list_project_documents` (`document-catalog-tools.ts:142-156`). That route is behind the Vault catalog flag.

**J. Submission Center sequences and leaves**
- **Tools:** `place_into_sequence` (writes; `:9650`), `run_shadow_review` (`submission-center-tool-defs.ts:261`), `assess_dispatch_readiness` (`:894`), `trace_provenance` (`:396`), `check_submission_status` and `get_submission_ack` (`AnaToolDefinitions.ts:1403,1414`). Every one needs a numeric id.
- **Gap:** no tool lists submissions or sequences, or reads a leaf's content.

## 2. Navigation tools

- **The six self-drive tools:**
  - `list_app_screens` (`navigationTools.ts:23`).
  - `navigate_to` (`:37`; handler `AnaToolExecutor.ts:17672`).
  - `list_screen_actions` (`:60`; handler `:17772`).
  - `act_on_screen` (`:76`; handler `:17804`).
  - `list_demo_scripts` and `start_product_demo`.
  - All six are pinned on every stream turn (`stream.ts:1583-1604`; `tool-selection.ts:63-70`).
- **Live Drive:** directives are applied as they stream when `live_drive` is on; otherwise they appear as chips the person clicks (`ana-ri/live-drive.ts:1-40`; `ToolContext.liveDrive` at `AnaToolExecutor.ts:309-315`).
- **Authoring navigation target:** `authoring` declares only `authoringDocType` (`shared/navigation/index.ts:160-163`). `section-workspace` declares `sectionCode` (`:121`). Both map to `document-authoring` (`client/.../registryModel.ts:895,900`).
- **Authoring screen actions:**
  - `authoring.open-document`, by title (`surface-actions.ts:339`; handler `DocumentWorkbench.tsx:1708-1748`).
  - `authoring.open-section`, within the open document only (`:353`; handler `:1749-1776`).
  - `authoring.find`, opens the find bar read-only (`:367`; handler `:1777`).
- **Other document screen actions:**
  - `ectd-coauthor.open-document` (`:412`).
  - `protocol-dev.open-section` (`:1375`).
  - `regulatory-workspace.open-section` (`:1387`).
  - `submissions.select-submission` and `submissions.select-sequence` (`:453`, `:467`).
  - Vault search and open-folder (`:165`, `:179`).
  - Quality has tabs and filters only; there is no action to open a document (`:605-675`).
  - Artifacts Center takes an `artifactId` parameter (`index.ts:105-111`).
- **Editor deep link (`setEditorTarget` / `editorTarget.ts`):** it carries `docId`, `sectionCode`, `sectionLabel` and `programId` (`editorTarget.ts:88-171`).
  - It is written only by client clicks: DocumentCanvas (`:368`), Vault (`Vault.tsx:1236`), CMC (`CmcModule.tsx:2648,2812,2927`) and MdxSurfaceHost (`:276`).
  - No AnA directive writes it. Directive parameters travel on a different channel, `C2C_NAV_PARAMS` (`navParams.ts:63-79`), which carries no `docId`.

## 3. Can AnA open a specific authoring document and section today?

Only partly, and only by title:
- **What works:** `navigate_to authoring`, then `act_on_screen authoring.open-document {title}`, then `authoring.open-section {sectionCode}`. This is title and code matching with refusals on unsaved edits.
- **By id:** no. Nothing AnA can emit sets a `docId`.
- **Cross-document, by section code:** `navigate_to section-workspace {sectionCode}` reaches the workbench, which runs its bounded cross-document search (`DocumentWorkbench.tsx:1004-1030`). The route has no document or program claim.
- **The documented route fails silently:** `authoring.open-section` tells AnA to use "navigate_to authoring with sectionCode" (`surface-actions.ts:357`; refusal text at `DocumentWorkbench.tsx:1767`). But `resolveNavigation` copies only declared parameters (`shared/navigation/index.ts:287-305`), and `authoring` declares no `sectionCode`, so it is dropped without an error.
- **Misleading parameter:** `authoringDocType` is described as a document type but is matched against document titles (`DocumentWorkbench.tsx:1650-1655`).
- **Canvas:** it mounts only for a draft AnA produced in that turn through `draft_authoring_document` (`stream.ts:2395-2418`; `DocumentCanvas.tsx:1-12`). No tool can show an existing document as a canvas.

## 4. Cross-cutting gaps

- **Tool selection:** a turn is offered at most 50 tools out of about 760 (`tool-selection.ts:141-187`). None of the document read tools is always on; `global_search` is, and it searches only program and artifact titles (`:25-42`).
- **The "catch-all" bridge:** the stream comment says anything dropped stays reachable through `execute_platform_command` (`stream.ts:1579-1581`). In fact that bridge runs only ana-ri `COMMAND_REGISTRY` entries (`AnaToolExecutor.ts:5553-5556`), not typed tools such as `read_governed_document`.
- **Editor context does not reach tool selection:** `documentType: asStr(document_context)` and `surface: asStr(authoring_context)` receive objects, so both resolve to `undefined` (`stream.ts:1606-1607`).
- **Too many stores, too many id spaces:** authoring (UUID), c2c (text), coauthor (int), protocol (int), QMS (int), artifacts (int / `artifact_…`), vault (UUID), uploads (`file_…`). No single index or search spans them, and only `c2c` and the Vault are project-scoped in what AnA reads.

### turn-context
**What AnA knows on each `/api/ana-ri/stream` turn without calling a tool (read-only survey at `907263fb31`)**

`module_context` reaches no model. Hand-off item 14 is still open (it starts at `docs/work-orders/README.md:1068`, not 1063). There is no per-turn index of the project's documents.

## 1. What goes into the prompt, in order

The request body is destructured at `stream.ts:473-492`. It takes `authoring_context` (`:483`) but not `module_context`.

**A. Stable prefix.** `messages[0]`, cached (`cacheControl: true`, `:1002`). Built as `intelligencePrefix + orchestration.systemPrompt` (`:944`).
1. **Intelligence prefix**, `getIntelligencePrefix(org, projectId)` (`:900`, defined at `lumen-context/intelligence-prefix.ts:73`). It holds client intelligence, project intelligence (`integerProjectForRef`) and the wisdom engine output. It is cached for 60 seconds (`:42`), with at most 200 entries (`:43`).
2. **`orchestrate()`** (`:842-859` → `orchestrator.ts:353`), on inputs prefetched by `prefetchRouteIntelligenceContext` (`stream.ts:824-832`, `chat-context-builder.ts:126`). It appends, in this order:
   - base persona (`orchestrator.ts:403`)
   - external intel (`:408`)
   - deadline radar (`:414`)
   - session briefing, first turn only (`:421`)
   - contradiction watch (`:430`)
   - project intelligence profile (`:437-441`)
   - document template (`:446-454`)
   - deficiency context (`:459-464`)
   - registry context (`:469-487`)
   - document actions (`:491-495`)
   - role context (`:499-502`)
   - decision context, at most 10 (`:510-532`; prefetch at `chat-context-builder.ts:249-261`)
   - RIM, only when there is a `sectionCode` or `artifactId` (`orchestrator.ts:542-548`)
   - document state and active section (`:554-579`)
   - freshness warning (`:583-585`)
   - feedback patterns (`:589-601`)
   - proactive and citation protocol text (`:606-650`)
   - continuity (`:653-660`)
   - command context (`:665`)
3. **Route block**, `## Current UI Route` (`stream.ts:866-869`), built from `req.body.context` by `context-blocks.ts:50-77`. It carries screen, project id/name, product type, role and section code.
4. **Authoring block**, `## Current Authoring Context` (`stream.ts:816`, `:871-873`), from `context-blocks.ts:79-115`. It carries workflow stage, section code and title, module code, `artifact_id`, version, status and submission type. The readiness and contradiction branches never get data from this client (see §6).
5. **ICH M4 section guide** (`stream.ts:876-882`), when there is a `sectionCode`.

**B. Volatile suffix.** `messages[1]`, not cached (`:945-948`, `:1004-1006`). It is `memoryBlock + enrichment.block + (Live Drive block | offered-moves block)`.
- **Memory:** `buildMemoryContextForChat`, query-driven, `limitPerLayer: 4`, `maxChars: 3500` (`:901-910`).
- **Enrichment:** `enrichContextForChat` (`:911-920`, `context-enrichment.ts:1059`). It adds slash commands, @app mentions, the governed envelope, project profile, readiness and similar sources (source pushes at `:1224-1749`).

**C. History.** Server thread history, last 20 messages (`stream.ts:1021`), plus a tool-trace note and a stopped-turn note as system turns (`:1030-1038`). If there is no server history, it uses the client's history (`:1048-1058`): at most 20 messages, each at most 50,000 characters. The client only sends its last 10 (`useAnaChat.ts:921`).

**D. Session bootstrap**, a system turn (`stream.ts:1074-1099`). Details in §3.

**E. Attachments.** `file_ids` and `source_ids` add a user turn listing file names (`:1183-1191`). With PDF intake on, PDF and text bytes go inline as document blocks, capped at 30 MB (`:1199-1226`).

**F.** The user message (`:1246-1249`).

**During the tool loop:** `loopMessages = [...messages]` (`:2476`). Screen-report and unconfirmed-move system turns are added as needed (`:2341`, `:2658`; builders at `:225-270`).

## 2. `module_context` is not read

- `module_context` and `buildSurfaceContextBlock` appear nowhere in `stream.ts`. The imports from `chat-context-builder` are only the route/authoring/prefetch helpers (`:143-149`).
- The only renderer is `chat-context-builder.ts:533`, inside `buildChatContext` (`:327`), which has no production caller. Its docblock at `:5` ("Both endpoints call buildChatContext()") is wrong.
- `surface-context-block.ts:18-25` and `:111-116` already say this block reaches no model.
- The MDX branch (`chat-context-builder.ts:496-517`) is equally dead.
- `scripts/ci/check-ana-surface-context.mjs:8` says the server renders `module_context`. That is false today, which is item 14's point that the gate holds surfaces to a contract with no consumer.

## 3. Per-turn index of the project's documents: not found

- Nothing on the per-turn path reads `authoring_documents` or `authoring_sections`. That covers `lumen-context`, the memory assembler, `context-enrichment`, the orchestrator, `context-blocks` and the bootstrap.
- The only references in AnA code are:
  - write tools: `governed-write-tools.ts`, and the `draft_authoring_document` tool definition (`document-surface-tool-defs.ts:144`)
  - `authoring-canonical-bridge.ts:158-170`
  - `command-executor.ts:3544` and `:3680`
  - `post-processing.ts:164`
- The D2 row (README:65) records that no AnA tool reads an authoring document.
- **What the model does get:** the open document's id (`<artifact_id>`) and the active section's code and title, through the authoring block. It gets no outline, no other sections and no section text.

**`ana-session-bootstrap`** (`ana-session-bootstrap.ts:91-117`, `:131-231`):
- Fires only when the session has no prior turns and an org is set (`ana-session-bootstrap-format.ts:33-40`). Disabled with `ANA_SESSION_BOOTSTRAP_AUTO=false`.
- Contents:
  - working-memory summary, clipped to 1,200 characters
  - project and client atoms (top 6 and top 3 of 40 loaded; each title clipped to 120 characters, each content to 240)
  - up to 5 outcome lessons
  - a vault catalog digest of 12 files (`getCatalogBootstrapDigest`, `document-catalog.service.ts:618-641`)
  - up to 8 past chat uploads
- The formatter is at `ana-session-bootstrap-format.ts:194-279`.
- The two vault parts are gated on `isDocumentCatalogEnabled` (`document-catalog.service.ts:43-49`).
- The digest calls `listProjectDocuments(organizationId, {limit})` with no project filter, so it is org-wide. This is the Vault, which the other session owns; I am describing it only.
- It is a once-per-session snapshot, not a per-turn index.

## 4. Budgets and caps

| What | Cap | Where |
|---|---|---|
| Output tokens | fast 4,096 / balanced 6,144 / thorough 8,192 | `ai-gateway/reasoning.ts:59-63` |
| Planner clamp on output | [512, 8192] | `stream.ts:1318-1327` |
| Agentic rounds | fast 4 / balanced 6 / thorough 10, plus 0 / 2 / 4 extension rounds | `agentic-loop.ts:277-302` |
| Demo rounds | `DEMO_MAX_ROUNDS` | `stream.ts:2778-2785` |
| Tool results | 8,000 characters each, 24,000 per round, at least 1,500 per result | `budgetToolResultsForModel`, `agentic-loop.ts:581-596`, used at `stream.ts:2441` |
| Memory | 3,500 characters | `stream.ts:906` |
| Surface block | summary 600; selection 1,000; 24 facts (key 60 / value 200); 24 actions of 120; surface id 80 | `surface-context-block.ts:48-56` |
| Route / authoring blocks | values 200; texts 400; 24 items | `context-blocks.ts:20-22` |

## 5. Smallest correct change to render `module_context` (in `stream.ts` only)

1. **Import.** Next to `:143-149`:
   `import { buildSurfaceContextBlock } from '../../services/ana-ri/surface-context-block.js';`
2. **Destructure.** Add `module_context,` to the list at `:473-492`.
3. **Append to the volatile suffix at `:945-948`, not to the cached prefix.** Facts, summary and a one-turn `selection` change every turn, so putting them in `messages[0]` would break the prompt cache on each turn. The function already returns `''` when the screen sends nothing and starts with its own `\n\n` (`:214-216`), so no guard is needed:
   ```ts
   const surfaceContextBlock = buildSurfaceContextBlock(module_context);
   const streamVolatileSuffix = memoryBlock + enrichment.block + surfaceContextBlock + (driveState.enabled ? … : …);
   ```
4. **Test, made to fail first.** The harness in `server/routes/ana-ri/__tests__/live-drive-turn.test.ts` mocks the orchestrator and context and captures `h.state.gatewayCalls[n].messages` (`:40`, `:61`, `:263`). A turn with `module_context: {surface, summary, selection}` should produce `## OBSERVED SCREEN STATE` in `messages[1]` and not in `messages[0]`. Without the change, the test fails.
5. **Out of scope for the smallest change:** retiring or wiring `buildChatContext`, correcting its `:5` docblock, and correcting the CI gate header at `check-ana-surface-context.mjs:8`.

## 6. How the client sends these fields

**`module_context`**
- `V2App.tsx:698-713`: `useActiveSurfaceContext(activeId)`, passed through `toModuleContext` (`surfaceContext.ts:221-227`), which gives `{surface, summary, facts?, available_actions?}`. `screen_actions` from `advertisedScreenActions(activeId)` is added on top, and the result is passed to `useAnaChat({ moduleContext })`.
- `useAnaChat.ts:904` sends `module_context: options.moduleContext`. The option is defined at `useAnaChat.types.ts:566-569`. It is hook-level only: `AnaSendOptions` (`:713-725`) has no per-turn `moduleContext`, so a one-turn `selection` cannot be sent today.
- **The editor's own chat sends keys the block ignores.** `DocumentWorkbench.tsx:1205-1220` builds `{surface:'document-authoring', documentId, documentTitle, sectionId, sectionCode, sectionTitle, screen_actions}`. `buildSurfaceContextBlock` only reads `surface`, `summary`, `facts`, `available_actions`, `screen_actions` and `selection`. Even after the §5 change, it would render only `Surface: document-authoring` plus the screen actions, and drop the document and section identity. Those values would have to move into `facts` or `summary` to be rendered.
- `ConversationThread.tsx` does not call `usePublishSurfaceContext` (not found). It runs on the shell chat (`:861`), so its `module_context` is whatever V2App derives for the active surface.
- The editor's "Ask for a source" (`RichSectionEditor.tsx:2216-2220`) still puts the selection into the message, as `surface-context-block.ts:111-116` says.

**`authoring_context`**
- `DocumentWorkbench.tsx:1153-1173` builds an `AuthoringContextPack`: `projectId`, `workflowStage: 'section-workspace'`, `artifactId` (the open document's id), `artifactStatus`, `moduleCode`, `sectionCode`, `sectionTitle`.
- That pack reaches the server two ways:
  - the editor's own chat (`useAnaChat({authoringContext})`, `:1222-1226`)
  - `onEditorBridge` (`:1184-1200`), which `ConversationThread.tsx:892-898` forwards per turn as `anaChat.send(text, files, { authoringContext })`. This only happens while the editor is open (`:884`).
- `useAnaChat.ts:811` resolves `sendOpts?.authoringContext ?? options.authoringContext`. It is then unpacked (`:812-841`) into:
  - `project_context`
  - `document_context`: `{section, module}`
  - `authoring_context`: `projectId, workflowStage, artifactId, artifactVersionId, artifactStatus, sectionCode, moduleCode, sectionTitle, regulatorBody, domainTrack, submissionType`
  - legacy `context.*` fields (`:905-919`)
- The unpacking drops `readiness`, `contradictions`, `dossierId` and `linkedSectionCodes` from the pack (`shared/types/authoring-context.ts:59-86`). So `context-blocks.ts:93-112` never gets readiness or contradiction data from this client.

**Side finding: some project-scoped blocks are skipped for UUID program ids.** `prefetchRouteIntelligenceContext` uses `Number(projectId)` (`chat-context-builder.ts:139`, `:149-153`). With a UUID program id (the workbench's `projectIdForOutline = programId`, `DocumentWorkbench.tsx:767`) that is `NaN`. Feedback, project profile, RIM and decision context are then skipped. The intelligence prefix resolves program ids properly (`intelligence-prefix.ts:22-29`); the bootstrap does not (`stream.ts:1083-1090`, where a UUID gives `undefined`).

### edit-path
I couldn't run anything, so every finding below comes from reading the code, with file:line cited. **Recommendation:** AnA proposes, the browser applies the proposal as an AnA-attributed redline in the editor that already has the section open, and the person's normal save is the only write. A server tool that writes suggestions is a second step, only for sections that are not open, and only after the save path is hardened.

## 1. The section save route (`PATCH /sections/:sectionId`, `server/routes/authoring.router.ts:1801-2206`)

- **Access checks:** a middleware on the `/sections/:sectionId` prefix runs for PATCH, POST and DELETE.
  - It refuses a frozen or approved document with `DOCUMENT_FROZEN`, via `checkSectionWritable` (`:432-484`).
  - It then calls `canEditSection` (`:318-399`), which checks the user, the tenant, that the section exists, the record lock (`LOCKED_DOCUMENT_STATUSES`, `document-lock.ts:55`) and, when per-user permissions are enforced, `decideAuthoringPermission`.
  - **An AnA tool handler does not pass through this router, so none of these checks apply to it.**
- **Concurrency: the premise "no optimistic concurrency" is partly wrong.**
  - The check is opt-in through `expectedUpdatedAt` (`:1856-1875`) and answers 409 `SECTION_CHANGED`.
  - The editor does send it (`DocumentWorkbench.tsx:2341`), and on 409 it tells the person to reload and reapply their changes (`:2425-2433`).
  - **Race window:** the check reads the row with a plain query outside the transaction (`:1823-1826`). The later `UPDATE` matches only on id and tenant (`:2016-2021`), with no `updated_at` condition and no `FOR UPDATE` lock. Two saves made with the same timestamp can both get past the check.
- **Reason for change:** required on any content change through `requireGovernedReason` (`:1983-1990`). The client enforces at least 8 characters on every save path (`DocumentWorkbench.tsx:2304-2311`).
- **Images:** `refusedFigures` rejects any image that is not an uploaded figure (`:1959-1973`, `authoring-html-sanitizer.ts:129-141`). The PATCH content is **not** otherwise sanitized. Only the from-draft path calls `sanitizeAuthoringSectionHtml` (`authoring-from-draft.ts:252`).
- **One transaction** (`:2033-2185`) contains, in this order:
  1. `createRevision`, with origin `ai-draft-accept` when the client names machine contributors, otherwise `human-edit` (`:2050-2058`).
  2. The `UPDATE` (`:2061`).
  3. The lineage gate `enforceAuthorLineage` with `acceptedMachineText` (`:2069-2076`).
  4. `commitSectionToFiling` (`:2083-2096`).
  5. The Part 11 audit record (`createAuditTrail`) with before and after content (`:2103-2114`).
  - Any failure rolls everything back with 500 `LINEAGE_REQUIRED` (`:2167-2182`).
- **Revision is written before the row lock.** `createRevision` reads the current chain head (`authoring-evidence.ts:369-374`) before the `UPDATE` takes the row lock. `revision-ledger.ts:34-36` claims writers serialize on that lock, but on this path they don't, so concurrent saves can fork the chain. `verifyLedger` would report the fork as `link-mismatch` (`revision-ledger.ts:134-136`).
- **Who wrote accepted text:** the client sends `acceptedAuthors` and `acceptedMachineText`. The server keeps only machine author ids it recognises, which today is only `'ana'` (`revision-ledger.ts:168-200`, `:228-240`).

## 2. How tracked changes are stored

- **Marks:** `insertion` is written as `<ins class="rse-ins">` and `deletion` as `<del class="rse-del">` (`suggestions.ts:116-153`).
  - Attributes: `data-author-id`, `data-author-name`, `data-at` (rounded to the minute, `:78-81`) and `data-source-record` (`:87-112`).
  - The insertion mark excludes other insertion and deletion marks (`:121-125`).
- **Grouping and ids:** `collectSuggestions` groups adjacent spans by kind, author and turn record (`:174-223`). A change id is derived from the change's content, not stored: `changeIdOf` (`:771-789`).
- **The one door for AnA text:** `insertSuggestedContent(text, author)` (`:956-1001`).
  - It converts a small markdown subset into real nodes and replaces the current selection.
  - It sets the internal-action flag so the tracking plugin skips the step (`:992`, filter at `:1032-1039`), and it is excluded from undo.
- **Wrappers:**
  - `RichSectionEditorHandle.insertSuggestion` (`RichSectionEditor.tsx:135`, `:1497-1504`) refuses in source mode, on a non-editable editor, or once the editor is destroyed.
  - `EditorBridge.insert` (`DocumentWorkbench.tsx:667-677`, `:1180-1199`) passes it on.
  - Callers: `DocumentWorkbench.tsx:4483` and `ConversationThread.tsx:178-195`.
  - **There is no command for "replace this range with that", and no way to place text by anchor.** Find-and-replace while tracking is on attributes the change to the person, not to AnA (`findReplace.ts:17-23`).
- **Server sanitizer:** allows `ins` and `del` and keeps `data-*` attributes because that is DOMPurify's default (`authoring-html-sanitizer.ts:22-25`, `:66-69`).
- **The lineage gate ignores markup.** `detectSpans` runs over the raw stored HTML (`lineage-gate.ts:149`, `sentenceTraceabilityService.ts:274`). If a person saves while an AnA suggestion is still pending, the AnA text (and any struck `<del>` text) is recorded as that person's own assertion until it is accepted.

## 3. Accept and reject

- **Routes:** `POST /documents/:id/tracked-change-decisions` (`authoring.router.ts:6887-6958`) and `/bulk` (`:6965-7044`).
  - Both check the document lock and that the section belongs to the document (`:6922-6933`). They do not go through the section-prefix guard.
  - In one transaction they upsert `authoring_tracked_change_decisions` and write an audit row with the full proposed text and its hash (`recordTrackedChangeAct`, `:6781-6833`).
- **"Proposed by AnA" is verified only through a turn record.** `proposedByVerified` is true only when `sourceRecord` resolves to an `ana_turn_records` row in the same organization (`:6848-6869`, `authoring-record.ts:39-56`).
  - Turn record ids are created by the database when the turn finishes (`turn-record.ts:510-530`). **A tool running mid-turn cannot stamp a verifiable `data-source-record`.** It only has the run id (`AnaToolExecutor.ts:298`).
- **Decisions do not change content.** The text change from an accept or reject lands only on the next PATCH save, which requires a reason.

## 4. Governance tiers

- **Model gate:** `draft_authoring_document` is in `GOVERNED_CONTENT_WRITE_TOOLS` (`governed-write-tools.ts:41-42`), so an unapproved model is refused (`AnaToolExecutor.ts:470-475`).
- **Confirmation:** its register class is `confirm` (`tool-authorization.register.json`, site `authoring-from-draft.ts:229`). It is not in `REASON_REQUIRED_TOOLS` (`stated-reason-input.ts:103+`), so the tier is a plain yes (`governed-tool-gate.ts:135-137`).
  - It is held until `humanConfirmed` (`AnaToolExecutor.ts:484-491`), and the person needs an editor role (`:509-525`).
  - **It is a proposal only in the sense that a person confirms it.** Once confirmed it creates a new draft document with settled text, not redline suggestions. Lineage records it as AnA's draft (`authoring-from-draft.ts:257`), and the reason is a fixed system string, "Drafted by AnA in a conversation" (`:189-193`).
- **P0-12 ("every AnA write is a proposal"):** every write command is propose-only (`command-rbac.ts:440-457`). Tiers are confirm, reason or e-signature (`part11-governance.ts:149-214`).
  - Confirmation goes through `POST /api/ana-ri/governed-action`, which reads the parameters from the held run (`routes/ana-ri/utility.ts:567-700`).
  - The sign-off dialog shows the call's parameters, not a redline.
- **`section.update`** (`command-rbac.ts:327`, `mdx-command-handlers.ts:393`) writes 510(k)/CER kit sections, not `authoring_sections`, so it does not apply here.
- **No read, propose or edit tool for authoring sections exists.** I checked `propose_section_edit`, `get_authoring_section`, `update_authoring_section` and similar names in the register; none are there.
- **Precedent:** `POST /sections/:id/ai/draft/accept` (`authoring.router.ts:3565-3784`) replaces the whole section with no `expectedUpdatedAt`, no `refusedFigures` check and no required reason (UPDATE at `:3640-3643`).

## 5. How an open editor learns the section changed

It doesn't.

- The editor remounts only after its own revert or AI-draft accept (`DocumentWorkbench.tsx:2577`, `:2985`, key at `:4178`).
- `DocumentCanvas` re-reads after an AnA turn (`DocumentCanvas.tsx:280-287`), but the full editor embedded inside it gets no refresh signal (`:613-622`).
- So a server write while the editor is open shows up only as a 409 on the person's next save. Their unsaved work survives in the device cache, but they must reload and reapply it.
- **With live co-editing switched on** (`ENABLE_COLLAB_CRDT`, off by default, `hocuspocus-server.ts:57`, `:90`), the stored Yjs state takes precedence. Stored section content is used only when that state is empty (`RichSectionEditor.tsx:1001-1003`, `:1091-1093`). A server write would be silently hidden.

## 6. Defects found (by reading only)

1. **`insertSuggestedContent` deletes a selection without tracking it** (`suggestions.ts:990`). It replaces the selection inside a step the tracking plugin skips and undo excludes, so text the person had selected disappears with no deletion mark and no undo. Existing tests don't cover this (`__tests__/anaDraftStructure.test.ts`).
2. **The 409 check can be raced** (`authoring.router.ts:1823`, `:1857-1875`, `:2019`), as described in section 1.
3. **Revision written before the row lock** (`:2050` before `:2061`), contradicting `revision-ledger.ts:34-36`.
4. **Pending AnA suggestion text is recorded as the saver's own assertion** in lineage, as described in section 2.

## 7. Design options

**A. Proposal applied in the browser through the open editor (recommended default)**

- **Server:** a new tool, `propose_section_edit`.
  - Input: `{ sectionId, base: { updatedAt, contentSha256 }, anchor: { quote, prefix?, suffix? }, replacement }`.
  - It reads and checks (tenant, `checkSectionWritable`, `decideAuthoringPermission` with action `edit`) and writes nothing.
  - Register class `read` or `self` in `tool-authorization.register.json`.
  - Also add it to `GOVERNED_CONTENT_WRITE_TOOLS` so the approved-model gate still applies. `replacement` matches the free-text field pattern, so `governed-write-gate.test.ts` requires the tool to be classified one way or the other.
  - Add it to the launch-scope list (`ana-launch-scope.ts:59`).
- **Client, no new editor:**
  - Add a command in `suggestions.ts`, next to `insertSuggestedContent`: `proposeReplacement(from, to, text, author)`. It puts an AnA deletion mark on the anchored range and an AnA insertion after it.
  - Find the anchor with `computeMatches` (`findReplace.ts:74`) and refuse unless there is exactly one match.
  - Refuse if the editor's loaded `updated_at` or content hash differs from `base`.
  - Expose it on `RichSectionEditorHandle` (`RichSectionEditor.tsx:131-160`) and `EditorBridge` (`DocumentWorkbench.tsx:667-677`). Navigate with `embedded.focusSection` (`DocumentWorkbench.tsx:713-714`) and apply from `ConversationThread.tsx` (`:178-195`, `:880-892`).
- **Why it is safe:** the editor's buffer stays the only writer, so nothing gets overwritten. The person sees the redline in place. Accept and reject are recorded with `sourceRecord`. The save already carries the reason, `expectedUpdatedAt` and `acceptedMachineText`. P0-12 holds because the save is the person's own act.
- **Limits:** it only works when the section is open in a browser. Nothing is persisted until the person saves. `sourceRecord` attaches only after the turn ends, which `ConversationThread` already handles. It can't edit unattended across thousands of pages.
- **Fix defect 1 at the same time:** turn a non-empty selection into a deletion suggestion instead of deleting it.

**B. Server tool that writes tracked suggestions with a revision guard (only for sections not open)**

- **Shared save service:** move the PATCH core (`authoring.router.ts:1944-2185`) into a new `server/services/authoring/section-save.ts` that both the router and the tool call, so there is still one implementation. Harden it:
  - lock the row with `SELECT … FOR UPDATE` inside the transaction;
  - compare `expectedUpdatedAt` or the content hash inside the transaction;
  - add `AND updated_at = $expected` to the `UPDATE`;
  - write the revision after the lock.
- **Tool:** class `confirm`, added to `REASON_REQUIRED_TOOLS` and to `GOVERNED_CONTENT_WRITE_TOOLS`.
  - It runs the same lock and permission checks as `canEditSection`, but from the tool's context.
  - It builds `<ins>`/`<del>` markup exactly as the marks parse it (`suggestions.ts:87-153`), using jsdom (`authoring-html-sanitizer.ts:107-113`), then runs `sanitizeAuthoringSectionHtml`.
  - A new revision origin (e.g. `ai-suggestion`) needs an edit to `revision-ledger.ts:43-49`.
  - Lineage needs a pending-machine-text option in `lineage-gate.ts:49-73`.
  - It refuses when live co-editing state exists for the document.
- **Cost:** while an editor is open, the server write forces a 409 and a manual reapply. Proposals held for confirmation go stale (the guard catches this). The confirmation card shows parameters, not a redline. Turn-record verification is not available mid-turn.

**Order:** fix defects 1–3 first, then ship A, then B only if unattended multi-section proposals are needed. A also depends on read tools for authoring sections, which don't exist today. Under CLAUDE.md Rule 2, the implementing session must name the launch row it moves and the evidence it will file before starting.

### editor-scale-ux
**Long documents and Word-like editing in the existing editor (read-only survey, nothing edited)**

Short answer: the editor holds one section at a time and is reasonably Word-like inside that section. Navigation, search, view, export and the AI's ability to edit text across the document are all built around single sections, and nothing is virtualised. Everything below comes from reading the code; I ran nothing.

## 1. Outline tree: how much it shows, nesting, virtualisation

There are two lists in the left pane.

**The project's filing outline** (`DocumentWorkbench.tsx:3184-3256`)
- It renders `filing.flat.map(...)` (`:3189`), which is every node of the tree walked depth-first (`useFilingOutline.ts:125-135`). There is no limit on the number of nodes.
- It **does nest**: children are attached through `parent_key` (`useFilingOutline.ts:94-118`) and indented by `paddingLeft: 10 + node.depth * 12` (`DocumentWorkbench.tsx:3203`).
- It cannot be collapsed. Every node is always shown, and there is no `aria-expanded` or collapse state in the workbench (grep finds none).
- Its height is capped at `maxHeight: '46%'` with its own scrollbar (`:3187`).
- A node is linked to a section only when the section's code matches the node key exactly (`useFilingOutline.ts:225-231`).

**The document's own sections** (`DocumentWorkbench.tsx:3386-3404`)
- This is a **flat** list. Every section gets `paddingLeft: 22` (`:3392`), so 3.2.S.1.1 is **not** nested under 3.2.S.1. The code is only shown as a label.
- No collapse, no filter box.

**Virtualisation:** none. `react-window` is declared in `package.json:603` but nothing under `client/src` imports it.

## 2. Is everything loaded when a document opens?

Yes.
- `GET /docs/:docId/sections` selects `s.content` for every section, plus three count joins, with no paging (`authoring.router.ts:1699-1749`). The workbench calls it once per document (`DocumentWorkbench.tsx:1424-1460`).
- Only one `RichSectionEditor` is mounted, for the open section (`:4175`, keyed per section at `:4178`).
- On each change of `sections`, the workbench re-parses the HTML of every section above the open one to number citations (`:2059-2074`), and of every section to number tables and figures (`:2089-2101`).

## 3. Navigation

- **Tree:** clicking a section goes through the unsaved-work guard (`:3391`). A deep link scrolls the active row into view (`:1670-1675`).
- **AnA's commands:** AnA can do three things on this screen: open a document (`:1707`), open a section by code (`:1749`), and open the find bar in the current section (`:1777-1797`). It has no "go to text" or "go to page" command.
- **Find:** works inside **one section only**. The labels are "Find in this section" (`RichSectionEditor.tsx:2292, 2305`); the plugin is in `findReplace.ts:1-26`. Matches never cross a paragraph boundary. "Replace all" is a single undoable step and is tracked when track changes is on. There is **no find across the whole document** (not found).
- **Cross-references:** they point at a section, table or figure by id and update when the target is renumbered or retitled (`RichSectionEditor.tsx:256-282`). **Clicking one does not navigate**; it just places the cursor (`crossReferenceNode.ts:157`).
- **Comment anchors:** "Show in the text" only works for comments in the open section (`DocumentWorkbench.tsx:5385`), although comments are loaded for the whole document (`:1847-1868`).

## 4. Whole-document view

- A Section/Document switch exists (`:3478-3500`). The Document view shows every section in one scroll (`:3821-3903`).
- It is **read-only by design** (`:3822-3826`). Each section has an "Edit" button that switches back to single-section mode (`:3881-3887`).
- It renders the full HTML of every section through `AuthoredHtml`, with no virtualisation and no `content-visibility` in the CSS (`authoring-v2.css:302-400`).
- It has no table of contents, no find, and does not scroll to the active section: switching section or document resets the scroll to the top (`DocumentWorkbench.tsx:1051-1054`).

## 5. Page / print view

- **No page-layout view** (not found).
- The only print rules are generic ones in `client/src/index.css:992-1010`. They target `.ProseMirror`, not the Document view.
- There are no page breaks per section, no headers or footers, and no page numbers in the editor.

## 6. Export and import

- **Formats:** Word, PDF and XML only (`authoring-export.ts:21`; buttons in `AuthoringCreateExport.tsx:266-272`). **HTML export: not found.**
- **Only frozen or approved documents can be exported.** A draft gets a 409 (`authoring.router.ts:5708-5719`). The one route for a draft is file-to-vault (`:5820`).
- **Word export:**
  - Every section heading is Heading 1 whatever the depth of its code (`authoring-blocks-to-docx.ts:250-264`), so Word's navigation pane is flat.
  - It is built as one Word section (`authoring-export.ts:410`).
  - No table of contents, header, footer or page-number field (not found in `server/export` or `services/authoring`).
  - Bookmarks for cross-references and Word revisions for tracked changes are written (`authoring-blocks-to-docx.ts:250-271`).
- **PDF export:** HTML rendered to PDF on the server (`authoring-export.ts:423-470`).
- **Word import:** a server route `POST /import/docx` exists (`authoring.router.ts:7376`), but **nothing in `client/src` calls it**.
- **Footnotes are dropped** when pasting from Word (`__tests__/pasteFidelity.test.ts:28-36`).

## 7. Formatting in the section editor (`RichSectionEditor.tsx`)

- **Headings:** H1–H5 (`:777`, picker at `:2018-2023`). No automatic heading numbering (not found); the section code is the only number.
- **Text:** bold, italic, underline, superscript, subscript, highlight, alignment, bullet and numbered lists, links, symbols, undo/redo (`:2026-2198`).
- **Tables:** captioned tables (`:789-790`) with add/delete row and column, merge/split cells, header row/column and delete table (`:2101-2148`). Column resizing is turned off (`resizable: false`, `:790`).
- **Figures:** governed image upload (`DocumentWorkbench.tsx:2448-2470`). Table and figure captions are numbered across the whole document (`:2076-2101`).
- **Citations:** numbered across the whole document (`RichSectionEditor.tsx:284-311`).
- **Comments:** anchored to a text range, threaded, with resolve and reopen (`DocumentWorkbench.tsx:2523-2761`).
- **Track changes:** switched on per section through the `track_changes` column (`:2481-2520`). Only edits inside a paragraph are tracked; joining or splitting paragraphs, table changes and formatting apply directly without tracking (`suggestions.ts:39-45`, `RichSectionEditor.tsx:2241`).
- **Sections:** reorder is one step up or down at a time (`DocumentWorkbench.tsx:2871-2911`). There is no route to delete a section (not found).
- **Word count:** per section (`RichSectionEditor.tsx:2784`).

## 8. What DocumentCanvas shows for a document with hundreds of sections

- It fetches the document and **all sections with their content** (`DocumentCanvas.tsx:148-156`).
- The card shows an `<ol>` outline with **one row per section**, each marked Drafted, Not drafted or Updated (`:477-499`). The outline is flat, with no maximum height, scrolling or virtualisation (`authoring-v2.css:1523-1533`). Hundreds of rows would sit inline in the conversation.
- The body shows the first (or chosen) section only (`DocumentCanvas.tsx:360-362`). "Show all N sections" renders every section body in full (`:362, :520-523`).
- When the editor is open beside the conversation, the body is hidden (`:476`). Expanding mounts `DocumentWorkbench` pinned to this one document (`:19-31`, `:379`), so the flat tree and single-section editor described above apply.

## 9. Top 8 gaps, ranked by user impact, each with the smallest change to the existing editor

1. **Flat section tree that cannot be collapsed or virtualised** (`DocumentWorkbench.tsx:3386-3404`, and `:3189-3203` for the filing outline).
   - Change: in the existing `sections.map`, work out depth from the code (number of `.`-separated segments), indent by it, and keep a set of collapsed code prefixes; give the filing outline the same collapse.
   - Add a filter input above the tree.
   - Render the rows with the already-declared `react-window` once there are more than about 200.

2. **No search across the document.** Find is per section (`RichSectionEditor.tsx:2292`) and AnA's find command is per section (`DocumentWorkbench.tsx:1777-1797`).
   - Change: add a search box to the Document view that searches the section content already in memory. List hits grouped by section code; clicking a hit opens the section and runs `openFind(q)` once it has loaded (`openFind` already exists, `RichSectionEditor.tsx:162`).
   - Extend `authoring.find` to accept a document-wide scope the same way.

3. **AnA can only insert text at the cursor; it cannot propose replacing a specific passage in a named section.**
   - The bridge offers only `insert` (`DocumentWorkbench.tsx:667-677, 1191-1198`).
   - Likely defect (not run, worth confirming): `insertSuggestedContent` replaces the current selection (`suggestions.ts:956-1003`) in a transaction flagged with `SUGGESTION_ACTION_META`, and transactions with that flag are skipped by the tracking filter (`suggestions.ts:1031-1038`). If so, selected text is deleted **without** a tracked deletion.
   - Change: add `proposeReplace(findText, replacement, author)` to the editor's handle, reusing the match and replace path in `findReplace.ts` (which track changes already redlines). Expose it as a new `authoring.propose-edit` command that opens the section by code first.

4. **AnA's context names the open section but carries no content, selection or outline** (`DocumentWorkbench.tsx:1153-1173, 1205-1221`).
   - Change: add the current selection's text, plus the outline (code, title, drafted yes/no, built from `sections`), to `moduleContext`. Section content stays on the server and is read through the existing `GET /docs/:docId/sections`.

5. **The Document view is heavy and has no way to get around it** (`:3821-3903`).
   - Change: add `content-visibility: auto` to `.ed-full-sec` (`authoring-v2.css:308`) and a sticky table of contents built from `sections`.
   - Scroll the active section into view instead of resetting to the top (`:1051-1054`).
   - Keep it read-only.

6. **Cross-references cannot be followed** (`crossReferenceNode.ts:157`).
   - Change: on Ctrl/Cmd-click of `.rse-xref`, call a new `onNavigate(targetId)` prop that the workbench routes through its existing `requestLeave({kind:'section'})`.

7. **Word export is flat and only works after freeze/approval** (`authoring-blocks-to-docx.ts:262`, `authoring.router.ts:5708-5719`, `authoring-export.ts:21`).
   - Change: set the heading level from code depth (2.7.3.1 becomes Heading 4) and add a Word table-of-contents field plus a page-number footer.
   - Draft "review copies" (a draft Word or HTML export) would be a product decision, because the current block is a deliberate Part 11 rule.

8. **No print or page view; Word import has no screen in the app** (`index.css:992-1010`; `authoring.router.ts:7376` has no client caller).
   - Change: add `@media print` rules in `authoring-v2.css` for `.ed-full` (hide the tree and side panels, page break before each top-level section) and a Print button in the Document view.
   - Connect the existing docx import route to a "Import Word" item in `AuthoringCreateExport`.

Files surveyed: `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/editor/RichSectionEditor.tsx`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/editor/DocumentCanvas.tsx`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/editor/suggestions.ts`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/editor/findReplace.ts`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/editor/crossReferenceNode.ts`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/useFilingOutline.ts`, `/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/styles/authoring-v2.css`, `/home/user/ClinicalSageAI-2-replit/server/routes/authoring.router.ts`, `/home/user/ClinicalSageAI-2-replit/server/services/authoring/authoring-export.ts`, `/home/user/ClinicalSageAI-2-replit/server/export/authoring-blocks-to-docx.ts`.