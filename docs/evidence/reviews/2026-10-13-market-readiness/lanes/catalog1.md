## Lane: Projects, Vault, Authoring

Everything here was traced cold from code. Scratch work is in `<scratch>/catalog1/`:
- `extract_client.cjs` pulls client URLs from the TypeScript AST, including concatenation and const base URLs.
- `xref.py` builds the server mount and route table and cross-references it against the client URLs.
- Outputs: `client_calls_ast.tsv`, `server_mounts.tsv`, `server_routes.tsv`, `client_xref.tsv`, `lane_all.tsv`, `broken_candidates.tsv`, `lane_server_routes_without_client.tsv`.

### Readiness score per app
- **Projects: 5/10.** Create, filing type, dashboard, activity and tasks are real, persisted, audited and role-gated. But nobody can invite a member or assign a role, the project cannot be edited after creation, and archive/delete exist on the server with no button. There are three parallel project APIs with two id-spaces, and there is no project-level access control.
- **Vault: 4/10.** The governance core is excellent. The file-management basics a GxP buyer expects are missing: versioning, check-out, delete, permissions, sharing, DOCX preview, large files, and submission file types. In the production infrastructure as written, every upload is refused with a 503 because no virus scanner is deployed.
- **Authoring: 5/10.** The editor is deep (tables, citations, cross-references, tracked changes, comments). E-signature re-verification is strong, and the AnA draft → canvas → editor → vault path is implemented. But every PDF export is a plain-text fallback stamped "Do not file". SSO and SCIM users cannot e-sign. An author can approve their own document with one signature. AI drafting is not grounded in the Vault. The DOCX has no table of contents, headers, footers or page numbers. Live co-editing is compiled off.

**Competitive bar**
- **Veeva Vault RIM / QualityDocs:** C2C is behind on major/minor versioning with check-in/out, configurable lifecycles, multi-approver routing with segregation of duties, PDF renditions with bookmarks, Office 365 co-authoring, and external portals. C2C is ahead on AI drafting with span-level source attribution, the deterministic CTD filing classifier with human confirm, per-document hash-chain verification visible to the user, and fail-closed honesty.
- **Box / Egnyte GxP:** C2C is far behind on basics: chunked uploads (theirs go to multiple GB), folder and drag-drop upload, previews for 100+ formats, expiring/watermarked links, per-folder ACLs.
- **Certara/Synchrogenix, Yseop, Weave:** C2C has section-level AI drafting with attribution. It lacks templates for the CSR (ICH E3), 2.7.4 and 2.3 QOS, and I found no TLF-driven drafting path (UNVERIFIED).
- **docuBridge:** C2C's PDF output is not submission-grade today (CAT1-02).

### What is genuinely strong (keep)
- **Project creation.** One transaction does the program insert, scaffold, submission spine, PM anchor and chained audit row. It is role-gated (`canCreateProgram`), and the filing type overrides a contradicting product class (`server/routes/c2c/projects.ts:620-990`). The client surfaces the scaffold-skip and anchor-skip notices honestly (`client/src/concept2cure/v2/surfaces/Projects.tsx:296-420`).
- **One governed ingest service** shared by HTTP and AnA (`server/services/vault/vault-ingest.service.ts`). It checks magic bytes, binds the declared type to the file name, and fails AV closed in production (`server/middleware/uploadSafety.ts:147-222`). Bytes are stored before the record is written. The Part 11 row is written in the same transaction. A re-upload never overwrites the record (`server/services/vault/vault-reupload.ts`).
- **Deterministic filing classifier:** it proposes a folder, a person confirms or moves it, and both steps are audited (`server/services/vault/vault-filing.service.ts` header; `VaultEditDetails.tsx`; `project-vault.ts:1682,1745`).
- **Vault full-text search** over the extracted text of uploaded documents, backed by a GIN expression index (`migrations/20260906_vault_documents_fulltext.sql:55-71`). A failed search returns a 500, never an empty result (`project-vault.ts:1376-1500`).
- **Per-document audit history** with chain verification shown to the user (`Vault.tsx:279-320`; `project-vault.ts:1507`). Downloads are audited and fail closed, and carry an `X-Content-SHA256` header (`project-vault.ts:1554-1655`).
- **Retention cron** snapshots before deleting and honours legal holds (`server/jobs/retentionCron.ts:60-180`). The legal-hold API writes chained audit rows (`server/routes/vault-legal-holds.ts`). Production storage is S3 (`terraform/stack/main.tf:179-183`).
- **Editor:** the TipTap TableKit, images, citations, cross-references and captions all work; tracked-change decisions (single and bulk) and comments with resolve are wired. Section saves use optimistic concurrency (`DocumentWorkbench.tsx:2159` → `authoring.router.ts:1864-1890`). Freeze refuses open comments and pending tracked changes (`authoring.router.ts:4065-4110`).
- **E-signature:** role authority check, password + MFA re-verification, lockout counting, account standing, printed name, and a digest bound to the content hash and frozen snapshot (`authoring.router.ts:603-619, 814-860, 4249-4365`; `server/services/part11/reverify-signer.ts`).
- **AI draft honesty:** retrieval status is reported as ok/empty/failed; attributions are structured and resolved only to retrieved sources; the model, provider and prompt SHA are parked with the draft (`authoring.router.ts:3180-3450`).
- **The AnA → canvas → editor → vault path** matches its design doc:
  - `POST /docs/from-draft` (`authoring.router.ts:1488`)
  - the `draft_authoring_document` tool (`AnaToolExecutor.ts:20103`)
  - `DocumentCanvas.tsx:265,377,450`
  - file-to-vault, which composes export and ingest and stamps a WORKING DRAFT notice on unsealed documents (`authoring-file-to-vault.ts:338-409`)
