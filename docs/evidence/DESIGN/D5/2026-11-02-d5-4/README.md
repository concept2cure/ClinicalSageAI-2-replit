# D5-4 — the design calculators as a work area (D5 §B.4 steps 9–11)

Package `D5`, lane L6. Completes `client/src/concept2cure/v2/surfaces/BiostatWorkbench.tsx`.

The last screen of D5's Biostatistics half. It closes §B, and with D5-0 to D5-3b it closes D5.

---

## What already exists (RULE 3)

| Path | What it does today | What it did not do |
|---|---|---|
| `surfaces/BiostatWorkbench.tsx` | the reviewer-risk defensibility assessment and twenty-nine deterministic design engines, each with its own form, result table and provenance stamp | rendered as four stacked `.pj-card`s in `.cm-body`, with every metric in a `style` prop |
| `surfaces/biostatCalculators.ts` `CALCULATORS` | the twenty-nine engines, their fields and their request bodies | unchanged |
| `surfaces/adaptiveMonitoring.tsx` `AdaptiveMonitoringPanel` | interim looks, the stopping rules at each, and the signed decision | a `.pj-card` with two filled primaries inside the work area |
| `surfaces/biostatKnowledge.tsx` `BiostatKnowledgePanel` | the method-precedent graph built from the sponsor's own CSRs | a `.pj-card` |
| `surfaces/adaptiveMonitoringApi.tsx` `AdaptiveDecisionSignModal` → `EsignModal` | the 21 CFR §11 ceremony, with its own confirm | unchanged — which is why the button that *opens* it is not a primary |

Nothing new. No route, service, engine or screen was added; one test file was split off an existing
one, which this directory's own naming already does (`workbenchHazardRatioLabel`,
`workbenchRendersNotComputedReason`).

---

## The change

**Step 9 — the frame.** `.cm-body` becomes `page-inner` with `data-work-area="biostat-workbench"`.
The intro card goes; its three sentences become the one `.ph-sub`, and the ghost button in its
heading row reading "Your study designs and documents" becomes the `.pj-back` link "← Biostatistics".
One `h1.ph-title`: "Design calculators".

**Step 10 — the defensibility assessment** is a `.pj-sec` headed "Statistical defensibility ·
Reviewer-risk assessment". Its field grid and label ramp move out of `style` props into `.wb-fields`
and `.wb-f`; the inputs lose `height: 30` and take `.c2c-input`'s canonical 32px (44px at 390).
"Assess defensibility" keeps the fill — it is the page's one primary.

**Step 11 — the engines.** The picker card and the chosen engine's panel become one `.pj-sec`:
twenty-nine `btn small` toggles with `aria-pressed`, the pressed one tinted `--bg-200` instead of
filled orange, and the panel below as a block of the same section rather than a card of its own.
"Compute" is a ghost.

**Two more things the acceptance forced, which steps 9–11 do not name:**

- **The two stored-state panels.** `AdaptiveMonitoringPanel` and `BiostatKnowledgePanel` are inside
  this work area, so §B.6.1's "one orange fill on the workbench" is about them too. Both become
  `.pj-sec`. "Open plan" — a lookup by integer id — stops being a primary, and so does
  "Sign decision…", because the signature's primary is the confirm inside `EsignModal`; the button
  that opens a dialog is not the commitment.
- **The input record.** `CalculatorPanel`'s provenance line printed `inputs 3766dc260a62` in
  monospace, the same defect D5-3b fixed on the assessment, and §B.6.4 reads the whole work area.
  The full hash is the line's `title`; the method, engine, version and "reproducible" stay visible.

---

## Measured in the running app

Dev server on `127.0.0.1:5000`, project **CS-401 IND**. `probe.mjs`, 1440×900 light and dark and
390×844 `hasTouch`.

```
maxWidth          1120px
backText          "Biostatistics"
h1                ["Design calculators"]            (one)
sub               "Deterministic, provenance-stamped engines, reference-tested against published
                   tables and closed forms. Nothing is computed in the browser."
sections          ["Statistical defensibility", "Engines", "Adaptive monitoring", "Method precedent"]
cardsLeft         0                                 (four .pj-card before)
primaryFills      ["Assess defensibility"]          (ONE; four before — §B.6.1)
uppercase         []
engines           29        enginePressed ["Assurance (Bayesian power)"]
enginePressedBg   rgb(232,230,220) light / rgb(61,61,58) dark   (never --accent-strong)
inputHeights      ["32px"] at 1440, ["44px"] at 390 (one height; 30px inline before)
hashOnScreen      []
sidewaysOverflow  0         (1440 and 390)
```

