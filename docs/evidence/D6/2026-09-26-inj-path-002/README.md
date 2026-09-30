# INJ-PATH-002 — no AnA tool opens a path outside its own tenant's workspace

Row **D6** (security). Finding INJ-PATH-002 (P0) in
`docs/audit-2026-07/12-findings-register.md`: the C2C-AI-003 workspace guard was
wired into one tool while its siblings read model-supplied paths unconfined —
an org-1 user could have AnA "build a document from the template at
`uploads/org-2/…`" and download org 2's dossier section.

## What was wrong, in full

The finding named six handlers. Tracing every AnA tool and the services it
reaches found more, and one that is not a path bug at all:

| Where | What the model could do |
|---|---|
| `build_from_template`, `generate_document` (no tenant context at all) | read any file as a template; `generate_document`'s XML mode wrote to a path built from the raw title |
| `insert_document_content`, `surgical_docx_xml_edit`, `insert_clause_template`, `validate_docx`, `verify_docx_against_source` | read any file (`input_docx_path`) |
| `fetch_template_and_fill` | read the path on the tenant's template row — and `PUT /api/templates/:id` let any user set that path from the request body |
| `start_legacy_import`, and its route twin `POST /api/mdx/imports` | hash and list any archive, storing another tenant's eCTD inventory in the caller's rows |
| `package_ectd_for_region` | ship any file inside the zip (`leaves[].source_path`); write the zip anywhere (`output_dir`, and an unsanitised `application_id` / `sequence` / leaf `file_name`) |
| `author_docx_native` | the Python worker opened any `![alt](<path>)` image in the content and embedded it |
| `convert_docx_to_pdf` | guarded, but to every tenant's `tmp/` and `uploads/`, lexically (symlinks followed); LibreOffice also overwrote a same-named PDF beside the output |
| `run_in_container` | output collection followed a symlink the script left in its work mount — `ln -s /etc/passwd out` came back as output |
| **`run_python_script`** | ran the model's Python **on the application host** as the server's user: every tenant's uploads and the server's environment under `/proc`. Its runtime's comment said production ran it in a container; nothing did |
| `file_chat_upload_to_vault` (name via `edit_spreadsheet`) | the Vault's local writer joined an unchecked file name — a traversal wrote outside the version directory, `_meta.json` replaced the ownership sidecar |
| `ocr_document_pages` | `languages[]` became `.traineddata` paths |
| scratch outputs of every document tool | written to `tmp/<kind>/<8 hex>/` shared by every tenant |

## What changed

**One confinement decision.** `server/services/ana/document-workspace.ts`
now takes the organization and accepts only that tenant's own directories —
`uploads/org-<id>/` and `tmp/<kind>/org-<id>/` — using `isPathWithin` and
`tenantPrefixDir` from `server/utils/document-file-roots.ts`, the decision point
the HTTP routes already use. The real path (symlinks resolved on the deepest
existing ancestor) must still be inside, and the real path is what callers
open. `anaScratchDir(org, kind)` is the one place scratch directories are named;
`workspaceFileName` the one sanitiser for names built from model input;
`workspacePathOrRefusal` the handler-facing form.

**Every sink.** Each tool above resolves its path through the guard and opens
the returned path; the builder writes only where its caller says
(`outputDir`); templates are stored under `uploads/org-<id>/templates/` and the
update route no longer takes a file path; the packager refuses path-shaped
file names and ids and checks extraction containment; the Vault writer refuses
a non-plain name; OCR refuses a malformed language code; LibreOffice converts
into a private directory; container outputs are opened `O_NOFOLLOW |
O_NONBLOCK` and checked on the handle; the worker's file-path image branch is
gone. `POST /api/mdx/imports` resolves through `resolveDocumentPath` with the
caller's organization.

**`run_python_script` runs in the container or not at all.** It now uses
`runInContainer` (`server/services/compute/containerExec.ts`, the executor
`run_in_container` uses: `--network none` unless opted in, read-only root,
capabilities dropped, non-root, only its own work mount). The host runtime that
`exec()`'d AnA's code — `workers/artifact-compute/python-script-runtime.py`,
`runPythonScriptIsolated`, the `python-script` profile — is deleted, not left
beside it. The tool remains; where `ANA_ENABLE_CONTAINER_EXEC` is not `true` it
answers that it is not available and runs nothing. Reachability of the
replacement is pinned by `server/services/ana/__tests__/run-python-script-container.test.ts`.
**Operational note:** `.env.example` sets `ANA_ENABLE_CONTAINER_EXEC=true`; a
deployment without Docker or without that flag loses scripting until it is
enabled.

**The ratchet the finding asked for.** `tests/ana-tool-tenant-and-path-scope.contract.test.ts`
reads every AnA tool handler: any that reads a `…_path` / `…_dir` argument or a
leaf's `source_path` must call the workspace guard, unless it is listed as
never touching the filesystem, with the reason — and a listed handler that
stops taking such an argument fails too. A structural test in
`sandboxEnv.contract.test.ts` pins that no host-side compute runtime
`exec`s, `eval`s or `compile`s supplied code.

## Red, then green

- `red-guard.txt` — the tenant-scoped guard cases against the old guard:
  **17 fail** (another tenant's upload and scratch, an `org-77` prefix, the
  old unowned layout, no organization, a symlink to another tenant and to `/etc`).
- `red-container-collect.txt` — the old collection logic inside the new
  function: the symlink case **fails**, having read `/etc/hostname` and the
  other directory's file through the links.
- `red-vault-put.txt` — the old Vault writer: **5 of 5** traversal / sidecar /
  absolute-name cases fail.
- `red-ratchet.txt` — with `start_legacy_import`'s guard removed, the ratchet
  names it.
- `green.txt` — the six new or extended files: **98 passed**.
  `green-suites.txt` — the AnA, compute, storage, OCR, packager, builder,
  template and route suites: 7388 passed; the one failing file,
  `artifact-status-approval-version.pglite.test.ts`, is outside this change
  and passes on its own (a PGlite timing failure under the parallel run).

Tests changed because their fixtures used paths the guard now refuses
(`/tmp/…`, `os.tmpdir()`): `verify-docx-*`, `package-ectd-for-region-withdrawal`
— moved into the tenant's workspace. The template upload test's 401 is kept by
checking the organization before multer runs.

## Hand-ons

- `server/services/compute/workerClient.ts` / `scriptWorker.ts` still stage
  fixed-runtime work in `os.tmpdir()` without cleanup; not model-addressable,
  not tenant data at rest for long, but untidy.
- `rasterize_page` and `pdf_overlay` report success and do nothing (P1-34
  hand-on 7, unchanged).
- Scratch files are never cleaned up; a retention sweep for `tmp/*/org-*/` is
  its own item.
