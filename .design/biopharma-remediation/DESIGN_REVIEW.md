# Design Review: Biotech & Pharma remediation (Wave 0 UI)

Reviewed against: `.design/surface-layer-assessment/DESIGN_BRIEF.md`
Work order: BIOPHARMA_WORK_ORDER.md — BP-W0-3, BP-W0-4, BP-W0-6, BP-W1-3
Date: 2026-08-15

## Lenses run

Six were available; **five had something to judge and one did not.** Stating this
explicitly because a review that silently omits a lens reads as coverage it does
not have.

| Lens | Verdict |
| --- | --- |
| `design-reviewer` | 3 must-fix, 2 consider |
| `a11y-auditor` | 4 blockers, 2 advisory |
| `microcopy-reviewer` | 5 findings, 1 of them a real product bug |
| `part11-ux-auditor` | 1 blocker, 2 gaps, 1 advisory |
| `design-system-auditor` | 2 violations, all 5 CI gates pass |
| `motion-auditor` | **no findings** — nothing in this session adds or changes motion |

## Screenshots captured

| Screenshot | Breakpoint | What it shows |
| --- | --- | --- |
| `screenshots/review-concept2cure-desktop-1280.png` | Desktop 1280×800 | Sign-in card |
| `screenshots/review-concept2cure-tablet-768.png` | Tablet 768×1024 | Sign-in card |
| `screenshots/review-concept2cure-mobile-375.png` | Mobile 375×812 | Sign-in card |
| `screenshots/review-landing-*.png` | all three | Landing route |
| `screenshots/review-{biostat-workbench,nda-cockpit,cmc-module,pv-cockpit}-desktop-1280.png` | Desktop | **Sign-in redirect, not the surfaces** — kept as the record of the gap |
| `screenshots/verify-01-login-redirect.png` | Desktop 1280×800 | The redirect itself, reproduced |
| `screenshots/verify-02-authenticated-landing.png` | Desktop | Authenticated, org in header |
| `screenshots/verify-03,04-biostat-workbench*.png` | Desktop | **The surface, signed in** |
| `screenshots/verify-05-focus-ring.png` | Desktop | `.c2c-input` focus ring |
| `screenshots/verify-06-fields-closeup.png` | Desktop | `.c2c-input` fields, bordered, label above |
| `screenshots/verify-07,08-engine-form*.png` | Desktop | The reported label/value collision, fixed |

### The screenshots did not show the changed surfaces — RESOLVED, and the cause was a defect

*Original finding, kept because it was accurate:* every `/concept2cure/<surface>`
route redirected to `/concept2cure/login?returnTo=…`, the dev-only **Demo access**
button did not establish a session, and so the four surfaces this session changed
were never visually verified. Every `review-*.png` above is a screenshot of the
sign-in card. **The `.c2c-input` repair had not been seen rendering**; the layout
claims were reasoned, not observed.

**Now closed.** An authenticated session was obtained through the real UI — the
actual Demo access button, a real JWT in localStorage, the org name in the header
— and `.c2c-input` was measured in the browser rather than reasoned about. See
`screenshots/verify-*.png` and `verify-measurements*.json`.

| Claim | Measured |
| --- | --- |
| field sits **below** its label | `belowLabel: true` on all 8 sampled; label bottom 325.5 → field top 331.5, a 6px gap |
| `display: block` | `block` |
| `min-height: 30px` matches the pinned inline heights | computed 30px; stripping the inline `height:30px` from a live field still renders 30.00px, so the rule alone reproduces it |
| placeholder contrast (`--text-300`) | **5.21:1** — matches the hand-computed figure exactly |
| border contrast (the "KNOWN, NOT FIXED" item) | **1.34:1** — also matches exactly, and is what SF-1 below resolves |
| placeholder italic, focus ring | `font-style: italic`; `rgb(217,119,87) solid 2px`, offset 2px |

The reported defect is fixed and was looked at: `verify-07-engine-form.png` shows
"Prior mean effect (δ)" on its own line with `0.4` in a bordered box below, not
the reported `"Prior mean effect (δ)0.4"`.