Run end to end, not just rendered: the Assurance engine computed on real inputs (δ 0.4, prior SD
0.15, n 120 per arm) and returned assurance **0.771146** against power-at-prior-mean **0.872528**,
with the provenance line reading `assurance:twoSampleMeans · c2c-stats 1.0.0 · reproducible` and
hovering it giving `Engine c2c-stats 1.0.0 · input record 3766dc…d51a0`
(`computed-1440-light.png`). Compute with the fields empty still refuses per field and says
"Calculation not run" rather than computing on nothing.

Screenshots: `workbench-{1440-light,1440-dark,390-light}.png` and their `-full-` variants,
`computed-1440-light.png` (a real result and its provenance), `panels-1440-light.png` (the two
stored-state sections).

### One thing the screenshot showed that the spec's text did not

The page's `h1` read "Design calculators" and so did the second section's `h2`, twelve lines below
it — §WA.4.2 rule 4's repetition, created by following steps 9 and 11 literally. The page is the
calculators; the section is the bank of engines, so it is headed **"Engines · 29 deterministic
calculators, one chosen"**. A test now pins that no section heading equals the page title.

---

## Tests

205 pass across the twelve biostatistics, workbench, adaptive-monitoring and precedent files. Four
cases are new, in `__tests__/workbenchWorkArea.test.tsx`; each was shown failing on a targeted
mutation of the finished code, not only on the old code (where all four die on the missing work-area
root, which proves nothing about what each asserts).

| Case | Mutation | What it reported |
|---|---|---|
| `carries exactly one filled primary…` | `primary` back on the chosen engine | *"a work area has one primary (§WA.4.2 rule 7): expected [ 'Assess defensibility', …(1) ] to deeply equal [ 'Assess defensibility' ]"* |
| `offers the engines as a choice, not as twenty-nine next actions` | same | *"the chosen engine is still an orange fill: expected true to be false"* |
| `never repeats the page title as one of its section headings` | the `h2` back to "Design calculators" | `expected [ 'Statistical defensibility', …(3) ] to not include 'Design calculators'` |
| `frames the page with the back link and one heading, not an intro card` | `pj-card` back on the adaptive-monitoring section | *"a card is left inside the work area: expected \<section …\> to be null"* |

**A regression of mine, found here and fixed here.** `specialistHandoffInteraction.test.tsx` and
`specialistRecoveryInteraction.test.tsx` were **already red on origin**: D5-3a renamed Biostatistics'
header primary from "Copy the example to the editor" to "Copy example to editor" and I did not run
those two files, because they are not matched by the `biostat*` glob I had been running. They query
by accessible name, so they broke on the rename. Both are corrected in this commit. The lesson is
the glob: a rename reaches every file that names the thing, not every file whose name resembles it.

`biostatWorkbench.test.tsx` needed one change — the assessment's container selector is `.pj-sec`
rather than `.pj-card`.

Also run: `tsc --noEmit` (0 errors), ESLint on the seven changed files (identical warning counts to
the baseline, no file gained one), `ci:undefined-css-classes`.

---

## Judgement calls, recorded

- **`assurance:twoSampleMeans` stays on screen.** It is the engine's own method identifier in a
  provenance line, and the line's job is to be quotable by a reviewer reproducing the number. Giving
  it a prettier label would be a second name for the same method, which is what the provenance stamp
  exists to prevent.
- **The page's `h1` is "Design calculators", and the rail and breadcrumb still say "Biostat
  workbench"** (`shared/constants/ui-surface-registry.ts:864`, label; `shared/navigation/index.ts:184`,
  "Biostatistics workbench"). D5 §B.4 step 9 chose "Design calculators" and D5-3 step 2 made the door
  from Biostatistics say it too, so the rename is the plan's — but its other half is in two shared
  files outside this package's paths. **Handed on:** one label in each, for whoever owns them.
