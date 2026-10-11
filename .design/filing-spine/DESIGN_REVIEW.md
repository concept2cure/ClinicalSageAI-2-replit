# Design review: the filing spine (2026-10-08)

**Feature.** The filing spine UI built on 2026-10-08 by session `…011DpxUyQmE1enma4gTjcfBy`, launch row **D2**:

| Slice | Commit | What |
|---|---|---|
| F2 | `113056e4` (merged as `64c4bcad`) | Project home: five tabs; conversations above the tabs; Submit's coming-later line |
| F16 | `77d95ef2` | No dead ends: locked doors gated, Builder sources note, Vault no-project action, launch-scope "Back to Projects" |
| F17 | `e796ae9c` | Place into filing states the filing copy's status; "Re-place approved version" |
| F19 | `a3dd2889` | Each market states what the platform can carry (`market-support.ts`, `MarketSupportLine`) |
| F20 | `97ab887d` | New submission takes the project's filing (`NewSubmissionForm`) |
| F21 (part) | `afca3546` | The Cross-region model verdict is retired |

**Brief.** `docs/design/FILING_SPINE.md` (§1–§3 intent, §7 slices). There is no separate `DESIGN_BRIEF.md`; the spine is the brief.

**Lenses run.** Seven read-only agents ran in parallel, each given the same scope and brief:
- the six of the design-review roster: `design-reviewer`, `a11y-auditor`, `part11-ux-auditor`, `microcopy-reviewer`, `motion-auditor` and `design-system-auditor`;
- `honest-state-auditor` as a seventh, because F19 and F20 are mostly about a failed read versus an empty one.

The motion lens ran and found no motion introduced. Its one finding was a layout jump.

## Screenshots

Captured in Chromium against the local server, after migrations:
- **Before the fixes:** `screenshots/`, at 1280, 768 and 375.
- **After the fixes:** `screenshots/after/`, taken with the same script, with three gaps closed:
  - the Builder note on a submission that has a sequence;
  - the Vault with no project open;
  - the Submit tab's submission rows.

The first pass missed those three. The design and a11y lenses said so, rather than judging them.

## Verdict

The slices did what they set out to do, but the review found problems the per-slice audits had missed.

**Ten were claims the screen made that were not true.** Three lenses found them independently:
- A 510(k) was told it gets an FDA eCTD build.
- "Refused at creation" was said of a submission nothing had refused.
- "Filed as approved: this document carries its approval signature" was shown before anything was filed, and with no seal read.
- Every IND preselected Biotech.
- "No project conversations yet" was shown when only the reader's own conversations are listed.
- An empty rule-pack read rendered as "No outline".
- "Assemble eCTD, validate & transmit" overclaimed the Submit stage.
- The Vault header read "IND · 21 CFR 312" on an NDA project.
- "Not offered. Not offered: …" repeated itself.
- The Submission Center header named formats the platform does not build.

**The rest were real defects of form:**
- two exits rendered as grey text;
- a strip of tabs with no tabs in it, for a screen reader;
- a composer squashed to 225px by a dead CSS rule;
- a drawer that moved the page twice before it opened.

All must-fix items are fixed in this change. The open list below is what was not, with the reason for each.

## Fixed in this change

Each fix has a test that fails on the code before it, saved under `docs/evidence/D2-ONE-ANA/2026-10-08/filing-spine-design-review/red/`.

### Must-fix

