# QA 2026-10-08 — creating and listing projects (journey j1)

Launch row: D2 (launch scope and honest screens), Projects app. Findings from
the j1 browser walk, `scratchpad/qa/findings/j1-projects.json`. Each one was
reproduced on :5078 (current code, launch scope off, the dev default) before it
was changed. :5086 is the same code and QA database with
`LAUNCH_SCOPE_ENFORCE=on`, started for this work. The database was read with
SELECTs only. One program, HLV-334, was created through the UI on :5086 to prove
the code derivation end to end.

| Finding | Reproduced | In launch scope | Outcome |
|---|---|---|---|
| Blank project name accepted; review "(unnamed)", saved as the filing-type label | yes (`screens/before-wizard-*`) | yes (Projects) | fixed: the name is required, and the review prints exactly what is sent |
| One-letter program code ("H") | yes (DB `H`; another walker made `Q` from `QA-SS-101` during this work) | yes | fixed: a code word in the product, then in the project name; else initials or the first four characters |
| NM-512 BLOCKED, card "No open blockers" | partly: HEAD had already removed the text (2f9de855a); the card still showed a red BLOCKED with no cause | yes | fixed in the reader: the card and list row say "No cause recorded" |
| BX-301 / BX-204 identity differs between Projects and Submission Center | yes (`screens/before-submission-center.txt`) | yes | fixed in the reader: the Program column reads `programId`, not the product string |
| Four readiness values for BX-256; none on the project home | yes (`screens/before-home-BX-256.txt`) | list and home yes; PDEV, IND lifecycle and NDA cockpit no | fixed: one figure, labelled "Dossier readiness", on the card and the home, with "not measured" when it is null |
| Lifecycle management renewals 500 | yes (`checks/api-probes.txt`) | **no** (`lifecycle-mgmt` locked; `/api/lifecycle` unmapped, refused in production) | not changed |
| FDA CRL library tile shows a dead error screen (404) | yes (`screens/before-tile-FDA-CRL-library.txt`) | **no** (`crl-library` locked; its API is out of scope, so 403) | gating fixed: the project home applies the rail's flag gate |
| Members can create programs | n/a | n/a | not changed: a product decision (`canCreateProgram`) |

## Which record is right (BX-204, BX-301)

Both records are what they say. `regulatory_programs` BX-204 is a 510(k) CGM
and BX-301 is a BLA. Submissions 3 (`BX-204 (NDA 212345 · 505(b)(1))`, NDA) and
4 (`BX-301 (anti-BCMA mAb)`, IND) have `program_id` NULL, so they belong to no
program. They only share a product-name string with those programs
(`checks/db-reads.txt`). The Submission Center's Program column printed
`title · productName`, so the product string read as a program identity. It now
prints `Product <name>` and either `Program <code>` from the program record or
`No program recorded`. No data was changed.

## The one readiness

`readinessByProject` (server/routes/c2c/projects.ts) is the share of a
program's governed sections that are approved or locked. The list and the
detail read both return it. `client/src/concept2cure/v2/dossierReadiness.ts`
prints it for both screens. Under launch scope, the other three figures
(PDEV 2%, IND lifecycle 0%, NDA cockpit 81%) are on surfaces outside the
catalog (`checks/launch-scope-verdicts-5086.txt`).

## Tests

- Red: `red/project-intake-code.test.txt` (5 of 7 against HEAD, plus the
  multi-part case) and `red/client-tests.txt` (14 of 20).
- Green: `green/project-intake-code.test.txt` (8 of 8) and
  `green/client-tests.txt` (20 of 20).
- `green/neighbouring-suites.txt`: 48 files and 349 tests across the project
  home, projects, wizard, Submission Center, rail and CRL suites, plus the
  create and list route tests.
- The CRL gate test includes a positive control: with the flag on and no
  launch scope, the same collection finds the tile, so the absence assertions
  can fail.

## Checks

- `checks/eslint-head-vs-now.txt`: warnings are unchanged on every edited
  file, and new files have 0.
- `checks/tsc-touched-files.txt`: a typecheck of only the touched files. Its 6
  errors are slice artefacts (CSS modules, an SVG import, `import.meta.env`
  without Vite client types). None is on a changed line.
- `checks/launch-scope-api-classification.txt`: `/api/lifecycle/renewals` is
  `unmapped` (enforced in production, report-only in development).
  `/api/clinical-regulatory-evidence` is `out-of-scope`.

`harness/` holds the walk scripts. The password is read from the environment,
and session state files are not included.
