# Every demo project has an objective of record (2026-11-12)

Package **DATA** (the demo seed), launch row **D2**. Session `session_011DpxUyQmE1enma4gTjcfBy`. It closes
`GA-DEMO-15` of the GA map's ledger (`docs/evidence/GA-READINESS/2026-11-10/ledger.json`): "C2C-101, C2C-201 and
NeuroPanel-Dx have no charter objective (only Lumen and Faux do)". Close condition: "Biotech and mdx packs record a
sourced objective; About shows it."

## What already exists (RULE 3)

- The objective of record is written through the route the project page's Objective card writes
  (`PUT /api/charters/by-project/:ref/objectives`, `server/services/c2c/charter-objectives.ts`), with a reason and
  sources of a stated kind.
- The Lumen pack already recorded LMN-201's objective that way (`ensureObjective` in `lumen.mjs`). That step is moved
  to `packs/biotech-shared.mjs` and used by all three packs; Lumen's call and values are unchanged (zero
  duplication). Nothing new is written to the server.

## What each project records, and from where

| Project | Objective | Source |
|---|---|---|
| C2C-101 | The protocol's own "Objective." and "Primary endpoint." sentences, read from the pack's protocol text | Protocol C2C-101-201 v1.0, section 1, Synopsis |
| C2C-201 | What the programme is: a US IND with Module 3 composed from its CMC records | The programme description. The pack holds no protocol for C2C-201, and the source says so, rather than giving it a clinical objective nobody wrote |
| NeuroPanel-Dx | 510(k) clearance for its intended use, in the 510(k) Summary's words | The 510(k) Summary, section 5 |

A recorded objective is left as it is, so a person's change is never overwritten.

## Proof

- **Test, red first:** `scripts/demo/launch-demo/project-objective.test.mjs` (a project with none gets one with a
  source and a reason; a recorded one is left alone; each objective is text the pack already holds). All 171 tests
  in `scripts/demo/launch-demo/` pass; the recovery test's stand-ins carry the new names.
- **Upgrade path, in a Codespace seeded before the change:** restarting the app re-ran the seed. "Objective: C2C-101
  … created", "Objective: C2C-201 … created", "Objective: NeuroPanel-Dx … created"; the Lumen pack, now on the shared
  step, "created 0, found 327".
- **On the project page** (`c2c-101-objective.png`, `neuropanel-dx-objective.png`): the Objective card shows the
  objective, the success criteria, "From Protocol C2C-101-201 v1.0 (fictional), in the project's Vault, Section 1,
  Synopsis" and "Version 1". None of the three pages says "No objective is recorded for this project yet".
