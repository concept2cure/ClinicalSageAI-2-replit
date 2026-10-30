# Codespaces editor human-testing handoff

2026-10-14, America/Los_Angeles. Workstream W1 / D2. This handoff targets the
application running in a **private GitHub Codespace**, on `concept2cure-v2`.
There is no deployment, staging or production prerequisite. All code, tests,
contracts and non-secret evidence stay in the canonical repository; completed
increments are committed and pushed directly with the normal hooks, without PRs.

Updated 2026-10-16 with current-access and specialist-handoff checks under the
[existing editor continuation contract](../design/AUTHORING_CURRENT_ACCESS_AND_HANDOFF_2026-10-16.md).
Updated 2026-10-17 with the existing specialist controls and explicit actions in
the [shared authoring creation recovery contract](../design/AUTHORING_SHARED_RECOVERY_2026-10-17.md).
The same editor now includes the [document and section build workflow](../design/AUTHORING_ASSEMBLY_BUILD_2026-10-17.md).
The [Project files Vault build entry](../design/PROJECT_FILES_SOURCE_ASSEMBLY_2026-10-18.md)
uses the same source chooser and guarded document handoff as the catalogue.
The [regional device initialization contract](../design/DEVICE_PROJECT_INITIALIZATION_2026-10-20.md)
connects eight existing preparation outlines to exact governed project classes.
The [assembly filing scope and review contract](../design/ASSEMBLY_FILING_SCOPE_AND_REVIEW_2026-10-20.md)
preserves the target filing and each assembled section’s recorded template context.
The [authoring-to-Vault continuity contract](../design/AUTHORING_VAULT_CONTINUITY_2026-10-21.md)
covers filing receipts, uncertain outcomes and the existing Vault placement handoff.
The [device client readiness correction](../design/DEVICE_CLIENT_READINESS_2026-10-23.md)
retains CDx/SaMD product identity and aligns preparation-only project actions.
The [filing traceability contract](../design/AUTHORING_REFILING_TRACEABILITY_2026-10-21.md)
records byte-bound authoring derivation and refuses ambiguous version-head hints.
The [cross-sector authoring contract](../design/CROSS_SECTOR_AUTHORING_2026-10-23.md)
connects shared planning outlines and source-focused AnA preparation to this editor.
The [selected-source document-start contract](../design/SOURCE_ASSEMBLY_DOCUMENT_START_2026-10-23.md)
continues Data Room/Vault selections through the existing New document form.
The [assembly template discovery contract](../design/ASSEMBLY_TEMPLATE_SEARCH_2026-10-23.md)
reuses that same searchable picker in the existing build controls.

This is an executable checklist, not a report of a completed human session.
Record the actual commit and observations below. The
[2026-10-13 installation evidence](../evidence/HUMAN-TESTING/2026-10-13/RUNBOOK.md)
proved a local fresh PostgreSQL installation and development login at its named
revision; its counts, screenshots and `ana: no_provider` observation are
historical. The [creation recovery contract](../design/AUTHORING_CREATE_RECOVERY_2026-10-14.md)
defines the creation behavior this session must verify. Current automated scope
and limitations are recorded in the
[regional template evidence](../evidence/D2-EDITOR-INTEGRATION/2026-10-14/global-biotech-templates/README.md)
and [human-review evidence](../evidence/D2-WORKFLOW-CONTINUATION/2026-10-14/README.md).

## Prepare the local Codespace

Use a Codespace dedicated to this test. Confirm the branch before updating it:

```bash
set -e
test "$(git branch --show-current)" = concept2cure-v2
git pull --ff-only origin concept2cure-v2
git rev-parse HEAD
node --version
npm ci
pg_lsclusters
pg_isready -h 127.0.0.1 -p 5432
```

Use Node 22 and PostgreSQL with the `vector` extension available. If dependencies,
the local PostgreSQL cluster or extension are unavailable, record setup as
blocked before the browser session. `.devcontainer/post-create.sh` treats some
installation failures as optional, and `post-start.sh` starts a database without
installing the complete application schema. Neither banner proves readiness.

Choose a **new local database**. The explicit loopback URLs below prevent an
inherited `DATABASE_NEON_NEW_SECRET`, `DATABASE_URL` or ignored env file from
selecting a different database. Do not run this setup against a shared remote
database. `createdb` refuses an existing name; this procedure does not reset or
delete a database. Use the Codespace's local administrator authentication if
required.

```bash
set -e
export C2C_EDITOR_TEST_DATABASE=c2c_editor_human_20261014
export C2C_EDITOR_TEST_ADMIN_URL="postgresql://postgres@127.0.0.1:5432/${C2C_EDITOR_TEST_DATABASE}?sslmode=disable"

# Fresh, dedicated Codespace: generate a local URI-safe runtime password.
# If app_service already exists, set this variable to its local password first.
if [ -z "${C2C_EDITOR_TEST_RUNTIME_PASSWORD:-}" ]; then
  export C2C_EDITOR_TEST_RUNTIME_PASSWORD="$(node -p "require('node:crypto').randomBytes(24).toString('hex')")"
fi

createdb -h 127.0.0.1 -p 5432 -U postgres "$C2C_EDITOR_TEST_DATABASE"

DATABASE_URL="$C2C_EDITOR_TEST_ADMIN_URL" \
APP_SERVICE_DB_PASSWORD="$C2C_EDITOR_TEST_RUNTIME_PASSWORD" \
node scripts/db/install-fresh.mjs

DATABASE_URL="$C2C_EDITOR_TEST_ADMIN_URL" \
APP_SERVICE_DB_PASSWORD="$C2C_EDITOR_TEST_RUNTIME_PASSWORD" \
node scripts/db/deploy-migrate.mjs

export C2C_EDITOR_TEST_RUNTIME_URL="postgresql://app_service:${C2C_EDITOR_TEST_RUNTIME_PASSWORD}@127.0.0.1:5432/${C2C_EDITOR_TEST_DATABASE}?sslmode=disable"
export C2C_EDITOR_TEST_SESSION_SECRET="$(node -p "require('node:crypto').randomBytes(32).toString('hex')")"
export C2C_EDITOR_TEST_JWT_SECRET="$(node -p "require('node:crypto').randomBytes(32).toString('hex')")"
export C2C_EDITOR_TEST_REFRESH_SECRET="$(node -p "require('node:crypto').randomBytes(32).toString('hex')")"

DATABASE_URL="$C2C_EDITOR_TEST_ADMIN_URL" \
APP_DATABASE_URL="$C2C_EDITOR_TEST_RUNTIME_URL" \
RLS_ENFORCE=on EXPORT_REVIEW_GATE=enforce \
NODE_ENV=development ALLOW_DEV_AUTH=1 SEED_DEMO_USER=1 PORT=5000 \
SESSION_SECRET="$C2C_EDITOR_TEST_SESSION_SECRET" \
JWT_SECRET="$C2C_EDITOR_TEST_JWT_SECRET" \
REFRESH_TOKEN_SECRET="$C2C_EDITOR_TEST_REFRESH_SECRET" \
CONCEPT2CURE_SIGNER_MODE=dev \
npx tsx server/index.ts
```

Run both schema commands sequentially and require exit 0; do not continue after
a failed installation. The second command applies the durable out-of-band set
even on a fresh installation. Keep the same local runtime password when
restarting; do not regenerate it or overwrite an existing shared role password.
The example's generated password is hexadecimal so it needs no URL escaping.
If supplying a different password, URL-encode it in the runtime URL. Keep all
secret values out of Git, terminal transcripts, screenshots and test evidence.

The app must connect through `APP_DATABASE_URL` as `app_service`, a non-superuser
without `BYPASSRLS`, rather than through the administrator URL. Ask the operator
to verify active app connections and role attributes without printing a
connection string. Shell exports override `.env.local` and `.env`; keep the
explicit URLs in the app's start command. Do not infer runtime identity from a
successful administrator query.

In a second terminal, read the app's actual health:

```bash
curl -sS -i http://127.0.0.1:5000/healthz
curl -sS -i http://127.0.0.1:5000/readyz
```

Record the status and component states. A liveness 200 alone does not qualify
the session. Database, schema and storage failures block their dependent steps.
An `ana` failure can leave the manual lane testable, but it blocks the AnA lane.
Do not enable deterministic/demo AI responses to count that lane as passing.

## Open the browser and prepare the people

In Codespaces **Ports**, forward **5000** and keep its visibility **Private**.
Open that port in the browser, then `/concept2cure/login`. The address is the
current Codespace's `https://<codespace-name>-5000.app.github.dev`, not another
person's localhost. The existing server binds `0.0.0.0:5000` and recognizes this
Codespaces origin. No second frontend server or alternate editor is required.

With the development flags above, use **Demo access** under **DEV ONLY** to
enter the local development account. This bypass is for this private development
session. The development server's bootstrap creates the account; the schema
installer does not. A fresh account has a random, non-recoverable password unless
the operator supplies `DEMO_USER_PASSWORD`, so do not assume a built-in password
works. This account bootstrap does not populate a project, filing, document or
submission. Confirm the signed-in organisation before creating work.

