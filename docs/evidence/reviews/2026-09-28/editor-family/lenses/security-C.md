# Security lens: the editor family, the ProtocolDev family, 2026-09-28

Lens C covers the ProtocolDev family. Reviewed at `7087f46e2` (`concept2cure-v2` HEAD, clean tree).

- **Read-only.** Nothing in the repository was edited, created or deleted. No gate was run with `--write-baseline` or `--baseline`.
- **Reproductions.** Two ran from the session scratchpad and wrote nothing under the repository; `git status` was clean before and after.

## Scope actually covered

**The fifteen files, read in full (4,250 lines).** Under `client/src/concept2cure/v2/surfaces/`:
- `ProtocolDev.tsx` 1-233, `ProtocolDevCompliance.tsx` 1-210, `ProtocolDevDerivation.tsx` 1-457
- `ProtocolDevDesign.tsx` 1-317, `ProtocolDevForms.tsx` 1-392, `ProtocolDevPanes.tsx` 1-202
- `ProtocolDevProjections.tsx` 1-304, `ProtocolDevRegisters.tsx` 1-294, `ProtocolDevReviews.tsx` 1-158
- `ProtocolDevSection.tsx` 1-283, `ProtocolDevShared.tsx` 1-55, `ProtocolDevSigning.tsx` 1-112
- `ProtocolDevSoa.tsx` 1-284, `ProtocolDevWorkspace.tsx` 1-524, `ProtocolDevWrites.ts` 1-425

**Imported client code, read only as far as a traced path needed:**
- `editor/RichSectionEditor.tsx` 1-120, 320-939, 1030-1230, 1300-1320, 1868-1897. These cover the text-format load and save, the crash cache and its restore notice, "suggest a source", and the paste transforms.
- `editor/roundTrip.ts` 365-380; `surfaceContext.ts` (all); `surfaceActions.ts` 1-80 plus its exports; `download.ts` (all)
- `V2App.tsx` 1000-1069; `lib/queryClient.ts` 237-245, 361-420; `services/portal/authService.tsx` 137-219, 980-995; `hooks/useEsignature.ts` 15-60

**Imported client code checked by grep only** (for raw-markup, URL, storage and fetch sinks): `ProtocolGov.tsx`, `C2CForm.tsx`, `toast.tsx`, `dataConnect.tsx`, `_shared/components/EsignModal.tsx`, `ProtocolRegisterForms.tsx` (plus its route map, 9-14 and 165-203), `IrbPackage.tsx`, `biostatBridge.tsx`.

**Server code traced.**

Session and tenant key:
- `server/auth.ts` 186-296
- `middleware/enterprise-security.ts` 542-615; `middleware/tenantContext.ts` 92-173; `middleware/orgMembership.ts` 472-535
- `middleware/authBoundary.ts` 148-240; `startup/middleware.ts` 145-170
- `bootstrap/register-inline-routes.ts` 360-380, 580-745, 1000-1030

Routes:
- Read in full: `routes/protocol-dev.routes.ts`, `protocol-development.ts`, `protocol-reviews.ts`, `protocol-soa.ts`, `protocol-budget.ts`, `protocol-export.ts`
- Partly: `protocol-risks.ts` 80-104; `protocol-deviations.ts` 120-160; `study-design.ts` 380-431 and 525-610; `tenant-users.ts` 51-96 and 330-408; `c2c/exports.ts` 1-200
- Route lists only: `protocol-milestones.ts`, `protocol-amendments.ts`
- AnA routes: `ana-ri/stream.ts` 460-500; `ana-ri/utility.ts` 222-246 and 560-700

Services:
- Protocol development:
  - `protocol-development-service.ts` 56-395
  - `protocol-signature.ts` (all)
  - `pdev-view-assembler.ts` 60-66, 380-450, 535-550
  - `design-derivation-service.ts` 60-125 and 184-238
- Registers:
  - `protocol-reviews-service.ts` (all); `protocol-soa-service.ts` 1-75; `protocol-budget-service.ts` 25-55
  - `protocol-risks-service.ts` 38-80; `protocol-deviations-service.ts` 96-180
  - `protocol-amendments-service.ts` 61-77 and 125-157; `protocol-milestones-service.ts` 26-36; `protocol-templates-service.ts` 40-99
- Study design and export:
  - `study-design-repository.ts` 250-300 and 364-377
  - `protocol-export-service.ts` 25-57; `protocol-export-logic.ts` 64-86; `export/exportReviewGate.ts` 27-124
- Signing and governance:
  - `governance/separation-of-duties.ts` 117-141, 185-300, 331-341
  - `part11/signature-persistence.ts` 545-608 and 790-800; `part11/reverify-signer.ts` 237-267
  - `routes/c2c/actions.ts` 270-420; `tenant/governed-tenant-context.ts` (all)

