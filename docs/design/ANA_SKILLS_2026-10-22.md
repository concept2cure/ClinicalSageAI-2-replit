# AnA skills: a governed method library AnA selects from, and a Skills tab for each organization's administrators (2026-10-22)

## Summary

The founder's ask, 2026-10-22: *"AnA and platform skills. We need an admin inside the admin for clients to be
able to customize their own skills, build skills. But we also need to come with all of our own skills, a full
library to be selected from, and AnA could select from based on questions, jobs, needs, use cases before her and
in front of her. These skills need to be segmented by use case, by client type, medical device and diagnostic,
IVD, biotech, pharma, therapeutic area, biostatistics, CMC, sub-skills across the board. And we need to start
populating and building these skills out as well as using our knowledge base."*

What this change delivers:

1. **A platform skill library**, shipped in code (`server/services/ana/skills/library/`): methods AnA follows
   for a kind of regulatory work, each filed by client segment (device, IVD, biotech, pharma), discipline
   (biostatistics, CMC and eleven others), kind of work, therapeutic area, region, submission type, screen and
   document type, with sub-skills under each discipline. Every skill routes to the deterministic engines (AnA
   tools) that hold the numbers and verdicts, and cites only records the platform holds.
2. **The organization's own skills**: the account skill bundles that already existed, completed. An
   administrator adds to a library skill, replaces it with the organization's own method, or writes a new one.
3. **Selection on every conversation turn**, by code: what the person asked ("before her") and what is on screen
   — surface, open document, the program's segment, therapeutic area, submission type and region ("in front of
   her"). At most three skills a turn, recorded with the turn by version and content hash.
4. **Admin and access → Skills**: browse and read the library, turn a skill off or on with a reason, add to or
   replace one, write new ones, and test which skills a question would load and why.
5. **The knowledge base reached**: the 24 therapeutic-area profiles become library skills (rendered, not
   copied), and the first-wave skills route to the CMC record, IVD knowledge, ICH corpus, currency registry,
   standards registry and the `shared/regulatory` records through the tools that read them.

## 0. Where this sits under Rule 2

- **The lane.** `ANA-SKILLS`, the founder's directive of 2026-10-22. It moves **no D-row**, and is recorded the
  way `ANA-SUMMARY` (P-24) and `ANA-AGENTS` record theirs: a founder-directed exception with its own evidence
  folder, `docs/evidence/ANA-SKILLS/2026-10-22/`.
- **No new surface, module, model or integration.** The administration is a tab inside `admin-console`
  (`LAUNCH_SHELL_SURFACES`: "organisation administration"). The API is one prefix, `/api/ana-skills`, listed in
  `LAUNCH_PLATFORM_API` beside `/api/ana-ri` because it serves AnA on every host. No AnA tool is added: selection
  happens on the server before the model is called.
- **No new capability outside the catalog.** Skills shape how AnA works inside the launch apps (Projects, Vault,
  Authoring, Submission Center, QMS, Reporting, CMC / Module 3). Where a skill touches a launch boundary, it says
  so: CMC composition is small-molecule Module 3 for a US IND (P-28); IND safety reports and ICSR transmission
  are not sent from the platform (P-32); only a person with signing authority signs (P-27).
- **Truth (Rule 2).** A skill is method, never a source of figures, verdicts, dates or citations. Its text says
  which engine answers each part and that a missing tool is reported, not filled. A library test refuses any
  skill that routes to a tool AnA does not have at launch, or cites a standard, ICH code, currency fact or record
  the platform does not hold.

## 1. What already exists

Searches run: `skill`, `skills`, `skill_bundle`, `playbook`, `persona`, `prompt library`, `prompt_template`,
`recipe`, `specialist`, `expert`, `scoped rule`, `instruction`, `capability`, `knowledge pack`, `wisdom`,
`therapeutic`, `taxonomy`, `segment`, `discipline`, `work type`, `module type` across `server/`, `shared/`,
`client/src/`, `migrations/`, `db/migrations/`, `docs/`, `ui_kits/`, `skills/`, `.claude/`; and
`git log --all --diff-filter=D` filtered for skill, playbook, prompt-library, prompt_template, persona, recipe,
specialist, expert-mode, agent-template. The clone holds history from 2026-10-08 only; within it, the only
deletion that matched was the vendored gstack developer-tool suite under `.claude/skills/gstack/` (commit
`7df89f4f`), which is not product code.

