# F19b — the gates read the one market verdict (D2)

Slice: docs/design/FILING_SPINE.md F19, reconciled. Decision: docs/design/WORKFLOW_DECISION_2026-10-08.md §4 Q2 and §5 ("the product never offers a filing it cannot finish; it says why; it keeps authoring value").

Trunk's F19 (a3dd2889b) and F20 (b638247e1) stand as the one source of truth: `server/services/regulatory/market-support.ts`, `GET /api/submissions/market-support`, `MarketSupportLine.tsx`, `transport-refusals.ts`. This session's earlier build, withdrawn before push, had a second verdict module (`shared/constants/market-support.ts`). It is not ported. Only the gates trunk did not have are ported, and each reads trunk's verdict.

## What was wrong

- The verdict said what a market can carry, and nothing acted on it.
  - `POST /api/c2c/projects` created every filing. Health Canada, TGA and an EMA NDA got a project with no outline. An MHRA "IND" got the mislabelled `ind:mhra` outline. A new J-NDA got a spine for an eCTD v3.2.2 sequence that PMDA no longer accepts for new applications.
  - The New project picker (`AnaVerbs.tsx` RegistryPicker) listed all 234 catalog filings. None said what the platform would do with it. Trunk's Projects.tsx +6 lines only show the line on the Configure step, after the filing is chosen.
- The verdict and the scaffolder disagreed about master files. The verdict read only the agency's own pack, so `(dmf, FDA)` read "No outline". The scaffolder binds it to `mod3:ich` (`[agency, ...AGENCY_FALLBACKS]`).
- An FDA `variation` sequence was coded as an amendment to the original application (`core-to-packager.ts`, the `type === 'variation'` branch). `createSequence` accepted it from any caller.
- `health-canada-gateway.ts` still posted to `cesg.hc-sc.gc.ca/submission/v1`, an endpoint written from no Health Canada source, once five `HC_CESG_*` variables were set. Trunk's a3dd2889b only stated this in the market line (`ADAPTER_UNSOURCED`). The adapter itself was unchanged. The GA readiness row turned `ready` on those five variables.

## What changed

- `server/services/regulatory/market-support.ts` is extended. Nothing is restructured.
  - `MarketSupport.offer` (:120, `filingOfferFor` :203) has three tiers, read only from the statement's own fields:
    - `build_and_sequence`: an outline, Module 1 built to the agency's headings, and a registered eCTD application (clinical trial or marketing authorisation).
    - `author_only`: "Author documents for this market".
    - `not_offered`: no path, with the reason.
  - Not offered means one of three things (`notOfferedReason` :181):
    - the verdict's own `offered: false` (an unmapped agency, MHRA "IND");
    - no outline;
    - PMDA new applications blocked on eCTD v4.0 (`continuingLifecycle`, new on `MarketInput`, lifts this for an API caller that sends an approval number; the reason no longer tells a screen user it can).
  - `outlineFor` (:416) now tries the ICH fallback, in the scaffolder's order. The change is dated in the comment.
  - `sequenceTypeRefusal` and `FDA_VARIATION_REASON` (:237). FDA has no variation.
  - `marketOfferGivenOutline` (:506): the offer when the caller already resolved the pack through `rule-pack-lookup.ts`.
- `server/routes/c2c/projects.ts` returns 422 `FILING_NOT_OFFERED` with the verdict's reason. It checks at two points against one verdict:
  - before any SQL (:758), for refusals no outline could lift;
  - after the scaffold looked for the pack (:953), for a filing with no outline. The transaction is rolled back.
  - The pack is read once, by the scaffold. No extra query was added, so trunk's queued-mock creation tests keep their order.
  - The 201 carries `meta.marketSupport`.
- `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx` (`useFilingOffers` :52):
  - The picker reads `GET /api/submissions/market-support`, one read per application type in the catalog.
  - It lists only offered filings and labels author-only ones.
  - It states the chosen filing's offer as text.
  - A search lists matching not-offered filings under "Not offered", with the server's reason.
  - A pending read lists nothing. A failed read is an alert with Retry.
- `Projects.tsx:530` passes `applicationTypeOf` to the picker, using the existing `programTypeFor`. That rule is unchanged.
- `server/services/ectd/core-to-packager.ts:236` refuses an FDA variation with the verdict's reason. The FDA coding is derived for FDA sequences only.
- `server/services/submission-service/submission-service.ts:506` makes `createSequence` refuse a type the market does not take. It checks the region the caller names and the submission's own region.
- `server/services/submission-gateways/health-canada-gateway.ts` follows the PMDA pattern:
  - transmit refuses with `UnverifiedTransportError` before any row, credential read or socket;
  - checkStatus returns the stored row and never polls;
  - isConfigured is false.
  - The reason is `HEALTH_CANADA_NO_TRANSPORT` (:57), also the market statement's channel detail for Health Canada (market-support.ts:282). It replaced `ADAPTER_UNSOURCED`, which says the adapter "posts to an endpoint".
  - Deleted: the REST/mTLS/HMAC transport, which had no agency source. There is no replacement in the product. The sponsor submits through Health Canada's own channel. Precedent: pmda-gateway.ts, 2026-10-05.