Arrange three roles through existing account/membership controls: an author,
an independent current colleague who can receive the review assignment, and a
viewer for denial checks. The reviewer must not have created, written, renamed
or reordered this document. Use separate browser profiles for the author and
reviewer so an account switch cannot silently reuse the author's session. If
the second account is not available, mark peer-review cases **Blocked** rather
than approving as the author. Signing is a separate optional case requiring
the appropriate signing authority and the existing password/authenticator
ceremony; a peer verdict is not an electronic signature.

Use non-sensitive material that the testers are authorized to use, such as a
public source document. Record the source and intended test purpose. Do not
load patient data, credentials or fictional agency responses. Test records in
this local database are test records, not evidence of a completed regulatory
filing. Leave normal governance gates enabled.

## Choose the test lane

| Lane | Prerequisites | What it can establish |
| --- | --- | --- |
| Manual editor | Local schema/runtime role, working login, project/write entitlement and storage for file cases | Project/template creation, empty scaffold and guidance, human editing, explicit save/reload, recovery, citations, independent human review and draft Vault filing. |
| AnA oversight and remedies | Manual prerequisites plus an enabled model approved for high-risk drafting/review, working embedding lane and the organisation's applicable provider-placement policy | Real saved-record reads, complete review paging, evidence reconciliation and attributed tracked proposals. A provider key alone, or a chat-only model, does not establish this. |
| Optional governed signing/export | Current signing authority, password/authenticator setup and required source/model qualification and export runtimes | The specific recorded signature/export outcome. A dev signer does not establish operational or regulatory validation. |

Provider configuration belongs in Codespaces secrets under the operator's
existing authorization. This runbook does not provision credentials or invoke
a provider. Check current AnA readiness rather than copying the older runbook's
provider status. If the approved model or embedding lane is unavailable, execute
the manual cases and record AnA cases as **Blocked**, including the visible
reason. Preserve preparation-only and original-record restrictions throughout.

## Tester cases and outcome worksheet

Use **Not run**, **Pass**, **Fail** or **Blocked**. A pass requires the observed
outcome and evidence; a blocked prerequisite is not a pass. A case with several
checks passes only when each succeeds. Record subcases separately when they
differ. Use the existing buttons, dialogs and native editor throughout.

