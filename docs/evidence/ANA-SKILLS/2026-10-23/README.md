# ANA-SKILLS — 2026-10-23: expand and enhance

**Lane:** ANA-SKILLS. The founder directed it, and it moves no D-row.

**Design:** `docs/design/ANA_SKILLS_2026-10-22.md` §11.

**Direction:** "Expand and enhance."

## What already exists

The full record is in design §11.1 and §11.2. The short version:
- **Before this change:** the library held 114 authored skills and 25 therapeutic-area skills.
  - Markets: 102 authored skills applied to every market, 9 were US-specific and 3 EU-specific. The other ten supported regions had none, although the launch tools, the pathways corpus and the market specs already serve them.
  - Thinnest kinds of work: lifecycle-change (12 skills), agency-interaction (14) and submission-assembly (18).
- **Data already in place:** every turn record already named the skills its model call carried, and whether each was picked, deployed or chosen by AnA. Nothing read that back by skill.

## Expand

### Second wave: markets

Each market skill is a child of `regulatory-strategy.global-planning`.

| Module | Skills |
|---|---|
| `library/markets-europe.ts` | EU medicines (centralised procedure), EU clinical trials (CTR/CTIS), UK (MHRA), Switzerland (Swissmedic) |
| `library/markets-international.ts` | Japan, China, South Korea, Canada, Australia, Brazil, India, Singapore |

All 12 markets are covered: 4 skills in Europe and 8 in Asia-Pacific and the Americas, with 41 golden questions (17 and 24). A library test now requires every supported region to have a skill written for it.

**Engine gaps the market skills state openly**, rather than covering over them:
- The currency registry holds no UK or Swiss facts, and its jurisdiction filter has no Switzerland option. For the eight Asia-Pacific and Americas markets it holds one fact: PMDA's eCTD v4.0 rule.
- `package_ectd_for_region` builds:
  - the UK and Swiss backbones as placeholders taken from the EU structure;
  - Japan and Canada with a non-conformant ("flat") Module 1;
  - the other markets on a placeholder copy of another region's Module 1.

  The skills tell AnA to relay that status and never call a package conformant.
- The pathway engine and the strategy brief cover only Japan, Canada and Australia among these markets. The pathway comparison adds China, Korea and Brazil. No engine models India's or Singapore's medicine routes; those skills label every route as not engine-verified.
- The EU marketing-authorisation timeline ends at the CHMP opinion.

**Review of the agents' content.** I checked every market skill for figures, invented routes and overclaims:
- Every clock, fee and date goes through an engine or the currency check.
- Statements outside the catalogues are written as things to confirm, for example the Swiss Article 13 and notification procedures, MFDS's newer expedited route, and China's human genetic resources authority.
- Two triggers were removed because they mean something else elsewhere in the platform:
  - "hsa", which is also human serum albumin;
  - "cde", which is also a common data element.

  A test now proves an albumin question and a common-data-element question load no market skill.

### Third wave: depth

Recorded below once its agents' work has been reviewed.

## Enhance: how often AnA used each skill

- **Server:**
  - `server/services/ana/skills/usage.ts` counts use from the organization's own turn records, over a window of at most 365 days and at most 5,000 records. It says when the window held more.
  - `GET /api/ana-skills/usage` is for administrators only.
- **Admin and access → Skills:**
  - a summary of how many turns followed skills;
  - "used N×" or "not used" on each library skill;
  - a sentence in the drawer explaining that skill's use;
  - filters by use and by the market a skill is written for.
  - A failed read of use says so, and marks no skill as unused.
- **Composer:** the Skills menu shows the markets each skill is written for.

**PostgreSQL proof:** `usage-postgres.txt` ran the real query against a scratch `ana_turn_records` table. It shows:
- counts by key and by how each skill was chosen;
- the window excludes a 45-day-old record at 30 days and includes it at 60;
- a turn with no skills and a record from before skills were recorded are both handled;
- another organization's records are not counted;
- an organization with no records gets zeros.

## Shown failing (`red/`)

| Mutation | Test that caught it |
|---|---|
| M22: any member can read usage | routes: "is for administrators" |
| M23: a capped read is never reported as capped | routes: "says when the window held more records…" |
| M24: a failed read of use shown as "not used" | adminSkills: "never shows every skill as unused" |
| M25: the market filter keeps skills written for every market | adminSkills: "…and to those written for a market" |
| M26: the Singapore skill triggers on "hsa" again | skills-in-use: "never load on a word that means something else…" |
| M27: a supported market has no skill written for it | library: "gives every market the platform files in a skill written for it" |
