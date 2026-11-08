# Reporting & analytics, re-walked in the running app at the head (2026-11-08)

**Package:** D7 (D7-D), with F1 repairs. **Session:** the reporting session (`session_011HLkYC…`, lane L11).
**Why:** CLAUDE.md RULE 4 says a screen is not done until it is opened in the running app. Since the first walk
(`../2026-11-02-reporting/`), two changes had only jsdom evidence:
- the shared `ProjectBack` link (`23238cd9ad`, `eac4aaff16`);
- packs read from their own tables (C-3, `aadca02cc7`).

## What was run

The method is the first walk's, with the same script plus one step, `capture.cjs` in this folder:
- a `git archive` copy of the commit, on port 5100, with `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on` and dev sign-in;
- the local `clinicalsage` database, migrated forward by the copy's `deploy-migrate` (owner `postgres`, runtime `c2c`,
  not a superuser, no RLS bypass);
- `jm.smith@concept2cure.pro`, organisation 1, enterprise;
- project "[Demo · Biotech] C2C-101" (`e89b7009-…`), with Chromium at 1440×900 and 390×844, light and dark.

One pack was made through the product's API before the capture: `POST /api/report-os/bundles`, with a fresh Executive
Readiness Digest run (42). It became:
- one `report_bundles` row (`de05d1c7-…`);
- one `report_bundle_runs` row (42, position 1);
- one `report_bundle_projects` row (project 1).

`GET /bundles` lists it. No `project_memory_entries` row was written. This database has no `project_memory_entries`
table at all, so the C-3 migration's guard (`to_regclass … IS NULL → RETURN`) skipped the backfill on a real
estate without failing.

## Found, at `f509c83044` (`found/`)

- **The page and the digest disagreed on the number of critical gaps.** The page's sub read "C2C-101 scores 0% on
  submission readiness, with **4** critical gaps outstanding" (`found/reporting-1440-light.png`). The project's
  Executive Readiness Digest read "with **23** critical gaps outstanding" and showed a Critical gaps tile of 23
  (`found/reporting-find-1440-light.png`).
- **The cause:** `computeInitialRun` cut the critical gap messages to four before counting them. The canvas lead and
  the portfolio rollup count that list.
- **The fix:** `server/services/report-os/orchestrator.ts`, F1, `c37e5c8f6b`, red first. The visible blocker list keeps its first four; the count keeps every one.

Everything else held at `f509c83044`:
- the shared back link names the project;
- the Bundles tab shows the pack from the new tables (`found/reporting-bundles-1440-light.png`);
- the IND is offered "Build the Nonclinical & CMC readiness", not the BLA pack;
- the digest shows no raw `not_ready`;
- an open report has one orange fill.

## Fixed, at `c9e45ef009` (`fixed/`, all 24 captures)

The sub reads "with **23** critical gaps outstanding" at 1440 and 390, in both themes, matching the digest. Every
capture passes every probe in `fixed/probes.json`:
- one column;
- no page or document overflow;
- one orange fill per screen;
- no script errors;
- the back link named, and Audit & compliance reports' link returning to Reporting & analytics.

## Not covered here

- No model key is set, so nothing here exercises AnA.
- The "Previewing Standard" line on the Bundles captures is the script's own earlier step (Preview plan in the
  Catalog), carried by the same page session. It is shown on every view, as designed.
