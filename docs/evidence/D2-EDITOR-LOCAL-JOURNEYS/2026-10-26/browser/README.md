# Existing selected-source handoff browser qualification

W1 / D2; contract: `docs/design/SELECTED_SOURCE_HANDOFF_OWNERSHIP_2026-10-26.md`.
Only local loopback browser evaluation is exercised. Every API response and
account/token is synthetic. No database, provider, agency or human session is
qualified here.

## What already exists

- `client/src/concept2cure/v2/editor/SourceAssemblyDialog.tsx` and
  `useSourceAssemblyTarget.ts` render the current source chooser and own its
  inventory/revalidation/handoff. `editorTarget.ts` and
  `editor/assemblySourceIntent.ts` carry and admit the same source owner.
- The existing `ProjectHome` source selection and native `DocumentWorkbench`
  already appear together in the historical
  `D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/probe.tsx`.
  `positive.tsx` imports that unchanged host. The Vite plugin binds only its
  synthetic API import to `positive-api.mjs` and replaces its opaque fixture
  session with a generated claim-bearing synthetic bearer. This is an adapter,
  not a copied host or another editor. `shared-host-binding.json` records the
  actual served transform without recording its generated bearer.
- `positive-api.mjs` extends that existing synthetic API with explicit current
  document projections and three existing Project home read DTOs. It does not
  replace production components or claim backend admission.
- `probe.tsx` is a small controlled host around the real shared chooser for
  synchronous Close/project/session/ceremony changes. It uses the real auth
  service, project publisher, ceremony counter and private target channel.
- Existing tokens and product styles are imported directly. No product CSS,
  dependency, writer, table or alternate editor is added. The historical
  creation-recovery browser `visual-checks.mjs` supplies the reused axe helper.

## Retained behavioral RED

`red/summary.json` and `red/command.json` retain three actual pre-fix browser
failures: Close switched project, replaced session, or opened a ceremony, but
the earlier action still navigated. Each case made exactly two explicit scoped
inventory GETs, had no page/console/fixture errors, and failed the navigation
assertion. All recorded production inputs remained unchanged. Original three
production files and the actual fixture/runner bytes are gzip snapshots there.

## Fixture diagnostics

`diagnostic/` retains the first touch-light replay: nine guarded chooser cases
passed; the actual Data Room-to-native-editor journey reached the correct editor
but its strict synthetic endpoint assertion found three canonical ancillary GETs
absent from the historical API. `positive-api.mjs` now supplies the existing
empty runs, project-skills, and `no_sections` dossier DTOs for those exact reads.
`diagnostic-current-reads/` passed all ten cases after that fixture correction,
with zero production/shared-input drift. These are diagnostics, not the final
matrix. The first fixture lint warning (six helper parameters) and its corrected
zero-warning successors are retained separately.

## Reproduction

Use the already-installed Node 22 and browser evaluation tools:

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH node docs/evidence/D2-EDITOR-LOCAL-JOURNEYS/2026-10-26/browser/server.mjs
```

The fixture server binds only `127.0.0.1:5216`, with a strict port and watching
disabled. Restart that known process after source changes. In another terminal:

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH node docs/evidence/D2-EDITOR-LOCAL-JOURNEYS/2026-10-26/browser/final-matrix.mjs --output=another-replay
```

Output directories must be new; historical results are never overwritten.
`--diagnostic` limits execution to touch/light. Chromium and Playwright are the
existing local evaluation tools. The final runner records exact source,
fixture and shared-host hashes; their closure is bounded rather than exhaustive.
Request records contain only synthetic actor-match/visit booleans, organization,
method, path and project. No bearer or refresh credential is recorded.

## Scope of final checks

The matrix covers desktop 1440×1000 and touch 390×844, light and dark.
Each context includes the actual Data Room → shared chooser → exact native
editor journey, actual retired launcher refusal, four post-Close boundary
changes, canonical refresh/header consistency, three delayed-owner masks, and
keyboard cancellation. Chooser bounds, visible footer and focus trapping are
measured with real Chromium; selected captures include WCAG A/AA axe results.
Incomplete axe findings remain recorded for human assessment. This is not a
complete accessibility audit or a claim that all controls are simultaneously
visible. The full shell router, backend source admission/RLS, build/drafting,
approval, filing, submission and provider execution are outside this packet.

## Definitive result

`final-latched/summary.json`, its command/raw output and `rollup.json` record
**44/44 passing cases**, 60 measured/screenshot stages and 16 bounded axe
captures with zero violations or incomplete findings. All 29 declared product
inputs, three reused host/helper inputs and 11 executable fixture inputs stayed
unchanged during capture and match current bytes. `source-freeze.json` records
those bounded inputs, rather than claiming exhaustive dependency closure.

All four actual Data Room cases open the exact selected document in one native
editor with both original source selectors. Representative image inspection
also confirms the actual receiver's Selected source references notice naming
Data Room sources 41 and 42. Opening performs no authoring write, build or
generation. Four actual retained-launcher cases reject a raw, unadopted bearer
before mounting a chooser or dispatching another read. The remaining 36 cases
cover the real chooser's Close owner/ceremony/parent changes, canonical refresh
and per-operation actor/header consistency, delayed-owner masks and keyboard
cancellation across the four display contexts. No case has an unexpected
endpoint, page error, console error or authoring write. The four synthetic
refresh POSTs exercise authentication refresh, not authoring.

`final/` and `pre-latch-rollup.json` retain the first 44-case qualification. Root
then latched the existing receiver's observed invalidity one-way; only
`assemblySourceIntent.ts` differs between epochs. The same frozen adapters were
replayed in full into `final-latched/`. Earlier diagnostics and RED are not
summed with that definitive matrix. Direct invalid→valid receiver restoration
is qualified by the separate unit-owner evidence; these browser cases qualify
its integration and preserve the scope stated above.

`final-lint.json` records strict lint with zero errors/warnings and no executable
fixture drift. `shared-host-binding-final.json` confirms the exact reused host
transform remains bound and excludes the obsolete opaque session. Known owned
Vite PID5556 was stopped after capture; `cleanup.json` confirms loopback port5216
is closed. Browser capture made no Git mutation, ran no global compiler or production
build, changed no container/database and called no live provider or agency.
Automated browser results do not fill the human worksheet.