AnA:
- `ana-ri/surface-context-block.ts` (all)
- `ana/AnaToolDefinitions.ts` 2728-2834
- `ana/AnaToolExecutor.ts` 338-369, 10032-10035, 10668-10676, 11509-11524, 11601-11632
- `ana/tool-authorization.register.json` (the protocol entries); `ana/notifications-study-memory-tool-defs.ts` 391-400

Schema:
- `migrations/20260629_protocol_reviews.sql` 17-52; `migrations/20260702_protocol_budget.sql` 31-43
- `migrations/20260701_protocol_soa.sql` (checked: it defines no trigger)
- `db/migrations/20260801_tenant_isolation_sweep.sql` 160-190; `scripts/ci/check-tenant-isolation.mjs` 1-25 and 88-173

**Gates run (read-only).**
- `ci:tenant-isolation:no-regression`: pass (8 current, 8 baseline)
- `ci:unauthenticated-fetch`: pass (70 raw `fetch()` calls scanned, 0 baselined)
- `ci:sign-ceremony`: pass (23 baselined sites, unchanged)

**Reproductions.** These live in the session scratchpad and are not committed:
- **Viewer writes:** `<scratch>/editor-review/viewer-writes.secC.test.ts`, run with `vitest.secC.config.mts` from the same folder.
  - It drives the real protocol-development, deviations, budget and reviews routers.
  - The role is set exactly as `server/auth.ts:278-290` sets it, and the domain services are stubbed.
  - Result: 6/6.
- **Budget-params upsert:** `…/scratchpad/editor-review/secC-budget-params-rls.mjs`.
  - It runs PGlite (PostgreSQL 16 in WebAssembly) with the migration's DDL and the sweep's policy verbatim.
  - It uses a `NOSUPERUSER NOBYPASSRLS` role and `setBudgetParamsTx`'s SQL verbatim.

