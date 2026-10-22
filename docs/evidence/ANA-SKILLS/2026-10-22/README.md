# ANA-SKILLS — 2026-10-22

Lane: ANA-SKILLS, founder-directed (2026-10-22). It moves no D-row.
Design: `docs/design/ANA_SKILLS_2026-10-22.md`. Its "What already exists" section is the
Rule 3 record.

Status: **pushed at the founder's instruction to stop and push before usage ran out.** The
items under "Not done" are still open.

## What already exists (reached, not rebuilt)

- `account_skill_bundles` (`shared/schema.ts`), "how this account does X". It is now the
  store for the organization's own skills. The earlier bundle CRUD in
  `server/routes/account-intelligence.ts` was replaced by `/api/ana-skills`, which is
  governed.
- `server/services/ana-scoped-rule-loader.ts` was deleted. AnA's turn path now reads the
  skills block instead. The table is kept.
- These were reused rather than rebuilt:
  - TA profiles: `renderProfileForPrompt`
  - The ICH corpus
  - The currency registry
  - The global document registry
  - The client segments
  - The chained audit (`writeChainedAuditRow`)
  - `requireGovernedReason`

## What landed

- **Platform library:** 139 skills under `server/services/ana/skills/library/`.
  - 114 were written by hand across 13 discipline modules.
  - The other 25 are therapeutic-area skills derived from the TA profiles.
  - Every skill has a version and a content hash.
  - Every skill is marked **unreviewed**.
- **Selection:** a deterministic selector (`selector.ts`) loads at most 3 skills and 24,000
  characters per turn.
  - A question loads a skill through its trigger phrases.
  - The open screen, document or therapeutic area alone loads at most one skill, and never
    when the skill's facets do not match.
- **Live turn:** `server/routes/ana-ri/stream.ts`.
  - The selected skills go into the volatile system suffix.
  - Each skill's tools are pinned within the governed set.
  - `context_used` and the turn record list each skill by key, source, version, hash and
    reasons.
  - If the skill state cannot be read, the turn loads no skills and raises a warning.
- **Admin and access → Skills** (`AdminSkills.tsx`):
  - Browse the library and filter it by segment and discipline.
  - Turn a skill off or on, with a reason.
  - Add to a skill or replace it with the organization's own text.
  - Write organization skills.
  - A question test shows why each skill would load.
  - Every write goes through the admin/owner guard, needs a reason of at least 8 characters,
    and is recorded in a chained audit row.
- **Migration:** `migrations/20261022_ana_skills.sql`. It is additive and IF NOT EXISTS
  throughout. The PostgreSQL proof is in `migration-postgres/`: a red run on the
  NULL-mode CHECK, then a green run that applies the file twice.

## Tests (run 2026-10-22)

- Skills: 406, made up of library, selector, turn-skills and golden questions for every
  module.
- Routes: 15.
- Stream: 4.
- Client: 4.
- All pass. The typecheck reports 0 errors.
- Six mutations each turned a test red. Their output is in `red/M1…M6`.

## Not done

- A named reviewer for the library, and whether unreviewed skills stay on by default. Both
  are founder decisions.
- §6.1 counts in the design doc. The counts above are the record.
- The HawkScan DAST run was not done: no HAWK_API_KEY is set.
- Findings outside this lane, not fixed:
  - The P-28 boundary is not enforced on `estimate_recorded_shelf_life` or
    `assess_recorded_batch_poolability`.
  - The currency fact `eu-ai-act-high-risk` gives 2026-08-02. Article 6(1) applies from
    2027-08-02.
  - Device tool descriptions still cite 21 CFR 820.30.
  - Consent tools cite 45 CFR 46.116.
  - `ich_e_efficacy` says "E6(R3) 2023".
  - The ICH corpus lists M11 as a draft.
  - `classify_impurity` cites Q3C(R8).
  - `assess_nitrosamine_risk` cites "FDA 2021".
  - No AnA tool exposes `server/services/regulatory/change-assessment.ts`.