| # | Action and expected outcome | Outcome | Evidence / defect / blocker |
| --- | --- | --- | --- |
| 1 | Record canonical commit, Codespace URL, browser, viewport/theme, organisation and tester roles. Confirm health components and app runtime role. Mark the manual and AnA lanes independently. | Not run | |
| 2 | Sign in as author. Confirm the organisation and Projects list. An empty account reports no programs honestly; sign-out and sign-in return to the same account, without another organisation's records. | Not run | |
| 3 | **New project**: explicitly choose the intended active client workspace, select an appropriate filing from the registry, enter product type/name and indication where requested, review recorded values, and create once. No first workspace is selected implicitly; only a confirmed creation may switch the selected client/project. Record the returned project UUID and any partial-scaffold notice. Open that project and confirm its identity. | Not run | |
| 4 | Project **Documents → Open in Authoring → New document**. Choose a regional **Start from** template, title it, and confirm its module or no-placement value. Read **Template guidance and source requirements**. The scaffold is empty authored content with the exact source identity and limits retained. | Not run | |
| 5 | Submit creation, including rapid repeated clicks. One pending request must not create duplicates. Confirm the returned document opens by its exact UUID, including from an Approved/Frozen filter. Attempt a project switch while work is held: creation must not attach to a different project or adopt a late reply. | Not run | |
| 6 | With the operator, interrupt a creation response once without repeatedly submitting. An uncertain outcome must offer **Check**, not claim nothing was created. A failed scoped read keeps the guard; a successful scoped read allows inspection of the existing result before any deliberate retry. Check is a read, never an automatic repeat POST. | Not run | |
| 7 | In one section, type a clearly identified test paragraph, enter **Reason for change** of at least 8 characters, and **Save**. Reload, reopen the same document from project Documents, and verify exact text, section and reason/history. There is no content autosave to assume. | Not run | |
| 8 | Make another unsaved edit and try section/document/project navigation. Exercise **Stay**, **Discard** and **Save** separately; confirm they affect only the intended draft. Where offered, test device **Restore/Discard** after leaving. Canceling a created-document handoff must allow reopening the confirmed UUID without creating again. | Not run | |
| 9 | Add the authorized source through the existing project Data Room/Vault path and wait for its real extraction result. From **Project files** or **Sources**, inspect it and insert a citation. Verify exact source version/location, retained original bytes and citation after save/reload. Unavailable extraction is an explicit gap, not fabricated text. | Not run | |
| 10 | Provider lane: **Review with AnA → Review section** and **Review document**. AnA must read saved text, follow all review pages, preserve regional template context and distinguish pending changes, unread sources and preparation guidance. Unsaved text must not be claimed reviewed. | Not run | |
| 11 | Provider lane: **Prepare targeted fixes**. Apply one exact-quote remedy as a tracked change. Reject it, explicitly reapply, then accept it. Confirm attribution and reason; proposals must not silently save, approve or file. Save deliberately and verify the accepted text, History and Audit after reload. | Not run | |
| 12 | **Send for review** to the independent colleague with a reason. Confirm the request on the **Review board** and its task in **Tasks**. A task alone is not a verdict. The author, historical contributors and unassigned users must not decide this review. | Not run | |
| 13 | Reviewer opens the complete saved document on the board and records **Changes requested** with a reason. After an author edit or new request, a previously opened decision must refuse stale content/request identity. Reopen the fresh complete snapshot for a new independent decision; check current versus historical standing and task outcome. | Not run | |
| 14 | Save, then **File to vault** as a working draft. Record the server's Vault ID, project folder, format, SHA-256 and approval outcome. Find that version in this project's Vault and verify the downloaded bytes/hash and draft marking. A working copy must not become approved by filing. Record any scanner/storage/export refusal rather than bypass it. | Not run | |
| 15 | Repeat regional template identity/guidance/save/reopen and, when enabled, AnA handoff checks for FDA, Health Canada, EMA/EU, Japan and a shared ICH component. Test viewer and foreign-project denials without writes. Use desktop/light and touch/dark keyboard/focus checks; controls, text and recovery must remain usable in the same editor. | Not run | |
| 16 | From an existing specialist result, **Open in document editor** must open the exact returned document and section in the same project. Confirm it when another document is newer. Repeat with a project/account switch while the response is delayed: an old completion must not navigate or update the new context. An unbound working document must not be reported as filed into a dossier. | Not run | |
| 17 | Provider lane, with the operator and separate authorized account: after a valid AnA project read, revoke the reader's private-project membership and request another section, outline/search continuation or saved review. It must refuse current access without returning further project text or inventory. Restore only the intended test membership through existing controls. | Not run | |
| 18 | Specialist recovery, with the operator: interrupt a document response after one explicit save. The retained result must offer **Check working documents** and block repeat creation. A refused or malformed check keeps that block. A successful scoped check shows inventory and its uncertainty without navigating or writing. Inspect before another deliberate creation; a matching title or list position must not be adopted as the interrupted request's receipt. | Not run | |
| 19 | Interrupt or refuse the section write after the specialist document ID is confirmed. **Check document sections** must verify that exact parent in this project's inventory and retain the original title/code. When the code is absent, **Continue saving text** is a separate action that rechecks and sends only the original section payload, including after the source result changes. A permission refusal or duplicate-code conflict must keep the text unresolved for another check. Preserve an existing code for inspection; never create another parent or overwrite text. **Open document to review** / **Open saved document** must open the exact ID/project, with the exact existing section or no section target for an empty document. | Not run | |
| 20 | In Biostatistics, rapidly invoke **Open in document editor** and **File it to the dossier** for one result. They must share one pending save, without duplicate creation or duplicate success effects. After a complete save, invoke the same result again: fresh scoped reads must verify and reuse its existing document/section, preserving current text. Missing/deleted records or refused reads must keep the action held without another creation or navigation. | Not run | |
| 21 | With delayed specialist **Check** and **Continue saving text** responses, separately switch project A → B → A, switch account/organisation, and leave the surface. Old responses must not publish inventory, status or navigation into the new context. Start a new deliberate save in project B while an older response is pending: its finalizer must not release the newer save or allow duplicates. A normal token refresh for the same account must preserve the valid current attempt. | Not run | |
| 22 | In CMC correspondence, refuse the lifecycle update after a response draft saves. The draft must remain inspectable with the file-update refusal visible. **Open saved document** must reuse the exact draft without automatically retrying the correspondence update. Separately, **Check document sections**, section-only continuation and explicit inspection after an interrupted text save must not automatically PATCH the agency-question lifecycle. | Not run | |
| 23 | Open a working document and **Build document or section**. Choose a template with matching scope, leave AnA off, preview the ordered plan and state a build reason. **Build document** must add only missing sections using stored template content, preserving existing text, citations, identities and order. Confirm the assembled document view and saved section guidance. No generation request may occur; empty reference sections must remain identified as missing content. | Not run | |
| 24 | Choose one exact **Build target** and **Build section**. Only that missing section may be added. A normalized code already present must preserve its existing section and text. Sample FDA, Health Canada, EMA/EU and Japan templates with matching document scope; verify recorded guidance, applicability limits and drafting region. Incompatible modules, preparation-only drafting, foreign documents and frozen records must refuse by name without changes. After a valid preview, have the operator withdraw edit access and refresh the document: show the exact access reason, disable build/AnA and preserve saved text. Restoring access must require a fresh preview. | Not run | |
| 25 | With an approved provider lane available, choose **Draft empty eligible sections with AnA** and build a small document. Generation must run in sequence without automatic acceptance. Review a completed candidate in the existing draft panel while another is pending; retain its edited text and reason while switching reviews. **Stop preparation** must retain the current completed response and prevent the next request. Retry only remaining or explicitly selected candidates, preserving completed reviews. Record provider cases as **Blocked** if their prerequisite is unavailable. | Not run | |
| 26 | Change the template or saved target after preview, then attempt the old build. It must refuse the stale plan. With the operator, inject a later section/evidence failure and confirm the entire structural build rolls back. Double-click and interrupt a commit response: **Check saved document** must read the exact parent without automatically repeating a write. Type in the editor during an in-flight build/refresh; keep that buffer and suppress later automatic drafting. With the operator, revoke private-project access immediately after commit: the response must withhold private content and hold the outcome for an explicit check after access is restored. | Not run | |
| 27 | Generate a section candidate, then save newer section content from another authorized account before acceptance. Acceptance must refuse the changed or unverified saved base and retain the candidate for comparison or fresh generation. Unsaved local edits must also block acceptance. For a lost acceptance response, **Check saved section** must display the exact saved text read-only alongside the held candidate, without inferring authorship, accepting again or replacing local edits. Change a selected Vault source version or revoke its access before acceptance: refuse the stale/unavailable source receipt without changing section text or consuming the retained candidate. Repeat delayed generation/acceptance across project/account changes. | Not run | |
| 28 | In Project Data Room, explicitly select two current readable sources and choose **Build in editor**. The dialog must retain that exact selection and original project, list only that project's working documents, and require a deliberate target choice. Continue must open that exact document in the same editor with its build disclosure and source count visible. Selecting/opening alone must not create, commit, draft or replace text. Zero selections must never become the newest sources; more than five must require reducing the selection. | Not run | |
| 29 | Start from a current-project Vault/catalogue source and from the editor's existing Data Room source rail. Confirm the original source namespace and ID, target project, version/hash and bounded excerpt details in the build preview. With verified retained text but unavailable original bytes, AnA source use may remain available while **Work on document** correctly refuses unavailable original-file import. Cross-project/library sources must not silently associate with the current project. | Not run | |
| 30 | Keep AnA off and build from the selected sources. Only recorded template content/structure and source-reference intent may be saved; existing prose/order stay intact and no generated science appears. Verify the source manifest in the audit trail, including a build where every section already exists. For verbatim work on the original document, the existing **Work on document** path must still create/reuse its governed working copy and preserve conversion warnings. | Not run | |
| 31 | In the approved provider lane, build a small selection with AnA. Confirm each candidate uses the exact previewed source IDs and excerpt coordinates/hashes, with no unrelated project-source fallback. The visible limits must distinguish bounded excerpts from full-file scientific review. Retain each candidate, edited body and reason across reviews and accept individually. Verify the actual source manifest remains on the accepted revision/audit. Mark this provider case **Blocked** when its prerequisite is unavailable. | Not run | |
| 32 | With the operator, change a selected source's bytes, same-length extracted text, version, disposition or current access after preview and before build/generation/acceptance. Refuse the stale source identity without starting fallback retrieval, replacing content or consuming a refused candidate. Refresh the original sources and explicitly preview again; do not silently substitute another identity or excerpt. An audit/lineage failure must roll back the structure/reference or acceptance transaction. | Not run | |
| 33 | Open a source-start dialog while an existing editor has dirty text. Exercise Stay/Save/Discard through the existing navigation guard: canceled navigation must not bind the new sources. Delay target/source reads and separately switch project A → B → A, account/organisation, selected source and target document. Repeat the context changes after choosing Open in editor but before the editor finishes loading. Old responses must not hand off, adopt sources, reveal text or release a newer attempt. An unavailable/malformed document list must show a retryable refusal, never auto-select the first/default document. | Not run | |
| 34 | Complete a source-based build, leave Authoring and reopen the same saved document. In its existing build disclosure choose **Check saved sources**. Verify the last recorded build's source identities and time; checking alone must not select sources, change text, create audit events or start generation. A successfully checked document without source-build history must explicitly report no saved references. An authorized whole-document viewer or a frozen document may inspect readable references while reuse stays disabled. | Not run | |
| 35 | With a clean editable document, no current selection and the draft review pane closed, choose **Use saved sources**. It must recheck the same saved event and source versions before selecting those exact identities. Choose a current template and preview a new build, then sample deterministic and approved-provider AnA modes. No old plan, reason, candidate or acceptance may be reconstructed. A new catalogue selection must take precedence until explicitly cleared and checked again. Opening a draft review during the recheck must preserve that review and refuse the late source change. | Not run | |
| 36 | With the operator, change the last recorded sources' extraction, version, disposition or access before check/reuse, and separately simulate an unreadable or unverifiable latest audit record. Show a refusal and a remedy through current catalogue selection; never restore an older usable event or treat a failed read as no history. In a document with more than 500 later unrelated audit events, the source check must still address the last recorded source build. | Not run | |
| 37 | Delay saved-source check and reuse responses. Exercise rapid repeated clicks, project A → B → A, account/session change, document/source changes, dirty edits and an open governed form before completion. Old metadata and results must not appear or adopt sources in the new context. A failed/stale check must preserve local text, current selection, plan and retained reviews. An unresolved build/acceptance must stay held; checking references must not release it or repeat any write. | Not run | |
| 38 | In Authoring, open **Project files → Vault**, select an uploaded file, then choose **Build in editor**. Repeat for a later-page search match. The chooser must name the exact Vault document and effective project; opening the selected working document must use the existing editor and build disclosure without writing or generating. Preview explicitly and sample deterministic and approved-provider AnA modes. A retained readable source with unavailable original bytes may be used for assembly while **Work on document** retains its separate original-file restriction. Verify Open/import/cite/reference still work independently. | Not run | |
| 39 | From that Vault rail, exercise a source change, a live withdrawal/disabled change followed by re-allowing the same source, project A → B → A and account/session changes while the chooser read is pending. No retired chooser may publish a target. Authored sections/folders must not be treated as Vault uploads; withdrawn/superseded/earlier versions must refuse. With unsaved editor text, choose another working target and exercise **Stay** and the existing Save/Discard remedies: no refused handoff may replace text or bind sources. Repeat source browsing when the current section is read-only and confirm target permissions remain authoritative. | Not run | |
| 40 | Start an EU MDR project, choose IIa/IIb or a declared Class I subtype, and review the saved project profile. FDA product-code, CDRH panel and predicate fields must not appear or be sent. Switch between FDA and EU before creation; hidden values must not leak. Class-specific filings must constrain choices and refuse contradictory class facts; leaving a fact unconfirmed must preserve null. | Not run | |
| 41 | Start an EU IVDR project and choose A–D. Verify the exact EU class in the saved profile and no US device class. Leave classification unstated in another project; it must remain unconfirmed. Invalid or conflicting class/product/filing combinations must refuse. | Not run | |
| 42 | In the existing Authoring template picker, select FDA PMA/De Novo/HDE, Canada MDL/IVD licence and Japan Shonin/IVD/CDx and Class I notification preparation templates, plus the seven device-only QMS worksheets. Save, rename and reopen each exact template UUID. Confirm source/region/body, empty editable sections, original-format restrictions and the preparation limits. Starting a template alone must not be reported as regional project initialization or as a complete agency template. | Not run | |
| 43 | Open the 510(k) summary, MDR GSPR, IVDR GSPR and performance evaluation report components. Verify US/FDA versus EU/device body context, separate MDR/IVDR references, saved guidance and the same editor. Manual GSPR worksheets must not enable automatic prose drafting or replace a clause-by-clause evidence checklist. | Not run | |
| 44 | Ask AnA to prepare exact device/IVD templates for FDA, Canada, the EU and Japan. Read every outline/reference page, answer a few decisive evidence questions and inspect a saved document. Check intended use, version, risk, analytical/clinical evidence, software/cybersecurity and local review questions as applicable. Japan device preparation must not assert a drug PK/PD enrollment requirement. Reject prepared MDR-component/IVDR-filing and 510(k)-summary/PMA-filing pairings, by both named ID and UUID. Standalone outline references remain available. QMS preparations must describe internal quality work and preserve original audit/certification/production records, without proposing an agency route. With an approved provider lane, draft an eligible narrative component and explicitly review before accepting. | Not run | |
| 45 | Inspect Submission Center for those projects. Record preparation, validated-package and transmission states separately. Canada/Japan gateway refusal and the notified-body/national-authority delivery limit must remain visible. Do not send a test filing. Generic regional device/IVD project creation must not silently substitute an FDA dossier where no exact governed pack is offered. | Not run | |
| 46 | From Projects, initialize FDA HDE, Canada MDL and IVD licence, and Japan Shonin, Ninsho, Todokede, IVD approval and CDx. Search from both device and diagnostics lanes. Review the exact filing, product family and authority before creating; MDL must remain a device and Japan CDx a companion diagnostic across lanes. Inspect the saved project and governed document: retain the chosen identity, exact preparation outline and unreviewed provenance, with empty sections and readiness 0. Ninsho must name the registered certification body, including after reopening. Do not default unconfirmed Canadian/Japanese risk classes. | Not run | |
| 47 | In each regional project, use the existing document editor and Data Room/Vault source selection. Sample manual structure assembly with AnA off, then preparation/reference/oversight with AnA. Verify the exact saved filing context and current source identities after reopening; no medicinal or FDA substitute. These preparation outlines must retain their manual drafting limits. Eligible separate narrative components still require a supported provider and explicit acceptance. | Not run | |
| 48 | With the operator, attempt conflicting regional filing/program/authority/product-family inputs and remove an exact pack from a dedicated test database. Refuse before creating project artifacts, with no FDA/ICH fallback or medicinal submission spine. Restore the pack through the normal migration, then replay migrations after saving a regional draft and a prior-version document. IDs, text, pack versions, signatures and review attribution must remain intact. | Not run | |
| 49 | Inspect regional readiness with empty content, then with text in every optional preparation heading. Unknown required-section and artifact sets must remain unassessed with named gaps, never 100% or ready from an empty requirement set. With the operator, call generic eCTD status/compile/validate using both project UUID and linked numeric project ID: refuse as not applicable, including validation-report import. Attempt adding these device filings as an eCTD market on a medicinal project and direct canonical submission creation: refuse without writes. Record any remaining application-specific assessment limits. Preparation, expert review, package validation and agency transmission remain separate outcomes. | Not run | |
| 50 | With the operator, open a no-template working document bound to a Canadian or Japanese home filing. Select an incompatible regional/FDA template through the existing build preview. Refuse before loading selected source content or changing sections, revisions, lineage or audit records. Repeat with an organization template explicitly limited to another region, a foreign declared authority on an ICH-backed home filing, and an unavailable/foreign bound filing. Implicit US IND administrative templates must refuse a Canadian CTA or FDA NDA; compatible common medicinal Modules 2–5 remain usable. A previously valid preview must refuse if its binding or template scope changes before commit. | Not run | |
| 51 | In the existing editor, preview a matching Canada/Japan preparation outline, including Japan Ninsho’s registered certification body. Keep ordinary unbound working documents available within their project. In an existing 510(k) working document, use its compatible summary component; in IVDR use IVDR GSPR/performance components. Refuse a 510(k) summary in PMA and an MDR GSPR component in IVDR even though each pair has the same region. Confirm the same editor, original content and manual/AnA eligibility limits. | Not run | |
| 52 | Assemble selected built-in sections into a blank document without a parent template, then into a compatible document with a different parent template. Choose **Review with AnA → Review document**. AnA must read every saved-review page and identify each assembled section’s own template, filing context, original format, eligibility and limitations. Preserve the parent’s separate identity and limits; reference guidance must not become scored prose, scientific evidence or an approval. A missing provider blocks only the provider lane. | Not run | |
| 53 | With the operator, alter an assembly source/guidance receipt or remove required recorded guidance in a dedicated test fixture. Saved review must report the unverified reference/refuse complete coverage and retain document text. It must not borrow another section’s or the parent’s guidance. Change valid section source/guidance between review pages: the old snapshot must refuse continuation and require a fresh review. Stored-template assemblies without a verifiable recorded reference must stay explicitly unverified. | Not run | |
| 54 | With the operator, interrupt **File to vault** after the POST has started, or return a bodyless/unreadable success or server error in a dedicated fixture. The dialog must report that the outcome cannot be confirmed, hold another filing attempt and avoid claiming nothing was written. Close and reopen it ordinarily: the hold must remain. Inspect this project's Vault records before any fresh deliberate action; matching titles or list positions do not identify the interrupted request. | Not run | |
| 55 | Return a wrong/missing Vault UUID, project, SHA-256 or requested format, and a false-success receipt in a dedicated fixture. Do not show a confirmed filing, approval or navigation. Separately delay a valid filing while switching document, project A → B → A or account/organisation: the old completion must not publish a toast, callback or Vault target in the new context. Double-click filing once; only one POST may run. Preserve valid same-account token refresh and exact confirmed navigation. | Not run | |
| 56 | With the operator, change a saved document's project, title, module, locale/product, version, author, provenance, template/binding or lock state during export/admission while leaving its status and section text unchanged. The final filing must refuse the changed source identity before authoring export/history or approval carryover. Verify the captured project and exact admitted version, including the compensation result; do not infer the result from a rendered error alone. | Not run | |
| 57 | With the operator, repeat identical rendered bytes and simulate an empty admission pre-read followed by a concurrent existing-version winner. The pre-existing Vault row, placement and approval must remain intact; the attempt must require review rather than re-placement, approval carryover or deletion. Separately fail cleanup/audit, or lose an admission/recording COMMIT or rollback reply, after a genuinely new admission: report an unknown outcome when cleanup or the transaction cannot be confirmed, preserve possibly committed rows and bytes, retain the reconciliation hold and inspect the exact version. Historical hash versions must not be silently renumbered or attached to a guessed predecessor. | Not run | |
| 58 | From the existing editor, file a valid document, choose **Open in Vault**, inspect the exact returned UUID under the captured project and use the existing **Place into submission** action. The leaf must reference that Vault UUID and retain the confirmed study/section placement; the working document remains in the same editor. Approval, package validation and transmission remain separate checks. A missing faithful PDF renderer must give its named refusal; a DOCX working export must not be treated as a qualified submission PDF. | Not run | |
| 59 | File a saved document through the existing editor, place its exact Vault UUID and compile a local test package. Inspect the existing governance artifact: the native Vault pointer and any actual alias remain separate from the recorded authoring derivation. Compare source UUID, captured project, artifact SHA-256, filing audit receipt and explicit link/seal verdict with the retained records. New filings also retain the captured source version and sections digest; old absent values remain unknown. Editing the authoring document afterwards must not relabel that retained PDF as today's source or authorize a body read. | Not run | |
| 60 | With the operator and a dedicated fixture, exercise absent, unsequenced, malformed, ambiguous, cross-project, hash-mismatched or tampered filing receipts, invalid/missing configured-key seals and a failed receipt read. Governance must distinguish no recorded derivation, unverified derivation and an unavailable read, without inventing a source or treating no-key as HMAC authenticity. Native Vault bytes, approval, current-version and PDF substantive-content checks must retain their own verdicts; derivation metadata must stay outside the agency backbone. | Not run | |
| 61 | In a dedicated local fixture, give one document code two independent live Vault heads with different creation dates, then encounter a conflicting upload from the Data Room. Do not offer a guessed “add as version” head based on date. A unique scoped head may still be offered, and an explicitly chosen eligible UUID must keep the existing check-in rules. Another tenant/project or a tombstoned row must not become the hint; no existing submission leaf may be silently retargeted. | Not run | |


