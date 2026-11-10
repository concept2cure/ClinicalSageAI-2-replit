# D5-0 and D5-1 — the work-area pattern, and the CMC frame

**Package:** D5, Work areas I (`docs/design/one-design-plan.json`, `open`).
**Spec:** `.design/claude-convergence/D5.md` §WA (the shared pattern) and §D5.A (CMC), under
`docs/design/ONE_DESIGN_PLAN.md` §2 and §5 (RULE 6) and `CLAUDE.md` RULES 3–6.
**Date:** 2026-11-01. **Steps landed:** D5-0 (§WA.4.1) and D5-1 (§A.4 steps 1–7).
**Not in these two steps:** D5-2 (the tab bodies), D5-3/D5-4 (Biostatistics), S7 (CMC behaviour).

---

## What already exists (RULE 3)

Everything here finishes or converges a file that was already in the repository. No screen, route file,
service, table, mount, AnA tool or component file was added. Searched before writing: every function in
`surfaces/CmcModule.tsx`; every `Cmc*.tsx` / `cmc*.ts*` in `surfaces/`; `CMC_NAV`, `CMC_SUGGEST`,
`CMC_SURF`; the `.cm-*` rules in `styles/journey-v2.css`; `grep -n "export function"` for a shared
page-header or work-area component (**none exists** — each work area builds its frame from shared
classes); the tests that pin CMC (`client/src/concept2cure/v2/__tests__/cmc*`).

| Piece | Path | Before | After |
|---|---|---|---|
| The work area | `surfaces/CmcModule.tsx` `CmcModule` | `.cm` scroll box; sticky nine-tab `.cm-sub` bar, `StageBand`, `CmConnectBar`, then the body | `.page-inner cm` with `data-work-area="cmc"`: back link, one `h1`, one sentence, three starters, the two halves, the active half's tabs, then the body |
| Navigation | `CMC_NAV` | nine flat destinations | the same nine, same ids, each with `half`, ordered Module 3 then Study records; `pathway`'s label "Project records" → "Approvals & audit" |
| Tab header | `CmHead` | kicker + 23px `h1` + meta + orange "Ask AnA" + three suggestion tiles, ×9 | a `.pj-sec-h` view lead: `h2`, `.sec-sub`, `.pj-sec-acts` |
| Starters | `CMC_SUGGEST`, `SUGGEST` (Build, QbD) | per-tab tiles; Quality by design and Module 3 build had **no** `CMC_SUGGEST` entry at all | one page-level row; the two missing tabs' lists are imported by reference, so AnA's `availableActions` now covers all nine |
| Per-row doors | `CmPush` | "OPEN IN" label + four accent-filled pills | four `btn ghost small` in a `.pj-sec-acts` row |
| Destinations | `CmConnectBar` | "THIS WORK FLOWS INTO" + six chips | deleted; §A.5 below names each destination's own door |
| Pattern CSS | `styles/app-v2.css` | — | one `[data-work-area]` block (D5-0), used by D5, D6 and D7 |
| CMC CSS | `styles/journey-v2.css:347–421` | `.cm`, `.cm-sub`, `.cm-subtab`, `.cm-connect*`, `.cm-push button` … | those deleted; `.cm-meta`, `.cm-linkish`, `.cm-sub-head` restyled quiet and not uppercase |

## Capability kept (§A.5)

| Removed or demoted | Where its outcome lives now |
|---|---|
| Sticky nine-tab bar above everything | The same nine tabs, by id, in the two halves' rows under the header. `cmc.open-tab`, `__cmSetTab` and every tab id are unchanged. |
| `StageBand` "What to do now" + "NEXT STEP" | `blurb` → each tab's `title`; `now` → `anaContext.facts.whatToDoHere`, answered by the first starter "What do I do on …?" (proved in `cmcSurfaceContext.test.tsx`). |
| `CmConnectBar`'s six destinations | Module 3 dossier → the Module 3 build tab; Document editor → the project's Author step and ⌘K; Vault → the rail; Project → the `.pj-back` link; Tasking → the topbar Task button and each register's `CmPush` Task; Collaborate → the topbar and `CmPush` Discuss. |
| `CmHead` kicker and orange "Ask AnA" (×9) | The starter row's three asks, the first of which sends the same prompt the button sent. |
| Suggestion tile grid | The same suggestions as a row; every `CMC_SUGGEST` entry still reaches AnA as context. |
| `CmPush` "OPEN IN" pills | The same four actions, same handlers, as ghost buttons. |
| `.cm-kpis` tile grids | `.reg-kpis`, a quiet figure line. `Kpi`'s markup (`.reg-kpi`, `-v`, `-l`) is byte-identical, so a door is still the same `<button>` and the tests still read it. |

