# ANA-SKILLS: skills in use — 2026-10-22 (second change)

**Lane:** ANA-SKILLS. The founder directed it on 2026-10-22, and it moves no D-row.

**Design:** `docs/design/ANA_SKILLS_2026-10-22.md` §10.

**Founder's direction:**
- Don't build anything new. Uplift what exists, in AnA, in the UI and in the experience.
- These are skills, not tools.
- An organization adds, creates, designs and tunes its own skills.
- Skills apply in admin, settings and setup, and per project.
- A person picks skills from AnA's chat.
- AnA still chooses skills on her own from what is asked.

## What already exists

The search, by path, is in the design's §10.1. Short version:

**Completed by this change:**
- The skills layer pushed in `359221e5`: selector, library, organization skills, Admin → Skills.
- The selector's `invokedKeys`, which nothing sent before.

**Reused:**
- The composer footer's Engine pill pattern.
- The project page's side column.
- AnA's own project admission (`admitAnaProjectScope`) and the project write admission (`requireProjectAdmission`).
- The governed drawer vocabulary.
- `orgToClientSegment` and `organizations.client_type`.
- The audit rows the skill writers already commit, read back as a skill's version history.

**Replaced:**
- The organization-skill drawer, by the skill studio. Its form builders were deleted in the same change.

**Not reused (reasons in §10.1):**
- `ana_project_capabilities`, which tracks capability-catalog usage and has no writer.
- Project custom instructions: always-on text that reaches the legacy chat path, not the stream. Logged as a finding.

## What a person can now do

| Where | What | Record |
|---|---|---|
| AnA's composer → **Skills** pill | Pick up to 3 skills for the conversation. The pill reads "AnA chooses" until then. | The turn records each loaded skill with `chosen: 'picked'` |
| Each AnA answer | See the skills it followed: *you picked*, *project*, or *AnA chose*, with the selector's reasons | `context_used.skills` |
| Project page → **Skills** card | Deploy a skill so it is always on in the project (at most 3), turn one off, or clear the setting | `project_skill_settings` + `ana_skill.project_*` audit row |
| Project page → **Write a skill** | Write a skill that loads only in this project. It can add to a library skill but never replace one. | `account_skill_bundles.project_id` + `ana_skill.created` |
| Admin → Skills → **skill studio** | Design a skill, test a question against the unsaved draft, read its versions, ask AnA to draft one, and save with a reason | `ana_skill.created` / `ana_skill.updated` |
| Setup → client type | The client type steers which skills AnA prefers when a turn names no product | `organizations.client_type` (existing) |

## Tests

All run on 2026-10-22.

| Suite | Tests |
|---|---|
| `server/services/ana/skills/**` (library, selector, turn-skills, golden, **skills-in-use**) | 418 |
| `server/routes/__tests__/ana-skills-routes.test.ts` | 16 |
| `server/routes/__tests__/ana-skills-project-routes.test.ts` (new) | 13 |
| `server/routes/ana-ri/__tests__/stream-skills.test.ts` (2 new: a picked skill reaches the live turn; a malformed pick does nothing) | 6 |
| `client/.../__tests__/anaSkillsInUse.test.tsx` (new) | 8 |
| All touched surfaces: conversation, project page, admin access/setup, composer, admin skills | 777 in total, 50 files, all pass |
| `server/routes/ana-ri/__tests__` + AnA client components + turn context/record | 1005, 106 files, all pass |

Typecheck: `tsc --noEmit -p tsconfig.json` reports no errors.

ESLint: the new files have 0 warnings. The touched files have no more warnings than before (`ConversationThread.tsx` 5→5, `ProjectHome.tsx` 6→6).

## Shown failing (`red/`)

Each mutation was applied, its test was run, and the mutation was reverted. Each run went red.

