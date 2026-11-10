# The showcase walk of the Lumen account (2026-11-10)

The founder, 2026-11-10: *"Keep working to get everything ready for a sales showcase of the entire platform."*
Packages F1 and DATA. The presenter's script that came out of it is `docs/demo/lumen-showcase.md`.

## What was walked

The stack as a Codespace builds it: `.devcontainer/post-start.sh` as it stands, on a fresh local database, with a
stand-in model provider (`../../D2-CSR/2026-11-10-build-provider-refusals/csr-stand-in.mjs`), because this
environment has no model key. Signed in through the login page's **Demo access**, as the Lumen lead.

| Walk | Script | Stops |
|---|---|---|
| Every rail destination and each of its tabs | `tour-rail.cjs`, `tour-rail.json` | 41 |
| LMN-201: its page, six journey stages, five work areas with tabs, four rail places with tabs | `tour-lmn201.cjs`, `tour-lmn201.json` | 44 |
| AnA asked from Home and from the project | `ana-ask.cjs` | 2 |
| The LMN-201 CSR: build, live view, resume, section review by a second person, import, narratives, assembly | the recorders in `../../D2-CSR/2026-11-10-live-drafting-view/`, with `DEMO_CSR_TITLE` | |
| The tour, filmed | `film-tour.cjs` | 16 scenes |

Each stop records a screenshot, API responses of 400 and above, console errors, visible error wording, and text a
client should not see (raw identifiers, ISO times, `undefined`, UUIDs). `tour-lib.cjs` holds that.

## What already exists (RULE 3)

Nothing new was built. The demo seed (`scripts/demo/launch-demo/`), the Codespace scripts, the walkthroughs in
`docs/demo/`, the 2026-11-09 rehearsal and deep walk (`../2026-11-09-rehearsal/`) and the platform tour
(`../2026-11-09-platform-tour/`) were read first. This walk is the same exercise on today's trunk, in the Lumen
account, which did not exist in the Codespace when those were done.

## Found and fixed (each red first; all on trunk)

| # | What a person saw | Cause | Fix |
|---|---|---|---|
| 1 | The Lumen account opened half empty: no monitoring, Vault, CSR, sequence or reports. `post-start.sh` said "The Lumen seed did not finish" and carried on | A signing rule that landed at 06:10 (`c284f3cb4`) requires the digest of the change the approver read; the seed's change-control approval sent none, and the pack stops at its first refusal | `59dedc451`: `lumen-qms.mjs` `approveChangeAsRead` |
| 2 | "CSR build 15 · failed · 98%: §12.5 has no saved text … its study tables hold no results" | The synthetic study source had no vital-signs table, and §12.5 is written over that table | `lmn201_synthetic_csr_source_v2.json` (exposure, laboratory shifts, vital signs, concomitant medications); the pack files and freezes it, also over an earlier freeze |
| 3 | "not complete: §11.2 still holds a data placeholder" on an accepted draft | The engine's demographics table labels a row "Age, mean (SD) [yr]"; the placeholder rule read "[yr]" as missing data | `shared/authoring/csr-scientific-review.ts`: "[yr]" and "[kg]" only |
| 4 | "failed" beside a build that had drafted 68 of 69 headings | The panel printed the server's state word for three different ends | `CsrRunBuilds.tsx` `buildStateWord`: "not complete", "stopped", "failed" |
| 5 | "evaluated 2026-11-08T00:00:00.000Z"; "site 104 — 2026-11-10T06:45:39.873Z" | Two lines the 2026-11-09 fix did not reach | `RbmSurfaces.tsx` `RbmWhen` |
| 6 | "PDF/A conversion is the packager's finalizePdfA (Ghostscript) … ECTD_REQUIRE_PDFA=true" | A function and a setting name in a sentence a person reads | `csr-assembly.ts` `CSR_ASSEMBLY_PDFA_STATEMENT` |

After the fixes, in the running app: both seeds finish ("lumen pack: created 163, found 100"); build 16, resumed
from the panel, reads "complete · 100%"; four headings were sent, approved by the Lumen approver and imported into
the report; the report assembles into a 28-page body and its §14 tables.

## Found and handed to their owners

In `.design/claude-convergence/COORDINATION.md`, "Showcase walk of the Lumen account":

- the project's data room leads with Quality-system records, with file wording and file actions
  (`screens/finding-data-room.jpg`);
- the rail's work areas open the newest project, which was the emptiest one;
- Submission Center's Planner prints pathway codes;
- CMC / Module 3 composes nothing for the Lumen products, all biologics (a founder decision, P-28).

## Follow-up the same day: the project's data room

The data-room session (`01QoxbLdTrw…`) fixed the first hand-off below in `275b7e328f`
(`docs/evidence/SPINE/S2/2026-11-10-quality-records/`): the study's files list first, a Quality record is named in
its own words and says "Quality record", and it carries no file wording or file actions. A room captured before the
change shows the new names on its next read.

This walk had written the same repair in parallel, after a message to the project-page session answered "not
found". It was dropped unpushed when the owner's landed: one implementation, the owner's.

## Clean

Home, Projects, Tasks, Communication, Vault and its five views, Submission Center's eight tabs, Biostatistics,
all ten monitoring tabs (after fix 5), Quality's eight registers, Reporting's five tabs, the project page and its
journey, the protocol workspace, the editor, and AnA's conversation: no failed request, no console error, no error
wording. The two CMC tabs answer 409 by design for a biologic and show the reason.

## Limits, stated

- **No real model answered or drafted.** AnA's answer and every drafted heading in these screens and films are
  the stand-in's. The films show the product's screens and flow, not Claude's prose or pace.
- **The films are not in the repository.** They were sent to the founder.
- **The development organisation was not re-walked here.** It was walked on 2026-11-09 (`../2026-11-09-rehearsal/`).
- **A model-drafted CSR still cannot be approved, frozen or filed** (P-115, P-118). The script says so.
- **HawkScan was not run:** no scan key in this environment.