| 62 | Start US CDx PMA, US CDx 510(k) and EU CDx IVDR projects from both device and diagnostics searches. Configure, review and create: product class must remain **Companion diagnostic** in review, the POST and the saved project, without choosing or inferring a risk class. Confirm Japan CDx still behaves the same. A complementary diagnostic must not be silently relabeled CDx. | Not run | |
| 63 | For a generic supported US device filing, select **Software as a medical device** in the existing product-class control. For an applicable diagnostic filing, select **Companion diagnostic**. Review and save, then reopen the exact project: preserve the selected subtype. Confirm the bounded Canada/Japan device/diagnostic options and EU MDR/IVDR family restrictions; no drug/biologic option belongs to a device filing. | Not run | |
| 64 | Change the selected filing after choosing a device subtype. Reopen Configure and Review: the retired subtype must not leak into an incompatible filing. Exact named CDx/SaMD selections must retain their specific identity. With the operator, send contradictory exact filing/pathway/subtype inputs through the same create endpoint; refusal must precede project, document, submission or audit creation. | Not run | |
| 65 | Open Submit on each of the eight regional preparation project types. It must explain authoring-only preparation and the absence of a sequence; no **Add a market**, **Open readiness** or **Open Submission Center** action may promise an unavailable path. Confirm the status line and standalone Submission Readiness surface describe the same limit. Do not transmit a filing. | Not run | |
| 66 | Open supported 510(k)/PMA projects: **Add a market** must not offer the medicinal eCTD add-market action. Existing supported device submission access must remain available where offered. Open an NDA project as the authorized lead/manager and confirm its existing **Add a market** action remains reachable. Record permissions and observed outcomes. | Not run | |
| 67 | Inspect these controls at desktop and narrow touch widths, in light and dark themes. Use keyboard focus, labels, Continue/Back and errors. Verify the existing design tokens, readable product-class labels, visible preparation limits and absence of horizontal page overflow. These observations are independent of automated DOM and component rendering checks. | Not run | |
| 68 | From a fresh saved medical device/diagnostic working document, file PDF and Word using the existing dialog. Each receipt must report version **1.0**, its own Vault UUID and hash. Open each exact record: PDF and Word have separate histories. Confirm the pre-submit explanation is readable at desktop/narrow widths and in both themes. | Not run | |
| 69 | Place that PDF into a draft sequence, then edit and save the working Authoring document and file PDF again. The receipt must report **2.0** and the exact predecessor UUID. The Vault lists the linked family; earlier bytes and the sequence's existing UUID/hash remain unchanged. Readiness/release must name the older leaf as superseded. Deliberately replace its placement with the new UUID and complete the new version's required review/approval before expecting release. Word remains current in its own family. | Not run | |
| 70 | Move the current Vault rendition to another valid folder with a recorded reason. Edit the working source and refile the same format. Confirm the successor keeps the Vault filing rather than silently deriving a different folder from Authoring. A conflicting explicit folder request must refuse and direct the person to the existing Move action. | Not run | |
| 71 | With the operator's retained legacy/hash-labelled or all-retired scratch fixture, attempt refiling. Expect a review-required refusal before storage/admission, unchanged prior labels/bytes, and no positive receipt or guessed predecessor. Coordinate a controlled failed-successor fixture: changed bytes may advance past its reserved number; exact retired bytes remain refused under the existing duplicate-content rule. | Not run | |
| 72 | Interrupt a filing response or provide a malformed successful lineage receipt in the controlled harness. Close/reopen the dialog: retain the unknown outcome and require inspection of current Vault records before another attempt. Confirm session/project changes retire the prior context and no stale receipt opens a different project's Vault. | Not run | |
| 73 | In a medical-device, diagnostics, biotech, pharma, laboratory or research project, use the existing New document form and search the shared planning titles: regulatory strategy, gap analysis, competitive landscape and health-authority meeting minutes. Each must load the same recorded five-heading internal outline in the one editor, with no CTD module or bound agency filing. The GLOBAL/ICH registry classification must not be presented as an ICH-required template, approval or delivery destination. Use the existing Quality workflow for controlled SOPs, work instructions, validation protocols, forms and training documents; verify their QMS identity remains attached. | Not run | |
| 74 | Select current project sources from the Data Room or Vault and preview/build one of the shared planning outlines in an unbound working document. The manual build must keep prior prose and parent identity, append empty supported structure, retain the exact selected-source manifest and make the recorded outline/limitations available to saved AnA review. It must not insert invented analysis, mark evidence reviewed or authorize an automatic agency submission. Try the internal outline against a bound medicinal or device filing: refuse before selected-source reads or document writes. | Not run | |
| 75 | Ask AnA for each shared planning outline by exact registry ID and by its editor UUID, with and without preparation. Its questions must concern purpose/audience, source versions, as-of dates, actual commitments and reviewers as relevant. No target market is required; an optional US/CA/EU/JP focus must not create a delivery route or default pediatric, biologic or PK/PD requirements. Read all bounded pages and retain manual preparation eligibility. Refuse an unrelated component, filing identity or package family; discussed-topic markers must not count as evidence verification or approval. | Not run | |
| 76 | In authorized device and IVD programs, including CDx 510(k) and PMA projects, open the existing official eSTAR panel and its attachment section. Search this project's Vault, explicitly choose a current approved PDF version and assign the FDA destination using its own description. Verify that CDx selects the IVD template, and compare the visible document version, UUID and SHA-256; do not map a document by title alone. Repeat in supported De Novo and PMA panels. | Not run | |
| 77 | Add, change and remove assignments. Leave one incomplete and choose two documents for a single-file slot: generation must be held with an explanation. Remove all assignments and confirm the existing administrative-only export remains available. PreSTAR must retain its administrative preparation and applicant-completion limits. | Not run | |
| 78 | Generate an official eSTAR with approved Vault attachments. Confirm the actual returned filenames, chapters, UUIDs and SHA-256 values match the explicit selections. In a qualified compatible PDF editor, inspect the embedded bytes and routing manifest, complete applicant questions and declarations, save and reopen. Compare attachment hashes; record template/editor versions and any FDA script behavior. A downloaded PDF alone does not establish filing readiness. | Not run | |
| 79 | With the operator, use unreviewed, withdrawn, superseded, wrong-content approval and disposition-unavailable sources in a dedicated fixture. Export must refuse the affected assignment before a successful download, naming the source problem. Correct it through the existing Vault review/approval workflow, deliberately select the eligible version again, and retry. Do not bypass approval by selecting an earlier family member. | Not run | |
| 80 | With the operator, deny/revoke project access or current organization membership before export and during attachment reads. The export must refuse without delivering a private program's data. Failed authorization reads must not become an empty Vault result or an approved export. | Not run | |
| 81 | Delay an export, then switch program, pathway, variant or account. Prior selections, receipts and late downloads must not appear in the new context. Double-click generation once and verify one active request. Changing attachment selections during export must be disabled. | Not run | |
| 82 | In the controlled harness, return a missing, partial, wrong-UUID, wrong-slot or wrong-hash attachment report with HTTP 200. The browser must hold delivery and report that attachments could not be confirmed. Return a mechanical attachment refusal and verify its explanation is visible. Fail the slot read or use an altered/unpinned template: show the read/refusal and an appropriate recovery path. | Not run | |
| 83 | Inspect attachment search, assignments and returned receipts at narrow and desktop widths in light/dark themes. Use keyboard focus, labels, remove/change actions and error retry; ensure long titles/UUIDs/hashes wrap without horizontal page overflow. Record human findings separately from automated layout checks. | Not run | |
| 84 | From the Data Room/catalogue, select current Data Room and Vault sources with known version hashes. Choose Build in editor → New document. The chooser must close and the existing New document form must open in the one editor, retaining the selected-source count. Opening/cancelling the form must issue no document create, preview, build or generation request. | Not run | |
| 85 | Choose an applicable existing template (including an internal, unbound planning outline), enter a title and create once. Verify the chosen template, actual CTD module or preparation-only null module and current project on the saved record. Open only the server-returned document UUID, even when another record is first/newest or has a similar title. Verify both original source identities and hashes; no source prose, assembly or AnA generation occurs until explicitly requested. | Not run | |
| 86 | From the already-open editor’s Project files/source chooser, choose New document. Verify the same form/picker opens once, with one active focus trap and one editor. Cancel or Escape, then use ordinary New document: the cancelled source request must not reopen or attach its sources. Check keyboard focus and small viewport scrolling. | Not run | |
| 87 | Type an unsaved test paragraph, start a selected-source document and cancel the unsaved-work decision. Keep the same buffer. Repeat, continue to the creation form and cancel it: the original text must remain guarded on the next leave attempt. Create a document with a controlled reordered working-list response; cancelling the actual document switch must retain the original editor/text. An explicit later open may continue through the leave guard to the exact created record without another POST. | Not run | |
| 88 | Change the actual selected sources/checksum while the source-linked form is open. Creating must refuse before POST. Change sources while an already-requested create is pending: retain the confirmed record or unknown outcome honestly, but attach no retired sources or guessed document. Select sources again deliberately before building. | Not run | |
| 89 | With the operator’s controlled delayed-response fixture, change project A→B→A, replace/sign out the account session or leave the editor. Late creation/read responses must not open or bind sources in the new context. A legitimate same-session token refresh must still allow the current attempt, using its original actor ownership. | Not run | |
| 90 | With an identified uncertain-creation fixture, use Check working documents, then Open identified document. Verify its exact recovery UUID/project and original source hashes, no automatic open before that choice and no duplicate create. For a generic unknown response without an identified record, inventory/title/list order must never infer which document this request created. | Not run | |
| 91 | Use a filtered or pinned editor host for a selected-source New document. After confirmation and form close, the existing exact-document handoff must reach the one editor with the original source selectors. If the returned record is absent or inaccessible in the refreshed project inventory, show the known-created/opening limitation and bind no sources to another record. Preview/build and any AnA generation or acceptance remain separate explicit choices. | Not run | |
| 92 | Open Build document or section in the existing editor. Search loaded template metadata by module, recorded region/agency, type or description. Confirm counts reflect the loaded roster, clearing returns keyboard focus, the native Template select remains usable and there is no blank-document creation option in assembly. A failed or unavailable catalogue is explained distinctly from an empty result. | Not run | |
| 93 | Choose a template, target and reason, then Preview build. Search for a different template so the current choice is filtered out, then clear. Confirm the selected template ID, preview, target, reason and selected source versions are retained, with no request caused by search/Clear. Build explicitly with and without AnA; preserve existing text and review each generated candidate separately. | Not run | |
| 94 | In the build disclosure, verify search, Clear and Template are disabled while unsaved editor changes, a read-only/frozen document, pending build or unknown outcome holds the lane. Do not retry an unknown write. Use the existing explicit recovery check; search alone must never create, preview, build, generate or accept content. | Not run | |
| 95 | Enter an assembly template search in project/document A, visit another document/project and return. Verify current-owner query separation and exact template choices; no stale result changes another document. Ordinary same-session refresh retains the query; account/session replacement starts a fresh owned build state. No source or candidate is borrowed between owners. | Not run | |