| What exists | Where | What it does today | What it does not | Disposition |
|---|---|---|---|---|
| Account skill bundles | `account_skill_bundles` (`shared/schema.ts`), `server/services/account-skill-bundles.ts`, `/api/account-intelligence/bundles` | Stores an organization's "how this account does X": prompt fragments, submission/module/work types, regions, evidence and response-style preferences, status, version | Never reached the conversation: its only prompt injection was in `chat-context-builder.buildChatContext`, which has no production caller, and the cortex path, which has no client caller. Chosen by name (`LIMIT 10 ORDER BY name`), not relevance. Routes had no role check and no reason; any member could change them. No migration created the table (drizzle push only). No UI | **Completed and reached.** These bundles are the organization's own skills. Facet columns added; the writers made governed (admin, reason, chained audit row, one transaction); selected per turn on the live stream; the ungoverned routes removed (replacement: `/api/ana-skills/organization`) |
| Scoped rule loader | `server/services/ana-scoped-rule-loader.ts`, `ana_scoped_rules` (`migrations/0013`) | Scored rules by document type, capability, agency, stage, section and slash command; top three rendered | Never ran: its one caller (`ana-context-router.buildMergedContext`) is reached only with no `actionContext`, and `seedScopedRules` has no caller, so the table is empty everywhere. Its seed text held a fabricated statistic (WO-16) and wrong facts (e.g. "FDARA §907", "IND amendment within 30 days of implementation") | **Migrated and deleted** (Rule 3 item 5). It could not be fixed in place: content as insert-only seed rows can never be corrected (Rule 1), it has no tenancy, and its scorer reads a context nothing builds. The eight method rule sets were folded, corrected, into library skills (§6.3); the loader and its router branch are deleted; the table stays (Rule 1: no DROP) |
| Therapeutic-area profiles | `server/services/ana/therapeutic-area-profiles/` (25 profiles, `renderProfileForPrompt`) | Context rules, reviewer expectations, endpoints, statistics, guidance, gaps per area; injected into section drafting, the authoring plan and readiness | Not in the conversation prompt; no AnA tool reads them | **Reached.** Each profile is a library skill whose instructions are the profile as its own renderer renders it (`library/therapeutic-areas.ts`); nothing is copied |
| Judgment and enrichment packs | `server/services/ana-ri/context-enrichment.ts` with `industry-wisdom-pack.ts`, `use-case-playbooks.ts`, `agency-tactics.ts`, `challenge-library.ts`, `decision-frameworks.ts`, `capability-registry.ts` and others | Live on the stream: slash commands, `@app` mentions and regex triggers inject live data and judgment content | Not filed by discipline or segment, not configurable by an organization, not recorded per turn | **Left as they are, distinct.** They deliver data lookups and judgment (orientation, challenge, tactics), not discipline methods. Converging them into the skill registry is a follow-up (§8), not part of this change |
| Company persona and custom instructions | `client_intelligence_profiles.company_persona`, `project_intelligence_profiles.project_persona`, `custom_instructions`, via `getIntelligencePrefix` | Always-on text an organization or project gives AnA | Not selected per need; one block for every turn | **Left.** Skills are per-need methods; these are standing instructions. Both reach the turn |
| Connector skills pack | `skills/concept2cure/*/SKILL.md` (4) | Agent Skills for Claude through the connector (D8), routed to `c2c_*` tools | Not AnA's; different tools | **Left.** Same open-standard idea, different consumer. Generating the pack from the library is a follow-up (§8) |
| Design references | `docs/design/ANA_CHATGPT_PARITY_UI_DESIGN.md` §5 ("Skill" object) and §10.6 (Settings: "Skills"); `ui_kits/authoring` `AUTH_SKILLS` (prototype) | Name a Skills settings area and composer skill chips | Never built | **Reached in part.** The Skills settings area is the Admin and access tab; composer chips are a follow-up (§8) |
| Tool selection | `server/services/ana/tool-selection.ts` (`selectToolsForTurn`, cap 50) | Ranks tools per turn by token overlap | Did not know which engines a loaded method needs | **Extended**: a loaded skill's tools are pinned (still within the tenant's governed set) |
| What the turn read | `server/services/ana/turn-context-used.ts`, `turn-record.ts`, `client/.../anaWorkModel.ts` | `context_used` event, sealed turn record, "Used in this session" | Said nothing about method content | **Extended**: skills by key, version and content hash; a "Skills" row |
| Vocabularies | `shared/regulatory/client-segments.ts` (`ClientSegmentId`), `shared/constants/domain/therapeutic-areas.ts`, `shared/regulatory/region-identity.ts`, `shared/regulatory/submission-type-bridge.ts`, `shared/regulatory/global-document-registry.ts`, `shared/regulatory/standards-registry.ts`, `server/services/ana-ri/ich-guideline-corpus.ts`, `server/services/regulatory-currency/currency-registry.ts` | The canonical client segments, areas, regions, submission and document types, standards, ICH codes and dated facts | No discipline or kind-of-work axis | **Reused** for every facet and every citation check. Two axes added in `shared/ana/skills.ts`, stored in the bundle columns that already meant them (`module_types`, `work_types`) |

