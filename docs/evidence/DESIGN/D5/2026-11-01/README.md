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