| 96 | In Data Room/catalogue, Vault, or an existing Protocol/CSR/IVD saved-source action, create one working copy in the selected project. Verify the recorded source identity/hash or fingerprint, project and saved section codes. Opening is a separate choice and reaches the existing editor. A reused edited copy retains its actual saved text and section structure. | Not run | |
| 97 | With the operator’s delayed-preview/create/body fixtures, replace the signed-in account/session, change project A→B→A, mutate the selected source, or close the owner. Earlier reasons, previews, receipts and Open controls must not appear in the new context. The retired intake must permit Close and explain that an already-sent save may have completed in its original project. | Not run | |
| 98 | Refresh the current session normally during source preview, creation and a multi-read recovery check. Retain the current reason/preview and outcome; each dispatched operation must keep its captured headers for every hop. The next deliberate operation uses the refreshed bearer. A raw storage-only bearer replacement must refuse. Record only request counts and sanitized actor IDs, never the bearer. | Not run | |
| 99 | Interrupt a source-copy response after dispatch, or return a malformed successful receipt, 408 or server error. Verify another Create and preview replacement remain held. Close must remain available after the uncertain outcome; closing/reloading must never claim to cancel the server write. Inspect the original project before another copy. | Not run | |
| 100 | For a generic uncertain source copy, choose Check working documents. Verify only scoped reads occur and inventory does not identify a receipt by title, date, order or emptiness. No document opens automatically. Inspect Author before deliberately creating again; a workflow source additionally requires a fresh explicit preview. | Not run | |
| 101 | For an identified uncertain source copy, check the exact recovery UUID through current scoped inventory, header and sections. Whole-document access, original actor/project/organisation and saved import provenance must match before Open is offered. Foreign/malformed identities, section-only projections, unavailable source metadata and failed reads remain held. An edited recovered workflow uses its actual saved section choices. | Not run | |
| 102 | After a confirmed/recovered receipt, change the editor’s dirty-work/ceremony hold and then choose Open. The latest host guard must prevail while preserving the copy. If closing the intake changes account/project, do not navigate with the earlier receipt. Verify keyboard Close/Escape, focus return and small viewport scrolling using existing dialog styles. | Not run | |