- **Contract integrity:** all 173 URL expressions in the lane surfaces resolve to a mounted route.
- **No fabricated records in lane code.** The `v2/fixtures/*` modules imported by lane files hold only labels, enums and helpers.

### Journey matrix

**Projects**
| Step | Status | Evidence | Note |
|---|---|---|---|
| Create project | WIRED | `Projects.tsx:324` → `c2c/projects.ts:620-990` | Transactional and audited. Quota check defaults to warn (`:700-725`). |
| Set type (IND/NDA/BLA/510k/MAA/CTA/MDR/IVDR…) | WIRED | `c2c/project-intake.ts:21-31`; `projects.ts:653-680` | The device/drug class is validated. |
| Invite members + roles | MISSING | `Projects.tsx:251-254, 697-707` ("Team assignment isn't available yet"); `projects.ts:1117-1165` | The team is free-text names in JSON with no user id. The sharing/members API in `concept2cure.ts:1912,2042` works on the integer `projects.id` space and nothing in v2 calls it. |
| Edit project (sponsor, application no., phase, dates) | MISSING | No PUT/PATCH among the `c2c/projects.ts` routes | `ProjectHome.tsx:1407+` shows "not recorded" for fields the user can never fill in. |
| Dashboard / activity feed | WIRED | `ProjectHome.tsx:1206-1210`; `projects.ts:1288-1330` (reads `audit_logs`) | |
| Tasks / assignments / due dates | WIRED | `TaskBoard.tsx:542` → `taskManagement.routes.ts:181`; `dueDateIso` at `TaskBoard.tsx:98-126` | Tasks with no assignee are auto-assigned by `getOptimalAssignee`. |
| Notifications | PARTIAL | `task-side-effects.ts:18-45` → `mdx_notifications`; `TaskTray.tsx:105-131` | In-app only. No email on assignment or review. |
| Archive / unarchive | PARTIAL | `projects.ts:1881,1893` | Server only; no client caller. |
| Delete | PARTIAL | `projects.ts:1908-1930` (soft delete, 409 if the project holds records) | Server only; no client caller. |