**Lens items with nothing to report.**
- **Raw markup.** None of these appear in the fifteen files or in the primitives they render through: `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `postMessage`, `window.open`, or a data-built `href`/`src`. Every stored, AI-derived or engine string reaches the DOM as React text.
- **Section text.** The section body is a plain-text column. The editor escapes it on load (`roundTrip.ts:373-380`) and saves `getText()` (`RichSectionEditor.tsx:345-357`), so pasted links and images never persist.
- **Tenant key.**
  - It is always the session's (`auth.ts:278-290`).
  - A mismatched `x-organization-id` header is refused with 403 (`enterprise-security.ts:559-608`).
  - The one org id the client chooses, for the reviewer list (`ProtocolDevForms.tsx:354-361` → `GET /api/tenant-users/:id`), is checked for membership on the server (`tenant-users.ts:51-78, :373`).
- **Fetches.** All go through the authenticated `apiRequest`.
- **Downloads.** File names are sanitised (`download.ts:28-34`). Files are saved through an `a[download]` anchor, with the server's MIME type or an explicit one.
- **AnA screen actions.** `act_on_screen` directives are re-resolved against the shared registry (`surfaceActions.ts:1-33`). The one action registered here, `protocol-dev.open-section`, only switches the open section.
- **Globals.** The three `window` globals at `ProtocolDev.tsx:231-233` have no runtime reader.

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| SEC-C-1 | blocker | `ProtocolDevWorkspace.tsx:316-318`; `server/bootstrap/register-inline-routes.ts:592-738`; `server/routes/protocol-*.ts` | All 24 write routes this screen calls accept a `viewer`. Only the two signed acts check role (reproduced) |
| SEC-C-2 | blocker | `ProtocolDevSoa.tsx:48-54, 243-251`; `server/services/protocol-soa/protocol-soa-service.ts:28-59` | A finalized, signed protocol's schedule of assessments still accepts new rows and cell changes, and the header still reads finalized |
| SEC-C-3 | high | `ProtocolDevWrites.ts:287-298`; `server/services/protocol-budget/protocol-budget-service.ts:40-53`; `migrations/20260702_protocol_budget.sql:43` | The budget-parameter upsert is keyed on the document id alone and never proves the document is the caller's. Another tenant can permanently block this write under row-level security (RLS), or overwrite it where RLS is not enforcing (reproduced) |
| SEC-C-4 | medium | `ProtocolDevWorkspace.tsx:141-142`; `ProtocolDevSection.tsx:236`; `ProtocolDev.tsx:143-145`; `RichSectionEditor.tsx:1314` | Stored protocol number, section title, programme name and selected section text reach AnA as the user's own words, outside the server's untrusted-data fence |
| SEC-C-5 | medium | `ProtocolDevSection.tsx:233-239` → `server/services/ana/AnaToolExecutor.ts:11524, 10032-10035` | The AnA section write behind "Draft with AnA" records either the model's reason or the fixed sentence "Protocol section edited via AnA". The person's confirmation collects no reason |
| SEC-C-6 | medium | `ProtocolDevSection.tsx:176`; `RichSectionEditor.tsx:325, 1082-1104, 1872-1883`; `authService.tsx:206-219` | Unsaved protocol text survives logout in `localStorage`, keyed by section id only. The next person on that browser is offered it as "the device draft", and it is saved under their name |
| SEC-C-7 | medium | `ProtocolDevForms.tsx:379-383`; `ProtocolDevReviews.tsx:40-54`; `pdev-view-assembler.ts:63` | A signed disposition is shown under a free-text label the assigner typed, not under the name of the person who signed |
| SEC-C-8 | low | `ProtocolDevWrites.ts:198-205, 272-285, 302-314`; six services | Six create paths insert against a document id they never prove is the caller's, and skip the finalized check |

### SEC-C-1 — a viewer can make every governed write on this screen except the two signatures

**What the code does.**
- **Client.** Writability is decided from the document id alone (`ProtocolDevWorkspace.tsx:316-318`):
  ```
  // The write routers key on the numeric protocol_documents id.
  const numericDocId = Number(doc.id);
  const canWrite = Number.isInteger(numericDocId) && numericDocId > 0;
  ```
  None of the fifteen files reads the org role (grep: no `viewer` or `userRole`). A viewer is therefore offered:
  - every drawer
  - the section editor (`ProtocolDevSection.tsx:86-87`)
  - the schedule grid (`ProtocolDevSoa.tsx:243`)
  - "Start a protocol" (`ProtocolDev.tsx:159`)
- **Mounts.** All eight routers this screen writes through are mounted with `authMiddleware` only (`register-inline-routes.ts:592, 601, 612, 621, 630, 711, 729, 738`). The global `/api` boundary authenticates and sets the tenant; it applies no role or method gate (`authBoundary.ts:148-240`).
- **Routes.** Those routers have 37 mutating routes. `requireEditorAccess` appears on only two: finalize (`protocol-development.ts:496`) and disposition (`protocol-reviews.ts:165`). The 24 routes this screen calls have no role check:
  - `protocol-development.ts`: 183, 242, 266, 281, 328, 358, 374, 387, 400, 414, 430, 446
  - `protocol-soa.ts`: 57, 70, 81
  - `protocol-risks.ts`: 85, 105
  - `protocol-deviations.ts`: 98, 124
  - `protocol-budget.ts`: 58, 71
  - `protocol-reviews.ts`: 106
  - `protocol-milestones.ts`: 57
  - `protocol-amendments.ts`: 97
- **Services.** No service checks role either. A grep of the protocol services finds role references only in the signing path and in the reviewer-eligibility check (`protocol-reviews-service.ts:60-74`).
- **AnA door.** The AnA route into the same write, `update_protocol_section` (`AnaToolExecutor.ts:11509-11524`), has no role check. `runConfirmedTool` does not pass a role to the handler (`ana-ri/utility.ts:233-240`).

**Why it matters.** The product says a viewer is read-only:
- `middleware/orgMembership.ts:482-485`: "`viewer` is the one org role this set excludes, and it is the whole line: a viewer reads, everyone else in the organization can work".
- `middleware/auth.ts:370`: "viewer → nothing (read-only is the point)".

Protocol development is a launch-catalog surface (`shared/constants/launch-scope.ts:77`). A viewer can:
- mark every section `complete`, which is what the finalize completeness gate counts (`protocol-development-service.ts:336-350, 378-381`);
- record a deviation's severity and its effect on subject safety, which decides whether a prompt IRB report is indicated (`protocol-deviations-service.ts:128-150`);
- bind or unbind the study design;
- apply a derivation that rewrites the study-design object itself (`design-derivation-service.ts:214-237`).

Each act is recorded in the ledger under the viewer's id, so it is attributable. What is missing is the 21 CFR 11.10(g) authority check the product claims. Earlier gaps of the same kind were fixed:
- on the Vault services, in `370d9a75`;
- on the QMS routes, which the 2026-09-24 part11-ux review rated blocker (Q2).

**Evidence (reproduced with the scratchpad harness, org role `viewer`).**
```
CONTROL finalize                        -> 403, nothing written
PATCH sections/7 as viewer              -> 201 ["updateSectionTx","LEDGER:update:protocol-section:7"]
POST deviations/3/assessment as viewer  -> 201 ["assessDeviationTx","LEDGER:update:protocol-deviation:3"]
POST design-derivation/apply as viewer  -> 201 ["applyDerivationTx","LEDGER:update:study-design:S1"]
PUT budget params as viewer             -> 201 ["setBudgetParamsTx","LEDGER:update:protocol-document:5"]
POST reviewers as viewer                -> 201 ["assignReviewerTx","LEDGER:create:protocol-document:5"]
```
The control case shows the harness does detect a role gate where one exists.

**Smallest fix.**
- Add a router-level `requireEditorAccess` for non-GET methods in each of the eight protocol routers. That cannot miss a route; per-route guards can.
- Carry the org role on `ToolContext` and refuse a viewer in the protocol tool handlers, as `370d9a75` did for the Vault services.
- Read the role on the client so a viewer is not offered the controls.

### SEC-C-2 — a finalized, signed protocol's schedule of assessments can still be changed

**What the code does.**
- **Client.** The schedule grid is editable whenever `canWrite` is true and a reason of at least 8 characters has been entered (`ProtocolDevSoa.tsx:243`). It does not look at `doc.status`.
  - Cell changes post to `/api/protocol-soa/cells` and `/cells/clear` (`:48-54`).
  - "Add assessment" posts to `/api/protocol-soa/documents/:id/assessments` (`:246-251` → `ProtocolDevWrites.ts:198-205`).
- **Server.** `addAssessmentTx`, `setCellTx` and `clearCellTx` (`protocol-soa-service.ts:28-37, 39-54, 56-59`) never read `protocol_documents.status`.
- **The lock exists but is only half applied.** `assertEditable` throws "Protocol is ${status}; create a new version to edit." (`protocol-development-service.ts:88-90`).
  - It is applied to adding, renaming and removing a visit, and to removing an assessment (`:271-273, 281-283, 296-298, 308-310`).
  - It is not applied to the three writes above.
  - There is no database trigger either (`migrations/20260701_protocol_soa.sql`).
- **The finalize signature covers exactly this content.** `signature-persistence.ts:600-601` hashes `protocol_soa_assessments` and `protocol_soa_cells`. The note at `:607` reads "sha256 over the protocol's content at signing time … SoA assessment(s) and … cell(s)".
- **The version record does not.** The finalize snapshot keeps sections only (`protocol-development-service.ts:383-386`).
- **The screen keeps showing it as finalized.** The read model returns finalized documents (`pdev-view-assembler.ts:386-392`, no status filter), and the header keeps printing the status and version (`ProtocolDevWorkspace.tsx:130, 139`).

**Why it matters.**
- After the signature (21 CFR 11.50 and 11.70), the schedule of assessments can gain rows and change cells with no new version and no new signature.
- The person is still shown a finalized protocol at the signed version. Nothing on this screen says the signature's bound digest no longer matches.
- The version table cannot show what the schedule was when it was signed.
- Together with SEC-C-1, a viewer can do this.

This overlaps the Part 11 lens. It is reported here because tracing this screen's writes reached it.

**Smallest fix.**
- In `addAssessmentTx`, `setCellTx` and `clearCellTx`, load the owning document (through the assessment's `protocol_document_id`) with the org predicate and call `assertEditable`, as the visit writers already do.
- On the client, render the grid read-only and hide "Add assessment" when `doc.status` is `finalized` or `superseded`.

### SEC-C-3 — the budget-parameter upsert lets one tenant block or overwrite another's

**What the code does.**
- **Client.** The screen sends the document id from the read model (`ProtocolDevWrites.ts:287-298`), but any signed-in session can send any id.
- **Route.** `PUT /api/protocol-budget/documents/:id/params` passes the id straight through (`protocol-budget.ts:70-81`).
- **Service** (`protocol-budget-service.ts:40-53`):
  ```
  INSERT INTO protocol_budget_params (organization_id, protocol_document_id, …) VALUES ($1,$2,…)
  ON CONFLICT (protocol_document_id) DO UPDATE SET
     target_enrollment = COALESCE($3, protocol_budget_params.target_enrollment),
     sponsor_payment_per_subject = $4, indirect_rate_pct = $5, updated_at = now()
  ```
- **Index.** The unique index is on the document id alone (`migrations/20260702_protocol_budget.sql:43`):
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_protocol_budget_params_doc ON protocol_budget_params(protocol_document_id);`
- **Missing proof.** Nothing checks that the document belongs to the caller's organisation.
- **Second door.** The AnA twin `set_protocol_budget_params` calls the same service with a model-supplied `document_id` (`AnaToolExecutor.ts:10668-10676`).
- **Precedent.** The codebase already fixed this exact pattern for study designs: "it had no tenant predicate, and a save naming another organization's study id overwrote that design" (`study-design-repository.ts:266-268`; the predicate is at `:295`).