| 103 | In the project’s Evidence step, select current Data Room and Vault sources and choose Build in editor. Open an exact current whole working document, then repeat with New document. Both paths preserve the selected IDs/hashes and use the existing editor/form. Before explicit creation/build, only scoped inventory reads occur. | Not run | |
| 104 | With the operator’s controlled Close callback fixture, change account/session, project A→B→A or the current source predicate, or open a governed ceremony during Close. Neither Open nor New document may publish/navigate with the earlier selection. Ordinary Close/unmount must still allow a valid explicit handoff. | Not run | |
| 105 | Refresh the session normally during an inventory response/body read. Preserve the selected document/sources and accept the valid reply; each GET retains its dispatched actor headers, and the next GET uses the adopted bearer. Raw storage-only replacement, anonymous launch and stale retained callbacks must refuse, mask private choices and explain the original-context refusal. | Not run | |
| 106 | Return explicit section-only, missing/unknown readScope, duplicate UUID or foreign-project inventory rows through the controlled fixture. Section-only targets are unavailable; malformed/foreign lists show a read error and may retry. After a genuine handoff is consumed, changing its original sender or selected sources must retire it; copied/raw commands must not acquire ownership. Check keyboard Close/Escape and footer access at desktop/phone widths in both themes. | Not run | |

| 107 | Build several eligible empty sections with AnA. Before the first section is inspected, have a collaborator save text in it. Confirm that section is shown as preserved, receives no candidate/review control, and the following empty section receives a candidate for separate review. Existing text and section order stay intact. | Not run | |
| 108 | Stop preparation or use the operator’s provider-refusal fixture. Save manual text in the first pending section, then choose Retry remaining candidates. Verify the saved row becomes preserved, later empty rows continue, completed candidate edits/reasons remain, and no text is accepted automatically. | Not run | |
| 109 | Repeat with all pending rows filled manually, and with an exact single-section target. All-filled rows show preserved with zero generated candidates; a selected target never starts other sections. A later retry does not regenerate completed/preserved rows. | Not run | |
| 110 | With the operator, interrupt the exact saved-section read or return a missing/wrong-code row, then test Stop and a project/account change during a delayed read. Preparation must stop before later candidates; an unreadable section is not shown as preserved. Return only through existing explicit checks/retry controls. | Not run | |

| 111 | For an eligible PMDA, EMA, Health Canada and FDA template, build with AnA using section guidance and stated requirements. Open Review and choose Draft again. With the operator, compare both requests: region, bounded template-reference context, requirements and selected-source receipt must match. No candidate is accepted automatically. | Not run | |
| 112 | After assembly, edit the build form’s requirements and review an earlier candidate. Its Draft again must retain that candidate’s original inputs. Switch sections and Close/reopen review; each section retains its own inputs, reviewed text and reason. | Not run | |
| 113 | Discard explicitly, then change Tone, Region, Context and Requirements using the existing controls. Close/reopen or switch away/back before drafting; the chosen values must remain for that section. A standalone draft keeps its existing initial region or FDA default. | Not run | |
| 114 | Using the operator’s refusal fixture, regenerate an edited candidate and verify its review text/reason and chosen inputs survive. An unknown acceptance outcome or a retired source/project/account still blocks further work through existing controls; input retention must not authorize a write, replace selected sources or revive a late reply. | Not run | |

| 115 | Select a long Data Room source and repeat with a Vault source whose relevant passage is beyond the opening 8,000 characters. Choose an exact template section with a matching scientific title. Preview shows a later bounded UTF-16 excerpt and its hash; verify the exact source slice with the operator. Build preserves that manifest and does not copy evidence into authored prose. | Not run | |
| 116 | Repeat with a relevant term found only in the selected section’s guidance, then with Japanese section guidance/text. A saved section may have a renamed heading; relevance must use its canonical template heading/guidance. Confirm normalized code selection still targets the same exact row. | Not run | |
| 117 | Repeat a whole-document preview and a selected section with no matching terms. Whole-document selection keeps its existing query behavior; no matching section term keeps the opening excerpt. A short source remains whole. An excerpt is bounded reference intent, not a full-source scientific review or evidence that AnA used it. | Not run | |
| 118 | After preview, change the extracted source text through the operator’s controlled fixture, including a same-length correction. Build must refuse the stale manifest without section/evidence writes. On unchanged sources, saved-reference reuse and drafting must replay the exact recorded span without reranking; acceptance remains an explicit separate action. | Not run | |