## 2. The model

### 2.1 A skill

| Field | Meaning |
|---|---|
| `key` | Dotted path, e.g. `cmc.stability`; its parent is `cmc`. Organization skills are `org:<bundle_id>` |
| `name`, `description` | Sentence case; when to use it |
| `disciplines`, `useCases` | The two new axes (`shared/ana/skills.ts`) |
| `segments`, `therapeuticAreas`, `regions`, `submissionTypes` | Where it applies; empty means any |
| `surfaces`, `documentTypes` | What, when open, puts the work in front of the person |
| `triggers` | Lowercase phrases whose presence in a question signals the need |
| `tools` | AnA tools the method routes to; must be in launch scope |
| `references` | Standards, ICH codes, currency facts, TA profiles and repository records it cites; all checked |
| `instructions` | The method: When this applies · Method · Before answering · Not AnA's to decide |
| `version`, `contentHash`, `review` | Identity of the text a turn received, and whether a named reviewer has read it against its sources |

### 2.2 Two sources, three relations

- **Library skill** — code, versioned with releases. On unless an administrator turns it off for the
  organization (`organization_skill_settings`, with the reason).
- **Organization skill** (`account_skill_bundles`):
  - *addendum* to a library skill — loaded after the library method whenever that skill loads;
  - *replace* a library skill — loaded instead of the library method, and still loaded when the library skill is
    turned off (the administrator turned it off because they replaced it); at most one in force per library skill
    (`acct_bundle_one_replacement`);
  - *stands alone* — selected on its own triggers and facets.
- `draft` is never loaded; `active` and `locked` are; `archived` is history. A locked skill refuses every change.

## 3. Selection (`server/services/ana/skills/selector.ts`)

- **The question outranks the screen.** Trigger phrases matched as whole phrases score by length; a skill named
  outright always loads first. Screen and program context adds to the score.
- **Context alone loads only what is in front of the person**, and only when nothing about the program says the
  method is for something else: a device method never loads on a pharmaceutical program's screen alone, but does
  load, at a penalty and with the reason stated, when the person asks about a 510(k) predicate in words.
- **Bounded.** Three skills a turn, one of them at most on context alone, within 24,000 characters. Everything
  eligible but not loaded is returned with why.
- **No model.** The same inputs give the same selection, which is what makes it recordable and testable.

## 4. On the turn (`server/routes/ana-ri/stream.ts`, `server/services/ana/skills/turn-skills.ts`)

- Resolved on the request's tenant-scoped connection, in parallel with memory and enrichment.
- The block rides the **volatile** system suffix, so the cached prefix is unchanged across turns.
- The block says which method is loaded, its version and hash, whether it has been reviewed, why it was loaded,
  and names any tool the method relies on that this turn cannot call (tenant deny-list, read-only turn).