**Vault**
| Step | Status | Evidence | Note |
|---|---|---|---|
| Upload single | PARTIAL | `useVaultUpload.ts:92-104` → `vault-ingest.ts:148` | Works in development. Refused with 503 in production (CAT1-01). |
| Bulk / folder / drag-drop | PARTIAL / MISSING | `Vault.tsx:1163-1168` (`multiple` only); sequential loop at `useVaultUpload.ts:203-204` | No folder upload, no drag-drop, one document type per batch. |
| Large files / resumable | MISSING | `vault-ingest.ts:56,71` (50 MB, `memoryStorage`) | Extraction and OCR run synchronously inside the request. |
| Virus scanning | PARTIAL | Code fails closed (`uploadSafety.ts:203-221`); no scanner in `terraform/stack/main.tf:158-187`, docker-compose, `app.yaml` or Dockerfile | CAT1-01. |
| Versioning / check-in-out / history / restore | MISSING | The client never sends a version (`useVaultUpload.ts:93-100`). Different bytes under the same code get 409 "upload under a new version" (`vault-ingest.service.ts:456,574-586`). Lineage fields are refused (`vault-ingest.ts:167`). `Vault.tsx:1682-1697` says "No version-history endpoint". | There is a per-document audit history, but no version list. |
| Metadata / classification / CTD placement | WIRED | `VaultEditDetails.tsx:94` → `project-vault.ts:1745`; classifier plus confirm/move at `:1682` | |
| Full-text search | WIRED | `Vault.tsx:941` → `project-vault.ts:1376` | Postgres FTS over title, filename and extracted text. |
| Semantic search | PARTIAL | Chunking is off by default (`document-chunking.service.ts:36-39`; `server/startup/document-catalog-bootstrap.ts` header). Passage search is reachable only from the AnA tool (`ana/document-passage-tools.ts:125`). | Not in the Vault UI. |
| OCR | WIRED (UNVERIFIED at scale) | `server/services/ocr/*`; tesseract and ocrmypdf in `Dockerfile.optimized:64-76` | Synchronous, inside the request. |
| Preview PDF / DOCX | PARTIAL | PDF appears only in the editor's Project Files pane (`ProjectFilesPanel.tsx:192-306`); the Vault shows a text excerpt (`Vault.tsx:1483`) | No DOCX preview. |
| Per-folder / per-document permissions | MISSING | Only the org-role gate `requireEditorAccess` (`project-vault.ts:1682`); no ACL model | CAT1-13. |
| External sharing / data room | MISSING | No share-link, expiry or watermark route in `project-vault.ts` or `vault-ingest.ts` | |
| Download | WIRED | `project-vault.ts:1554-1655` | Audited, fail closed. |
| Bulk export | MISSING | Only the admin tenant export exists | |
| User delete / obsolete | MISSING | No DELETE route | |
| Retention | WIRED | `retentionCron.ts:120-134` | |
| Legal hold | PARTIAL | `vault-legal-holds.ts:246-248` | No client caller. |
| Audit trail view | WIRED | `Vault.tsx:279-320`; `project-vault.ts:1507` | |
| Storage provider in production | WIRED | S3 set in `terraform/stack/main.tf:179-183` | |
| "Import from Veeva / SharePoint with approval" | PARTIAL / UNVERIFIED | `Vault.tsx:1250-1265` only opens an AnA prompt; the connectors have search/fetch (`services/connectors/veeva-vault.ts`, `sharepoint.ts`) | I found no governed import pipeline. |

**Authoring**
| Step | Status | Evidence | Note |
|---|---|---|---|
| Create from template | WIRED | `AuthoringCreateExport.tsx:84,137`; `authoring-documents.ts:95-132,480`; 20 global templates in `intelligence/template-seeds.ts:123-458` | Includes 2.5, 2.7.3, 3.2.S, 3.2.P, IB, protocol outline, M1 for FDA/EMA/PMDA/MHRA/HC/Swissmedic, IND, 510k, PMA, Q-Sub. Missing 2.7.4, 2.7.1/2.7.2, 2.3 QOS, 2.4/2.6, CSR (ICH E3). |
| Rich editing | PARTIAL | `RichSectionEditor.tsx:52-66` (StarterKit, TableKit, sub/sup, align, highlight); `editor/citationNode.ts`, `crossReferenceNode.ts`, `captionNumbering.ts` | Footnotes reach the export only through paste; there is no insert UI. Paragraph styles are limited. |
| Real-time collaboration | PARTIAL (off) | `client/src/flags/featureFlags.ts:74-81` (`enabled:false`, compile-time); `hocuspocus-server.ts:55-61` (`ENABLE_COLLAB_CRDT` off); `DocumentWorkbench.tsx:2366,4126` | Socket auth is solid. REST presence rooms live in an in-memory Map (`realtime-collab.ts:280`). Locks persist to the DB (`:627-760`). |
| Comments / suggestions / tracked changes | WIRED | `authoring.router.ts:2462,2561,6337,6434`; `DocumentWorkbench.tsx:2419,2543,2848` | |
| AI drafting with citations to Vault evidence | PARTIAL | `authoring.router.ts:3233` calls `searchHybrid` without `projectId`, over `lumen_data_atoms` (`enhancedEmbeddingService.ts:567-583`). Vault chunks go to `vault.document_chunks` (`document-chunking.service.ts:250`). | A Vault upload never grounds the editor's AI draft (CAT1-08). |
| Review / approval with e-signature | PARTIAL | `Review.tsx:180` → `authoring.router.ts:3049` (records a review but does not change status). An APPROVER signature sets APPROVED and freezes (`:4359-4365`). | No segregation of duties; one signer is enough; SSO users cannot sign (CAT1-03, CAT1-07). The `/docs/:id/submit` workflow (`:5582`) has no v2 caller. |
| Version compare / redline | PARTIAL | `AuthoringRevisionDiff.tsx` (adjacent revisions within one section); `/docs/:id/diff-since-export` (`authoring.router.ts:4914`) | No document-level comparison between arbitrary versions. |
| Export DOCX | PARTIAL | `authoring-export.ts:328-416`; sealed documents only (`authoring.router.ts:5400-5415`) | Has bookmarks and internal hyperlinks. No TOC, header, footer or page numbers. |
| Export PDF | PARTIAL (degraded fallback) | `server/export/renderers.ts:100-130, 378-445`; package.json has `puppeteer-cluster` only (`:576`); no Chromium in `Dockerfile.optimized` | Every PDF is plain text with the banner "Do not file this rendering" (CAT1-02). |
| File into Vault | WIRED | `FileToVaultDialog.tsx:79` → `authoring.router.ts:5523`; `authoring-file-to-vault.ts` | The PDF format inherits CAT1-02. |
| File into a submission sequence | PARTIAL | `AuthoringPlaceIntoFiling.tsx:246-275` | The client orchestrates a snapshot into `coauthor_documents` and then a leaf PUT; the two steps are not atomic. |
| AnA draft → canvas → editor → vault | WIRED | See Strengths | Needs a configured AI provider. |

