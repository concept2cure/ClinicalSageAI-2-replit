# D0-8: an urgent or good answer lead says so, with or without an eyebrow

**Package:** D0, Foundations (`Plan: D0`). **Step:** D0 review fix 9
(`docs/evidence/DESIGN/D0/review/README.md`, item 9, "An urgent or good lead with no eyebrow shows no cue at all").
**Read at:** `753990a0f` on `concept2cure-v2`, 2026-11-02. Line numbers below are as of that commit. The review cited
lines at `bfa9c6869`; they have moved, so each was found again by its selector.
**Files changed:**
- `client/src/concept2cure/v2/AnswerLead.tsx`: the tone cue (`toneCue`, replacing `eyebrowIcon`) and where it is drawn
  (`placeToneCue`).
- `client/src/concept2cure/v2/styles/app-v2.css`: four rules for `.al-cue`, directly after `.al-k svg`.
- `client/src/concept2cure/v2/__tests__/answerLeadToneCue.test.tsx`: the new test.
- This folder.

No caller is edited. `SafetyNarrative.tsx` gets its cue from the component.

## What already exists (RULE 3)

Searches run, at `753990a0f`:
- `grep -rn "\.al-" client/src/concept2cure/v2/styles/app-v2.css` (the lead's rules);
- `grep -rn "sr-only" client/src --include=*.css` and `--include=*.tsx` (the visually hidden class: 1 definition,
  36 uses in TSX);
- `grep -rn "'Urgent:\|\"Urgent:\|>Urgent:\|On track:" client/src --include=*.tsx` (no tone prefix exists anywhere:
  0 hits);
- every `<AnswerLead` render outside the component, with its `tone=` and `eyebrow=` (28 renders in 20 files, plus
  5 `<UnresolvedLead>`);
- `git log -S "al-cue" -- client/src/concept2cure` (0 commits: the class never existed) and
  `git log -S "al-urgent" -- client/src/concept2cure` (`75bc5f6b4`, `bacc0d343` D0-2, `1dee898e9` D0-4);
- `git log --diff-filter=D --name-only -- 'client/**/*AnswerLead*'` (nothing deleted);
- every test that reads `.al-h`, `.al-k` or `.al-lead` (`grep -rn "al-h\|al-k\|al-lead" … --include=*.test.*`).

### What each piece does today

- **The component** is `client/src/concept2cure/v2/AnswerLead.tsx`. `eyebrowIcon(tone)` (`:36–42`) returns `I.clock`
  for urgent, `I.check` for good and nothing for calm. It is drawn **only inside the eyebrow line**, `.al-k`
  (`:57–61`): `{eyebrow && <div className="al-k">{eyebrowIcon(tone)} {eyebrow}</div>}`. The headline `.al-h`
  (`:62`) carries no cue. So a lead with no `eyebrow` shows its tone nowhere: not in an icon, not in color, not in
  text.
- **The styles** are `client/src/concept2cure/v2/styles/app-v2.css:3703–3718` (D0-4's quiet lead). The tone colors
  only the eyebrow: `.c2c-v2 .al-urgent .al-k { color: var(--warning) }` (`:3705`) and
  `.c2c-v2 .al-good .al-k { color: var(--success) }` (`:3706`). `.al-k svg` is 14px (`:3707`). `.al-lead` has no
  background and no border (`:3703`).
- **Before D0** the whole panel was tinted by tone: `d914c2618:app-v2.css:3577–3578`
  (`.al-lead.al-urgent` and `.al-lead.al-good`, a 40% border and an 8% fill). D0-4 removed the panel, correctly by
  ONE_DESIGN_PLAN §2 and D0.md §3 ("Status colour (…) appears … always with text or an icon beside it"), and with it the only
  cue a lead without an eyebrow had. That is the regression.
- **Screen readers.** Every icon renders `aria-hidden="true" focusable="false"` (`icons.tsx:134`). So the tone has
  never reached a screen reader, with or without an eyebrow, before D0 or after. The review's fix asks for a
  visually hidden prefix on both tones.
- **The visually hidden class** is `.c2c-v2 .sr-only` (`app-v2.css:1010`): absolute, 1px, clipped, `nowrap`. It is
  already used for labels (`IndDocumentLibrary.tsx:190`, `ProjectFilesPanel.tsx:541`, `DataRoomSourcesPanel.tsx:144`)
  and a live region (`DownloadMenu.tsx:447`). It is reused here; no new hidden-text class is made.
- **The one caller this hits** is `surfaces/SafetyNarrative.tsx`. Its lead (`:253–271`) is `tone: 'urgent'` when the
  soonest SAE case is due in 3 days or fewer, with the headline "`<case>` is due in `<n>` days — `<clock>`" (the
  21 CFR 312.32(c) expedited-reporting clock). It renders at `:415–420` with **no eyebrow**. Of the 28 renders, it
  is the only one with no eyebrow; the other 27 pass one (some conditionally, such as `BiopharmaSpecialty.tsx`'s,
  all of which still pass a string).
- **Tests that read the lead's text.** `biopharmaSpecialtyNoFixtures.test.tsx:226` reads `.al-h` `textContent` and
  asserts with `toContain` / `not.toContain`. `ndaCockpitRequiredSectionCompleteness.test.tsx:128` joins `.al-h`,
  `.al-b` and `.al-re` and matches within it. Both callers pass an eyebrow, so their `.al-h` is unchanged. No test
  reads `.al-k`. `riskHonesty.test.tsx:128` and `zeroStateNarrative.test.tsx:166` read `.al-btn`, which is unchanged.
  `foundationsOneDefinition.test.ts` pins `.al-lead` and `.al-k` to `app-v2.css`; neither rule is edited.
- **No existing test** renders `AnswerLead` with a tone and asserts its cue. There is no `AnswerLead` unit test at
  all; it is reached only through the screens' tests.

## What changes

This **completes** `AnswerLead.tsx`'s tone cue (D0-4). It is not a new component, class family or variant.

1. `eyebrowIcon(tone)` becomes `toneCue(tone)`, which returns the icon and the words for the tone:
   urgent → `I.clock`, "Urgent:"; good → `I.check`, "On track:"; calm → nothing. A second helper in the same file,
   `placeToneCue(tone, hasEyebrow, hasHeadline)`, returns the cue for each line, so `AnswerLead` itself only renders
   `{cue.eyebrow}`, `{cue.headline}` and `{cue.body}`. (Written inline first, the branches took `AnswerLead` to an
   eslint complexity of 22 against a limit of 15, a new warning; the helper keeps it at HEAD's level.)
2. The cue is drawn on the lead's **first line**:
   - with an eyebrow, in `.al-k`, as today, and now with the hidden words before the eyebrow text;
   - with no eyebrow, at the start of `.al-h`: the icon in a `.al-cue` span, then the hidden words;
   - with neither, at the start of `.al-b` (no caller does this today; it keeps the cue from vanishing again).
3. The hidden words are `<span className="sr-only">Urgent:</span>` followed by a space, the pattern GOV.UK uses for
   its hidden "Error:" prefix. A screen reader reads "Urgent: SAE-0042 is due in 3 days — …".
4. Calm is unchanged: no icon, no words, the same markup as before.
5. `app-v2.css`, after `.al-k svg`:
   ```css
   .c2c-v2 .al-cue { display: inline-flex; vertical-align: -2px; margin-right: 2px; }
   .c2c-v2 .al-urgent .al-cue { color: var(--warning); }
   .c2c-v2 .al-good .al-cue { color: var(--success); }
   .c2c-v2 .al-cue svg { width: 14px; height: 14px; }
   ```
   The icon is the eyebrow's: 14px, `--warning` or `--success`. The 2px margin plus the following space makes about
   the 6px the eyebrow's `gap` gives. The `-2px` is the inline-icon offset `.rd-chip svg` already uses.

What does **not** change: the panel stays untinted (D0.md §3); the headline's color stays `--text-100`, so only the
icon carries color, and the icon is never the only signal, because its words are read; `UnresolvedLead` (calm);
every caller.

**One reading to flag.** The step's wording ties the hidden prefix to the no-eyebrow case. The review's fix lists it
as a separate bullet for both tones, because "the tone is visual-only for screen readers today" with or without an
eyebrow. This change follows the review: an urgent or good lead with an eyebrow also gets "Urgent:" / "On track:",
inside `.al-k`, before the eyebrow text. Its visible markup is unchanged (the same icon, the same color). Mutant `m1`
below is the narrower reading, and the test refuses it. If the coordinator wants the narrower reading, delete the
`{spoken}` from the `hasEyebrow` branch of `placeToneCue` and the two `.sr-only` assertions in the eyebrow cases.

## Tests and gates

Every run's full output is in `red/` or `green/`. Vitest ran with `--maxWorkers=1`. No dev server or browser was
started. HEAD moved during the work (`753990a0f` → `c5404356f` → `891e277d0` → `64ac5674a`); none of those commits
touched `AnswerLead.tsx`, `app-v2.css` or `SafetyNarrative.tsx` (`git diff --stat c5404356f HEAD -- …` is empty).

### The new test: `client/src/concept2cure/v2/__tests__/answerLeadToneCue.test.tsx`, 10 cases

- **No eyebrow, urgent and good** (2 cases): `.al-h`'s first child is `.al-cue`, holding exactly the `I.clock` /
  `I.check` markup with `aria-hidden="true"`; the next element is `.sr-only` with "Urgent:" / "On track:"; `.al-h`'s
  text is "Urgent: `<headline>`"; `getByText(<headline>)` still finds `.al-h`; there is no `.al-k`.
- **No eyebrow and no headline, urgent** (1 case): the cue opens `.al-b` instead.
- **With an eyebrow, urgent and good** (2 cases): `.al-k` keeps its icon and gains the `.sr-only` words before the
  eyebrow; `.al-h` is the headline alone; across the lead there is one `.sr-only`, one icon and no `.al-cue`.
- **Calm, with and without an eyebrow** (2 cases): no icon, no `.sr-only`, no `.al-cue`; `.al-h`'s `innerHTML` is the
  headline string; the class is `al-lead al-calm`.
- **CSS** (3 cases, read as text, as the D0 guards do): `.al-urgent .al-cue` is `--warning` and `.al-good .al-cue`
  is `--success`, like `.al-k`; `.al-cue svg` is 14px like `.al-k svg`; `.c2c-v2 .sr-only` is absolute and clipped.

**Red, before any change** (`red/answerLeadToneCue.txt`, at `c5404356f`): 7 of 10 fail. The 3 that pass are the two
calm cases and the `.sr-only` rule case, which pin what must not change. The 7 fail for the reason they exist:
"expected undefined to be 'al-cue'" (no cue on the headline or body), "expected undefined to be 'Urgent:'" /
"'On track:'" (no words on the eyebrow), and "expected '' to match /color:\s*var\(--warning\)/" (no `.al-cue` rule).

**Red, with five defects planted one at a time against the final code** (`red/answerLeadToneCue-m*.txt`). The script
swapped one text in `AnswerLead.tsx`, ran the test, and put the file back; the file's md5 was the same before and after.

| Mutant | What was planted | Cases that turned red |
|---|---|---|
| `m1-no-words-on-eyebrow` | No `.sr-only` words on the eyebrow line (the narrower reading) | The two eyebrow cases (2) |
| `m2-cue-twice` | The cue on the eyebrow and again on the headline | The two eyebrow cases (2) |
| `m3-icon-without-words` | The headline icon with no `.sr-only` words | The two no-eyebrow cases and the body case (3) |
| `m4-calm-gets-a-cue` | Calm gets the good cue | The two calm cases (2) |
| `m5-no-body-fallback` | No cue when there is neither eyebrow nor headline | The body case (1) |

**Green** (`green/answerLeadToneCue.txt`): 10 of 10 pass.

### Gates

| Gate | Result | File |
|---|---|---|
| The three D0 guards (`foundationsSentenceCase`, `foundationsOneDefinition`, `foundationsRetiredRatchet`) | 3 + 17 + 33 cases, all pass. `.al-lead` and `.al-k` are still declared once, in `app-v2.css`. | `green/readers-and-guards.txt` |
| `npm run --silent ci:undefined-css-classes` | exit 0: "every static className in v2 is defined, 2 reviewed exception(s)". **Seen failing:** with the four `.al-cue` rules removed it exits 1 and names `al-cue` in `AnswerLead.tsx`. | `green/ci-undefined-css-classes.txt`, `red/ci-undefined-css-classes-without-al-cue.txt` |
| `npm run --silent ci:token-contrast` | exit 0. 131 pairs; 15 documented exceptions held. No token changed; `--warning` and `--success` were already used for `.al-k`'s text. | `green/ci-token-contrast.txt` |
| `npx eslint` on `AnswerLead.tsx` and `answerLeadToneCue.test.tsx` | 0 errors, 0 warnings. HEAD's `AnswerLead.tsx`, linted the same way through `--stdin`, also has 0. **No new warning.** | `green/eslint.txt` |
| `tsc` on the two TSX files and their import graph, with the repo tsconfig | exit 0. A whole-project `tsc --noEmit` ran out of heap at 2 GB, so the run uses a temporary tsconfig that extends `./tsconfig.json` with only these files (`--listFiles` shows `AnswerLead.tsx`, the test and `icons.tsx` in the program). | `green/tsc-isolated.txt` |
| Every test under `client/src` and `tests` that names `AnswerLead`, `app-v2` or `SafetyNarrative`, plus the 3 guards: 40 files | 39 files pass, including the SafetyNarrative suites (`saeReportabilityNotDetermined` 9/9, `safetyNarrativeSaveRecovery` 7/7) and `biopharmaSpecialtyNoFixtures`, which reads `.al-h`. 1 fails: `runPolicySwitch.test.tsx`, 5 cases, "No `authService` export is defined on the `@/services/portal/authService` mock". **This failure was there before the change:** with HEAD's `AnswerLead.tsx` and `app-v2.css` swapped back in, the same 5 cases fail the same way. D0-7 recorded the same failure. It is that test's mock, not this lane. | `green/readers-and-guards.txt`, `green/runPolicySwitch-at-head-without-this-change.txt` |
| The tests that read `.al-*` through their screens but name neither file: `riskHonesty` (`.al-btn`), `ndaCockpitRequiredSectionCompleteness` (`.al-h`, `.al-b`, `.al-re`), `zeroStateNarrative` (`.al-btn`) | 3 files, 28/28 pass | `green/al-class-readers.txt` |
| Skeptic's run: every test that imports one of the 15 surfaces that can render an urgent or good lead (the eyebrow line of 14 of them now also carries the hidden words) | 77 files, 693/693 pass, so no screen test reads the eyebrow's text in a way the hidden prefix breaks | `green/caller-surfaces.txt` |

### Not done here

- **The running app.** No browser was opened (this step's constraint). RULE 4 says a screen is not done until it was
  used in the running app. Owed: open Safety narratives with a case due in 3 days or fewer, at 1440 and 390, light
  and dark, and check that the clock icon sits on the headline's first line in `--warning`, about 6px before the
  text, and that a screen reader (VoiceOver rotor or the accessibility tree) reads "Urgent:" first.
- **`design-system/README.md:177`** (the component inventory's answer-lead row) does not mention the cue. A
  one-clause addition would be "urgent and good name their tone on the first line". It is left to whoever holds
  that file for fix 16's README copy, to avoid two sessions editing it at once.