- The loaded skills' tools are pinned into the turn's tool selection, within the governed set.
- **Fail closed to nothing.** If the organization's settings or skills cannot be read, no skill loads (a skill an
  administrator turned off must not return because a read failed); the turn warns, and AnA answers without them.
- Recorded: the `context_used` event and the sealed turn record carry each skill's key, source, version, content
  hash, organization addenda or replacement, and reasons; the work panel shows a "Skills" row.

## 5. Administration

- **Where**: Admin and access → Skills (`client/src/concept2cure/v2/surfaces/AdminSkills.tsx`).
- **API** (`server/routes/ana-skills.ts`): reads for any member of the organization (the methods are the ones AnA
  uses for them); changes for `admin`/`owner` only (`requireRole`), each with a stated reason (8-character floor,
  `routes/governed-reason.ts`), committed with a chained audit row (before, after, reason) and an account event,
  in one transaction on the request's tenant-scoped connection — a refused audit row rolls the change back.
- **Store**: `migrations/20261022_ana_skills.sql` (additive, `IF NOT EXISTS`; `public`, integer
  `organization_id`, policed by the tenant sweep); `organization_skill_settings` is in the tenant purge list.
- **Not a signed act.** Changing a skill is an audited configuration change with a reason, not a Part 11
  signature: a skill is not a record, and every document AnA drafts with it is still reviewed and signed by a
  person (decision 3 below).

## 6. The first-wave library

### 6.1 Coverage

139 skills: 114 written across the 13 disciplines (regulatory strategy 8, submissions 9, CMC 13, nonclinical 6,
clinical 14, clinical pharmacology 7, biostatistics 12, safety 7, labeling 7, medical writing 7, quality systems 7,
device 10, diagnostics 7) and 25 therapeutic-area skills derived from the TA profiles (a root and 24 areas). Every
client segment has at least 40 skills that apply to it (`library.test.ts`). Counts by segment and area are in
`docs/evidence/ANA-SKILLS/2026-10-22/README.md`.

### 6.2 How it was written

- Method over pinpoint facts. Guidelines cited by code at document level (ICH corpus), standards by registry id,
  in-force facts by currency-fact id; an FDA guidance by topic only, with `lookup_fda_guidance` before citing
  (P-9: no reviewed index of FDA guidance exists).
- Recent changes stated correctly: E6(R3) in force with its own numbering (`shared/regulatory/ich-e6r3.ts`); the
  QMSR in force since 2026-02-02 (`shared/regulatory/qmsr-crosswalk.ts`); the LDT rule vacated; eSTAR mandatory for
  510(k) and De Novo; ICH M11 at Step 4; EU trials through CTIS.
- **Every first-wave skill is marked unreviewed.** It was written from working knowledge, and eCFR, ich.org and
  fda.gov are not reachable from the build environment. Settings and AnA's prompt both say so. A named regulatory
  reviewer's pass is owed (decision 1).

### 6.3 The scoped rules, migrated

| Rule set | Where it went | Corrected or dropped |
|---|---|---|
| CSR drafting | `clinical.study-report` | Kept: E3 structure, disposition, causality wording, narrative order. Dropped: a fixed MedDRA version |
| FDA compliance scan | split across `submissions.*`, `regulatory-strategy` | Dropped: "CRL triggers … (35%)", "(22%)" — fabricated statistics (WO-16) |
| EMA LoQ response | `submissions.agency-response` | Kept: per-question structure, tone, summary table. Dropped: unverified clock timings |
| IND Module 2.5 | `medical-writing.clinical-overview` | Dropped: "30–60 pages", "improves reviewer satisfaction by ~20%" |
| 510(k) predicate | `device.substantial-equivalence` | Dropped: "predicate older than 10 years" folklore |
| Protocol amendment | `clinical.protocol-amendments`, `submissions.ind-maintenance` | Corrected: a change in protocol is submitted and implemented after IRB approval (except an immediate hazard); not "within 30 days of implementation" |
| CMC drug substance | `cmc.drug-substance` | Corrected: impurity thresholds come from ICH Q3A(R2) via the impurity tools, not a fixed "0.10%" |
| Biostatistics SAP | `biostatistics.statistical-analysis-plan` | Kept, aligned with E9(R1) |
| Foresight, RIM, CORTEX | not migrated | Engine internals, not methods |

