# The deep demo walk, 2026-11-09: every screen a client could reach, and what it said

**What this is.** This walk followed the dress rehearsal in `../README.md`, on the same freshly seeded database at
trunk `b4284d08ce`. Seven walkers each took one area and opened every screen a presenter or a client could reach from
it, one level deep. Every finding was then reproduced by an independent verifier, starting from a fresh browser
session. `findings.json` holds all of it: the screens walked, the walkthrough claims checked, each verified finding
(steps, what the screen showed, what was expected, the code path, the verdict and its cause) and the presenter advice
for each area.

**Package.** F1.

## Numbers

| Area | Walkthrough claims checked | Verified (all high) | Not verified (medium / low) |
|---|---|---|---|
| Front door, Home, Projects, the three program pages | 21 | 8 | 20 |
| The editor on C2C-101 | 21 | 3 | 21 |
| The device program end to end (NeuroPanel-Dx 510(k)) | 38 | 7 | 17 |
| Submission Center and dispatch readiness | 15 | 6 | 17 |
| Vault, Communication and Tasks | 16 | 3 | 18 |
| Quality, Audit trail, Reporting, Biostatistics, RBM | 26 | 5 | 17 |
| CMC / Module 3 and AnA | 7 | 4 | 15 |
| **Total** | **144** | **36** | **125** (91 medium, 34 low) |

Every one of the 36 high findings was reproduced and confirmed real:
- **12 are stale walkthrough.** The screen was right and the presenter script was out of date.
- **24 are product or seed defects.**

The 125 medium and low findings were recorded but not independently verified. They are in `findings.json` under
each area's `unverified`, and are not claimed as defects here.

## The 36, re-checked at trunk on 2026-11-12

**No fix from this lane landed.** The fixes this lane built on 2026-11-09 were lost with its machine before they were
applied, and the `fixes/` folder an earlier version of this file named never existed. Other lanes then fixed many of
the same defects. On 2026-11-12 each finding was re-read against trunk `a9b5af187` to `592233d61`: the code the
screen runs, the seed, the commits since the walk, and the holds in `.design/claude-convergence/COORDINATION.md`.
A second reader challenged 13 of the 19 groups; the six it did not reach are marked †. Each reader's proof, by file
and line, is in `recheck-2026-11-12.json`.

**Result: 3 closed, 16 partly closed, 17 open.** This was read from code and tests, not walked in the app.

Ids are `area.index` into `findings.json`. GA ids are items of `docs/evidence/GA-READINESS/2026-11-10/ledger.json`.