- `scripts/ops/ga-readiness-report.mjs:171`: the `ca:hc_cesg` row reads no credentials and is always blocked, with its own unblock text.

## Review fixes (second pass, same day)

- **Build and sequence was claimed for filings that are not the application** (major). A Type A meeting, a designation, a supplement, a safety report or a QMS record that `programTypeFor` files under `nda` read "Build and sequence" in the picker.
  - `FilingOffer.appliesTo` (market-support.ts:147, `sequencedFilingsLike` :167): a build-and-sequence offer names the registered filings it covers, the judged application and its family's other eCTD filings (NDA, 505(b)(2), rolling, accelerated approval; BLA and 351(k)).
  - The picker (AnaVerbs.tsx:276) lists the other filings with no tier claim: "No tier is stated for this filing", naming the filings the tier is stated for. No chip.
- **The EU MDR/IVDR lane was refused** (major). 'EU / Notified Body' named no region.
  - `NOTIFIED_BODY` (market-support.ts:340): a Notified Body is the EU region; the MDR, IVDR and CER classes read the `ema`-keyed packs, as migrations/20260810b ("WHY agency 'ema'") chose. The statement names the Notified Body and judges the channel from its own registered filings. Any other class at a Notified Body is refused, with a Notified Body sentence.
  - `documentAgencyFor` (:379), used by projects.ts:947: the scaffold resolves the class from the agency the verdict judged. This also fixes 'us'/'EU' sent by an API caller, which were offered by the verdict and then refused with a false "no outline" reason (minor).
  - The picker asks the server about every catalog (type, agency) pair the per-type read did not name (AnaVerbs.tsx:52, a second round, 16 reads), so a Notified Body filing's offer, or an ICH / ISO filing's refusal, is the server's.
- **The four outside test amendments** (blocker): verified again against this version, see below. They must land in the same commit.
- Minors fixed: Health Canada sentence (above, and the import is one-way so there is no module cycle); the PMDA reason no longer promises a continuing-application path no screen reaches; one search predicate for offered and not-offered filings (AnaVerbs.tsx:160); the not-offered note counts its tab (:188); Retry stays mounted and busy, then focus goes to the search box (:195, :208); the wizard answers 422 `FILING_NOT_OFFERED` with "This filing is not offered here" and "Choose another filing", not "Try again" (Projects.tsx:408); the picker re-asks the verdict when `applicationTypeOf` changes (no suppressed dependency).

Effect on the catalog (live packs on trunk), 234 filings: 8 build and sequence, 28 listed with no tier stated, 34 author only, 164 not offered. Medical devices offers 15 of 46 filings (7 before this pass), diagnostics 14 of 36.



## Shown

Red runs: own source files copied from HEAD, test run, own versions restored (brief rule 4). `review-*.txt` are mutation runs: the current code with one review fix removed (the mutation is written at the top of each file).

| Test | Before (red) | After (green) |
|---|---|---|
| server/services/regulatory/__tests__/market-support-offer.test.ts | red/market-support-offer.txt: 47 of 47 fail at HEAD | green/vitest.txt |
| server/routes/c2c/__tests__/projects-create-market-offer.test.ts | red/projects-create-market-offer.txt: 15 of 15 | green/vitest.txt |
| client/src/concept2cure/v2/__tests__/registryPickerOffers.test.tsx | red/registryPickerOffers.txt: 11 of 11 | green/vitest.txt |
| client/src/concept2cure/v2/__tests__/newProjectWizardNotOffered.test.tsx | red/newProjectWizardNotOffered.txt: 1 of 2 (the other pins "Try again" for other failures) | green/vitest.txt |
| server/services/ectd/__tests__/fda-variation-not-coded.test.ts | red/fda-variation-not-coded.txt: 2 failed | green/vitest.txt |
| server/services/submission-service/__tests__/create-sequence-fda-variation.test.ts | red/create-sequence-fda-variation.txt: 2 failed | green/vitest.txt |
| server/services/submission-gateways/__tests__/health-canada-refuses.test.ts | red/health-canada-refuses.txt: 3 of 3 | green/vitest.txt |
| tests/ops/ga-readiness-hc-cesg.test.mjs | red/ga-readiness-hc-cesg.txt: 1 failed | green/ga-readiness-hc-cesg.txt |
| Type A meeting states no tier | red/review-picker-claims-every-row.txt: 1 | green/vitest.txt |
| appliesTo names the application's family only | red/review-applies-to-unscoped.txt: 2 | green/vitest.txt |
| EU / Notified Body lane | red/review-notified-body-unmapped.txt: 12 | green/vitest.txt |
| scaffold reads the judged agency | red/review-scaffold-agency-as-sent.txt: 4 | green/vitest.txt |
| one search predicate | red/review-search-predicates-differ.txt: 1 | green/vitest.txt |
| note counts its tab | red/review-note-counts-catalog.txt: 1 | green/vitest.txt |
| Retry stays mounted, focus returns | red/review-retry-unmounts.txt: 1 | green/vitest.txt |
| Health Canada channel detail | red/review-hc-says-adapter-posts.txt: 1 | green/vitest.txt |