**Evidence (reproduced in PGlite).** Tenant A is another organisation (org 1). Tenant B owns the protocol (org 2).
```
CASE 1  RLS enforcing; A names B's doc 500 before B has set parameters:
  A -> ok
  B -> "new row violates row-level security policy (USING expression) for table \"protocol_budget_params\""
  rows -> [{org 1, doc 500, 1, 1.00, 0.00}]
CASE 2  RLS enforcing; B sets parameters first, then A names doc 600:
  A -> refused (same error); B's row unchanged
CASE 3  RLS in shadow mode (app.rls_enforce not 'on'); B first, then A names doc 700:
  A -> ok; rows -> [{org 2, doc 700, target 1, pay 1.00, fa 0.00}]   (B's row, A's values)
CONTROL conflict key (organization_id, protocol_document_id); case 1 replayed:
  both -> ok
```

**Why it matters.**
- **Production.** Production sets `RLS_ENFORCE=on` (`terraform/stack/main.tf:159`). Under it, any signed-in user of any other tenant can make a protocol's feasibility parameters permanently unwritable for its owner.
  - Document ids are sequential, so future ids can be claimed in advance.
  - The owner sees the raw Postgres error text, because the route's 500 path returns `err.message` (`protocol-budget.ts:34-38`).
  - The attacker's ledger row lands in the attacker's own tenant, so nothing in the owner's audit trail explains the refusal.
