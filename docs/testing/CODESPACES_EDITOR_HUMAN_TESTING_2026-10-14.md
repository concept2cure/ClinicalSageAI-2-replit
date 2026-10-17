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

## Twenty-seven tester cases and outcome worksheet

Use **Not run**, **Pass**, **Fail** or **Blocked**. A pass requires the observed
outcome and evidence; a blocked prerequisite is not a pass. A case with several
checks passes only when each succeeds. Record subcases separately when they
differ. Use the existing buttons, dialogs and native editor throughout.

| # | Action and expected outcome | Outcome | Evidence / defect / blocker |
| --- | --- | --- | --- |
| 1 | Record canonical commit, Codespace URL, browser, viewport/theme, organisation and tester roles. Confirm health components and app runtime role. Mark the manual and AnA lanes independently. | Not run | |
| 2 | Sign in as author. Confirm the organisation and Projects list. An empty account reports no programs honestly; sign-out and sign-in return to the same account, without another organisation's records. | Not run | |
| 3 | **New project**: select an appropriate filing from the registry, explicitly enter product type/name and indication where requested, review recorded values, and create once. Record the returned project UUID and any partial-scaffold notice. Open that project and confirm its identity. | Not run | |
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

For case 15, use the canonical registry entries `US_NDA`, `CA_CTA`, `EU_CTA`,
`JP_CTN`, plus `component:quality_overall_summary`; identify choices by the
returned template UUID and saved source metadata, not just their labels. Also
open `component:pil` to verify the missing-outline preparation notice, and sample
IND module starts M1 through M5. The published built-in inventory is 305;
organisation/shared database templates may add rows. The
[inventory](../evidence/D2-EDITOR-INTEGRATION/2026-10-14/global-biotech-templates/template-inventory.json)
records the exact expected built-in IDs. Do not expect an EU CTA, Japanese CTN
or shared component to inherit a fabricated US IND module or receiving market.

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