## Measured, in the running app

`probe.mjs` (filed here) signs in, opens CMC on the C2C-101 project, and reads the page. Output at
1440×900 and 390×844, light and dark:

| §WA.6 / §A.6 | Measured |
|---|---|
| 1. `[data-work-area]` inside the page metrics | `page-inner cm`, `max-width: 1120px`, `padding: 32px 40px 96px` |
| 2. one `h1.ph-title`, Lora 26 (22 at 390), the rail label | 1, `Lora … / 26px` (390: `22px`), "CMC / Module 3" |
| 5. no retired text in the work area | `retiredText: []` ("What to do now", "flows into", "Linked to", "come from", "later release", "comes later", "NEXT STEP") |
| 3. no uppercase inside the work area | one left: the `AnswerLead` eyebrow (D5-2). Before D0-2 landed it was eight — the eyebrow, Portfolio's five column headers, "RPI" and "IR overdue"; D0-2's sentence-case header rules took the rest. |
| 6. ≤3 starters, each sending its prompt | "What do I do on Overview?", "Run the ICH compliance check and show every gap", "Generate the drug-substance control strategy" |
| 7. at 390 the page does not scroll sideways | `sidewaysOverflow: 0` at both widths; the tab row scrolls inside itself |
| A.6 2. the halves | `segs: ["Module 3 *", "Study records"]`; Study records shows Substance & product … Change control |
| A.6 2. coming back keeps your place | opened Stability, went to Module 3, came back: `reopened Study records on: ["Stability"]` |
| A.6 6. Stability's row actions are not clipped | `tableOverflow: 0`; all of Result, Estimate Q1E, Trend, Shelf life, History visible |

**Still red, and all of it is D5-2's named work, not a gap in these two steps:**

- `answerLeads: 1` and `orangeFills: ["Advance the next section"]` — Overview's `AnswerLead`. D5-2 step 8
  decomposes it (question → the tab's first starter, headline → the lead's meta, action → a Section
  approvals ghost).
- `uppercase`: the `AnswerLead` eyebrow — it goes with the lead in D5-2 step 8, which also renames
  Portfolio's "RPI" → "Preparedness" and "IR overdue" → "Questions overdue" (abbreviations defined nowhere
  on screen).
- Substance & product is 3,588px tall at 1440 with its registers empty (§A.6 item 5 wants under 1,600) —
  D5-2 step 9, the one `RegisterCard` change.

## Verified by making the check fail

`client/src/concept2cure/v2/__tests__/cmcWorkAreaReach.test.ts` was written for the retired band; its
cases are rewritten here. Run against **HEAD's** `CmcModule.tsx` (`git show HEAD:… > …`), the four
changed cases fail and the other fourteen pass:

```
× declares all nine, with both sentences
  → expected [ 'overview', 'materials', …(7) ] to deeply equal [ Array(9) ]
× splits the nine into the two halves the founder named
  → expected [] to deeply equal [ Array(4) ]
× keeps no band above the title
  → expected '…' not to contain 'from \'./ProjectStages\''
× would notice a band put back, or a parser that reads nothing
  → expected '…' not to match /\bCmConnectBar\b/
Tests  4 failed | 14 passed (18)
```

Two defects the rewrite found in the test itself, both fixed:

1. **A parser that silently matched nothing.** `destinations()` was one regex requiring `id`, `label`,
   `icon`, `blurb`, `now` on consecutive lines. Adding `half` to the first line made it match **zero**
   entries — and every case over it would then have passed vacuously. It is now split per entry and read
   per field, with `expect(destinations().length).toBe(9)` as the guard.
2. **A rule reading its own documentation as a violation.** "no `CmConnectBar`" first failed on the
   comment that *records* its deletion. The assertions now read the file with comments stripped, as this
   file's route sweep already does, and one case asserts the strip is working (the name IS in the
   module's prose and is NOT in its code).

## Caveats, stated