**Why it could not be verified before, which is the more useful finding.** Not
the button. `Concept2CureLogin.tsx` POSTs `/api/auth/dev-login`; that route is
gated behind `isDevAuthAllowed()`, which requires `NODE_ENV=development` **and**
`ALLOW_DEV_AUTH=1` — and `scripts/setup-local-db.sh`, which generates the local
`.env`, never sets it. The endpoint answers **404** when disabled (deliberately,
so it is invisible), so the button failed silently. Separately,
`scripts/db/install-fresh.mjs` still aborts outright when the `vector` extension
is absent, even under `--allow-incomplete`, so a fresh machine without
`postgresql-16-pgvector` ends setup with **0 tables**.

Both are why a design review could not see the product it was reviewing.

**Reproducing it, so the next review does not have to rediscover this.** Both
defects are fixed at source, so setup now produces an environment you can sign
into:

    bash scripts/setup-local-db.sh     # provisions, writes ALLOW_DEV_AUTH=1, seeds the demo admin
    npm run dev                        # then click "Demo access" on the sign-in card

`setup-local-db.sh` reports whether dev sign-in is actually usable rather than
assuming it, and warns when a pre-existing `.env` predates the flag. On a machine
without the `postgresql-N-pgvector` package the install now completes and names
the objects it skipped, instead of dying at step 1/8 with zero tables.

## Must fix — all resolved in commit `7d7b303`

1. **Freeze and §11.50 e-signature failures rendered as success.**
   `AuthoringFilingBar.tsx:36` typed `fireToast: (m: string) => void`, erasing the
   tone, so a **rejected PIN** drew the green success tick. Worse than the export
   bug that prompted this work, on the one action that is a legally binding
   attestation. `AuthoringCollab.tsx` had the same erased signature. _Fixed: 9 call
   sites toned._

2. **Placeholder contrast failed the rule it was added to serve.** `--text-500` on
   `--bg-000` is 2.11:1 light / 2.76:1 dark against a 4.5:1 bar. `--text-400` also
   fails. _Fixed: `--text-300`, 5.21:1 / 6.82:1._ `ci:token-contrast` passed
   throughout — it carries `--text-500` as an exception conditioned on
   "disabled/decorative", which a required field's only affordance is not.

3. **Export attribution was spoofable.** `req.body.exported_by` could become the
   "who" on a Part 11 EXPORT audit row when the JWT carried no email claim.
   _Fixed: `getActorEmail(req)`, 401 otherwise._

4. **`role="status"` + `aria-live="assertive"` is contradictory.** _Fixed:
   `role="alert"` for errors._

5. **`select.c2c-input { padding-right: 6px }`** was *smaller* than the 10px base it
   overrode — the opposite of its own comment. _Fixed: removed._

6. **`CmcModule` tone ternary had both arms `'calm'`**, so `assessed-clear` could
   never render the `'good'` tone `NdaCockpit` used for the identical state.
   _Fixed._

7. **Two further "SEND not in scope" strings** on the same card, missed on the
   first pass. _Fixed._

8. **"Awaiting an agency decision" inferred from a display string.** `onSubmit`
   hardcodes `date: 'pending'` for a row its own toast calls "not persisted", so
   creating a designation request announced it was with the agency. This is the
   same empty-set-as-clearance error the session exists to close, reintroduced
   through an overloaded field. _Fixed: only an explicit `'submitted'` status
   carries that sentence._

## Should fix — all resolved