- **Where RLS is in shadow mode.** The policy then admits every row (`20260801_tenant_isolation_sweep.sql:168-170`). The write becomes a silent cross-tenant overwrite of a governed register, with no audit row in the owner's tenant.
- **Why the gate misses it.**
  - `ci:tenant-isolation:no-regression` passes (8 of 8).
  - Its `TENANT_SCOPED_TABLES` list (`scripts/ci/check-tenant-isolation.mjs:88-173`) contains no protocol table.
  - The gate accepts any statement that names `organization_id` (`:5-25`), and this INSERT does. So it would pass even if the table were listed.

**Smallest fix.**
- Prove the document belongs to the caller before the upsert (`SELECT 1 FROM protocol_documents WHERE id=$1 AND organization_id=$2`, the `loadDoc` pattern).
- Re-key the unique index to `(organization_id, protocol_document_id)` by amending `20260702` in place with a dated note, as CLAUDE.md Rule 1 requires, and change the conflict target to match.
- Clean up any existing rows whose org differs from their document's org.
- Add the protocol tables to the gate's list.

### SEC-C-4 — stored document text reaches AnA as the user's own request

**What the code does.** Four controls build a prompt from stored strings and send it immediately as the clicking person's own chat turn. The send is `void anaChat.send(clean, files)` (`V2App.tsx:1042-1051`).
- **"Ask AnA" (protocol number).** `ProtocolDevWorkspace.tsx:141-142`:
  ```
  onClick={() => onAsk('Review ' + str(doc.shortTitle) + ' for completeness and list what blocks finalization.')}
  ```
  `shortTitle` is `protocol_number` (`pdev-view-assembler.ts:539`). Any member can set it when creating a protocol or on the cover page, up to 120 characters (`protocol-development.ts:173, 236`).
- **"Draft with AnA" (section title).** `ProtocolDevSection.tsx:236` builds `'Draft ' + (sec.title ?? 'this section') + ' for ' + (shortTitle ?? 'this protocol') + …`. Section titles come from organisation templates, which any member can write (`protocol-templates-service.ts:46-54`, cloned at `:57-75`).
- **Empty-state prompt (programme name).** `ProtocolDev.tsx:143-145, 160`.
- **"Suggest a source" (selected section text).** Reached through `ProtocolDevSection.tsx:178`; it sends `Suggest a source for this claim: "${s}"` (`RichSectionEditor.tsx:1314`).

On the server the user turn is only screened by default: "hard-block and content encapsulation are opt-in via PROMPT_INJECTION_ENFORCE / PROMPT_INJECTION_ENCAPSULATE (both default OFF)" (`ana-ri/stream.ts:470-473`). Neither variable is set in `terraform/` or `.github/workflows/` (grep: no hits).

When the same titles travel as screen context instead, the server fences them as data, because "Treating it as trusted would make it a prompt-injection channel" (`surface-context-block.ts:18-33`). These four paths go around that fence.

**Why it matters.** A member, or a template imported into the organisation, can plant an instruction in a protocol number or section title. Another person, possibly with more authority, then sends it as their own request with one click. The question that click asks is exactly "what blocks finalization", so AnA's answer about the protocol's readiness can be steered.

