# Registration still to do: the three authoring read tools

**Status: not wired.** `server/services/ana/authoring-read-tools.ts` defines and registers `list_authoring_outline`, `read_authoring_section` and `search_authoring_sections`. Another session owns the four shared files below, so this change does not edit them. Until the lines below land, **AnA cannot call these tools**.

What happens if only part of it lands:
- **No definition in `ALL_ANA_TOOLS`:** the model is never offered the tools.
- **No `register*` call:** the executor has no handler for them.
- **No entry in the register:** the tools are treated as `confirm` (`toolAuthorizationOf`, `tool-authorization.ts:172-174`), so every read would ask the person for a yes.
- **Not in the launch inventory:** `ana-launch-scope.test.ts` fails.

All anchors below are at HEAD `d10de752c9` (2026-10-01). Re-check them before editing: these files move often.

## 1. `server/services/ana/AnaToolDefinitions.ts`

Add the import beside the document-catalog definitions import, which ends at **line 44** (`} from './document-catalog-tool-defs.js';`):

```ts
// Read-only outline / section / search over the open project's authoring store
// (authoring_documents + authoring_sections). Handlers registered from
// authoring-read-tools.ts (inject-and-sibling).
import { AUTHORING_READ_TOOLS } from './authoring-read-tools.js';
```

Add the spread to `ALL_ANA_TOOLS_RAW` (it starts at **line 1870**), directly after `SEARCH_DOCUMENT_PASSAGES,` at **line 2270**. That keeps the authoring reads next to the Vault reads they are described against.

```ts
  SEARCH_DOCUMENT_PASSAGES,
  ...AUTHORING_READ_TOOLS,
  CHECK_DOSSIER_CONSISTENCY,
```

## 2. `server/services/ana/AnaToolExecutor.ts`

Add the import beside the other sibling-module register imports, after **line 210** (`import { registerDocumentCatalogHandlers } from './document-catalog-tools.js';`):

```ts
import { registerAuthoringReadHandlers } from './authoring-read-tools.js';
```

Add the call after `registerDocumentCatalogHandlers(registerToolHandler);` at **line 15646**:

```ts
// The authoring store, read-only (outline / one section windowed / search),
// scoped to the open project — same injected-register pattern.
registerAuthoringReadHandlers(registerToolHandler);
```

The production pool is the default, a lazy `import('../../db.js').getPool()`, so the call takes no second argument.

## 3. `server/services/ana/tool-authorization.register.json`

The entries are in alphabetical order. Each new entry copies the shape of the existing read entry `list_app_screens` (`"class": "read"`, `"writes": "none"`, `"site"`). The `site` lines are those of the `register(...)` calls in `authoring-read-tools.ts`.

Insert before `"list_cmc_registers"` (**line 2418**):

```json
  "list_authoring_outline": {
   "class": "read",
   "writes": "none",
   "site": "authoring-read-tools.ts:329"
  },
```

Insert before `"read_governed_document"` (**line 2846**):

```json
  "read_authoring_section": {
   "class": "read",
   "writes": "none",
   "site": "authoring-read-tools.ts:330"
  },
```

Insert before `"search_chembl_compound"` (**line 3453**):

```json
  "search_authoring_sections": {
   "class": "read",
   "writes": "none",
   "site": "authoring-read-tools.ts:331"
  },
```

Why `read` and not `self`: `read_project_document` is `self` because it writes a read-coverage receipt. These three write nothing at all; every statement in `authoring-read.ts` is a `SELECT`.

## 4. `server/services/ana/ana-launch-scope.inventory.json`

The `tools.inScope` array is sorted. These tools act on the Authoring launch surface. Insert:

- `"list_authoring_outline",` before `"list_demo_scripts",` (**line 802**);
- `"read_authoring_section",` before `"read_governed_document",` (**line 871**);
- `"search_authoring_sections",` before `"search_chembl_compound",` (**line 941**).

## Suites to run after wiring

- `server/services/ana/__tests__/governed-write-gate.test.ts`. No input name matches `FREE_TEXT_FIELD`, so neither map needs an entry. `authoring-read-tools.test.ts` asserts this.
- `server/services/ana/__tests__/tool-authorization.test.ts`
- `server/services/ana/__tests__/ana-launch-scope.test.ts`
- `server/services/ana/__tests__/tool-registry-consistency.test.ts`, which reads `ALL_ANA_TOOLS_RAW` and checks for duplicate names.
- `server/services/ana/__tests__/authoring-read-tools.test.ts` and `server/services/authoring/__tests__/authoring-read.test.ts`

## Not covered by this wiring

- **Being offered on the turn** is plan step 2 (`stream.ts:1583-1607`, `send-message.ts:809-822`): pin the tools when an `authoring_context` or a project is present. Without that pin, the 50-tool selection cap can drop them on the turns that need them most.
- **MCP** calls handlers only by explicit name (`server/mcp/tools/runtime.ts:96-110`), so the tools are not exposed there.