1. ~~**`--border` is 1.34:1 against `--bg-000`**, below SC 1.4.11's 3:1.~~
   **RESOLVED — the call is a second token, not a new value for the first.**

   Two corrections to the finding first. `--border-strong` is **1.49:1** in
   light, not 1.70 — that was the dark figure, and light (which aliases
   `--bg-300`) is the binding constraint, so the gap was worse than recorded.
   And `--sidebar-border` was declared *identically* in both theme blocks, so
   #ebebeb cascaded onto the #262624 dark page as a **12.72:1** near-white rule:
   not a subtle divider, a glaring line.

   `--border` is used 1242 times and ~964 of those are dividers, row rules and
   card edges. SC 1.4.11 does not reach them — it governs "visual information
   required to identify user interface components and states". Repainting every
   divider to fix the edge of an input is the wrong instrument, which is exactly
   why this sat open. `--border-control` is declared instead: 3.91:1 light,
   4.36:1 dark, clearing 3:1 on all three fills controls sit on.

   **The gate could not have caught any of it, for three separate reasons**, all
   fixed: it had no non-text tier at all (`4.5` was the only threshold in the
   file, while its own header talked about "the 3:1 non-text floor" in prose);
   it could not read `oklch()`, which is how the palette is authored, so the two
   tokens that turned out to be wrong were precisely the ones it skipped; and it
   could not follow a `var()` alias, which is how half the border family is
   declared. A fourth check was added that is not a floor — a **divider
   ceiling**, because a minimum cannot see the sidebar-border bug: 12.72:1
   passes every floor in the file. 22 pairs checked before, 44 now.

   Also now recorded with a number rather than prose: `--border-focus` is the
   brand orange at **2.96:1**, below what SC 1.4.11 and 2.4.11 want of a focus
   indicator. Unchanged — that is the same decision as the existing accent
   exception — but it can no longer silently worsen.

2. ~~**`BiopharmaSpecialty` hand-rolls the not-assessed judgment four times.**~~
   **RESOLVED**, and the duplication was the symptom rather than the defect. What
   the four copies had in common was not that they were typed out four times: it
   was that each derived from `rows` alone (`const prea = livePrea.rows`), so
   none could represent `loading` or `unreadable`. The lead therefore asserted
   "No signals have been screened for this organization" over a **failed** read,
   forty pixels above a table that said "Couldn't load". `assessmentStateFor(read, …)`
   takes the read object, so dropping the flags now requires going out of your
   way. Eight gates, not four.

3. ~~**~20 surfaces still carry the one-tone toast.**~~ **RESOLVED.** Measured, it
   was 28, not ~20 — the estimate counted `function useToast` declarations and
   missed five surfaces that inlined the same thing in a component body. The
   canonical now lives at `v2/toast.tsx`, not in `cmcShared.tsx`: the other
   twenty-two consumers are identity, licensing, PV, gateway and reporting
   surfaces, and a shared component under a module name claiming a domain it
   does not belong to is *why* the copies were written instead of the import
   being found. 106 failure sites now carry `'error'`; `ci:toast-canonicality`
   holds it, including the invisible case — a tone narrowed away at a prop
   boundary, which TypeScript accepts silently and which is how
   `AuthoringFilingBar` lost it in the first place.

   Found while doing it, and now **also resolved**: five more pill classes
   (`pdev-toast` ×6, `sn-toast`, `ac-toast`, `amem-toast`, `etmf-toast`) — the
   same dark pill under different names, in two positions, none able to express
   an error. Pinning the count treated two questions as one. The *position* is a
   design decision (three sit at `top: 18px` on surfaces where a bottom-centre
   pill covers the composer); being unable to report a failure, or to reach a
   screen reader at all, is a bug. `C2CToast` takes an optional `position`, so
   the position survived the migration and the defect did not. Nothing moved on
   screen; ten toasts that could only say "success" can now say a write failed.
   All five baselines are 0, so any reappearance fails.

4. ~~**`NdaCockpit`'s KPI strip is not gated on the loading state.**~~ **RESOLVED**,
   and it was six ungated items, not one. The four KPI tiles, plus both arms of
   the lead's action — which on a failed read offered to "Draft the final
   readiness plan" and prompted AnA about "the open administrative items on this
   NDA program", asserting to the model that such items exist. That is the one
   with reach beyond the surface.

   The **error** case matters more than the loading one the review named: loading
   resolves, a failed read does not, so `0% / 0 / 0` is the final answer the user
   is left with — and `data-tone={highs.length ? 'err' : undefined}` rendered a
   failed Refuse-to-File read as a neutral-toned zero beside the words "High RTF
   risk", which is an empty findings set presented as a finding of none, in the
   one form that reads faster than prose.

   Also found and fixed: the "Review clock · not started" tile. There is no
   review-clock store at all — the surface's own header says so and the clock tab
   renders "No review clock recorded" — so "not started" was a stronger,
   unevidenced claim contradicting the tab 90 lines below it. Now "not recorded".

   **A design decision left open.** `CmcModule`, on the same taxonomy, *deleted*
   its KPI strip rather than gate it: _"Repeating a figure three times does not
   make it more true."_ Two of these four tiles are likewise restatements of
   figures the lead already narrates. Deleting them would remove the
   contradiction rather than gate it, and would leave zero ungated numbers. It
   is not done here, because removing a scannable summary is a product decision.
   **Your call.**