Existing limits hold, so the injected text cannot write without a click or send data out:
- Every protocol write tool is `confirm` and finalize is `refuse` (`tool-authorization.register.json:3767, 1945`; `AnaToolExecutor.ts:338-360`).
- The web tools are off by default and limited to agency domains (`AnaToolDefinitions.ts:2753-2803, 2828-2834`).

The injected text can still put a write proposal in front of the person. What the confirmation card shows was not traced.

**Smallest fix.**
- Stop inserting stored strings into the user turn.
- Say "the protocol open on screen" or "the open section" instead, and let AnA resolve names by id or from the fenced context.
- Send the editor selection in a separate field that the server fences the same way it fences `module_context`.

### SEC-C-5 — the AnA section write records a reason nobody gave

**What the code does.**
- **Entry point.** "Draft with AnA" (`ProtocolDevSection.tsx:233-239`, and the editor's empty state at `RichSectionEditor.tsx:2581-2586`) leads to the AnA tool `update_protocol_section`.
- **Tool schema.** `reason` is optional (`notifications-study-memory-tool-defs.ts:397-398`, `required: ['section_id']`).
- **Handler.** It records `reason: fcoiReason(input, 'Protocol section edited via AnA')` (`AnaToolExecutor.ts:11524`). `fcoiReason` substitutes that sentence whenever the model's reason is shorter than 8 characters (`:10032-10035`).
- **Confirmation.** For a tool, the confirm tier only checks `body.confirm === true` and takes no reason (`ana-ri/utility.ts:594-596`). It then runs the model's stored parameters (`:222-240`).
- **HTTP twin.** The same write over HTTP refuses a reason under 8 characters (`protocol-development.ts:92, 357`).

**Why it matters.**
- Section content and status, including `complete`, change with a 21 CFR 11.10(e) reason that is either the model's or a fixed placeholder that reads like a real reason.
- This is the canned-reason pattern that the 2026-09-24 part11-ux review (Q3) removed from the authoring routes.
- The person's confirmation makes the act attributable, but the recorded reason is not theirs.
- The handler also has no role check (see SEC-C-1).

**Smallest fix.**
- Make `reason` required in the tool schema, and refuse rather than substitute when it is under 8 characters.
- Better: have the confirmation step collect the person's own reason for tools that write governed content, and pass it to the handler.

### SEC-C-6 — unsaved protocol text outlives the session and is offered to the next person

**What the code does.**
- **Where drafts go.** `ProtocolDevSection.tsx:176` sets `storageKey={writable ? \`pdev-section-${sec.id}\` : null}`, stored as `'dc::' + storageKey` (`RichSectionEditor.tsx:325`). Every unsaved change is written to `localStorage` (`:1082-1093`).
- **What comes back.** When the editor mounts, any cached text that differs from the stored section is offered back (`:1095-1104`). The offer says only "A draft cached on this device differs from the saved section." with a "Restore the device draft" button (`:1872-1883`). It names no author and no time.
- **What logout clears.** `clearAuth()` calls `SecureStorage.clear()` (`authService.tsx:986-995, 206-219`), which removes only `AUTH_STORAGE_KEYS` (`:137-143`) and the legacy bearer keys. Nothing in `client/src` clears `dc::` entries (grep).

**Why it matters.**
- On a shared or handed-over workstation, protocol text one person typed and never saved stays in the browser after they sign out.
- The next person in the same organisation who opens that section is offered it as "the device draft".
- If they restore it and save, the ledger and the author-lineage gate (`protocol-development-service.ts:240`) record another person's words as theirs. This breaks 21 CFR 11.10(e) and the ALCOA "attributable" principle.
- Unsaved, sponsor-confidential text is also readable by anyone with access to that browser profile.

**Smallest fix.**
- Key the cache by user and organisation.
- Delete `dc::` entries in `SecureStorage.clear()`.
- Say in the restore offer who cached the draft and when.

### SEC-C-7 — a signed disposition is displayed under a label, not under the signer

**What the code does.**
- **Form.** The request-review form accepts both a member account and a free-text reviewer name. It fills the name from the account only when the name field is blank (`ProtocolDevForms.tsx:379-383`).
- **Server.** It stores the name exactly as given (`protocol-reviews.ts:99-105`; `protocol-reviews-service.ts:75-79`). The only check is that the account is a member who can sign (`:60-74`).
- **Display.**
  - The read model returns `reviewer: str(rv.reviewer_name)` (`pdev-view-assembler.ts:63`).
  - The Reviews pane prints that label next to the disposition (`ProtocolDevReviews.tsx:40, 49, 54`).
  - The same label is the target text in the signing dialog (`ProtocolDevSigning.tsx:73-74`).

**Why it matters.**
- Whoever creates the assignment (any member, or a viewer per SEC-C-1) can attach colleague B's account to a label naming someone else.
- Once B signs, the Reviews pane reads "<label> · Approve".
- The server-side signature row correctly records B. But the Reviews pane is where people read a protocol's review outcome.
- 21 CFR 11.50(a)(1) requires the printed name of the signer.

**Smallest fix.**
- For an account-bound assignment, resolve and store the account's name on the server, and refuse a different free-text name.
- Next to a signed disposition, show the signer's printed name from the signature row.

### SEC-C-8 — six create paths never prove the document is the caller's

**What the code does.** These six inserts take `organization_id` from the session and `protocol_document_id` from the path, with no lookup of the document:
- review assignment (`protocol-reviews-service.ts:49-80`)
- review comment (`:185-208`)
- schedule assessment (`protocol-soa-service.ts:28-37`)
- risk (`protocol-risks-service.ts:41-58`)
- milestone (`protocol-milestones-service.ts:28-36`)
- budget line (`protocol-budget-service.ts:29-38`)

`protocol_review_assignments.protocol_document_id` has no foreign key (`migrations/20260629_protocol_reviews.sql:20`).

Other writers do check:
- objectives, eligibility and visits run `loadDoc` (`protocol-development-service.ts:249, 261, 272`);
- deviations check the document (`protocol-deviations-service.ts:77`);
- amendments check it too (`protocol-amendments-service.ts:65-69`).

**Why it matters.**
- **No cross-tenant leak today.** Every reader filters by organisation (`pdev-view-assembler.ts:406-435`). An assignment against a foreign document cannot be signed, because the separation-of-duties check finds no authors and refuses (`separation-of-duties.ts:331-341`).
- **Ledger noise.** The tenant's ledger still records governed `create` acts against `protocol-document:<id>` for documents the organisation does not own.
- **No finalized check.** These writes skip `assertEditable`; SEC-C-2 is the case where that matters.
- **Ready to become SEC-C-3.** This is the same shape as SEC-C-3, waiting only for a unique key on the document id.

**Smallest fix.** Call `loadDoc(client, orgId, docId)` at the top of each, plus `assertEditable` where the content is covered by the signature.

## Earlier findings re-verified

None of the four earlier security reports raised an id inside these fifteen files. The earlier items that touch this screen's server paths are below.

| Earlier item | Raised in | State at `7087f46e2` | Evidence |
|---|---|---|---|
| Protocol AnA write tools confirm with no one (`protocol-design-tool-defs.ts`, and the protocol slice of `notifications-study-memory-tool-defs.ts`) | 2026-09-24 security §3 | **Changed.** Confirmation is now required; the reason is still open (SEC-C-5) | All are `confirm` in the register: `apply_protocol_design_derivation` :292, `assign_protocol_reviewer` :861, `bind_protocol_to_study_design` :881, `create_protocol_document` :1409, `set_protocol_budget_params` :3573, `set_soa_cell` :3594, `update_protocol_section` :3767. `preHandlerRefusal` refuses a confirm-class tool unless `ctx.humanConfirmed === true` (`AnaToolExecutor.ts:338-360`), and the registry wrapper applies it (`:362-369`) |
| `finalize_protocol_document` refuses | 2026-09-24 security §3 | **Holds** | Register :1945-1951 is `refuse`. The handler reads completeness and writes nothing (`AnaToolExecutor.ts:11601-11632`) |
| DP-08 tool-layer observation: governed AnA writes carry a model-authored reason | 2026-09-24 security §5 | **Still open in this lane, in a worse form** | SEC-C-5: a placeholder is substituted rather than refused (`AnaToolExecutor.ts:10032-10035, 11524`) |
| DP-36: the propose-only gate covered only the command registry | 2026-09-26 (high); closed 2026-09-28 | **Holds closed for this lane** | Evidence as in the first row. The SEC-0928-1 residual (no e-signature tier for registered tools) does not apply: the only signed protocol act is refused as a tool and signed on its own route |
| P1: finalize and disposition were ledgered as `sign` with no ceremony | 2026-09-22 part11-ux #1; "holds fixed" in the 2026-09-24 lenses | **Holds** | Listed below the table |
| DP-41 lesson: the tenant-isolation gate was blind to a whole lane | 2026-09-28 eCTD second pass | **Recurs for the protocol lane** | `TENANT_SCOPED_TABLES` has no protocol table (`scripts/ci/check-tenant-isolation.mjs:88-173`). The gate is green (8 of 8) with SEC-C-3 present |
| IAM-19: the `/ana` socket has no periodic session re-check | 2026-09-26 | **Not applicable; not re-verified** | This screen reaches AnA over HTTP streaming at `/api/ana-ri/stream` (`V2App.tsx:1026-1051`), not the `/ana` socket namespace |

Evidence for the P1 row:
- Both routes run `signProtocolAct` behind `requireEditorAccess` and the attempt limiter (`protocol-development.ts:492-529`; `protocol-reviews.ts:151-206`).
- `protocol-signature.ts:142-221`:
  - checks the declared meaning;
  - re-authenticates before the transaction starts;
  - checks separation of duties before the write;
  - writes the ledger row and the `electronic_signatures` row on the same database client.
- The second factor is required whenever one is enrolled (`reverify-signer.ts:243-267`, via `actions.ts:296-310`).
- Only the assigned user can sign a disposition. A reviewer with no account can only have their decision recorded by someone signing as `responsibility` (`protocol-reviews-service.ts:99-154`).
- The client sends the password and code only inside the signing request and stores neither (`ProtocolDevWrites.ts:360-382`). The password pre-check sends the bearer token (`useEsignature.ts:28-43`).

The other ids in those four reports (IAM-01 to IAM-19, DP-02 to DP-41, SEC-0928-1 and SEC-0928-2) cite no code on this screen's paths and were not re-verified here.

## What I did NOT get to

**Imported client code only partly read.**
- **`RichSectionEditor.tsx`** (2,716 lines) was read only on the paths this pane uses. These parts belong to the editor-family lens and were not read:
  - the link bar, beyond the scheme check seen by grep at 1525-1537;
  - the image node, live collaboration, track changes, comments and citations.

  This pane passes none of `imagesApi`, `collab`, `track` or `commentsApi` (`ProtocolDevSection.tsx:163-179`).
- **`ProtocolRegisterForms.tsx`**: only its route map was read. Its milestone and amendment create routes were traced only as far as the services' parent checks and the absence of a role guard.
- **`IrbPackage.tsx` and `biostatBridge.tsx`**, mounted as tabs here (`ProtocolDevWorkspace.tsx:268, 271`): grep only. Both use `apiRequest`. biostatBridge's two writes (`biostatBridge.tsx:406, 447`) were not traced to the server.
- **`C2CForm.tsx`, `ProtocolGov.tsx`, `EsignModal.tsx`, `toast.tsx`, `dataConnect.tsx`**: checked by grep for sinks only (none found), not read line by line.

**AnA paths not traced.**
- The confirmation card a person sees before a confirm-tier tool runs was not read. Whether a steered proposal (SEC-C-4) would be recognisable there is not verified.
- Of the roughly 25 protocol AnA tools, only three handlers were read: `update_protocol_section`, `set_protocol_budget_params` and `finalize_protocol_document`. For the others, only the register class was checked, not their role, parent or finalized checks.

**Limits of the reproductions.**
- **SEC-C-3** was reproduced in PGlite, not on a provisioned database. Two things are not verified:
  - whether production's API database connection is subject to forced RLS (the 2026-09-24 DP-05 finding records an owner credential in the API task);
  - whether every deployed connection sets `app.rls_enforce='on'`.
- **SEC-C-1** was reproduced against the real routers with stubbed services, not against a running server.
- **SEC-C-2** is established by reading only: those three writes issue no query against `protocol_documents`. It was not executed. I did not search for any background job that re-checks protocol signature digests and flags drift.

**Not read at all.**
- The server's markdown-to-DOCX conversion (`services/docxGenerator`).
- No browser run and no live AnA turn.

**Seen in passing, outside this lens, not assessed further.**
- **Export.** DOCX and PDF export from this screen can never succeed in production. The client posts only `{title, content}` (`ProtocolDevWorkspace.tsx:187-190`), and in production the export gate requires `governance.humanReviewApproved` (`exportReviewGate.ts:60-65, 110-121`). The refusal is shown to the user, so it fails closed.
- **Schedule grid (honest-state lens).** Its tick state is set once (`ProtocolDevSoa.tsx:71-75`). The re-read after a write deliberately keeps the pane mounted (`ProtocolDev.tsx:194-201`), so the ticks are never refreshed and cells changed elsewhere stay stale on screen.
- **Projections (honest-state lens).** `ProjectionsPanel.show` does not guard against a stale response (`ProtocolDevProjections.tsx:253-262`). A slower earlier projection can render under a later one's heading and be downloaded under its name.
- **Raw error text (server-error-leak class).** Every protocol router's 500 path returns `err.message` (for example `protocol-budget.ts:34-38`). The raw Postgres text in SEC-C-3 is one instance.