## 7. Decisions

### Taken in this change (with the reason; open to revisit with new facts)

1. **Library in code, organization skills in the database.** Library content changes with releases, through
   review, and every turn records its hash; content as seed rows could never be corrected in place (Rule 1).
2. **Selection by code, not by a model.** Recordable, testable and the same every time; a model-chosen skill
   could not be explained after the fact.
3. **A skill change is audited with a reason, not signed.** It is configuration. The documents AnA drafts are
   signed by people.
4. **Library skills ship on.** An administrator turns off what does not fit; selection already filters by
   relevance and segment.
5. **Unreadable skill state loads no skill.** Wrong methods are worse than none.

### For the founder

1. **Who reviews the library.** Name the regulatory reviewer(s) who read the first-wave skills against their
   sources; a reviewed skill records the reviewer and date, and Settings shows it.
2. **Whether unreviewed skills stay on by default** until that review (today: on, labelled unreviewed).

## 8. Not in this change (follow-ups)

- Converging the enrichment judgment packs into the registry so an organization can configure them.
- Generating the connector `skills/concept2cure` pack from the library.
- Skill evaluations against `server/eval/` (does a skill improve an answer), before a skill is marked reviewed.
- Per-user skills.

## 9. Verification

See `docs/evidence/ANA-SKILLS/2026-10-22/README.md`.

## 10. Skills in use: chosen in the conversation, deployed to a project, designed and tuned (second change, 2026-10-22)

The founder's direction: skills, not tools; an organization adds, creates, designs and tunes its own as one does
with Claude's; skills apply at organization setup, in Settings, and per project; a person picks skills in AnA's
chat; and AnA still selects skills on her own from what is asked. This change completes §3–§5 rather than adding
a second skills system.

### 10.1 What already exists (searched before this change)

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| Selector, invoked keys | `server/services/ana/skills/selector.ts` | Scored `invokedKeys` +100 | Nothing sent them; no project choice |
| AnA's composer | `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` (`.ct-comp-foot`) | Live drive, run policy, the Engine pill and menu | No skill choice |
| `/` and `@` menus | `client/src/concept2cure/v2/appMentions.tsx`, `shared/ana/slash-commands.ts` | Slash commands (`/playbook`, `/guide`…) and app mentions | Do not list skills (follow-up, §8) |
| `selected_tools` | `useAnaChat.ts` body | Pins tools for a turn | Tools are not skills; left as it is |
| Project page side column | `client/src/concept2cure/v2/surfaces/ProjectHome.tsx` (`pj-side`) | Readiness card; Memory and Instructions as fixed empty states | No skills |
| Project admission | `server/services/ana/project-scope-admission.ts`, `server/routes/c2c/project-access.ts` | How AnA's turn admits a project; project write admission | Reused, not rebuilt |
| `ana_project_capabilities` | `shared/schema/ana-intelligence.ts:169` | Per-project usage counters for the capability catalog; nothing writes it; one reader prints the top five | Not a skill store: keyed to `ana_capability_registry`, no reason, usage-shaped. Not reused, so its one reader does not print skill keys as capabilities |
| Project custom instructions | `projects.settings.customInstructions`, `server/services/projects/project-instructions.ts` | Read on the legacy chat path (`send-message.ts`) | Not on AnA's stream; always-on text, not a selected method (finding, not changed here) |
| `project_intelligence_profiles.project_persona` | `shared/schema.ts:15555` | One "SKILL.md for this project" text read by client-intelligence memory | One text per project, not skills |
| Organization setup | `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` (Setup), `organizations.client_type` | The client type picker | Did not reach skill selection |
| Governed dialogs | `useDialog.ts`, the `de-*` drawer vocabulary | Every governed drawer | Reused for the studio |
| Audit history | `audit_logs` rows written by `account-skill-bundles.ts` | Every skill change with before, after and reason | Nothing read them back for a skill |

Deleted-file search: `git log --all --diff-filter=D` on skill, playbook, recipe, prompt-library and instructions
names finds only `.claude/skills/**` (developer tooling), no application code — in the history this clone holds,
which is shallow; older deletions are not visible from here.

