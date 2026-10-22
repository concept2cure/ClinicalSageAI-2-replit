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

*(Counts are filled from the built library in the evidence README.)*

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

- Composer skill chips and a `/skill` invocation (the design reference's SkillsRow); selection already accepts
  invoked keys.
- Converging the enrichment judgment packs into the registry so an organization can configure them.
- Generating the connector `skills/concept2cure` pack from the library.
- Skill evaluations against `server/eval/` (does a skill improve an answer), before a skill is marked reviewed.
- Per-user skills.

## 9. Verification

See `docs/evidence/ANA-SKILLS/2026-10-22/README.md`.