| 119 | Open a saved medical-device, diagnostics or life-sciences narrative section and ask AnA to review it and prepare an addition before a specific passage. Inspect Anchor and Addition, apply through the existing card, and verify only the addition is pending with AnA attribution. The anchor remains unstruck; no save or approval occurs. | Not run | |
| 120 | Repeat after a passage with multiple paragraphs, a list and a table. Additions must fit the named paragraph/cell boundary, preserve formatting and position, and refuse a mid-paragraph or incompatible list edge. Reject and reload; the original section must return exactly, without empty added structure or literal fallback replacing the intended structure. | Not run | |
| 121 | Ask AnA to draft source-supported text for a genuinely empty saved section using an insert-empty remedy. Review, apply, reject and reapply; review state must reflect the actual editor. Save with a reason only as a separate choice. A section containing even an empty table, citation, pending text or several empty paragraphs must refuse this operation. | Not run | |
| 122 | After AnA reads an empty section, type unsaved text before applying its empty-section draft. It must refuse without changing or saving the typed text. Repeat a stale saved version, ambiguous quote, existing tracked anchor, read-only/frozen/source mode and unavailable or unqualified model; each must retain its existing refusal. | Not run | |
| 123 | In an M11 protocol at section 3, ask AnA about the open section. With the operator, inspect the actual prepared prompt: the document type remains protocol; a bare 3 must not add Module 3 CMC or Phase 1 IND guidance. Repeat a device/global component section and Canada, EU and Japan administrative section 1; their codes must not inject a US IND playbook. | Not run | |
| 124 | Repeat with unknown/unread document type, then a verified US IND. Unknown scope must remain unknown without a guessed section playbook; the exact US IND may retain its existing scoped supplement. Confirm current template/section/evidence readers remain available. This prompt check does not establish scientific accuracy, full oversight, regulatory completeness or human-operation parity. | Not run | |
| 125 | Open a saved template-based section, rename its heading and request a draft using the existing panel. With the operator, verify the recorded prompt contains that exact section’s retained guidance and limits, labelled as reference data. A newer/current template or another section must not silently replace the retained reference. Source evidence, user requirements and the candidate’s prompt digest remain distinct. | Not run | |
| 126 | Use a section assembled from a narrative template inside a different/manual parent. Its own template identity, guidance, limits and region must govern the draft; parent-only identity and limits must not leak into the section prompt. The parent document and saved section text stay unchanged until explicit acceptance/save. | Not run | |
| 127 | For recorded Japan, Canada and EU section templates, use the existing Region control. A conflicting explicit FDA value must refuse before source retrieval or model dispatch; choose the matching value and retry explicitly. With the operator’s isolated request fixture, omission derives PMDA, Health Canada or EMA; GLOBAL/unknown references establish no receiving jurisdiction. | Not run | |
| 128 | Try automated drafting for a template marked manual, preparation or aiDraftable=false. The request must refuse without model/turn/candidate/content writes. Original forms, datasets and signed records remain original; the existing manual editor remains available to an authorized author. | Not run | |
| 129 | With the operator’s isolated refusal fixtures, try a malformed retained reference, a section assembly for another saved project, and an assembled section without a saved project. Each must refuse before reading selected sources or calling the provider. Separately verify ordinary ad-hoc and historical identity-only references remain usable without invented eligibility or source fields. | Not run | |
| 130 | Use a reference containing long non-ASCII guidance or limitations that exceeds the full 16 KiB UTF-8 reference budget. Drafting must refuse rather than clipping mandatory context; no candidate is retained. A bounded request must preserve exact guidance, user tone/context/requirements and selected-source receipts. Review/source checks and acceptance remain separate. | Not run | |
| 131 | In the existing template picker, create Clinical Study Report (CSR) and reopen it. Verify all 119 canonical E3 working headings, including 11.4.2.8, 12.3.2, 16.1.2, 16.3.1 and 16.4; sections start empty and retain their guidance. AnA template paging must reach every heading. A full outline is not a completed study report. | Not run | |
| 132 | Use source-supported CSR narrative drafting, with the intended Region selected. Section 3 and sections 14–16, including signed appendices and patient CRFs, must refuse automated drafting and retain manual/source preparation. Verify ethics section 5 remains narrative. Distinguish sample blank CRFs at 16.1.2 from completed patient records at 16.3. | Not run | |
| 133 | Build an eligible regional CSR outline with AnA. More than 20 pending narrative sections must prepare at most 20 candidates per explicit action and retain every remaining section for continuation. Continue, stop, retry a failed request and select one exact section; completed candidates and newly saved manual text must be preserved. Review and acceptance remain per section. GLOBAL templates must not silently infer an assembly region. | Not run | |
| 134 | Create both Blank case report forms (CRFs) and design specification and CRF annotation and data mapping worksheet from the existing library. Draft manually and with AnA using the same editor; review form fields, visit rules, choices, edit checks, specimen/diagnostic details and mapping gaps. No patient observations, executed signatures, certified annotations or EDC deployment must be implied. | Not run | |
| 135 | On a project-filed protocol's Study design tab, open CRF shell. Verify actual prompts, types, units, visit IDs, provenance hints and placeholders. Open blank CRFs in editor, review the exact saved-source fingerprint/gaps, provide a reason and create the working copy. Open its chosen section in the sole editor, edit/save/reopen and verify source design/protocol remain unchanged. | Not run | |
| 136 | Change the saved design after CRF preview: creation must reject drift until a fresh preview. Try another organization/project or a revoked actor; no copy may be created. Switch study/project during a pending projection/import: old replies must not display or open in the new scope. Retry an unchanged import to reuse the existing edited copy and retain source lineage; approval and signatures remain separate. | Not run | |
| 137 | Open a saved section assembled from a CSR or blank-CRF template inside a different parent, then ask AnA which section requirements apply. With the operator, inspect the prepared conversation prompt: the section's own retained source, guidance and limits must govern; conflicting parent-only outlines must be absent. A non-registry CRF component must not acquire a US IND or receiving-agency identity. | Not run | |
| 138 | Open CSR original-record appendices, including a historical IND section whose recorded E3 reference lacks a newer drafting-mode field. AnA must be able to inspect and explain their retained requirements while preserving manual/source preparation, original patient records and signatures. VIEW access to frozen or manual sections must not grant drafting, editing or approval authority. A stale client DRAFT status must not replace the current saved FROZEN status in AnA's authoritative context. | Not run | |
| 139 | Rename a saved section and compare its retained guide with a newer current template. Ask AnA about it; recorded guidance must remain distinguishable from a current reference, and the actual saved section identity/code must control context. An unavailable exact source must not silently become another section's guide or a client-supplied type. | Not run | |
| 140 | With the operator's isolated fixtures, use a section-only or current email-based VIEW grant, then revoke it or the project membership. Try a section from another document/project and a stale administrative role. Authorized oversight must work; denied/unread context must be explicit without exposing saved template metadata. No other section's content may be read to prepare this reference. | Not run | |
| 141 | Test missing request/current project context, a malformed assembly receipt and retained guidance exceeding the full 16 KiB UTF-8 reference budget. AnA must report unavailable saved context without clipping mandatory guidance or falling back to the parent. A surface-only public registry classification must remain labelled as stated by that surface. | Not run | |
| 142 | With the operator, exercise the live editor stream and the JSON chat route, including its custom system-prompt option. Confirm that the final model messages and retained input record contain the same admitted section reference. Guidance must remain reference data, separate from scientific source evidence and answer-grounding claims. This transport check is not clinical or regulatory validation. | Not run | |
| 143 | With an operator's isolated CSR drafting fixture, return empty or whitespace output for a requested section. The job must name the missing section, retain successful outputs and remain failed; dependent submission continuation must not run. An explicit retry must fill missing or previously blank output while preserving valid saved sections and reporting progress only for the requested target set. | Not run | |
| 144 | Draft CSR ethics section 5 with an isolated provider-refusal or empty-output fixture. The template must identify missing IRB/IEC, consent and ethical-conduct records and remain incomplete. It must not assert approval, obtained consent or GCP compliance from study metadata. Verify its template origin; source-supported narrative generation and human review remain separate. | Not run | |
| 145 | Save a study with safety-category ECG linked to a recorded safety endpoint and unlinked laboratory/vital-sign activities at known visits. In the existing CRF shell and editor import preview, verify all named assessments remain alongside the generic AE form. After create and reopen, compare each form's actual activity identity, endpoint field, visits and explicit unknown-field placeholders with the saved design. | Not run | |
| 146 | Change the saved safety endpoint or activity after CRF import preview. Creation or reuse with the old fingerprint must refuse without modifying the existing edited copy. Refresh the preview explicitly and review the changed safety forms and gaps before importing; no CDASH validation, observed patient values or collection readiness may be implied. | Not run | |
| 147 | Create or open NDA, BLA, 351(k) and 505(b)(2) projects. On Plan, compare the exact recorded filing identity, saved section outline, working guidance and template doors with the project record. Guidance must not claim complete legal requirements. Open a selected template in the sole editor and reopen the saved copy. | Not run | |
| 148 | Replace the account/session while keeping the same project URL, then switch projects and return. Prior project identity, outline, template roster and creation forms must retire immediately; late replies and retained callbacks must not restore old context or initiate a write under the new account. | Not run | |
| 149 | In a BLA project, start a CSR, protocol and blank document. Filing/shared suggestions must preserve the exact selected template, all-template search must remain available, and blank must have no invented CTD placement. A stale filing choice must require a fresh explicit start. | Not run | |
| 150 | Create protocol, IB, SAP, specimen ICF, DSUR and PBRER working copies. With verified project sources and an approved configured provider, prepare eligible narrative with AnA; manually edit, save and reopen. Inspect actual retained references and source attribution. A blank ICF is not executed consent. | Not run | |
| 151 | Try AnA drafting for protected title/approval records, generated indexes/schedules, original signatures, tabulations and appendices. It must refuse that narrative operation while retaining manual/source preparation. An earlier saved manual template snapshot must not become narrative merely because the current catalogue changed. | Not run | |
| 152 | Start the IND early protocol outline and finalized protocol. Both must show the actual M11 working structure without CSR-result headings. Start the SAP deliverable and verify its complete existing planning structure and document-local codes, without inventing a filing placement. | Not run | |
| 153 | Create the distinct meeting packages, IND amendment/clinical-hold documents, CBE-30/CBE-0 and ISS/ISE working documents. Compare their exact retained source identity and parts. Confirm US/FDA scope, region mismatch refusal, original-form/data protections and distinct subtype selection. | Not run | |
| 154 | Start US prescribing information. Inspect the PLR source structure and the unconfirmed boxed-warning/applicability controls. Draft supported narrative and retain original labeling/format fields. No approved labeling, product assessment or validated SPL output may be implied. | Not run | |
| 155 | Start a nonclinical working report, draft supported methods/results/discussion text and verify its source gaps. Original title/GLP/signature records and tabulations must remain source/manual parts; the working copy must not replace a signed original report or imply verified GLP. | Not run | |
| 156 | Start drug-substance and drug-product components and their IND aliases. Compare narrative/manual modes against the exact canonical heading record. Original data, tables and mixed source parts remain protected. Whole Module 3 stays a preparation scaffold; biologic or non-US authorship must not imply access to the small-molecule US IND composition engine. | Not run | |
| 157 | Load US regional Module 1 and GLOBAL Modules 2–5, save and reopen their deep canonical headings and exact scopes. Whole modules remain preparation documents. GLOBAL Module 1 must remain unavailable with a reason and must not borrow US requirements. | Not run | |
| 158 | From an accessible agency letter/question, preview and create its exact response working copy in DocumentWorkbench. Verify question/context and the selected answer section, source revision, current visibility, independent copy and unchanged response register before explicit writeback. Try another project or a revoked role; private text must remain inaccessible. | Not run | |
| 159 | Edit/save the answer in the shared editor, then explicitly use the saved response with a reason. Confirm exact document/section/hash/time and response-revision checks, the existing governed answer writer, new revision/audit history and unchanged original signature. Re-review and sign the new answer independently before package inclusion. | Not run | |
| 160 | Change the source answer or saved editor version during response preparation; stale writeback must refuse. Refresh the source explicitly and make a second amendment without overwriting the earlier edited copy. Known AnA attribution and retained source clauses must survive fresh imports and must not be relabelled human or unknown. | Not run | |
| 161 | In a response working copy, try unsupported rich structures or pending tracked changes. The plain response-register boundary must refuse without flattening or dropping content. Supported paragraphs and line breaks must survive exactly; preserve the rich working document separately for the applicable attachment/export workflow. | Not run | |
| 162 | Switch letter/project/account/session with a response dialog, pending read, pending save or retained callback. Prior questions, editor candidates, reasons, signing targets and busy/notice state must retire before effects; stale callbacks must not initiate new reads or writes. An uncertain prior write must not be retried blindly. | Not run | |
| 163 | Run the canonical coverage report and inspect the biotech matrix. Template/blueprint facts, tested workflow evidence, original forms, live-provider/human status and specialty/format gaps must stay separate. Counts must not claim complete biotech coverage, Weave parity, regulatory correctness or actual agency delivery. | Not run | |
| 164 | From the existing CSR workflow, request a results section without retained results, then repeat with an explicitly unavailable pack. Check both job and on-demand paths with an operator. The outcome must identify missing data and template origin without billing a model or asserting a clean safety finding, event severity or actual conduct. | Not run | |
| 165 | Draft ethics/consent and statistical-methods sections with missing records and with recorded late approval or post-unblinding SAP changes. Inspect the actual model context and output. Approval, GCP, consent and prespecification must not be inferred from metadata; gaps and deviations need independent review. | Not run | |
| 166 | In the CSR interview, record both met and unmet primary outcomes, including a therapeutic-area branch. Both paths must reach robustness questions, distinguish sensitivity/supplementary/post-hoc work, and allow an analysis not performed without inventing a result. An AE count alone must not produce a high-rate conclusion. | Not run | |
| 167 | Compare superiority, noninferiority, equivalence and Bayesian study records with the CSR drafting guidance. Verify the actual source analysis set, margin/threshold, interval type and decision; no p-value, clinical conclusion or new analysis may be invented. Clinical/statistical reviewers must assess the resulting prose separately. | Not run | |
| 168 | With an operator's isolated delayed-model fixture, revoke access or withdraw/change the retained source before the reply returns. The job must refuse the late section and retain earlier outputs. Repeat a fully populated resume with changed evidence or missing lineage; it must not silently complete or overwrite prior work. | Not run | |
| 169 | Compare owner/editor and read-only/review-assignee accounts on the same retained CSR job. Retained reads may remain available, but build, review writes and cancellation require current edit permission. A pending-deletion tenant must retain allowed history reads while refusing these writes; disabled users must be refused. | Not run | |