| # | Finding | Lens(es) | Fix | Held by |
|---|---|---|---|---|
| 1 | "Back to Projects" (launch-scope gate) and "Re-place approved version" were bare `.btn`: no border, no fill, read as captions. | design, a11y, design-system | `btn ghost`; `btn primary sm`. | `filingPathNoDeadEnds`, `placeIntoFilingApprovalState` |
| 2 | Re-place sent the first placement's reason from a locked field, said nothing of its effect, and its `LEAF_UPDATED` row could not show draft → approved (same text, same pin, `documentChanged:false`). | Part 11 | Its own required reason field ("Reason for re-placing"); a sentence naming the leaf, the code, the sequence and the effect; the button stays mounted while the write runs, and focus moves to the outcome. The server records the copy's `documentStatus` on every `LEAF_CREATED`/`LEAF_UPDATED` row. | `placeIntoFilingApprovalState`, `leaf-cross-project.pglite` |
| 3 | "Refused at creation" on markets nothing refuses (the submission row exists). | Part 11, honest-state | The line reads "Not supported: the platform has no filing outline or channel for X". No refusal is claimed and no internal words are used. | `market-support.test` (amended in place, dated) |
| 4 | Device filings (510(k), PMA, De Novo, IDE, MDR, CER) were said to get "Structured Module 1. Transmit not proven…" and to be buildable. | honest-state | They now read "Outline only, no package" (or "No outline, no package") with "device filings are not eCTD, and the platform builds no device package or transmit yet". They are not buildable. | `market-support.test` |
| 5 | Project home's lifecycle strip was `role="tablist"` over plain buttons with `aria-selected`, so a screen reader was told of no open stage. | a11y | `<nav aria-label="Project lifecycle">`, with `aria-current="step"` on the open stage. | `projectHomeStages`, `anaDrivesWave5` |
| 6 | `marketSupportText` printed "Not offered. Not offered: …". Lines leaked internal names: `ind:mhra rule pack`, `ema:… adapter`, `PKCS#7`, "No document agency is defined for…". | microcopy | A line that opens with its summary is shown once, as one sentence. The server lines are reworded. | `marketSupportLine`, `market-support.test` (a guard that no line names a pack, adapter or signature format) |
| 7 | "Assemble eCTD, validate & transmit" on the Submit stage. The Submission Center header named eCTD v4.0, eSTAR and MDR/IVDR, and "Seven workspaces scaffolded from the submission contract". | microcopy | "Build and validate each market's eCTD sequence"; "Plan, build, validate and dispatch each market's eCTD v3.2.2 sequences." Respond reads "Draft responses to agency letters". | reviewed |

### Should-fix taken

| # | Finding | Lens(es) | Fix |
|---|---|---|---|
| 8 | **The start-a-conversation composer squashed to about 225px, centred, with a stray rule and a hover fill.** `.pj-convo` was defined twice in `app-v2.css`: once for the section, and once for a conversation row that nothing renders any more. | design, design-system | The dead row rules (`.pj-convo` row, `-ic`, `-b`, `-t`, `-m`, `-go`) are deleted, and `surface-text-ramp.css` is regenerated (`ci:surface-text-ramp`). A test holds one `.pj-convo` rule that does not centre. |
| 9 | **The New submission placeholder sat in the page, moved it about 64px twice, and was never announced.** | motion, a11y | `C2CForm` takes a `busy` status. The drawer opens at once with the status inside the dialog (`aria-busy`). The fields take their defaults in the render where the reads settle, so there is no frame of empty fields. |
| 10 | **The drawer's notice was `role="alert"`, competing with the dialog's name.** As a `<div>` it also flipped the `:nth-of-type` gap of the half fields. | a11y, design-system | It is now a `<p role="status">` that describes the dialog, with a bottom margin. |
| 11 | **The half-width Client type and Project fields touched.** | design, design-system | Both are full width in this form. The global rule is listed under Open, item 4. |
| 12 | **The region description changed silently while focus was on Application type.** | a11y | It is a polite live region (`descLive`). |
| 13 | **Defaults looked like choices.** | Part 11 | Each defaulted field says so: "From this project's record." or "From this project's product type." When the project's market already exists, the region field says so instead of staying silently blank. |
| 14 | **Client type was a guess.** The shell's workspace, and then the filing type's bucket, put every IND under Biotech. | honest-state | The recorded `product_type` decides: drug → Pharma, biologic → Biotech, device or SaMD → Medical device, IVD or CDx → IVD. Without one, the open workspace decides. Otherwise nothing is preselected. |
| 15 | **"Programme" in the form.** | microcopy | "Project". |
| 16 | **An empty rule-pack table read as "No outline" on every market.** | honest-state | `readMarketSupport` throws, and the row shows its error state with Retry. |
| 17 | **A DMF read "No outline" while the scaffolder gave its project the ICH Module 3 outline.** | honest-state | `outlineFor` tries the agency's pack and then `AGENCY_FALLBACKS` (`ich`), in the scaffolder's order. |
| 18 | **The Retry beside each market row was hue-only.** Each failed row raised its own `role="alert"`. | a11y | `btn ghost sm` with `aria-label="Retry: platform support for NDA in fda"`, and `role="status"`. |
| 19 | **The copy-status line read as done before anything was filed, and claimed a signature from the status as loaded.** | honest-state, microcopy, design | It is a forecast now: "Will be filed as a draft. Freeze refuses it…" or "Will be filed as approved once the server verifies its approval seal." It is styled as a blocker when the copy will not be approved, and shown only until placement. The toast says "The leaf was not changed.", not "Nothing was written.": the copy had been rewritten. |
| 20 | **The canvas card rendered Place into filing without `docStatus` or `sectionCodes`.** | Part 11 | `DocumentCanvas.tsx` passes both. A test holds every caller to passing them. |
| 21 | **The Submission Center's empty device-filings state sent the reader to "the 510(k) surface's filing panel", which is locked.** | design | When the 510(k) surface is not available, it says the workbench is not part of this release. |
| 22 | **The Vault's "Open Projects" read as the header's "Open project".** | microcopy, design | "Go to Projects". |
| 23 | **Conversations: "No project conversations yet" when the server lists only the caller's own threads.** A reply without `threads` rendered as empty, and the empty state was a 215px dashed block above the tabs. | honest-state, design | "You have no conversations on this project yet." is one line. A reply without `threads` is a failed read (`hasKeys('threads')`). |
| 24 | **The Vault header read "IND · 21 CFR 312" on an NDA project.** It named the first filing type of the view. | found in the screenshots | `vaultSpineLabel(view, program_type)` in `vault-taxonomy.ts` names the project's own type, or the view when the view does not list it. |
| 25 | **A project opened from a link left Client type empty.** | found in the screenshots | Covered by item 14. |
| 26 | **"a FDA (US) NDA" and "a EU (EMA) MAA" in the Submission Center's lead line and in AnA's screen context.** | microcopy, and the after-shots | Both are rephrased without an article: "NDA · FDA (US), at the planning stage". |