### 10.2 What changed

- **Chosen skills.** The selector takes two choices besides the question: skills **picked** in the conversation
  (`invokedKeys`, +100) and skills **deployed** to the project (`deployedKeys`, +50). A choice loads with no
  trigger phrase and whatever the program's facets, and has its own allowance (`maxChosen` 3), so a choice never
  crowds out what the question calls for (`maxSkills` 3 for AnA's own selection); `maxChars` rises to 32,000 for
  both. The turn record and `context_used` say, per skill, `chosen: 'picked' | 'deployed' | null`.
- **The composer's Skills menu** (`ComposerSkills.tsx`), beside the Engine pill: "Skills: AnA chooses" until a
  person picks up to three from what is on for the organization and the project. The picks ride on every turn of
  that conversation as `skills` (`anaSkillChoice.ts`, kept per conversation for the browser session). The server
  keeps only skill-shaped keys, at most three (`pickedSkillKeysOf`).
- **Each answer names its skills** (`TurnSkillsUsed`): each skill, whether the person picked it, the project
  deployed it, or AnA chose it, and the selector's reasons on hover.
- **Project skills** (`project_skill_settings`, `20261022c`): a project deploys a skill (`always`, at most three)
  or turns one off there (`off`), with a reason and a chained audit row
  (`ana_skill.project_deployed | project_turned_off | project_cleared`). A skill can also be **written for one
  project** (`account_skill_bundles.project_id`): it loads only on that project's turns, and a project adds to a
  library skill but never replaces one (that stays the organization's decision). Who may change a project's
  skills is the project's write admission; who may read them is the same admission AnA's turn uses.
- **The project page's Skills card** (`ProjectSkills.tsx`), in the side column: always on here, off here, written
  for this project, and the actions for a person the project admits to change it.
- **The skill studio** (`SkillStudio.tsx`) replaces the organization skill drawer (zero duplication): design the
  skill, **try a question against the unsaved draft** (`POST /test` with `draft`, nothing stored), read its
  **versions** from the audit rows (`GET /organization/:id/history`), ask AnA to draft one (a fixed prompt handed
  to the conversation), and save with a reason. The same studio writes a project's skill from its Skills card.
- **Setup.** The organization's client type (`organizations.client_type`, through the existing
  `orgToClientSegment`) is the segment when a turn names no submission type, and Setup says so.
- **The question test and the live turn share one path** (`selectTurnSkills`), so what Settings shows is what AnA
  loads.
- An active organization skill no longer needs a trigger phrase: one without is loaded when picked or deployed.

### 10.3 Decisions

1. **Skills, not tools.** A skill is a method AnA follows; the composer picks skills (`skills`), not tools
   (`selected_tools` is untouched).
2. **A project may deploy at most three skills.** Each loads on every turn there; more would leave no room for the
   question. Enforced under an advisory lock in the writer.
3. **A project adds, never replaces.** Replacing a library method changes it for everyone who meets it in that
   project; it stays an administrator's act in Admin and access → Skills.
4. **Picks are a working preference, not a record.** They live in the browser session per conversation; what a
   turn actually loaded is recorded on the turn.
5. **The project card is read-only for those the project admits only to read.**

### 10.4 Follow-ups

- Reaching the project's custom instructions (`project-instructions.ts`) on AnA's stream, or folding them into a
  project skill (founder's call: they are always-on text, not a selected method).

### 10.5 Skills in the `/` menu, and picks kept on the conversation (third change, same day)

- **`/` lists skills.** The one composer menu (`appMentions.tsx`, `useAppMentions`) takes an optional skill
  source. With one, `/` lists the matching skills after the commands. Choosing a skill inserts no text: the
  typed `/query` leaves the draft and the skill joins the conversation's picks, as the Skills menu would add it.
  The menu still never puts a command in a message that the server does not parse
  (`shared/ana/slash-commands.ts` is unchanged). The skills are read only once a draft starts with `/`, and none
  is offered when the allowance is full (`useSkillMentionSource`).
- **Picks kept on the thread.** When a turn says what its picks are (`skills` present, an empty list included),
  the stream writes them to `chat_threads.metadata.skills` for the thread it has already resolved to the caller's
  own (`recordThreadSkills`). A failed write costs nothing this turn: the turn loads the picks anyway.
  `GET /api/chat/threads/:id/messages` returns them as `skills`; a failed read leaves the field out and never
  reads as "none picked". The chat hook exposes them as `threadSkills`, and the conversation adopts them, once,
  when this browser holds no choice of its own for that thread (what this browser picked is the newer choice).
  Once a conversation has had picks, an empty list is sent too, so letting AnA choose again is recorded. A host
  with no Skills menu sends nothing, and the thread's picks are left alone.
- What already exists, for this step: `chat_threads.metadata JSONB` (`migrations/20260728_chat_thread_store.sql`)
  was already provisioned and written by `cortex-unified.ts`. No migration is needed. The `/` menu and its
  source-pinning test (`appMentions.test.tsx`) are extended, not forked.

Verification for this change: `docs/evidence/ANA-SKILLS/2026-10-22/skills-in-use/README.md`.

## 11. Expand and enhance (2026-10-23)

The founder's direction: expand and enhance. Two parts.

### 11.1 Expand: the second and third waves of the library

**What already exists** (counted from the built library before this change): 114 authored skills and 25
therapeutic-area skills. By market, 102 authored skills were for every market, 9 were US-specific and 3 EU-specific;
there was nothing for the other ten regions the platform supports (`shared/regulatory/region-identity.ts`: JP, CA,
UK, CN, AU, CH, BR, IN, KR, SG), although the launch tools already serve them (`lookup_regulatory_pathway`,
`get_market_submission_spec`, `validate_market_formatting`, `compare_global_pathways`,
`global_ri_reliance_pathways`, `package_ectd_for_region`, `search_eu_ctis`), and so do the pathways corpus
(`server/services/ana-ri/regulatory-pathways-corpus.ts`, 24 expedited and orphan programs across nine agencies)
and the market specs. By use case, the thinnest were lifecycle-change (12), agency-interaction (14) and
submission-assembly (18). There was no US NDA/BLA marketing-application skill, no post-approval-changes skill, and
nothing on non-inferiority margins, trial transparency, UDI or complaint handling.

- **Second wave: markets.** Two new modules, `library/markets-europe.ts` and `library/markets-international.ts`,
  hold one skill per market as a child of `regulatory-strategy.global-planning`, which keeps sequencing and
  reliance across markets. Each market skill is the method for working one regulator: its routes, its dossier
  (through the market spec and the regional backbone, whose placeholder status it relays rather than calling a
  package conformant), its trials and, where the same agency regulates them, its devices. Every date and
  transition goes through `check_regulatory_currency`; where the registry holds none (the UK and Switzerland
  today), the skill says the date is not held.
- **Third wave: depth.** Sub-skills in submissions, labeling, nonclinical, safety, biostatistics, clinical, device
  and quality systems, each checked against its siblings so it adds what is missing rather than repeating them.
- A library test now requires every region the platform supports to have at least one skill written for it.

The waves were written by agents under the same contract as the first (validate.ts, library.test.ts, golden
questions run against the whole library). Every skill is marked unreviewed; the review decision (§7) still
stands.

### 11.2 Enhance: how often AnA used each skill

**What already exists:** every turn's sealed record (`ana_turn_records.record_text`, canonical JSON) already names
the skills its model call carried, by key, with whether the person picked it, a project deployed it or AnA chose
it (`context.skills`, §10.2). Nothing read it back by skill.

- `server/services/ana/skills/usage.ts` counts, from the organization's own turn records over a window (default
  30 days, at most 365), how many turns carried each skill, how many of those were picks and deployments, and
  when each was last used. It reads at most 5,000 records, newest first, and says when the window held more
  (`capped`) rather than presenting a partial count as the whole. Nothing is stored for it.
- `GET /api/ana-skills/usage` is for administrators: it describes the organization's activity.
- Admin and access → Skills says how many turns followed skills, marks each library skill "used N×" or "not
  used", explains a skill's use in its drawer, and filters by use and by the market a skill is written for. A
  failed use read says so and marks no skill unused.
