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
| `screenshots/review-{biostat-workbench,nda-cockpit,cmc-module,pv-cockpit}-desktop-1280.png` | Desktop | **Sign-in redirect, not the surfaces** |

### The screenshots do not show the changed surfaces, and that is a real limit

The dev server boots and serves, and the sign-in card renders correctly at all
three breakpoints. But every `/concept2cure/<surface>` route redirects to
`/concept2cure/login?returnTo=…`, and the dev-only **Demo access** button on the
card does not establish a session in this environment. So the four surfaces this
session actually changed — BiostatWorkbench (the `.c2c-input` fix), NdaCockpit and
CmcModule (the narrative states), PvCockpit — were never visually verified.

Consequence, stated plainly: **the `.c2c-input` repair has not been seen rendering.**
Its correctness here rests on reading the CSS cascade and computing the contrast
ratios by hand, not on looking at it. The contrast finding below was found that
way and is arithmetic rather than opinion, but the layout claims — that fields
now sit below their labels and that `min-height: 30px` matches the pinned inline
heights — are reasoned, not observed. They need one authenticated pass before
this is called done.

The sign-in card itself is a useful control: its inputs use `.auth-input`, which
*does* have CSS, and they render as proper bordered fields. That is what
`.c2c-input` controls should now look like.

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

## Should fix — open

1. **`--border` is 1.34:1 (light) / 1.41:1 (dark) against `--bg-000`**, below the
   3:1 SC 1.4.11 wants for a control boundary. No palette token clears it
   (`--border-strong` is 1.70:1). This is a **token decision**, not a rule bug:
   changing `--border` moves every divider in the product. Recorded in the rule's
   comment; needs a call.

2. **`BiopharmaSpecialty` hand-rolls the not-assessed judgment four times** instead
   of importing `assessmentState`. The reasoning is right in all four, but
   copy-pasted — the fifth surface will regress. Violates CLAUDE.md zero-duplication.

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

   Found while doing it, and **still open**: five more pill classes
   (`pdev-toast` ×6, `sn-toast`, `ac-toast`, `amem-toast`, `etmf-toast`) are the
   same dark pill under different names, in two positions, and *none of them can
   express an error at all*. Ten render sites. Converging them changes their
   appearance, which is a design decision rather than a bug fix, so the gate
   pins the count instead of migrating them. That decision is the follow-up.

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

- **A latent cross-tenant read in `part11-compliance.ts`, armed but not firing.**
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

## Could improve

1. `CmcModule.tsx` — "agencies read a late IR response as a readiness signal"
   tells a regulatory professional what agencies think. Lecturing; drop the clause.
2. `NdaCockpit.tsx` — "the same review that refuses today accepts" is a turn of
   phrase in a record that is otherwise admirably plain.
3. Export-failure toasts stop at the HTTP status with no next step, unlike every
   other toast in the same file.

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