5. ~~**Signature manifestation is never shown back.**~~ **RESOLVED for the
   electronic display** — a Signatures rail in `DocumentAuthoring` renders the
   §11.50(a) triple plus the reason and the §11.70 covered version. Confirmed
   first that no client anywhere called that endpoint, or the other two
   signature stores' endpoints either.

   Scoping it turned up something worse than the missing view. **`signer_name`
   was the signer's EMAIL ADDRESS on every row ever written.** Both sign paths
   read `((req.user as {name?: string})?.name) || email`, and the router's own
   middleware builds `req.user` without a `name` key — the access token carries
   no `name` claim to put in one. The left operand was always `undefined`, so
   the fallback always won, and §11.50(a)(1) "printed name of the signer" was
   satisfied with an identifier. Now resolved from `users.name` at signing time,
   returning **NULL** rather than the email when nothing resolves, so the display
   can say "no printed name on record" instead of silently substituting one.

   Also closed while in there: `/sign` accepted `meaning` as a free string with a
   `'REVIEWER'` default and no validation (`/e-sign` had validated it all along),
   so an arbitrary token could be stored as the meaning of a binding attestation;
   and `GET /signatures` never selected `covered_freeze_version` /
   `covered_content_hash`, so a manifestation could show that a document was
   signed but not *what* was signed.

### Still open, found while scoping item 5

- ~~**§11.50(b) printout is unmet.**~~ **RESOLVED.** All three export formats now
  carry the manifestation, rendered from one `signatureManifestLines()` so DOCX,
  PDF and XML cannot drift — a manifest that omits the meaning in one of two
  files a reviewer might open is non-compliant in exactly one of them. The dead
  `buildDocx` (310 lines, absent from the built bundle, reading four field names
  that do not exist on the table) is **deleted** rather than repaired: its
  presence suggested exports already had a manifest.

  Found while adding it: **the XML export escaped nothing.** A document titled
  "Safety & Efficacy" produced a bare ampersand and a file no parser accepts —
  the export returned 200 with a broken artifact. Signature reasons and signer
  names made this unavoidable rather than latent. Now escaped, with `]]>`
  handled inside CDATA, and pinned by a test that parses the bytes.

- ~~**A latent cross-tenant read in `part11-compliance.ts`, armed but not firing.**~~
  **DISARMED.** Three of the five routes are now connected via `requestPgClient`
  — the request-pinned connection, so RLS applies — each with its tenant
  predicate landing in the *same change* as the repair. `/signatures/:documentId`
  gained a mandatory `organization_id` filter; the manifest route's predicate was
  conditional (`if (Number.isFinite(orgId))`, i.e. a default, not a predicate)
  and carried `OR organization_id IS NULL`, letting every tenant read any
  unattributed row — both removed. `seal-integrity`'s guard accepted `admin`,
  the org-scoped role self-service signup mints for the first user of every new
  organization, on an endpoint that reads the estate-wide chain; now
  platform-only.

  **Two routes are deliberately left unconnected**, with the reason in the code
  so the 500 is not "fixed" blind. `/audit-trail/:entityId` selects six columns
  that exist on no table it can reach and has no tenant column to filter on;
  `/audit-trail/seal-integrity` would report a false "chain broken" under RLS,
  because it walks a global chain through a tenant-scoped connection. Both need
  decisions, not repairs.

  The old finding, for the record:
  All five routes do `const pool = (req as any).pool || (req.app as any).pool`,
  and **nothing in the repo assigns either** — so every one 500s on
  `pool.query` of `undefined`. The identical bug was found and fixed in
  `graphrag.ts:543` with a `|| getPool()` fallback. **Do not apply that fix here
  alone.** `GET /signatures/:documentId` has no tenant predicate and
  `document_id` is an enumerable `serial`, so repairing the pool *creates* the
  cross-tenant leak; `GET /audit-trail/:entityId` is likewise unpredicated over a
  table with no `organization_id` column (it relies on parent-scoped RLS through
  `leaf_id`, and reads columns absent from the public `audit_trail`, so which
  table it targets needs establishing first). The predicate to copy for the
  signatures route already exists 60 lines below it in the same file. Left
  untouched deliberately: the blast radius could not be verified in this pass,
  and a half-verified fix here opens a tenant leak.

