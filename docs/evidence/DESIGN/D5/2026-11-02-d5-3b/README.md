# D5-3b — the design assessment and the governed documents (D5 §B.4 steps 6 and 7)

Package `D5`, lane L6. Completes `client/src/concept2cure/v2/surfaces/biostatBridge.tsx`.

D5-3a left two steps open and said why: *"Neither is verifiable on the demo project, which has no
persisted study design, so they come with their own evidence."* That was true, and it was the wrong
place to stop. **A screen is not done until it was opened in the running app and used** (RULE 4). So
the first thing this slice did was get a study design onto the demo project the way a person would —
through the governed route the Create-design drawer posts to — and the whole of §B.6 was then run
against the real engine's answer for it.

---

## What already exists (RULE 3)

| Path | What it does today | What it did not do |
|---|---|---|
| `surfaces/biostatBridge.tsx` `DesignBridgePanel` | the designer's assessment: readiness, the engine result, the risk table, the filing sentence, two governed writes, three cross-links | rendered as a `.pj-card` with an orange primary inside it, three inline-styled 26px doors and three flat explanation lines |
| `surfaces/biostatEngineResult.tsx` `ComputedSizeLine` | the engine's figures, method, engine and version — the ONE rendering, shared with the protocol Statistics tab | printed `inputs 39589c3b2c83` on screen |
| `surfaces/biostatEngineResult.tsx` `StatisticalReviewTable` | the gates' findings and the defensibility verdict | printed `PWR-003 MIS-002` in monospace under each element |
| `surfaces/Biostatistics.tsx` "Governed statistical documents" | the org- or project-scoped list of persisted statistical artifacts | a `.pj-card` whose rows led with the artifact id in monospace and whose chip printed the stored status token |
| `editor/CanvasDocumentList.tsx` `statusWords` | the one document-status label map (`draft`/`review`/`approved`/`locked` → words) | was not reached from Biostatistics, which printed the token |
| `surfaces/biostatEngineResult.tsx` `dashed`, `Biostatistics.tsx` `verdictWord`, `vTone` | **two** verdict-word helpers and **two** tone maps for one vocabulary | disagreed: "adequate" beside "Adequate", and only one of the two toned `insufficient_information` as a warning |
| `styles/journey-v2.css` `.sp-row` | the list-row primitive | nine surfaces each carried `style={{ width: '100%', textAlign: 'left' }}` to make a `<button>` row behave |

Nothing here was built new. `POST /api/study-design/persist`, `GET /api/biostat-bridge/designs/:id/assessment`
and `GET /api/ana-biostats/governed-documents` are all pre-existing and unchanged.

---

## The change

**Step 6 — the assessment.** `DesignBridgePanel` is a `<section className="pj-sec bs-assess">`: a
`.pj-sec-h` with `<h2>Design assessment</h2>`, a `.sec-sub` summarising the engine's own figures with
the verdict toned as its chip is, and the two governed writes as `btn ghost small` in `.pj-sec-acts`.
The three cross-links become plain names — "Open the protocol", "Open Tasks", "Open Submission
Center" — left-aligned at the foot. The filing sentence, the standards list and "nothing is computed
in the browser" move into `<details className="pj-more">`. The input record and the gate codes leave
the visible text for the `title` of the line and of the cell they belong to.

**Step 7 — the documents.** "Governed statistical documents" becomes a `.pj-sec` headed "Statistical
documents for this project" (or "…for this organization" — the scope rule is unchanged). The row's
monospace artifact id moves into its `title`; the study's name leads the row instead. The status chip
and the artifact header's status both go through `statusWords`.

**Three convergences the change forced, each a RULE 3 duplication:**

- one `verdictWord` and one `verdictTone`, exported from the lower half of the pair. The wider tone
  map won, because `insufficient_information` is "the engine could not tell", not "the design is
  wrong";
- `button.sp-row` is full-width and left-aligned in `journey-v2.css`, where `.sp-row` lives, instead
  of in nine inline `style` props;
- `statusWords` is reached rather than copied.

**One split (RULE 6).** `biostatBridge.tsx` was at **exactly** 500 effective lines — the repository's
ceiling — so the section could not be built in it without `max-lines` going red. The two governed
write forms moved to `surfaces/biostatGovernedWrites.tsx` (107 lines): they were the block that
depends on nothing else in the module (`computedTotalN`, `pct`, `muted` from the engine-result half,
`C2CForm`, and `DesignAssessment` as a type only — no runtime cycle), and nothing outside the file
imported them. `biostatBridge.tsx` is 444 lines.

---

## Measured in the running app

Dev server on `127.0.0.1:5000`, project **CS-401 IND**, study design **CS-401 pivotal in type 2
diabetes**, persisted through `POST /api/study-design/persist` with a governed reason (the route the
Create-design drawer posts to; the demo database had no design at all, which is why D5-3a could not
reach this section). Every figure below is the engine's, not a fixture: `probe.mjs`, 1440×900 light
and dark and 390×844 `hasTouch`.