| Mutation | Test that caught it |
|---|---|
| M7: the stream ignores picked skills | stream-skills: "loads a skill the person picked…" |
| M8: no cap of 3 on deployed skills | project routes: "refuses a fourth deployed skill" |
| M9: a project change without the project's write admission | project routes: "refuses a person the project does not admit…" |
| M10: a skill turned off in a project still loads there | skills-in-use: two tests |
| M11: another project's skill leaks into this one | skills-in-use: two tests |
| M12: chosen skills crowd out what the question asks for | skills-in-use: "has its own allowance…" |
| M13: a malformed project read is shown as an empty card | anaSkillsInUse: "says a failed or malformed read failed…" |
| M14: the composer's picks are not sent | anaSkillsInUse: "sends what was picked with the turn" |

## PostgreSQL

`migration-postgres-20261022c.txt` applies `migrations/20261022c_ana_project_skills.sql` twice to a scratch database. The second apply is all `IF NOT EXISTS` notices (Rule 1). The run then shows:
- A deployment with a reason is accepted.
- These are refused:
  - a second setting for the same skill in the same project (unique);
  - a state other than `always` or `off` (check);
  - a reason shorter than 8 characters (check);
  - a row with no organization (not null).
- Deleting a project removes its settings and its own skills (ON DELETE CASCADE).

The table is in `public` with `organization_id INTEGER NOT NULL`, so the tenant sweep at the tail of the set covers it. It is listed for purge in `tenant-offboarding.ts`.

## Findings (outside this change, not fixed)

- **Project custom instructions** (`projects.settings.customInstructions`) reach only the legacy chat path (`send-message.ts`), not AnA's stream. The project page's Instructions card is a fixed empty state.
- **`ana_project_capabilities`** has a reader and no writer.

## Third change: skills in `/`, and picks kept on the conversation

This is design §10.5.

**What a person can now do:**
- Type `/` and a few letters in AnA's composer. Matching skills are listed after the commands, and choosing one adds it to the conversation's picks.
- Reopen a conversation in another browser or tab, and its picks come back.
- Choose "Let AnA choose", and that is recorded on the conversation.

**Tests (2026-10-22):**

| Suite | Tests |
|---|---|
| `appMentions.test.tsx`: 3 new for skills in `/`; the source pin now allows the composer's fourth argument | 12 |
| `anaSkillsInUse.test.tsx`: 7 new | 15 |
| `useAnaChat-thread-skills.test.ts` (new): picks returned with the thread, null when unstated, sent on each turn including an empty list | 3 |
| `thread-messages-store.test.ts`: 2 new | 14 |
| `stream-skills.test.ts`: 2 new (picks kept on the conversation; left alone when a turn says nothing) | 8 |
| Everything touched: skills, skill routes, all of `server/routes/ana-ri/__tests__`, chat routes, AnA client components, conversation, project page, composer, `/` menu, Home | 1,838 across 157 files, all pass |

**Found and fixed while verifying:**
- A source-pinning test (`stream-stopped-reason.test.ts`) requires the stopped-turn thread assignment to follow the message ids directly. The picks write now sits after it.
- The adoption effect could loop when storage refuses writes and a host passes a fresh record on every render. It now adopts once per conversation, and a test proves it.

**Shown failing (`red/`):**

| Mutation | Test that caught it |
|---|---|
| M15: a turn that says nothing overwrites the picks | stream-skills: "leaves the conversation's picks alone…" |
| M16: unreadable picks reported as an empty list | thread-messages-store: "serves the transcript without the picks…" |
| M17: the thread's record overrides this browser's newer choice | anaSkillsInUse: "prefers what this browser picked…" |
| M18: clearing the picks is never sent | anaSkillsInUse: "letting AnA choose again is sent as an empty list" |
| M19: choosing a skill in `/` does not pick it | appMentions: two tests |
| M20: `/` offers skills already picked | anaSkillsInUse: "offers what is not picked…" |
| M21: the record is re-adopted on every render | Red by a runaway render that exhausts the worker's memory. The unbounded render is the defect itself; the test's render-count assertion never gets to run. |

## Owed

- The founder decisions from the first change still stand: who reviews the library, and whether unreviewed skills stay on by default.
- HawkScan DAST was not run: no `HAWK_API_KEY` in this environment.