- **The screenshots were taken with `RLS_ENFORCE=off`.** With the container's `.env` value (`on`) nobody
  can sign in, because this local database is behind the migration set: `c2c_platform_scope` does not
  exist and `public.user_id_for_email` is still owned by `c2c`, so under FORCE row-level security the
  sign-in lookup answers NULL and the route takes its unknown-email branch (`failed_login_attempts` stays
  0). `migrations/20261030b_platform_scope_role.sql` predicts this symptom in its own header. Applying the
  set locally halts earlier, at `migrations/20261023_review_routes.sql`, with *permission denied for schema
  public*: it does `ALTER FUNCTION … OWNER TO review_route_writer` having granted that role only `USAGE`
  on `public`, and a non-superuser applier cannot give a function to a role that may not create in the
  schema. Both are outside D5's paths and are reported, not fixed here.
- The dev account's password was reset in the local database to run the screen.

## After the merge

D0-1 (the type-scale tokens) and D0-2 (one definition of each primitive) landed upstream while this was
being built. The merge commit deletes every bridge rule D5-0 carried for them, so each primitive has one
definition; `foundationsOneDefinition` and `ci:undefined-css-classes` pass, and the numbers above were
re-measured against the merged tree. `foundationsSentenceCase` is still red at 288 declarations — D0-3's
open sweep — and this branch lowers `journey-v2.css`'s share of it from 18 to 16.

---

# D5-2 — the CMC tab bodies