```
primaryFills      ["Open in editor"]                      (one, as §B.6.1 asks; four before D5-3)
uppercase         []                                      (none, at every width and theme)
assessHeading     "Design assessment"
assessSummary     "137 subjects · 90% power · Inadequate · 4 of 10 checks pass"
assessHeadActs    ["Apply sample size to design", "Raise tasks (12)"]
assessDoors       ["Open the protocol", "Open Tasks", "Open Submission Center"]
assessFrame       transparent / border 0px / padding 0px / margin-top 32px
engineLineTitle   "Engine c2c-stats 1.0.0 · input record dad4a4bc…2579b53"   (the FULL hash, hoverable)
gateTitles        "Primary endpoint — raised by gate EST-001"
                  "Sample size — raised by gates PWR-003, PWR-006"
                  "Analysis methods — raised by gate MTH-001"
                  "Missing data — raised by gate MIS-002"
                  "Populations — raised by gate POP-001"
govHeading        "Statistical documents for this project"
hashOnScreen      []        gateCodeOnScreen []        snakeOnScreen []
sidewaysOverflow  0         (at 1440 and at 390)
sectionGaps       Study design 0 · Document 24 · Design inputs 24 · Design assessment 32 · Statistical documents 32
```

§B.6.5 end to end, not just rendered: **Apply sample size to design** opens the governed reason form
reading *"Writes 137 subjects at 90% power onto the statistical plan of 'CS-401 pivotal in type 2
diabetes' (currently unset)"* with its 21 CFR §11 notice (`apply-form-1440-light.png`); **Raise tasks
(12)** opens the task picker with the twelve the assessment proposed (`raise-tasks-1440-light.png`).
Neither fires on its click, as before.

Screenshots: `biostat-{1440-light,1440-dark,390-light}.png` and their `-full-` variants,
`assessment-head-1440-light.png` (the heading row), `disclosure-open-1440-light.png` (the doors, the
disclosure and the documents section), `apply-form-` and `raise-tasks-1440-light.png`.

### Three things the screenshots showed that the spec's text did not

1. **The heading summary printed the engine line verbatim.** "137 subjects · 90% power · Inadequate"
   appeared twice, thirty pixels apart — exactly the repetition §WA.4.2 rule 4 retires. The spec says
   the headline facts go to the `.sec-sub`; it does not say the shared engine line gives them up, and
   it must not give them up on the protocol Statistics tab, which has no heading to carry them. So
   `ComputedSizeLine` takes `figuresInLead`, set only by the assessment. The "Not sized" sentence is
   never suppressed: a word in a heading is not the engine's reason for refusing.
2. **The study column's sections sat 44px apart** — `.bs-side`'s 12px flex gap plus the page's 32px
   `.pj-sec + .pj-sec`. A 320px column reads tighter than the page beside it: one gap, 24px.
3. **At 390 the study column came first, not the artifact** (§B.6.6). `.bs-doc-layout > .bs-doc
   { order: -1 }` stopped matching when D5-3a wrapped the note and the artifact in `.bs-main` to stop
   the note becoming a third grid cell — a defect my own previous slice introduced and whose probe
   measured overflow but not order. The wrapper is the grid item, so the wrapper moves.

---

## Tests, each shown failing on the thing it exists to catch

188 pass across the eleven biostatistics and protocol-statistics files. Five cases are new or
rewritten; each was run against the behaviour it replaces and against a targeted mutation.

| Case | Mutation it was shown red on | What it reported |
|---|---|---|
| `traces each finding to its gates in the row's title, and prints no gate code on screen` (`biostatBridge`) | (a) the `title` dropped; (b) the `title` kept **and** the codes printed as before | (a) *"the gates the finding rests on are not reachable at all: expected '' to match /MIS-002/"*; (b) *"a gate code is still printed as visible text"* |
| `summarises the engine's figures in the section heading, once` | `figuresInLead` removed from the panel | *"the heading's figures are printed again in the section body: expected 'Statistical readiness 85%526 subjects…' not to match /526 subjects/"* |
| `says "Not sized" in that heading for a design the engine could not size` | `'Not sized'` → `'— subjects'` | `expected '— subjects · 1 of 1 checks pass' to be 'Not sized · 1 of 1 checks pass'` |
| `keeps the artifact id reachable on the row, and off its face` (`biostatGovernedDocRows`) | the `.sp-tag` id put back on the row | *"the artifact id is still printed on the row: expected 'ART-501BX-204 Phase 2PFS — DSMB…' not to contain 'ART-501'"* |
| `says a stored status as a word, never as the token the store holds` | `statusWords(p.status)` → `p.status` | `expected 'BX-204 Phase 2DSMB / DMC Charterreview' to contain 'In review'` |

`rowFor` in `biostatGovernedDocRows` found its row by the id in the row's **visible text**. Moving the
id broke the locator for all five existing cases at once — which is why the two new cases assert the
id's reachability directly rather than leaning on the helper that now depends on it.

Also run: `tsc --noEmit` (0 errors), ESLint on the six changed files (the same five pre-existing
warnings, no file's count grew; `biostatGovernedWrites.tsx`, `biostatBridge.tsx` and
`biostatEngineResult.tsx` are clean), `ci:undefined-css-classes`, `ci:eslint-ratchet`.

---

## Found while here, not fixed (outside D5)

- **`"Total N=116 (137 after attrition adjustment). 1 groups with 116 per group."`** — the judgment
  engine's own rationale text, server-side (`Sample Size Adequacy` dimension). "1 groups" is a
  pluralisation bug, and a single-arm count reported for a two-arm parallel design is worth a second
  look. `server/services/ana-biostats/**`, outside this package's paths.
- **The demo database has no persisted study design and no persisted statistical document**, so the
  assessment and the document list are both unreachable on a fresh environment until someone creates
  one. That is honest behaviour, not a defect, but it is why this slice had to seed one to test at
  all, and it is worth a seeded design in the demo data.