## Where the lenses disagreed

- **"Unmapped" and "Not offered".** The microcopy lens wanted the two merged into "Not offered". They are different facts:
  - the platform maps no outline or channel for the market (Swissmedic, ANVISA, CDSCO, HSA);
  - the agency has no such application (a UK IND).

  So they stay distinct. "Unmapped" becomes "Not supported", which says whose limit it is.
- **The half-field gap.**
  - The design lens took the pre-F20 half pair to be Application type and Region. The design-system lens read the old code: both pairs were broken by the same parity rule, and F20 removed one of them.
  - The design lens proposed full width. The design-system lens proposed fixing the global rule.
  - This change does the local fix and lists the global one as open, because 332 fields use the rule and a change there needs a visual pass across all of them.
- **Who chooses the client type.** My first fix for a project opened from a link used the filing type's workstream. The honest-state lens, reading that working tree, showed it files a small-molecule IND under Biotech. The recorded product type replaced it, as item 14.
- **BuilderSources: a note with links, or a note with doors** (added 2026-10-08, after F14).
  - The design lens wanted BuilderSources' button bar folded into one line with two links (open item 10).
  - The design-system auditor, run on F14, named `sc-trans-b` in a `cm-pushbar` as the door pattern for every secondary action on the sequence workspaces, with BuilderSources as its precedent. F14's "Validate and compile this sequence" door was moved onto it.
  - BuilderSources keeps its doors: inline links would make it the one exception on these tabs.

## Open: not fixed here, with the reason

1. **Fixed after the review** (`docs/evidence/D2-ONE-ANA/2026-10-08/filing-spine-review-followups/`): a sourced snapshot now requires `regulatory-author` and a stated reason, and the retake event records that reason. What follows is the finding as raised.

   **The write that changes a filing copy has no reason and no role check (Part 11, §11.10(d)(e)(g)).**
   - Placing a document calls `POST /api/coauthor/documents` (`server/routes/coauthor.ts:166`). It is guarded by `authMiddleware` only.
   - That call retakes the one shared copy in place (`retakeAliasedCopy`, `coauthor-snapshot.ts`), under every leaf that points at it, with a sentence composed in code as its audit text.
   - The leaf PUT requires `regulatory-author` and a reason. The copy write does not.
   - This predates the spine, and it is the authoring store's route. It needs the authoring lane or the weekly security review, not a UI slice. **Raised to the founder.**