- green/vitest.txt: 15 files, 180/180. The eight new test files plus trunk's market-support, submissions-market-support, marketSupportLine, submissionCenterNewFromProject, submission-resolver, newProjectWizardName, newProjectWizardFailure and wizardFilingType.
- green/importers-of-changed-files.txt: 130 files that import or mock a changed file (a wider grep than the first pass's 97), --maxWorkers=3: 1562 passed, 6 failed, 2 skipped.
  - 4 are the tests in "Must land in the same commit" below, which pin the old behaviour.
  - 2 are `transmit-guard-reports-checks`, red at HEAD without this change: red/transmit-guard-at-HEAD-preexisting.txt.
  - This run was taken before a type-only fix to AnaVerbs.tsx (the read guard's parameter type) and a wording change in its no-tier sentence; green/vitest.txt was run after both.
- green/outside-file-requests-applied.txt: the four test amendments in `outside-file-requests/*.test.diff`, applied with `patch -o` to temporary copies beside the originals (since deleted), run with health-canada-refuses, market-support-offer and market-support: 7 files, 126/126.
- Other checks:
  - tsc: 0 errors (`npx tsc --noEmit -p tsconfig.json`, exit 0). The first pass of this review had 2 errors in AnaVerbs.tsx; fixed.
  - ESLint, HEAD to now: AnaVerbs 5→3, health-canada-gateway 2→0, projects.ts 5→5, Projects.tsx 7→7, submission-service.ts 9→9, ga-readiness-report.mjs 1→1, core-to-packager and market-support 0→0. The new tests have 0.
  - `ci:undefined-css-classes`: OK. No new class names.

## Must land in the same commit (outside this slice's files)

Without these four, trunk is red: each pins the behaviour this slice changes. All four apply with `git apply` and pass (above).
1. `outside-file-requests/projects-create.test.diff`: a scaffold that finds no outline now refuses (422, rolled back) instead of a 201 with `scaffoldSkipped`.
2. `outside-file-requests/core-to-packager-fda-admin.test.diff`: `variation` leaves the FDA amendment/response loop.
3. `outside-file-requests/health-canada-gateway.test.diff`: the unconfigured transmit is `UnverifiedTransportError`, no transmittal row.
4. `outside-file-requests/refused-before-wire.test.diff`: health-canada-gateway.ts leaves the audited `CredentialError` sites.

Not run, need their own client test:
5. `outside-file-requests/SubmissionCenter.unverified.diff`: no `variation` in the FDA sequence types (the server already refuses it).
6. `outside-file-requests/GatewayTransmittals.unverified.diff`: the governed transmit form stops offering PMDA and Health Canada, whose adapters refuse every transmit; it asked for a §11 re-authentication for a send that cannot happen. `server/routes/mdx-submission-gateway.ts:77` still accepts `hc_cesg` and `pmda_gateway` credential registration; same change wanted there.

## Not done

- Catalog rows that create an application type without being that application (28, listed above as "no tier stated") still create an NDA/BLA/IND project and spine. That is `programTypeFor`'s routing, unchanged here; the picker no longer claims a sequence for them.
- The bare `device` / `ivd` rows (FDA and Notified Body) are not offered: no document class, so nothing to author. A product call for the founder.
- For a Notified Body filing the statement's Module 1 summary is the EU's ("Flat Module 1"), which says nothing useful about a device technical file. The offer reason, which the picker shows, is correct.
- The picker makes 17 type reads plus 16 market reads on open. A batch form of `GET /api/submissions/market-support` (`server/routes/submissions.ts`) would make it one.
- `transport-refusals.ts` ADAPTER_UNSOURCED's header still cites health-canada-gateway.ts as an adapter that posts. Not this slice's file.