## Could improve — all three resolved

1. ~~`CmcModule.tsx` — "agencies read a late IR response as a readiness signal".~~
   Dropped. The overdue count is the fact, and it was already in the sentence.
2. ~~`NdaCockpit.tsx` — "the same review that refuses today accepts".~~ Dropped.
3. ~~Export-failure toasts stop at the HTTP status with no next step.~~ Both now
   say no file was produced and the document is unchanged — true, because the
   assembler streams or it does not — and what to try next.

## What works well

The `.c2c-input` diagnosis is the right shape: one missing rule explained two
separately-reported P0 symptoms across 11 surfaces, and `display: block` — not a
form rewrite — is what fixes the label/value collision.

`assessmentState.ts` is well-scoped and correctly refuses to infer clearance from
an empty array. The Part 11 lens independently confirmed that hardcoding
`assessmentRan: false` in the NDA cockpit is the right compliance posture rather
than a stub, and named what would have to exist to change it: a positively
recorded "shadow review completed" ledger entry. That is now a concrete
prerequisite for BP-W1-6 rather than a vague one.

Deliberately different words for different facts — "unknown" where nothing was
screened, "untracked" where nothing was recorded — read as precision, not
inconsistency.

---

## W0-5 — standardise empty states (2026-08-17)

The contract, as landed: a finished empty state answers **what this is**
(`title`), **why it is empty** (`hint`), **the one action that fixes it**
(`action` — a real control), and **the regulation it serves** (`regulation`).
`EmptyState` in `v2/dataConnect.tsx` carries the two new slots; the docstring
names the contract and the thing it retires — the passive instruction, "Select
a program" as prose above a panel with nothing to click.

Two boundary decisions worth recording:

- **A failure is not an empty state.** `tone="error"` still delegates to
  `ErrorState`, and the new slots are deliberately NOT forwarded: the one
  action on a failure is recovery, and a "create" CTA over a failed read would
  invite writing into a store that just refused to answer. Pinned by test.
- **The CTA is real or absent.** `openProgramAction(nav)` (cmcShared — one
  label, one destination) navigates to Mission Control, where programs are both
  opened and created. When a host has not threaded `nav`, the CTA is honestly
  absent rather than rendered dead — a button that cannot navigate would be the
  passive instruction back in a button costume.

Converted call sites (the biopharma wave's three; mdx device surfaces are the
device wave's): `CmcModule3Build` (Serves the CTD Module 3 record, ICH M4Q),
`CmcQuality` (Serves the quality design record, ICH Q8/Q9/Q10), `CmcModule`'s
records tab (Serves the per-program audit history, 21 CFR Part 11 §11.10(e)).

**The sample-data banner is closed as superseded, not built.** Measured before
building: no v2 surface renders fixture content as content any more. Zero
`useLiveList` consumers remain under `v2/surfaces/`; the three remaining
`useLive`/`sample` reads (DispatchReadiness, Registrations, V2App) use the flag
*defensively* — to refuse sample data, not to show it — and the one surviving
`<SampleTag>` render (AdminSurfaces) is derived from a real fetch outcome and
says "Live". The fixture-free contract this file's own header describes has
overtaken the banner: a persistent banner for a state that no longer renders
would be scaffolding around a wall that is already down. If a fixture path
returns, the banner spec in `.design/surface-layer-assessment/DESIGN_BRIEF.md`
(persistent, non-dismissible) still stands.

Proof: `__tests__/emptyState.contract.test.tsx` — 7 assertions, including
source-level phrase retirement per converted file, verified non-vacuous by
reintroducing the phrase and watching exactly one test fail. Suites around the
touched components (errorState, zeroStateNarrative, cmcSuiteWrites): 51/51.
Gates: design-system, token-contrast, microcopy, compliance-claims,
css-selector-shadowing, token-cascade — all pass; typecheck 0.