2. **Fixed after the review** (same evidence folder): the findings and their severities are the validator's, the model's prose is bound to them by index under its label (prompt `validation-explain@v1.1`), and "Blocking." is gone. What follows is the finding as raised.

   **A model's verdict on the Validation tab (CLAUDE.md Rule 2).**
   - `SubmissionSeqWorkspaces.tsx` (the "Explain" panel) prints the model's `blocking` flag as "Blocking.", with severity chips, and no model label.
   - This is the same class as the Cross-region verdict F21 retired, and it predates this work. It is the next retirement or relabel.
3. **No visible history.**
   - Creation attribution is recorded (`SUBMISSION_CREATED`) but not shown.
   - The Builder shows no leaf history (who placed it, when, what it replaced).
   - "Place into filing" is offered to every role, and the refusal arrives as a 403. **Fixed after the review**: the document read carries the server's placement gate and the trigger names the refusal before the dialog (`…/filing-spine-review-followups/`, item 3). Creation attribution and leaf history remain open.
   - All of this predates the spine.
   - **What it needs** (checked 2026-10-08): `submissions` and `submission_leaves` record `created_by` as a user id only, so attribution needs the person's name joined on the submissions and leaves reads. "What it replaced" is in the `LEAF_*` audit rows, and no route reads a resource's audit rows back. That is a slice of its own: a history read, not a fix to this review's screens.
4. **The global half-field rule.** `.de-field.half:nth-of-type(odd)` (`journey-v2.css:472`) counts every div in the drawer body. `AuthoringCreateExport.tsx` has the same latent mispairing. A sibling-independent rule (flex-wrap with `gap`) wants a visual pass across all 332 uses.
5. **Selector-shadowing baseline.** `scripts/ci/css-selector-shadowing-baseline.json` still lists `.pj-convo` and `.pj-convo-t`, which no longer shadow, and `.ana-composer` (found by the F14 audit, not this review's). The file says it is edited downward by a human only, so the three lines are left for one to delete.
6. **`offered:false` is enforced nowhere.** A UK IND can still be created. Refusing it at the picker and at `POST /api/submissions` is F22 territory (picker refusals). It waits on the founder's answer to `WORKFLOW_DECISION_2026-10-08.md`.
7. **Vocabulary not taken this round:**
   - "no channel" → "no transmit channel";
   - "Flat/Structured Module 1" in a select label;
   - showing the chosen region's full statement under the select at 375px, where the option clips;
   - "Programme" in `SubmissionCenter.tsx` and `Projects.tsx` outside the form;
   - "Place into submission" (Vault) versus "Place into filing" (editor);
   - "snapshot" versus "filing copy".

   The summary strings also label 12 options at once and are pinned in three test files. They are worth one pass together with F22's picker.
8. **Fixed after the review** (`…/filing-spine-review-followups/`, item 4): the project-scoped submissions read has a shape guard (`isRowsWith`). As raised: a non-list 200 read as "no submissions", so a region could be preselected as if the market did not exist.
9. **Fixed after the review** (`…/filing-spine-review-followups/`, item 6): the Dossier readiness card says when the server measured the figure, and PMDA's line names the date it is true from. As raised: **No as-of time.** The readiness card shows none, and the market-support reply's `asOf` is dropped.
10. **Hierarchy notes:**
    - BuilderSources is an accent note plus a button bar, where a line with two links would do.
    - The Respond tab's coming-later line sits in a card, while Submit's is bare. **Fixed after the review** (item 7): it sits under the card, as Submit's does.
    - BuilderSources keeps its doors; see "Where the lenses disagreed".
    - The Vault header's "Open project" shows with no project open. **Fixed after the review** (item 5): it shows only with a project open.
11. **Motion advisory.** The global `--ease` token is in-out, not ease-out. It is global and not this change's.

## Lens reports

The seven reports are summarised above. Each finding cited `file:line` against the tree it read. Where a lens read a working tree mid-edit, that is noted, for example honest-state on item 14.