### Client→server broken calls
| Client call | Server | Status |
|---|---|---|
| Lane surfaces: Projects, ProjectHome, ProjectRecords, TaskBoard, TaskTray, CollabLauncher, Vault*, ProjectFilesPanel, DocumentAuthoring, Authoring*, editor/*, Review, TemplateLibrary, ArtifactsCenter, FilingsCatalog, ProtocolDev*, BiopharmaJourney/Project | 173 of 173 matched to a mounted route | **0 broken** |
| `GET /api/ana-ri/live-drive/state` (`V2App.tsx:742`) | `server/routes/ana-ri/utility.ts:524` (mounted through a mount-function idiom the script does not parse) | False negative; verified mounted. |
| Outside the lane: 51 candidates (`broken_candidates.tsx`→ see `broken_candidates.tsv`), mostly `/api/510k/estar/*`, `/api/ana-ri/*`, `/api/post-market/*`, `/api/regulatory-precedent-intelligence/*` | I checked 5 of these families by hand; all are mounted (for example `register-governance-routes.ts:67-71`, `ana-ri/stream.ts:313`). | Not adjudicated beyond those. Most come from mount idioms the script cannot parse (allSettled route maps, mount functions). |

I checked that the checker can fail. With synthetic client calls injected, it reported `POST …/documents/:p/checkout` as **NONE** and `PATCH /api/c2c/projects/:p` as **METHOD-MISMATCH** (no PATCH route exists).

The more useful signal is the reverse: server routes in the lane with no client caller (`lane_server_routes_without_client.tsv`, 128 rows). These include project archive/unarchive/delete, `concept2cure …/sharing/members`, `vault/legal-holds` (all three), `authoring/docs/:id/submit`, `c2c/projects/:id/evidence`, and the legacy `/api/vault/list|statistics`, which read `public.documents` with a hardcoded `storageLimit` (`misc-inline-routes.ts:88-150`).

### Findings

**CAT1-01 · P0 · Every Vault upload returns 503 in the production infrastructure as written**
- **Evidence:**
  - `uploadSafety.ts:203-221` rejects with 503 `FILE_SCAN_UNAVAILABLE` when `NODE_ENV=production` and no scan ran.
  - The scanner requires `CLAMAV_HOST` (`securityHealth.ts:225-231`); if it is unset the check is marked "skipped", non-critical, and boot and readiness stay green.
  - `terraform/stack/main.tf:158-187` has no `CLAMAV_HOST` and no clamd service.
  - `grep -rni clamav` over *.tf, *.yml, *.yaml and Dockerfiles returns nothing.
  - `NODE_ENV=production` is set in `terraform/modules/ecs-fargate/main.tf:142`.
  - The same gate covers Template Library uploads (`c2c/templates.ts:26`).
- **Impact:** The first action of any trial or pilot, uploading a document, fails. The health checks never show it.
- **Fix:** Deploy clamd (ECS sidecar or service) or S3 malware scanning, and set `CLAMAV_HOST`. In production, make the AV check critical in the boot self-test and add it to `/readyz`.
- **Effort:** S. **Dependencies:** infrastructure owner.

**CAT1-02 · P0 · All PDF exports are plain-text fallbacks marked "Do not file"**
- **Evidence:**
  - `renderers.ts:100-130` logs that no Puppeteer driver is installed.
  - package.json contains only `puppeteer-cluster` (`:576`); `puppeteer` and `puppeteer-core` are absent from package.json and node_modules.
  - `Dockerfile.optimized:64-76` installs LibreOffice but no Chromium.
  - `FALLBACK_PDF_NOTICE` is printed on page one (`renderers.ts:430-433`).
  - The authoring PDF path goes through this renderer (`authoring-export.ts:421-470`), as does file-to-vault with the PDF format.
- **Impact:** No filing-grade PDF: no tables, no images, no bookmarks, no styling. Authoring cannot produce a deliverable for a regulator.
- **Fix:** Render the PDF from the DOCX with the LibreOffice already in the image (headless `--convert-to pdf` with bookmark and hyperlink export), or ship `puppeteer-core` plus Chromium. Run veraPDF (already in the image) and eCTD PDF checks. Add a CI test that fails when a production-profile export uses the fallback.
- **Effort:** M. **Dependencies:** founder choice of renderer and page size.

**CAT1-03 · P1 (P0 for customers that mandate SSO) · SSO and SCIM users cannot e-sign**
- **Evidence:**
  - SAML just-in-time users are created with `passwordHash: saml:<uuid>` (`sso.ts:922`).
  - SCIM users get `scim:<uuid>` (`scim.ts:649-651`).
  - Signing requires a bcrypt password match (`reverify-signer.ts:180-201`, via `authoring.router.ts:814-828`).
- **Impact:** In an enterprise tenant on SSO, nobody can approve, freeze or sign.
- **Fix:** Re-authenticate at the identity provider for signing (SAML ForceAuthn, or OIDC `prompt=login` with `max_age`) and bind the assertion to the signature, or enrol a signing PIN. Record the method in the manifest.
- **Effort:** M. **Dependencies:** SSO lane.

**CAT1-04 · P1 · Vault versioning is a dead end**
- **Evidence:** See the matrix row: the client sends no version, different bytes under the same code get 409 "Upload it under a new version", and upload refuses lineage fields. There is no check-out, version list or restore.
- **Impact:** A user uploading a revised protocol hits an error they cannot resolve, or renames the file and loses lineage. This is basic GxP document control.
- **Fix:**
  - An "Upload new version" action; the server sets version and supersedes.
  - `GET …/documents/:id/versions` and a UI for it.
  - Restore by promoting a prior version as a new version, with a reason.
  - Check-out/check-in reusing the `collab_section_locks` pattern.
- **Effort:** L.

**CAT1-05 · P1 · The Vault cannot hold real submission content**
- **Evidence:**
  - Allowlist is `.pdf .docx .doc .txt .rtf .xlsx .xls .csv .md` (`vault-ingest.ts:53-55`): no `.xpt`, `define.xml`, `.zip`, `.pptx` or images.
  - 50 MB limit with multer `memoryStorage` (`:56,71`).
  - Extraction and OCR run synchronously inside the request (`vault-ingest.service.ts:350-375`).
- **Impact:** Module 5 datasets and large reports have to live somewhere else. Memory can blow up under concurrent uploads.
- **Fix:** Stream uploads to S3 (multipart or presigned), make extraction and OCR an async job, and widen the allowlist with per-type signature checks.
- **Effort:** M.

**CAT1-06 · P1 · Projects have no membership or role model, and access is org-wide**
- **Evidence:**
  - All reads check only the org (`c2c/projects.ts` handlers; `project-vault.ts:1376+`).
  - Only an org manager or the lead can mutate (`services/c2c/program-access.ts:54-61`).
  - The team is free text (`projects.ts:1117-1165`).
  - `project_members` cannot key a UUID program (`projects.ts:1103-1110`).
  - The sharing API (`concept2cure.ts:1664-2042`) sits on another id-space and has no v2 caller.
- **Impact:**
  - No invitations and no reviewer/approver roles.
  - A CRO with several sponsors in one org sees everything.
  - Non-lead authors cannot perform program-scoped mutations.
- **Fix:** A single `regulatory_program_members` table (public schema, `organization_id INTEGER NOT NULL`) with roles, enforced in the projects, vault and authoring routes. Invitation UI in the wizard and ProjectHome. Migrate the concept2cure sharing path onto it and delete the old one.
- **Effort:** L.

**CAT1-07 · P1 · Authors can approve their own documents, and one signature approves**
- **Evidence:**
  - `assertSigningAuthority` checks the org role only (`authoring.router.ts:603-619`).
  - The e-sign route has no author≠approver check and no check for required reviews (`:4249-4365`).
  - An APPROVER signature immediately sets APPROVED and freezes (`:4359-4365`).
  - A review decision does not change status (`:3049-3110`).
- **Impact:** Fails segregation of duties expected by QMS SOPs and auditors.
- **Fix:** Designated reviewers and approvers per document; all required reviews complete before an approval signature; author≠approver configurable per org; a multi-signature approval set.
- **Effort:** M. **Dependencies:** CAT1-06.

**CAT1-08 · P1 · AI drafting is not grounded in the project's Vault, and retrieval is org-wide**
- **Evidence:**
  - `authoring.router.ts:3233` calls `searchHybrid` without `projectId` (the project filter exists at `enhancedEmbeddingService.ts:567-570`).
  - It searches `lumen_data_atoms`; Vault uploads are chunked into `vault.document_chunks`, and chunking is off by default.
  - There are two retrieval stacks: the editor draft uses lumen atoms, the AnA tool uses Vault passages.
- **Impact:** A study report uploaded to the Vault is never cited by the editor's AI draft. A draft for program A can cite program B's material.
- **Fix:** Pass `projectId`. Use one retrieval path over Vault chunks, citing the Vault document id and page. Decide chunking-on for launch tenants.
- **Effort:** M. **Dependencies:** founder decision on embedding cost.

**CAT1-09 · P1 · DOCX export is not regulatory-grade**
- **Evidence:** `authoring-export.ts:328-416` and `export/authoring-blocks-to-docx.ts` build one section with default styles. There is no TableOfContents, Header, Footer or PageNumber (grep finds none).
- **Impact:** Every output needs manual Word rework: document ID and version in the header, "Page x of y", and a TOC for longer documents.
- **Fix:** Add the TOC field, header and footer (title, document ID, version, status, confidentiality, page x of y), and map styles from the Template Library spec (see CAT1-16).
- **Effort:** M.

**CAT1-10 · P2 · Project lifecycle UI is missing**
- **Evidence:** No edit route. Archive/unarchive/delete APIs exist (`projects.ts:1881-1930`) with no client caller.
- **Impact:** A trial user cannot correct the sponsor or application number, or close a project.
- **Fix:** A PATCH route with a reason for governed fields, plus three buttons.
- **Effort:** S.

**CAT1-11 · P2 · Parallel project and document stores (breaks the zero-duplication rule)**
- **Evidence:**
  - `/api/projects` (integer ids; `register-project-routes.ts:31-33`) is used by TaskBoard and CollabLauncher.
  - `/api/concept2cure/projects` (integer ids) is used by CommunicationCenter.
  - `/api/c2c/projects` (UUIDs) is used by Projects and ProjectHome.
  - `ProjectHome.tsx:1194-1203` documents the wrong-project hazard itself.
  - Document stores: `authoring_documents`, `coauthor_documents`, `concept2cure_artifacts`, `c2c_documents`, `vault.documents`, and the legacy `public.documents`.
- **Impact:** Wrong-project and orphaning bugs; filing needs snapshot copies.
- **Fix:** Make the `regulatory_programs` UUID the only project identity and retire the others per the working agreement.
- **Effort:** L.

**CAT1-12 · P2 · Live co-editing cannot be switched on without a rebuild**
- **Evidence:** A compile-time client flag (`featureFlags.ts:74-81`) plus the server flag. Presence rooms live in an in-memory Map (`realtime-collab.ts:280`), which breaks with multiple ECS tasks.
- **Fix:** Make the flag a runtime per-org setting, keep presence in Redis or the DB, and run a multi-client soak test.
- **Effort:** M.

**CAT1-13 · P2 · No per-folder or per-document permissions; database isolation of `vault.documents` is app-level (defer to the security lane)**
- **Evidence:**
  - Only the org-role gate applies.
  - `vault.documents` RLS is enabled but not forced (comment in `migrations/20260905_vault_documents_organization_id.sql:55-63`, not independently verified).
  - `core.can_access_program` is a `RETURN TRUE` stub in `db/migrations/000_gcc_bootstrap_core.sql:100-113`. Per the comment it is later redefined by 069 (UNVERIFIED).
- **Fix:** A folder and document ACL model on top of CAT1-06.
- **Effort:** L.

**CAT1-14 · P2 · No external data-room sharing, bulk ZIP export or DOCX preview**
- **Evidence:** No such routes exist; the Vault preview is a text excerpt (`Vault.tsx:1483`).
- **Fix:** Expiring, watermarked, view-only links with an audited viewer; an async ZIP export job; DOCX-to-PDF preview via LibreOffice.
- **Effort:** L.

**CAT1-15 · P2 · A user cannot withdraw or obsolete a mistaken upload, and legal holds have no UI**
- **Evidence:** No DELETE route; `vault-legal-holds.ts` has no client caller.
- **Fix:** A governed "withdraw/obsolete" action with a reason (a soft delete that respects holds and retention), plus an admin UI for holds.
- **Effort:** S–M.

**CAT1-16 · P2 · Draft Word export is blocked, and house-style templates never reach authoring exports**
- **Evidence:**
  - Export returns 409 unless the document is sealed (`authoring.router.ts:5400-5415`).
  - The Template Library's `renderDocxWithTemplate` is used only in `c2c/templates.ts:275`; `authoring-export.ts` has no template input.
  - "New document" lists only `/api/authoring/templates`.
- **Impact:** No Word draft for offline review. The "recreate your fonts, logo and margins" promise does not apply to authored documents.
- **Fix:** Allow a watermarked draft DOCX export, and add a formatting-template choice to export.
- **Effort:** M.

**CAT1-17 · P2 · Upload UX gaps**
- **Evidence:** See the matrix: no drag-drop, no folder upload, one document type per batch, sequential uploads with only an "Uploading…" indicator.
- **Effort:** S.

**CAT1-18 · P2 · Placing a document into a filing is a non-atomic client orchestration**
- **Evidence:** `AuthoringPlaceIntoFiling.tsx:246-275`.
- **Fix:** One server route (snapshot plus leaf in one transaction), or file the frozen Vault PDF directly (the `document_uuid` path already exists).
- **Effort:** M.

**CAT1-19 · P2 · No email notifications and no deep links**
- **Evidence:** `notification-service.ts` has no email fan-out. URLs carry only the surface id (`routing.ts:1-22`); the project lives in sessionStorage (`shellProject.ts:78-110`).
- **Impact:** A link like "please review this document" cannot open that document.
- **Fix:** Put the project and document in the URL, and send email on assignment and review.
- **Effort:** M.

**CAT1-20 · P2 · Template coverage gaps; templates are seeded at startup, not through migrations**
- **Evidence:** `template-seeds.ts` (20 templates); `startup/services.ts:414-415`.
- **Fix:** Add 2.7.1, 2.7.2, 2.7.4, 2.3 QOS, 2.4, 2.6, CSR (ICH E3), DSUR and RMP. Move seeding into `C2C_MIGRATION_FILES` with a row-count assertion (Rule 1 corollary).
- **Effort:** M.

**CAT1-21 · P2 · Authoring image uploads skip the fail-closed AV check the Vault uses**
- **Evidence:** `authoring.router.ts:6749` calls `scanBuffer` directly, which fails open.
- **Fix:** Use `assertUploadSafe`.
- **Effort:** S.

**CAT1-22 · P3 · Version compare is adjacent-revision, per section only**
- **Evidence:** `AuthoringRevisionDiff.tsx`.
- **Fix:** Document-level comparison between any two versions or frozen snapshots.
- **Effort:** M.

**CAT1-23 · P3 · No footnote insertion UI**
- **Evidence:** Export supports footnotes (`authoring-export.ts:357-365`), but they are only reachable through paste. Paragraph styles are limited.
- **Effort:** S.

**CAT1-24 · P3 · Hygiene**
- `v2/fixtures/` actually holds configuration; rename it.
- Two unused `ESIGN_MEANINGS` lists (`fixtures/review-data.ts:124`, `registryModel.ts:856`) include `VERIFIER`, which the server rejects (`authoring.router.ts:864`).
- `projects-management.ts:100` debug-logs full project rows.
- `AnaToolExecutor.ts` is 21,038 lines, `authoring.router.ts` 6,897 and `DocumentWorkbench.tsx` 5,383.
- The legacy `/api/vault/list|statistics` routes (`misc-inline-routes.ts:88-150`) should go.
- **Effort:** S.

### Recommended work orders (in order)
1. **WO-A: Production AV (CAT1-01, CAT1-21). S.**
   - Goal: uploads work in production and are scanned.
   - Scope: clamd sidecar/service or S3 malware scan; `CLAMAV_HOST` in `boot_environment`; AV critical in the self-test and `/readyz`; authoring images through `assertUploadSafe`.
   - Acceptance: under `NODE_ENV=production`, an EICAR upload gets 400 `FILE_SCAN_REJECTED`, a clean PDF gets 201, and `/readyz` goes red when clamd is stopped.
2. **WO-B: Filing-grade PDF (CAT1-02). M.**
   - Goal: authoring PDFs can be filed.
   - Scope: DOCX → PDF through LibreOffice (or Chromium); bookmarks and hyperlinks; embedded fonts; veraPDF gate.
   - Acceptance: exported PDF has no fallback notice, a bookmark per heading, working cross-reference links, and all fonts embedded; a CI test fails if the fallback runs under the production profile.
3. **WO-C: SSO signing (CAT1-03). M.**
   - Scope: identity-provider step-up re-authentication or a signing PIN.
   - Acceptance: a SAML just-in-time user signs after re-authenticating; the manifest records the method; a stale assertion is refused.
4. **WO-D: Vault versioning and admission (CAT1-04, CAT1-05, CAT1-15). L.**
   - Scope: new version, version list, restore, check-out/check-in, withdraw; streaming S3 upload; async extraction; wider allowlist.
   - Acceptance: v1 → v2 upload keeps lineage; restore creates v3 with a reason; a 500 MB PDF and an `.xpt` file upload; a check-out blocks another user's new version.
5. **WO-E: Project membership, roles and approvals (CAT1-06, CAT1-07, CAT1-10). L.**
   - Scope: membership table and API; invitation UI; project edit, archive and delete UI; designated approvers; author≠approver.
   - Acceptance: a non-member gets 404 on the project, Vault and documents when need-to-know is on; an author's APPROVER signature on their own document gets 403; approval requires the listed reviewers to be complete.
6. **WO-F: Vault-grounded AI drafting (CAT1-08). M.**
   - Acceptance: a draft for program A cites only A's Vault documents, by document id and page; a document uploaded to B is never retrieved for A.
7. **WO-G: Regulatory DOCX and house style (CAT1-09, CAT1-16). M.**
   - Acceptance: DOCX has a TOC field, header with document ID and version, and "Page X of Y" footer; the selected Template Library spec is applied; a watermarked draft export is allowed.
8. **WO-H: Consolidate project identity (CAT1-11). L.**
   - Acceptance: one project API; TaskBoard and CommunicationCenter keyed on the program UUID; the retired routes are deleted with named replacements.
9. **WO-I: GA polish (CAT1-12, CAT1-13, CAT1-14, CAT1-17, CAT1-19, CAT1-20). L/XL.**
   - Scope: runtime co-editing flag and shared presence; folder ACLs; data room; drag-drop and folder upload; deep links and email; template pack.

### Open questions for the founder
1. Which AV option do you want: self-hosted clamd or managed S3 malware scanning? And who owns it operationally?
2. For the PDF engine, LibreOffice (already in the image) or Chromium? Which page size (Letter or A4) and which eCTD PDF specification should exports target?
3. Do the pilot customers mandate SSO-only accounts? If so, CAT1-03 is P0. Which signing method is acceptable to their QA: identity-provider re-authentication or a PIN?
4. Should project visibility default to org-wide or need-to-know? CRO tenants with several sponsors need the latter.
5. Is self-approval ever allowed? Should segregation of duties be configurable per org?
6. Can Vault passage chunking and embedding be on by default for launch tenants, given the per-upload cost?
7. Are external data-room sharing and live co-editing in pilot scope, or GA?
8. Which templates must exist on day one of a pilot (for example 2.7.4, CSR E3, 2.3 QOS, DSUR)?
9. Should unsealed drafts be exportable to Word (watermarked) for offline review?
10. Do you confirm the `regulatory_programs` UUID as the single project identity, retiring `/api/projects` and `/api/concept2cure/projects`?