`d5-2/` holds the screenshots and `probe-tabs.mjs`, taken after the step.
**Steps landed:** §A.4 steps 8 (Overview), 9 (`RegisterCard`), 13 (Module 3 build),
14 (Quality by design), and `CmcRegisterLinks`.
**Not yet:** steps 10 (Stability's tiles and its Q1E note), 11 (Batch's four), 12 (Approvals &
audit's four), 15 (`CmcPlaceIntoSubmission`), 16 (the raw-state label map).

## Measured, in the running app at 1440

| | Before D5 | After D5-1 | After D5-2 |
|---|---|---|---|
| Overview — orange fills | 2 | 1 | **0** |
| Overview — uppercase runs | 8 | 1 | **0** |
| Overview — `.al-lead` banners | 1 | 1 | **0** |
| Overview — page height | — | 1,479px | **1,055px** |
| Module 3 build — orange fills | 2 | 2 | **1** ("Compile Module 3", in the tab's lead row) |
| Quality by design — orange fills | 2 | 2 | **1** ("Generate control strategy", same place) |
| Substance & product — height | 3,600px | 3,588px | **2,551px** |
| Study records tabs — orange fills | — | 0 | **0** |

That is §A.6 item 4 met on all four tabs this step touched. Item 5 (Substance & product under
1,600px) is measured here against a project that HAS records in several registers, so it is not the
spec's empty-register comparison; the 1,037px that came off is the fifteen card frames and their
dashed empties.

## Capability kept (§A.5, the rows this step moved)

| Removed or demoted | Where its outcome lives now |
|---|---|
| Overview's `AnswerLead` question | The page's first starter, same words (`CMC_FIRST_ASK.overview`) |
| its headline | The view's grey line (`overviewMeta`), with every arm it had — failed read, in flight, none recorded, the average, and the weakest submission |
| its action / alt | The two ghosts in Section approvals, same handlers (`openOverdueLetters` when a letter is overdue, else "Advance the next section"; "Open the Module 3 build board") |
| its body | Already shown: the failed read is the error `EmptyState`, the overdue count and everything it leaves out is the figure's own sub-text (including the §sections, which were a parenthesis in the body), the earlier file is its own line, and `anaContext` publishes the rest |
| its `reassure` / `secondary` | Deleted — AnA's voice, and the page describing itself |
| "RPI", "IR overdue" | "Preparedness", "Questions overdue" (same values) |
| Fifteen boxed register cards | The same title, count, scope, "+ Add", table, row actions and history, as sections |
| Module 3 build's five tiles | One grey line: "N sections in CTD §3.2 · N of N approved · N ready to compile · N stale · N blocked", stale and blocked in `--error` when non-zero |
| Quality by design's six tiles | One grey line: "N CQAs derived (ICH Q8) · N controlled by a method · N CPPs derived (ICH Q11) · from N specifications and N methods · N gaps" |
| Both files' own `Head` and `Kpi` | One `CmHead` and one `Kpi` in `cmcShared`, used by all nine tabs |
| `CmcRegisterLinks`' boxed panel | The same rows, retry and receipt, as a section; still renders nothing when nothing is pending |

## Defects this step found, not just made

1. **Every empty state in the app had a chip's background.** `EmptyState` renders
   `c2c-empty-state tone-idle`; `.tone-idle` is the chip tone vocabulary, same specificity and
   declared later, so it won straight through D0 §4.2.12's `background: none`. 579 renders. Undone
   in CSS; the real fix is the component not borrowing a chip's class, which is outside this
   package's files.
2. **`lowSub` named a single submission as what was holding itself back.** With one ranked
   submission the lowest IS the average. The retired banner carried the same flaw; it is named now
   only when there is more than one and it is actually below the average.
3. **The scope note doubled its separator** — `SCOPE_NOTE` text already opens with "·".
4. **A group label outranked by its own sections.** Making a register's title an `h2` put
   "Drug substance — §3.2.S" (13px) above "Drug substance" (15px). It reads as the divider it is.

## Verified by making the check fail

Six test files follow their screens. The four cases that read the deleted banner's body are
re-pointed at where the fact is shown now, and one got stronger in the move: "a failed read says so
more than once" (an assertion about echoes) became "says so once, and nothing contradicts the —"
(the rule). Shown red on the exact mistake it guards — `questionsComplete` treating an unread
earlier file as an empty one:

```
-    && fig.overdueLettersWithoutQuestions === 0 && earlierOpen === 0;
+    && fig.overdueLettersWithoutQuestions === 0 && (earlierOpen ?? 0) === 0;

× CmOverview — no all-clear over an earlier CMC file that was not read
  > withholds it, and says why, when the earlier file could not be read
  → expected 'ok' not to be 'ok'
Tests  1 failed | 17 passed (18)
```

All 20 CMC client test files pass (265 cases), plus the eight other files that mount these
components.

---

# D5-2, finished (§A.4 steps 10, 11, 12, 15, 16)

The remaining steps, landed 2026-11-02. No stylesheet but `journey-v2.css`; no `app-v2.css` turn.

| Step | What | Measured after, at 1440 on C2C-101 |
|---|---|---|
| 10 | Stability's two figures → the view's grey line | `0 active studies · 0 outside limits`; 0 tile groups, 0 uppercase |
| 11 | Batch's four → one line | `0 batches · 0 pending release · 0 open deviations · average yield 0%` |
| 12 | Approvals & audit's four → one line | governed events · sections tracked · contradictions resolved · still open |
| 15 | `CmcPlaceIntoSubmission`: orange `reg-cta` → ghost; its paragraph → a "What placing does" disclosure | Module 3 build keeps its single orange, "Compile Module 3" |
| 16 | One state vocabulary, `cmcStateWord` in `cmcShared.tsx` | chips read "Completed", "Capable", "Approved", "Draft", "In review" |

The one `.reg-kpis` that remains is Overview's questions-overdue **door**, which §A.4.5 keeps as a
`<button class="reg-kpi">`.

## The vocabulary found more than the spec named

§A.4.16 named three tokens on the §3.2 section chips (`draft`, `review`, `approved`). The new case —
**"a stored state is shown as a word, never as its token"**, asserted over *every* rendered `.rd-chip`
rather than one row — caught two the spec had not listed:

```
Stability   status chip   "COMPLETED"   ← the store's own caps, printed raw
Capability  verdict chip  "capable"     ← the engine's verdict token
```

Both are enums on a screen that files to an agency (§WA.4.2 rule 10), and the second is this session's
own code from pass 7. A token the map has not met is opened out and sentence-cased rather than guessed
into another state's word — so a state nobody anticipated shows as itself.

`incomplete` beside those chips is authored copy, not a token, and the spec says it stays. It sat in
lower case among them and read as one of them, so it is sentence case now: same word, same reason on
hover.

## Ratchet

`reg-cta`'s baseline drops 19 → 13 — the count after D5-2's three conversions — per the ratchet's own
instruction to re-level in the commit that lowers it.

Separately, D5-2 had taken `cm-head`, `cm-kicker` and `cm-title` to zero uses while their aliases stayed
in D0's `:is()` lists, which turned `foundationsRetiredRatchet` red on origin. The D0-6 deletion for all
three is `4f0486e97`: seven alias occurrences across five selector preludes, no rule body touched.

**Gates:** tsc 0; ESLint 0 errors, no file gained a warning; 266 CMC tests across 20 files; 50 across the
two foundation guards; `ci:undefined-css-classes` OK.
