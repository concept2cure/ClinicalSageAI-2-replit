# D2 — no example data anywhere: sample mode and its datasets are gone, and the gate refuses their return

**Row:** D2 — "Zero fixture imports reachable in production; `ci:fixture-fallback`
and `ci:no-mock-in-prod-routes` set to block."
**Evidence the row names:** "a CI run showing the gate block on a reintroduced
fixture" — `gate-blocks-reintroduced-fixture.txt` beside this file.
**Owner's instruction:** *"We can never have any fake or mock fixtures anywhere
ever … Anything that is fake must be converted into real."*
**Date:** 2026-10-14 · **Session:** `…session_01TzCCfqi5RbiwzZyfYxyBpX`

## What was still there

Both gates already blocked: `.husky/pre-push` has run them unconditionally since
the 2026-09-24 periodic review, and CI runs them on every push. They blocked a
fixture reaching a tenant on a *failed read*. What they deliberately allowed
was the remedy they recommended — a client-side **sample mode**:
`useSampleRows(live, fixture)` returned example rows when a user had switched
it on (`?sample=1` or a stored flag), force-disabled in production builds, under
a `<SampleDataBanner>`; `DataGate` took a `sample` prop for the same purpose; the
dossier store had `enableSampleFixtures()`.

So no production tenant saw the examples, and the product still carried them,
one toggle away in every other build:

| Where | What sample mode could show |
|---|---|
| MDX CER workbench (6 tabs) | 9 safety signals, a literature corpus, a 23-row GSPR matrix with conform/gap verdicts, an MDCG 2020-5 equivalence matrix against named devices, PMS KPIs, a complaint queue, PMCF studies with enrolment, a reporting calendar |
| MDX Engineering | a DHF, a trace matrix, an ISO 14971 risk file, ECRs, issues — and `ENG_RISK_ACCEPT`, labelled "the org's risk policy", colouring every matrix cell acceptable / ALARP / unacceptable on criteria nobody at the organisation set |
| MDX UDI | five devices with published GUDID / EUDAMED states, labels, a symbol checklist, an MRI matrix |
| MDX PMA | "Enrolled 412 / 680", "47 adverse events, 3 serious", modules naming "CV-330 IDE pivotal" |
| MDX Analytics | a KPI strip, cycle times against a "peer cohort", blocker causes with owners, FDA reviewer divisions with medians, AnA usage |
| MDX Overview | `MDX_HEALTH`: "Active programs 14 · Down 3 pts vs last week" |
| MDX pathway Files tab | example `Sources/` folders; the dossier store's example sections, attachments and editors ("Jordan Chen", "Sara Okafor") |
| Quality | an ICH Q10 change log, eight controlled documents six of them "effective", training counts "47 of 47", and a client copy of the server's SOP template catalog |
| unused | `MDX_PROGRAMS`: fourteen invented device programs |

## What changed

- The mechanism is deleted: `mdx/lib/sampleMode.ts`, `mdx/lib/useSampleRows.ts`,
  `mdx/components/SampleDataBanner.tsx`, `DataGate`'s `sample` prop and
  `useSampleMode`, `DossierStore.enableSampleFixtures` and its seed.
- The datasets are deleted: `mdx/data/cer.ts`; the example rows in
  `mdx/data/{engineering,udi,pma,analytics,programs}.ts` (row types those hooks
  inferred from them are now declared); Quality's `FIXTURE_DOCS`,
  `FIXTURE_TRAINING`, `SOP_TEMPLATES` (a duplicate of
  `server/services/qms/sopTemplates.ts`), `FIXTURE_CHANGES`, `FIXTURE_SUMMARY`.
- Every surface keeps its live path and renders its read's own state. Where a
  panel drew an empty table for a read that had not answered, it now says which
  of loading / failed / none it is (CER Signals and Literature, Analytics).
- Tests that drove surfaces through sample mode now serve **live-shaped rows
  through their own mocked reads** (`tests/concept2cure/mdx-surfaces-interactive-smoke.test.tsx`)
  or hydrate the store the way the backend does (`mdx-pathway-panes-smoke`,
  `dossierStore.dataIntegrity`). The change-control rows three Quality tests
  need moved to `quality/__tests__/changeRows.ts`, which nothing outside
  `__tests__` imports. Five test cases that asserted sample-mode behaviour
  ("cannot approve a sample row" and the like) are deleted with the behaviour.
- `ci:fixture-fallback` gains a third check: any code naming a part of the
  mechanism, importing it, or passing `sample={…}` is a finding. Its exemption
  for "a fixture ternary whose condition consults sample mode" is removed.

Nothing user-facing is deleted: every surface named above still renders its
live data, and the drafter, Files tree and panels keep the tests that pin them.

## Shown failing first

- **The gate's self-test** (`scripts/ci/__tests__/ungated-fixture-fallback-strings.test.mjs`,
  run by CI's `node --test scripts/ci/__tests__/*.test.mjs`): the three new cases
  fail against the previous gate (`UNGATED_FIXTURE_FALLBACK_GATE_PATH` pointed at
  `git show HEAD:scripts/ci/check-ungated-fixture-fallback.mjs`) — `not ok 6, 7,
  8`, 6 pass / 3 fail — and pass against this one (9 / 9).
- **The gate on the real tree** (`gate-blocks-reintroduced-fixture.txt`): three
  reintroductions into launch-adjacent files, each run through
  `npm run --silent ci:fixture-fallback` — the exact command `.husky/pre-push`
  runs, exiting the push on failure — each **exit 1**, each restored
  byte-identical (sha256 recorded before and after), then the committed tree
  **exit 0**:
  1. `reg.docs ?? FIXTURE_DOCS` in the Quality SOP register (the original defect);
  2. `useSampleRows(live.kpis, ANL_KPIS)` in Analytics;
  3. `sample={UDI_DEVICES}` on a UDI DataGate.

## Not in this change

- `ci:no-mock-in-prod-routes` is unchanged: it already blocks, and this change
  touches no route it scans.
- `client/src/concept2cure/v2/fixtures/` still exists. The launch surfaces may
  import only the reference constants `scripts/ci/launch-scope-fixture-allowlist.json`
  names (enforced by `ci:launch-scope`); the record arrays in that folder that
  locked surfaces still import are the next slice of this lane.