Cases 68–72 extend the [Authoring refiling version contract](../design/AUTHORING_REFILING_VERSIONS_2026-10-23.md).
They exercise editable working documents; frozen/sealed Authoring content remains
immutable under its existing revision policy. The retained legacy version review
boundary is an explicit limit, not an automated migration or renumbering action.

Cases 164–169 extend the [CSR expertise contract](../design/CSR_EXPERTISE_IMPROVEMENTS_2026-10-30.md).
Operator-controlled failures and captured prompts qualify transport and refusal behavior only.
Record real human observations separately from mocked-provider automated checks; these cases remain unrun.

For case 15, use the canonical registry entries `US_NDA`, `CA_CTA`, `EU_CTA`,
`JP_CTN`, plus `component:quality_overall_summary`; identify choices by the
returned template UUID and saved source metadata, not just their labels. Also
open `component:pil` to verify the missing-outline preparation notice, and sample
IND module starts M1 through M5. The earlier medicinal/IND built-in inventory is 305; device/diagnostics additions
are recorded in the [current device/diagnostics inventory](../evidence/D2-DEVICE-DOCUMENT-COVERAGE/2026-10-20/template-inventory-final.json).
Organisation/shared database templates may add rows. The earlier
[inventory](../evidence/D2-EDITOR-INTEGRATION/2026-10-14/global-biotech-templates/template-inventory.json)
records the exact expected built-in IDs. Do not expect an EU CTA, Japanese CTN
or shared component to inherit a fabricated US IND module or receiving market.

For cases 28–33, use the [source-first contract](../design/CATALOGUE_SOURCE_ASSEMBLY_2026-10-17.md). Source-reference intent, actual model consumption, accepted citations and filing approval are separate outcomes; record each one as observed.

For cases 84–91, use the [selected-source document-start contract](../design/SOURCE_ASSEMBLY_DOCUMENT_START_2026-10-23.md). Creation saves the working document; source version/excerpt verification belongs to the later explicit preview/build. A source selection is not a citation or an approved filing.

For cases 92–95, use the [assembly template discovery contract](../design/ASSEMBLY_TEMPLATE_SEARCH_2026-10-23.md). Search filters loaded display metadata; the explicit current preview remains the authority for source and filing scope.

For cases 96–102, use the [source intake ownership and recovery contract](../design/SOURCE_INTAKE_OWNERSHIP_2026-10-23.md). Conditional source-version reuse is not durable request idempotency. An exact recovered working copy does not establish current source eligibility, filing approval or submission readiness.

For cases 103–106, use the [selected-source handoff ownership contract](../design/SELECTED_SOURCE_HANDOFF_OWNERSHIP_2026-10-26.md). Automated component/browser results use synthetic HTTP and remain separate from these human observations. The current project journey is Plan → Evidence → Author → Review → Submit → Respond.

For cases 107–110, use the [assembly queue completion contract](../design/ASSEMBLY_QUEUE_COMPLETION_2026-10-26.md). Preserved means exact saved text was observed; it does not mean AnA generated, reviewed or accepted that text. Automated synthetic-HTTP regressions do not fill these human observations.

For cases 111–114, use the [regional redraft contract](../design/EDITOR_REGIONAL_REDRAFT_2026-10-26.md). Drafting options are editable review inputs, not evidence that a receiving market or candidate’s scientific content has been validated. These human observations remain separate from automated HTTP fixtures.

For cases 125–130, use the [saved draft-guidance contract](../design/EDITOR_DRAFT_GUIDANCE_2026-10-26.md). Verify the actual recorded request/prompt with an operator. Reference identity and a successful draft do not establish model use, scientific accuracy, current legal applicability or filing readiness. These six human cases remain pending.

For cases 119–124, use the [AnA amendments contract](../design/EDITOR_ANA_AMENDMENTS_2026-10-26.md). Additions use the same model, version, tracked-change and source boundaries as existing fixes. All six human observations are pending; automated fixtures and prompt inspection do not establish live model competence.

For cases 115–118, use the [section evidence contract](../design/EDITOR_SECTION_EVIDENCE_2026-10-26.md). Matching section terms improves excerpt selection; it does not establish scientific relevance, complete review, model consumption or filing approval. Recorded spans and source hashes remain authoritative.

For cases 34–37, use the [saved-reference contract](../design/SAVED_ASSEMBLY_SOURCES_2026-10-18.md). The last recorded source selection is historical build intent. Its successful read does not select it or establish current citation support; reuse requires a fresh check and another explicit preview.

For cases 18–22, sample the existing Reporting, Biostatistics, statistical
calculator, PV, CMC change, CMC quality and CMC correspondence result controls;
record the specific control and request counts. These are existing specialist
surfaces leading to the same editor. Coordinate response interruption and
permission changes with the operator; retain the source result and original
save payload while comparing outcomes.

Recovery guards last only for the mounted component's lifetime. They provide
no durable backend idempotency across remount, reload or another tab. After
those transitions, inspect current working documents before creating another
copy. Even a successful scoped inventory check cannot attribute an unknown
write to this request or prove that no write committed. Later creation is an
explicit human choice, not an automatic recovery retry.

## Record the session and unresolved prerequisites

| Field | Actual observation |
| --- | --- |
| Session date/time and timezone | |
| Canonical commit SHA | |
| Codespace name / private port URL | |
| Tester names/roles and organisation | |
| Browser, viewport, theme and input method | |
| Local database name / runtime role (no URL/password) | |
| Install/migrate exit codes and health component states | |
| Project, document, template and source/version IDs | |
| Manual cases passed / failed / blocked / not run | |
| AnA cases passed / failed / blocked / not run | |
| Peer-review requests, snapshots and verdicts | |
| Vault version, artifact SHA-256 and download verification | |
| Defect owner, impact, reproduction and follow-up commit | |
| Tester decision for another supervised session | |

File sanitized observations, selected screenshots and reproduction notes under
`docs/evidence/HUMAN-TESTING/<session-date>/`, with the actual tested SHA. Do not
commit a bearer token, password, secret, connection string or raw network capture
containing them. Keep automated, synthetic-browser and actual human results
separate. Existing CI and synthetic fixtures do not fill this worksheet.

Before calling a lane ready, resolve or record these specific prerequisites:
local installation/runtime role; private browser access and account membership;
source extraction/storage/scanner availability; export runtime for the chosen
format; an independent reviewer; and approved provider/embedding/placement for
AnA. A network failure or malformed creation receipt has an unknown write
outcome. A scoped read verifies current inventory; it cannot identify which
request created an unknown document or prove that nothing was saved. Do not
retry blindly.

The launch catalog remains Projects, Vault, Authoring, Submission Center,
Submission Readiness, QMS controlled documents, Reporting & analytics, and
entitled CMC / Module 3. This editor session does not qualify every launch app.
CMC composition remains limited to a small-molecule US IND; biologics,
marketing applications and non-US clinical-trial applications use the existing
editor and applicable original records. Regional templates establish authoring
coverage, not regulatory completeness, agency acceptance, package validation
or transmission readiness. Never transmit a test package to an agency as part
of this session.