| Id | Finding | State | Closed by | What a user still sees | Held by |
|---|---|---|---|---|---|
| 6.0 | Stability calls 14 results out of specification | closed | `40cc8265b`, `e30adf066` | Nothing. GA-DEMO-01 can be marked closed | — |
| 4.0 | Seeded PDFs print "?" | closed | `aeb72f6e9` | Nothing on a fresh seed. GA-DEMO-14 can be marked closed | — |
| 6.3 | A failed AnA turn blocks AnA's reads | closed | `c6ab29961` | Nothing. GA-DEMO-04 can be marked closed | — |
| 5.3 | Sensitivity breakpoints wrong | partly | `eaa0237fa` | The two designs the finding names are right. The challenger found the section still wrong on the worked example a device project opens on | `01T2woo…`, lane L6 |
| 6.2 | An out-of-specification result shows Pass, its batch eligible | partly | `40cc8265b`, `feea54cae` | Signing a release is refused. The QC register still shows a plain "pass" (the server sends no verdict), and the batch still reads eligible | `01T2woo…` (GA-DEMO-02); batch rows `01QoxbLcnW…` |
| 6.1 | §3.1 names the product as the substance | partly | `40cc8265b` | The name is right. The §3.1 contents table omits 3.3, 3.2.A and 3.2.R | `01T2woo…`, lane L1 |
| 2.0 | Release signature "Satisfied" on an unsigned 510(k) | open | `7df1d292c` (server note only) | As observed: the screen does not read the note | handed to RIM `011e42…` (GA-D7-11), no hold row |
| 3.4 | A personal address as template reviewer | partly | `7df1d292c` | No address shows. FDA 1571 and 3674 still read "no named reviewer yet" | `01T2woo…`, lane L4 |
| 5.0 † | Audit trail shows 200 entries as the whole trail | partly | `3ab73b247` | Right under 1,000 entries. Past that, filters still search only the newest 1,000 | J2 `01QoxbLb…` (the route) |
| 3.2 † | Two validators disagree | partly | `7df1d292c` | Validate names its rule set. The two counts still differ, and the gate still ignores package identity | RIM `011e42…` (GA-D7-10B), by hand-off |
| 0.7, 2.5 | 510(k) page errors | partly | `114f943f1`, `d92eeea15` | No raw "fetch failed". Section counts disagree (38, 31, 36), and the predicate is still "SepsiScreen Panel" | `01T2woo…`, lanes L8 and L3 |
| 1.1, 2.4, 4.1 | Seed: comments by the author; a resolution claiming an edit never made; filing notes "by the launch demo seed" | open | — | As observed | `01T2woo…`, lane L3 (GA-DEMO-13) |
| 3.3 | Module 2 QC says 2.3 is missing | open | — | As observed | handed to RIM (GA-D7-14), no hold row |
| 3.5 † | IND checklist "Not started" on placed sections | partly | `7df1d292c` | A placed leaf reads placed. A placed child does not roll up to its heading, and the denominators still differ (a founder question) | `01T2woo…`, lane L4 |
| 5.4 † | Reporting: "No governed artifacts" | open | — | As observed | server unheld; `Insights.tsx` Reporting `011HLkY…` (GA-DEMO-06) |
| 2.6 | Orchestration shows the wrong program | partly | `4c6d882af` | The open project is followed. Code names still show as copy, "0 blockers" sits beside "Blocked", and no run exists | `01T2woo…`, lane L7 |
| 0.3, 4.2 | Data room names, cross-program change controls, counts | partly | `275b7e328`, `912ec3cf3` | Counts agree. Each project still lists the other program's change control, and "Filed to vault 0" sits above six filed uploads | seed packs `01T2woo…` L3; the label: data room lane `01QoxbLdTrwY…` |
| 1.2 | A signed document labelled "unbound" | open | — | As observed | `01J935DZ…` took it 2026-11-12 (GA-UI-19) |
| 0.2 | Dossier readiness "0 drafted", "No editing copy" | partly | `d92eeea15` (device seed only) | As observed on C2C-101 | project page `01FTWcmX…` |
| 0.6 | C2C-201 "No documents" | open | — | As observed | project page `01FTWcmX…` |
| 0.0, 0.1, 0.4, 1.0, 3.0, 3.1, 5.1, 5.2, 2.3 † | Walkthrough lines the screens contradict | open | — | Both scripts are unchanged on these lines | `01T2woo…`, lane L3 (GA-DEMO-16) |
| 0.5, 2.1, 2.2 † | Device walkthrough §4 and §5 | partly | `d92eeea15` (six leaves again) | The script still says an eSTAR id is refused and describes six UNRESOLVED_DOCUMENT errors | `01T2woo…`, lane L3 |

**What this lane may take.** Nothing in the table is free: every remaining item is held or was handed to a lane. The
125 unverified findings (GA-DEMO-18) are this lane's own and unheld. A verifier pass over them in a freshly seeded
app at `592233d61` was started on 2026-11-12 and stopped before any finding was judged; it is still owed.

## Method, and its limits

- **One database, one trunk.** The counts in the findings (4 blockers, 8 errors, 7 leaves, 579 chained entries) are
  this seed on this trunk. The walkthroughs now tell the presenter to read such counts off the screen.
- **No model provider.** AnA's answers were not exercised beyond its honest "No AI provider is configured" reply.
- **Screens.** The walkers' screenshots (1,113 PNGs, 210 MB) stayed on the rehearsal machine. `findings.json` names
  each finding's screenshots by their local path, and the steps to reproduce each one are in the finding itself.
- **Not verified is not cleared.** The 125 unverified findings are leads for the next walk, not a pass.
