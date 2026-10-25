# D2 — the first session, run for real (decision 13)

Design: `docs/design/CLIENT_JOURNEY_2026-10-25.md`, "Pass 6". Founder decision 13 of the design interview: a scripted
first session, run for real — create an IND project, add a source, assign a section, draft with AnA, send for
review, see what is left.

## What already exists

| Path | What it does | What it does not |
| --- | --- | --- |
| `tests/e2e/golden-customer-journey.e2e.ts`, first test | The governed records of a draft: evidence, citation gate, version conflict, review under separation of duties, export gate. Run by CI on a fresh database (`tier5-browser-smoke.yml`). | Every step is an API call from a signed-in page; no screen is driven. |
| `tests/e2e/founder-critical-path.e2e.ts` | Sign-in, a project list, sign-out. | Not in CI; skips itself when sign-in fails. |
| `tests/e2e/biotech-founder-path.e2e.spec.ts` | Screens render without errors. | Not in CI; creates nothing. |
| `tests/e2e/seed-governed-workflow.cjs` | The e2e organisation and its admin, author, reviewer and viewer. | — |

The first-session test is the second test in the golden journey's file, reusing its sign-in helper and identities,
so CI runs it where it already runs the first.

## The journey (`first-session-*.png`, local install, e2e organisation)

| Step | Screen | Shot |
| --- | --- | --- |
| Home → "Create your first project" / "New project" | Home | — |
| IND, product, indication, drug, target date → Create project; opens on **Plan**, 8 phases | Wizard, Project home | `01-plan` |
| Evidence: a file dropped on the Data room is read ("text extracted") | Project home, Evidence | `02-evidence` |
| Plan: Target Product Profile → Assign → Admin User, Dec 15, 2026 → "Assigned to Admin User, due Dec 15, 2026" | Plan | `03-assigned` |
| Create from template → the editor opens the document | Editor | — |
| Draft with AnA → the conversation holds the request, "From Authoring", "Back to Authoring" | Conversation | `04-ana` |
| Back to Authoring → write → reason → Save → "Saved" | Editor | — |
| Send for review → Reviewer User, reason → "Review requested … Task … in Reviewer User's My work" | Editor | `05-sent` |
| Home → "Prepare: Target Product Profile", named by its project | Home | `06-home` |
| The project → Plan "n documents · 1 started", the assignment; Review lists the document with Reviewer User | Project home | `07-review-step` |
| The reviewer signs in → "Review: Target Product Profile", named by its project | Reviewer's Home | `08-reviewer-home` |

No model key is configured where this runs, so the AnA step asserts the hand-off, not a drafted answer.
`e2e-green.txt`: both tests in the file, green, on a local database that already held ten earlier runs.

## What it found, and what changed

1. **A new person's first Send for review offered no reviewer.** The `/api` limiter
   (`server/middleware/redisRateLimiter.ts`) counts every path with a `document`/`documents` segment in a
   20-a-minute bucket meant for generation, export and download. The Vault's metadata reads left it on 2026-10-08;
   these did not: `GET /api/c2c/documents`, `/api/c2c/documents/:id/outline`,
   `/api/authoring/documents/:id/{reviews,comments,tracked-change-decisions}`, `/api/data-origins/document` (a
   coverage summary, counts only). One clean first session used the bucket up; the review-requests read got 429 and
   the dialog said "who has already been asked is unknown and no one can be chosen". They now count in the metadata
   bucket with the Vault's reads — 600 a minute per person, still fail-closed — renamed `document_metadata` from
   `vault_metadata` (`server/config/platform-limits.ts`; the pinned fail-closed list in
   `tests/config/platform-limits.test.ts` follows the rename). Section text (`/c2c/documents/:id/sections/:key`), the
   document record, downloads, exports and every write keep the 20-a-minute ceiling.
2. **Home's open items could not tell projects apart.** "Prepare: Target Product Profile · Plan" was listed once per
   project, identically. `GET /api/task-management/my-work` now names each task's project
   (`server/services/tasking/my-work.ts`, moved out of the route unchanged in what it selects, joined to `projects`
   within the caller's organisation only), and `OpenWork.tsx` shows it on the row — on Home and in the top bar's
   "Your work". Tasks due the same day now come in a fixed order, newest assignment first (the database chose
   before).
3. **The row printed the module identifier as stored** (`submission-center`, `cmc`, `mdx` — found by the
   what-exists critic, checked against the code). The row now says the module's words through the existing label map
   (`clModLabel`, `fixtures/collab-data.ts`, extended with the stored spellings), not a second map.

## Tests, and each made to fail (`red/`)

| Guard | Test | Broken how | Red |
| --- | --- | --- | --- |
| Editor reads not refused after six opens; Send for review still accepted | `redisRateLimiter-vault-reads-and-batch-upload.test.ts` (3 new, 1 updated) | the source before the change | `editor-reads-in-documents-bucket.txt` (4 red) |
| One clean first session sends for review | first-session e2e | the new matchers removed, server restarted | `e2e-editor-reads-in-documents-bucket.txt` (red at Send for review) |
| Project names never another organisation's | `my-work.pglite.test.ts` (new, real SQL) | join without the organisation condition | `my-work-join-not-org-scoped.txt` |
| Each task names its project | `my-work.pglite.test.ts` | name dropped | `my-work-no-project-name.txt` |
| Same-day order fixed, newest first | `my-work.pglite.test.ts` | no second sort key | `my-work-same-day-order-undefined.txt` |
| Home row names the project | `homeOpenItems.test.tsx` (1 new) | the source before the change | `open-items-without-project-name.txt` |
| Home row names the project, in the browser | first-session e2e | the name dropped from the row | `e2e-open-items-without-project-name.txt` |
| Home row shows the module's words, not its id | `homeOpenItems.test.tsx` (1 new) | the source before the change | `open-items-raw-module-id.txt` |

Section text keeping the 20-a-minute ceiling is pinned by a test that passes before and after (it is a guard
against widening the carve-out, not a change).

Also corrected: AnA's description of the step-switching action (`shared/navigation/surface-actions.ts`) still said the
start box sits above the steps; since pass 4 it sits beside the open step.

Not fixed, seen on the way: the editor's draft request reads "Draft preparation Target Product Profile from the
linked section evidence." — the section's code is spliced into the sentence.
