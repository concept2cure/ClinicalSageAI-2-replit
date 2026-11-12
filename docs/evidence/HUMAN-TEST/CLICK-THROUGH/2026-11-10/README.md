# Click-through of the Codespace UI, second run (2026-11-10)

Launch row **D2** (the launch catalog works in the app). Lead session `session_011DpxUyQmE1enma4gTjcfBy`. The first
run is `../2026-11-06/` (its method, scripts and rerun steps). This run rebuilt the founder's Codespace from an empty
database with trunk's own `.devcontainer` scripts, then clicked through it.

## What already exists (RULE 3)

Nothing was built for this. The scripts are `../2026-11-06/clickcrawl.cjs` and `crawlsum.cjs`. The data is what a
fresh Codespace makes: `.devcontainer/post-create.sh` (`c2c_write_state`, `c2c_ensure_database`, `c2c_provision`,
`c2c_seed_accounts`), then `.devcontainer/post-start.sh` (the Lumen account and its pack, the demo packs, the idle
window, the CDISC pilot CSR study). The defects below were fixed in the existing files named, each test first.

## Found while building the Codespace, before any click

| # | Found | Outcome |
|---|---|---|
| A | A fresh Codespace's CSR study preparation never finished: "adsl.xpt sent: locator.click: Timeout 30000ms exceeded", repeated. The Vault's Library list now stays in the page, hidden, behind the Uploads tab, and the preparation clicked the first (hidden) copy of the file's name. | **Fixed.** Found here and sent to the CSR walk session, which landed the same one-line fix (`70ec16da36`, `walk-common.cjs`). Walked from an empty database: the study is prepared. |
| B | After the demo seed's second signer approved a project's controlled documents, **every project Vault in the organisation answered 500** "Failed to build project vault", the CSR study's included. | **Fixed** (`8c4a9e5a8a`). See below. |
| C | Every two-person demo step (QMS approvals, method validation, the RACT's approval, review requests; 20 steps) was recorded "not executed": the Codespace passed no second signer. With the RACT a draft, RBM's "Generate from RACT" was refused on every project (finding 10 of the first run). | **Fixed** (`11aa491184`, then the designation below): the approver is the second signer. |
| D | With the approver as signer, a fresh Codespace's QMS packs failed, not skipped: every demo person is an administrator, and with no QMS approver designated only the Approver role approves. The seed never finished, so it re-ran on every start. | **Fixed** (`ff49ebed77`): the start designates the approver as the organisation's QMS approver, once, through the governed route an administrator uses (`PUT /api/tenant-users/:org/:user/qms-approver`, with a reason, audited). From an empty database the seed finishes with every approval signed; 26 steps stay "not executed" (24 lumen-vault steps want a third person, sent to the Codespace session; orchestration is outside the launch; Shadow Review needs a key). |
| H | An existing Codespace's next start (reported by the Codespace session): with a signer now present, the seed asked for review on documents a previous run had frozen or approved (409 `AUTHORING_DOCUMENT_IMMUTABLE`) and never finished. | **Fixed** (`7aeecfc654`): a document past review is found, not re-requested, in the biotech and device packs. Shown red then green: `scripts/demo/launch-demo/authoring-rerun.test.mjs`. |
| J | A re-run of the seed over its own data (each start after `scripts/demo` changes) stopped at "The project Task Board contains malformed or duplicate task titles": once the SOPs are effective, each member holds a "Read and acknowledge …" task of the same title, and the task step read every title on the board as its key. | **Fixed** (`c9a3680a24`): only the seed's own titles are its keys. Shown red then green in `faux-demo.test.mjs`. Walked: the start re-ran the seed over its own data and it finished. |
| I | The prepared CSR study had no IND number, sponsor, D-U-N-S or FDA contact, so Dispatch → "Download an inspection copy" answered 409 `PACKAGE_IDENTITY_MISSING` (first run, item 4). | **Fixed** (`cc06768a51`, P-115 item 4: a CSR goes to an open IND): the preparation records a clearly fictional IND (999901) and sponsor through the applicant identity's own routes. Walked: recorded and bound. Not walked: the inspection copy itself, which needs the amendment sequence P-115's CSR filing walk makes. |

### B, in detail

A project's Quality records are captured into its data room as sources, each with a snapshot. Approval changes the
record, so the snapshot no longer matches and its admission refuses `NATIVE_SOURCE_CHANGED`. That was fatal twice
over: `listClientDocuments` checked every source in the organisation (so one project's stale snapshot refused every
other project's list), and the Vault never refreshed its own project's snapshots (only the data room's search does, on
its first page). Now the list checks only the sources it can return, and the Vault refreshes its project's Quality
sources first; a refresh that cannot be verified leaves the Vault up and names its data room unavailable. A stale
record still refuses its own project's list. Tests shown failing first:
`native-catalogue-current-records.pglite.test.ts`, `vault-data-room-counts.test.ts`.

## Coverage

Four runs on the fresh Codespace, all against the same app: A (projects, project home, authoring, protocol,
conversation) and B (communication, Vault, Submission Center, tasks) and C (work areas and administration, with every
rail button and account-menu item from Home) as Ana Author; D (every area of two Lumen projects, with the rail) as the
Lumen lead, where "Demo access" lands. They were stopped twice to push fixes, and restarted from the start each time.
The crawler now resumes from its own log, so a stop no longer starts a run again. It also skips "Start sequence 000N" past
0000: each one leaves a new, differently named button behind it, and a resumed run had made fourteen sequences on the
sandbox's CSR study before this was seen.

| Run | State at this entry | Result |
|---|---|---|
| A, projects and authoring (Ana) | **Finished**: 29 stops, 120 clicks | Nothing new. One browser-side "insufficient resources" while four browsers ran. |
| C, work areas and administration, with the rail (Ana) | **Finished**: 68 stops, 265 clicks | Nothing new beyond E, the correct refusals and the minor wording above. |
| B, Communication, Vault, Submission Center, Tasks (Ana) | **Stopped, not finished**: 38 stops, 1,343 clicks | Finding Q. Nothing else new. |
| D, the Lumen account, every area, with the rail (Lumen lead) | **Stopped, not finished**: 27 stops, 906 clicks | Nothing new. |
| E, the Lumen account, every screen and tab opened, a sample of each list clicked (Lumen lead) | **Stopped, not finished**: 303 stops, 308 clicks | Nothing new. |

B, D and E ran one at a time, each browser for 20 clicks. They were stopped when the push's typecheck needed the
sandbox's memory (the typecheck was killed twice beside the app and a browser), and the sandbox then restarted. They
were not resumed: the walk of 2026-11-11 opens every one of their screens and tabs again, with production's
launch-scope gate on (`../2026-11-11-release-gate/`).

37 clicks in B and D timed out on controls inside a collapsed section (a seal's "Open", a version's "View" and
"Download", a readiness finding's "Place a leaf"). Current Chromium gives such a control a box though it is not
visible. Each kind was opened by hand in the running app: one was finding Q, and the others work. The crawler now
opens the section first (`3b030ecea2`).

### What the clicks found

| # | Found | Outcome |
|---|---|---|
| E | Biostatistics → **Save as a working document** / **Copy example to editor** / **Open in editor**: 503 on every project. The sign-in token carries the organization as text ("2"); the route passed it on unchanged, and authoring's project access refuses any identity that is not a positive integer ("Invalid project access identity"). | **Fixed** (`44f25b3fdb`). Walked: the save answers 201 and the screen says "Saved to the authoring store with its calculation inputs and source basis". |
| F | Vault → data room, C2C-101: "Captured 26 … 25 need review — the classifier would not propose a folder" over one listed source. The 25 were the project's own captured Quality records, which have no original file, which the list leaves out and no classifier read. | **Fixed** (`912ec3cf35`): the counts leave them out, the list's own rule. Shown failing first on PostgreSQL. |
| G | `8c4a9e5a8a` (B) broke 39 route tests in six Vault suites that mock the database but not the new refresh. | **Fixed** (`912ec3cf35`). All 31 suites that mount the Vault route pass (346 tests). |
| L | Communication → **Close letter** on a letter that still owes a response: refused, correctly (409 `RESPONSES_NOT_APPROVED`, with what to do), but the message read "…with a reason.. Nothing was stored." | **Fixed** (this change, `AgencyInbox.tsx` `notAdvancedLine`): one full stop. The refusal itself is right. Shown red then green in `agencyInboxClockLine.test.ts`. |
| M | **Download an inspection copy** on the Lumen account's LMN-201, where "Demo access" lands (and on C2C-101): 409 `PACKAGE_IDENTITY_MISSING`. The packs made a sequence but recorded no application number and no sponsor. | **Fixed** (`f1b6b6e6df`): each pack records a clearly fictional identity through the applicant identity's own routes (LMN-201 under IND 194021, the number its fictional letters already cite; C2C-101 under 999101). |
| N | With M fixed, the same button answered **500 "eCTD operation failed"**. The packager had refused for a filing reason it states in full (FDA validation 1789: study files no Study Tagging File would reference), and the export route reported the refusal as a server failure. | **Fixed** (`1a60f41481`): answered 422 `PACKAGE_VALIDATION_REFUSED` in the packager's words, with its findings. Shown red then green in `tests/unit/ectd-export-routes.test.ts`. |
| O | The cause of N in the demo data: LMN-201's protocol, consent form and toxicity report, and C2C-101's protocol and SAP, were placed in study sections naming no study. | **Fixed** (`73ebee2233`, `68db67431e`): each states its study id and ICH STF file-tag; the seed places them tagged and tags leaves an earlier run placed. **Walked:** the button now downloads `194021-0000-fda.zip` on the Lumen account and in the development organisation, and `999101-0000-fda.zip` on C2C-101. |
| — | The same button on the device project (**NeuroPanel-Dx 510(k)**): 409 `PACKAGE_IDENTITY_MISSING`. | **Open, the device lane's** (P-114 decided its regulatory questions): a 510(k) files as an eSTAR and holds no agency number before it is filed, so whether Dispatch offers an eCTD inspection copy there, and under what identity, is not a number for a seed to invent. |
| P | Compliance reports → **Run attestation**: 503 in every Codespace (no attestation signing key), shown as "Couldn’t produce the attestation · Attestation not configured" beside a "Try again" that could never work. | **Fixed** (`a19a92eab7`): the Codespace mints its own key, as it does its JWT secrets, on a new state and on an existing one; where an installation has no key the panel says so with no retry. **Walked:** the attestation returns "Audit trail: Links intact". |
| Q | Vault → Seals & fixity → "What it holds" → **Open** on a sealed document: the document was framed under the seal's 17 rows, below the fold, so the click looked as if it had done nothing. | **Fixed** (this change, `VaultVersionViewer.tsx`): what a view opens, or what the Vault says when it refuses, is brought into view, with no motion. It holds for a document's Versions section too, which uses the same viewer. Shown red then green in `vaultVersionViewer.test.tsx`; walked on LMN-201 (the Investigator's Brochure opens in view, with its hash line). |
| — | CMC → **Open the Module 3 build board** on LMN-201: 409 `CMC_PRODUCT_CLASS_OUT_OF_SCOPE`. | **Correct** (P-28's composition boundary: a biologic is refused by name, and the message says where its quality content is written). |
| — | RBM → **Generate from RACT** (first run's item 10). | **Correct.** With the seed's RACT approved, LMN-201's plan is generated (v1, 14 actions). On a project where RBM has not started, the tab says so and offers Start; Generate on a draft RACT is refused with its reason. |
| K | Biostatistics → **Assess defensibility** on the untouched form: a red error toast in developer words ("…the inputs listed in errors are missing or invalid. No verdict was formed. Missing or invalid: effectSize."). | **Fixed** (this change, `BiostatWorkbench.tsx`): a field not yet filled is named by its label beside the button ("To assess this design, enter: Effect size (standardized)."), with no error. Any other refusal is still shown in the engine's words. Shown red then green in `biostatWorkbench.test.tsx`; walked (the note, then a verdict once 0.5 is entered). |
| — | Authoring showed "Loading…" as it opened; the rail's Home, account and "Organizations and invitations" clicks timed out. | **The run's own.** "Loading…" is gone within a second; the rail buttons click when addressed directly (the crawler's text match misses an icon-only button and a multi-line label). |
| — | Shadow Review and AnA's starters: 503. | **Correct without a key.** |
| — | Submission Center → Sequences → **Validated** on a sequence with nothing placed: 422, shown as "Transition refused — Sequence 0000 was not marked Validated: its validation found 10 errors…", each with what clears it. | **Correct.** **Open, minor** (Submission Center's owner): the tab's helper text is written for developers ("Transitions POST the real lifecycle endpoint and the server's verdict is shown verbatim…"). |
| — | Project home → Respond showed "Reading…" as it opened. | **The run's own.** Gone within a second. |
| — | 429 on Quality's and the Vault's document reads. | **The run's own.** One page open makes 40 to 70 API requests (measured: Vault 47, Quality 44, Project home 70, Submission Center 41), so a person needs about ten full page loads a minute to reach the 600-a-minute ceiling; the crawler reopens the page for every click. Noted for the shell's owner: each open reads the session six times and the project five. |
| — | The app stopped three times mid-run (`uncaughtException: ENOSPC` on a log write). | **The run's own.** Measured: a headless browser reloading Submission Center on the dev server holds up to 7.6 GB of temporary shared-memory files until its own collection runs (about 1 GB a reload), so three browsers together exhausted the sandbox's disk. The areas now run one at a time, each browser for 20 clicks, with a guard that pauses the runs under 5 GB free. Not verified against a production build; noted for whoever owns Submission Center's load weight. The app's log holds no token: request logging records allowlisted metadata only. |

### Not this lane's, seen red on trunk

`section-sources-unverifiable-native.pglite` (3) and `tests/routes/chat-governed-upload` (1) fail with this lane's
changes reverted.

### For the platform owner

Every sign-in mints the token's `organizationId` and `userId` claims as strings (`server/routes/authEnterprise.ts`
844–845, 949), and `enterprise-security.ts` copies `organizationId` to `req.organizationId` as it is. So E was broken
in production too, not only in a Codespace. A route that hands either claim to a positive-integer check refuses, as
Biostatistics' save did. Fixed in that route only; other routes that read `req.organizationId` unconverted are worth
one search by the platform owner.

## Running it outside a Codespace

See `../2026-11-06/README.md`, "How to rerun it", which now names the three sandbox differences (the container's
`DATABASE_URL` and `.env`, `devcontainer.json`'s environment, pgvector).
