# P-122 · Reporting & analytics: the reports that can be run are named on the landing, in words

Founder decision P-122 §3 item 6 lists Reporting after Quality. The inventory
(`../inventory/qms-reporting-device.md`, row P1) found no function lost in Reporting. This is what a walk of the
running app found on 2026-11-11, on the Lumen demo account's IND project (LMN-201), at trunk `31047492b7`.

## What already exists (RULE 3)

Nothing here is new.
- `client/src/concept2cure/v2/surfaces/Insights.tsx`: the landing ("Reports") with the standard packs, and the tab
  row (`ReportingTabs`, `setPaneView`).
- `InsightsCatalogPanel.tsx` (`CatalogPanel`, `TypeCard`, `CatalogFilter`): every report definition, its Run control
  and the filters. `insightsLibraryShared.tsx` `catalogCapabilityCounts`: the count the catalog prints.
- The report registry under `server/services/report-os/` holds each type's `region` and `allowedPersonas`. Nothing
  on the server changed.

## What the walk found

1. **The landing offered one pack while 20 reports could be run.** "Standard packs · 1 for Biotech", then a closed
   list of 30 reports that are not available. The 20 reports that are available were on the Catalog tab only
   (`screenshots/before-landing-1440.png`).
2. **The catalog printed the registry's codes.** A card read "USA_OLAW · iacuc coordinator, ra lead, qa". The
   Region filter listed `USA OLAW`, `fda`, `EU EMA`; the Reporting role filter listed `ra lead`, `qa`
   (`screenshots/before-catalog-1440.png`). ONE_DESIGN_PLAN §2 retires ids and enum values on screen.

## What changed

1. **The landing says how many reports can be run, and opens them:** "20 reports can be run one at a time for
   LMN-201. Open the catalog". The number is `catalogCapabilityCounts(...).available`, the catalog's own, so the
   two cannot disagree. Nothing is listed twice: the cards stay in the Catalog.
2. **A region is a country and an agency, and a role is its words:** "US · OLAW · For IACUC coordinator, regulatory
   affairs lead, quality assurance". The two filters show the same words, in the order read, and still filter by
   the stored value. The registry's codes are not uniform (`US`, `USA_FDA`, `fda`), so each is read by its parts
   (`regionWords`, `reportingRoleWords` in `insightsLibraryShared.tsx`); a part it does not know is shown as written.

## Red and green

- `insightsProjectScope.test.tsx`, "the landing says how many reports can be run, and opens the catalog": failed at
  HEAD (no such line), passes now, and checks the landing's number against the catalog's.
- `insightsRegionalCatalog.test.tsx`, two cases under "the catalog says a region and a reporting role in words":
  both failed at HEAD on the stored codes, pass now.
- All 32 Reporting suites: 278 of 278.

## Walked in the running app

LMN-201 as the Lumen lead, 1440 px: `screenshots/after-landing-1440.png` (the line and its button) and
`screenshots/after-catalog-1440.png` (reached by that button; the first card in words). No request failed and the
console was clean.

## Second change (2026-11-12, `5ed006764b`): why a regional report is not offered, in words

The catalog's three notes for LMN-201 read "EMA MAA Readiness Assessment — EMA MAA Readiness Assessment assesses a
EU filing…", "…assesses a nda or bla filing…" and "…assesses a JP filing…"
(`screenshots/before-catalog-1440.png`).
- `server/services/report-os/regional/filing-applicability.ts` now words the market and the filing kinds: "an EU
  filing", "a Japanese filing", "an NDA or BLA filing". Its reason for a filing with no Module 1 record lists what
  the record covers in words. The reason codes and the refusals are unchanged.
- The catalog shows a reason that opens with the report's name as it is, so the name is said once.
- **Red first:** three server cases (`filing-applicability.test.ts`) and one client case
  (`insightsRegionalCatalog.test.tsx`). **Green:** the five regional suites and the 32 Reporting suites, 373 of 373.
- **Walked** after a restart on that commit: `screenshots/after-catalog-notes-1440.png`. The three notes read
  "EMA MAA Readiness Assessment assesses an EU filing. …", "FDA NDA / BLA Filing Readiness Assessment (eCTD) assesses
  an NDA or BLA filing. …" and "PMDA J-NDA / Shonin Approval Readiness Pack assesses a Japanese filing. …". No
  request failed.

## Third change (2026-11-12, the reporting session `011HLkYC…`): the catalog's counts, scopes and availability in words

The first three items of "Found, not fixed" below, closed. Nothing was removed: every number the three count lines
carried is still there.

1. **The count lines.** They read "54 applicable definitions · 24 engine-backed · 20 available to run", "0 requires
   a plan · 1 requires context · 0 disabled · 0 unregistered" and "25 uncomputed · 5 prediction unavailable. An
   engine-backed type still requires authorized recorded inputs and its output gates." They now read:
   - "54 reports apply. 24 are computed in this release, and 20 can be run now."
   - "0 need a higher plan, 1 needs a record chosen first, 0 are switched off and 0 are not registered."
   - "25 are not computed in this release, and 5 predictions are not offered. A report that can be run still needs
     recorded inputs you may read, and its output is checked before it is shown."
2. **Where a report runs.** A card read "Runs over: project, submission, program, account". It reads "Runs over a
   project, a submission, a project group or the account". The scope words are the canvas's own (`scopeWord`, moved
   from `Insights.tsx` to `insightsLibraryShared.tsx` so the canvas and the catalog share one vocabulary).
3. **The two filters that still listed stored values.**
   - Data scope: "Account", "Document", "Project", "Project group", and "Organization-wide records" for the engines
     that count the organization's records (it read "organization" beside "account").
   - Availability: "Can be run", "Needs a higher plan", "Needs a record chosen first", "Needs the project's filing
     recorded", "Does not apply to this filing", "Filing context could not be read", "Switched off", "Not
     registered", "Not computed in this release", "Prediction not offered". It read "scope-required",
     "filing-context-required" and so on.
   Both still filter by the stored value.

- **Red first** (`2026-11-12-catalog-words/red.txt`): four of five cases in `insightsCapabilityCounts.test.tsx` failed
  on the old words; a fifth case, for the organization option, failed before its change. **Green:** all 39 Reporting
  files, 417 tests. Four older cases that pinned the old words (`insightsRegionalCatalog`, `insightsProjectScope`)
  now pin the new ones.
- **Walked** (`2026-11-12-catalog-words/walk.cjs`, `probes.json`) on C2C-101 as the demo lead, at 1440×900 and
  390×844, light and dark: the lines, cards and options read as above; page overflow 0 at both widths; no script
  errors and no failed requests.

## Found, not fixed
- **Never reached by any screen (inventory §3):** `/api/report-os/program-groups` (cross-project roll-ups with
  snapshots) and `/api/report-os/deliveries`. Production refuses both as unmapped.
