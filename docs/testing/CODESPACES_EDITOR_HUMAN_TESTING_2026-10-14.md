# Codespaces editor human-testing handoff

2026-10-14, America/Los_Angeles. Workstream W1 / D2. This handoff targets the
application running in a **private GitHub Codespace**, on `concept2cure-v2`.
There is no deployment, staging or production prerequisite. All code, tests,
contracts and non-secret evidence stay in the canonical repository; completed
increments are committed and pushed directly with the normal hooks, without PRs.

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
SEED_DEMO_USER=1 \
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
NODE_ENV=development ALLOW_DEV_AUTH=1 PORT=5000 \
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
enter an existing local test account. This bypass is for this private development
session. The optional seed creates a local known-password account; it does not
populate a project, filing, document or submission, and it must not be mistaken
for customer content. Confirm the signed-in organisation before creating work.

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

## Fifteen tester cases and outcome worksheet

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

For case 15, use the canonical registry entries `US_NDA`, `CA_CTA`, `EU_CTA`,
`JP_CTN`, plus `component:quality_overall_summary`; identify choices by the
returned template UUID and saved source metadata, not just their labels. Also
open `component:pil` to verify the missing-outline preparation notice, and sample
IND module starts M1 through M5. The published built-in inventory is 305;
organisation/shared database templates may add rows. The
[inventory](../evidence/D2-EDITOR-INTEGRATION/2026-10-14/global-biotech-templates/template-inventory.json)
records the exact expected built-in IDs. Do not expect an EU CTA, Japanese CTN
or shared component to inherit a fabricated US IND module or receiving market.

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
`docs/evidence/HUMAN-TESTING/2026-10-14/`, with the actual tested SHA. Do not
commit a bearer token, password, secret, connection string or raw network capture
containing them. Keep automated, synthetic-browser and actual human results
separate. Existing CI and synthetic fixtures do not fill this worksheet.

Before calling a lane ready, resolve or record these specific prerequisites:
local installation/runtime role; private browser access and account membership;
source extraction/storage/scanner availability; export runtime for the chosen
format; an independent reviewer; and approved provider/embedding/placement for
AnA. A network failure or malformed creation receipt has an unknown write
outcome until the scoped read confirms what exists. Do not retry blindly.

The launch catalog remains Projects, Vault, Authoring, Submission Center,
Submission Readiness, QMS controlled documents, Reporting & analytics, and
entitled CMC / Module 3. This editor session does not qualify every launch app.
CMC composition remains limited to a small-molecule US IND; biologics,
marketing applications and non-US clinical-trial applications use the existing
editor and applicable original records. Regional templates establish authoring
coverage, not regulatory completeness, agency acceptance, package validation
or transmission readiness. Never transmit a test package to an agency as part
of this session.
