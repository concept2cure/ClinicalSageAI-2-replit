# W1 / D2 — official eSTAR Vault attachment completion

Status: automated qualification passed; published directly to the canonical product branch.
Product branch: `concept2cure-v2`.
Design: `docs/design/ESTAR_VAULT_ATTACHMENT_COMPLETION_2026-10-23.md`.

## What already exists

- `OfficialEstarPanel.tsx` / `useEstarExport.ts`: the existing official export
  UI and delivery hook; neither exposes the existing attachment request/report.
  The variant helper also misses canonical `cdx`; reuse the existing
  `shared/constants/domain/product-types.ts` IVD family predicate for the
  correct diagnostic template and attachment destinations.
- `server/routes/510k-estar-routes.ts`: existing governed official export and
  attachment input; no read-only template slot catalog for the human UI.
- `estar-attachment-slots.ts`, `estar-template-registry.ts`: template-derived
  slots and pinned-byte integrity; extend/reach these, no copied registry.
- `estar-attachment-plan.ts`, `estar-fill.ts`: existing verified Vault source
  reader, mechanical refusals, manifest/embedding and UUID/slot/hash report.
  Its missing actor/current-version/approval/disposition gates must be composed
  from existing canonical services before this UI is enabled.
- `VaultLibraryResults.tsx` / `project-vault.ts`: existing authorized, paginated
  exact-version picker/search with recorded hashes; reuse rather than rebuild.
  Tighten its program response guard: missing current-version metadata must
  not become an affirmative current-version claim.
  Existing `client/src/concept2cure/v2/styles/vault-picker.css` supplies its
  layout; complete its measured 28–38px controls to the existing 44px touch
  target standard.
- `submission-service.ts`, Builder and `package-from-core.ts`: separate draft
  placement and later eCTD lifecycle mechanisms already exist. No new lifecycle
  or placement engine is needed for eSTAR.
- Vault immutability and retained hashes intentionally refuse legacy/all-retired
  recovery; those policies are unchanged. Deleted-history searches found old
  MDX editor/fixture cleanup, not a second usable official export UI.
- Builder's existing `mutationUnconfirmed` policy is extracted unchanged into
  `client/src/concept2cure/v2/mutationOutcome.ts` and re-exported for existing
  callers. Existing server manifest seeds/chapter format are shared through
  `shared/regulatory/estar-attachment-manifest.ts` with server re-exports.
- The existing AST proof in `scripts/ci/lib/approved-sql-predicates.mjs`
  recognizes reviewed predicate imports/literal aliases. Its exact-callsite
  registration must include this resolver's existing canonical byte-eligibility
  helper; the raw SQL interpolation baseline remains unchanged.

Full discovery paths, boundaries and test contract are in the design above.
No human acceptance, native Acrobat, live-provider or agency qualification is
claimed. Evidence will distinguish fixtures from real template bytes and mark
manual scenarios **Not run**.

## Implemented behavior

The existing official eSTAR panel now reaches the existing program-scoped
Vault version picker and the template-derived destination catalog. People
explicitly choose each UUID/hash/destination; incomplete, duplicate or
over-limit selections cannot generate. CDx uses the canonical IVD family
predicate and therefore the IVD template. PreSTAR keeps its administrative
preparation boundary.

The existing attachment resolver composes current actor/project access,
write authority, original-byte disposition, current-version and byte-bound
approval checks, including company legal applicability to FDA/US/the actual
submission type. Checks run around storage reads and at producer/persistence/
delivery checkpoints. Source or permission changes withhold delivery; changes
after persistence starts return an explicitly uncertain outcome.

Attachment-bearing production uses checksum-verified template bytes. Before
download, the existing export hook confirms the official/PDF envelope and an
exact UUID/slot/hash receipt with a coherent routing manifest. It retains
server refusal reasons and retires stale session/context results and downloads.
Returned filenames, chapters, UUIDs, byte counts and hashes are visible.

## Evidence scope and remaining human work

RED records cover the previously unreachable UI/catalog, missing source gates,
incorrect CDx template, malformed delivery/receipts, uncertain HTTP outcomes
and undersized touch controls. Separate GREEN records retain focused backend,
UI, transport and picker qualification. Combined results and exact source pins
are recorded separately so focused epochs are not added together as one run.

Backend fixtures execute canonical access, approval and disposition SQL in
PGlite; byte retrieval, producer and retention seams are explicit where used.
Real vendored FDA template bytes are used by catalog/planner/fill regressions.
Transport fixtures prove delivery control, not Acrobat behavior. Serialized
mounted DOM browser checks qualify component layout only.

Human guide cases **76–83** cover the completed workflow. All manual cases
remain **Not run**. No live deployment, native PostgreSQL concurrency,
Acrobat/FDA validation, agency transmission or general client-readiness
certification is claimed. No legacy recovery policy, new persistent store,
schema migration or production dependency was introduced.

## Final merged qualification

Qualified source: `4c5f2745fa95327721276b85bc8f1a63b8883152`.
Implementation: `8c87144fd`; all work stays on `concept2cure-v2`.

- **1,062 passed across 64 files**, zero failed, skipped or TODO tests.
- Full TypeScript check: **zero errors**; production build passed.
- **16 static/UI gates passed**; changed-file warning ratchet has no growth.
  Forced lint checks all 22 changed code files: zero errors, 24 existing
  warnings. New helpers and tests introduce no warning allowance.
- **12 browser layouts passed**, covering actual mounted picker, selection
  and receipt DOM at 390/1440px in light/dark themes. All attachment controls
  and Generate meet 44px height; actions remain reachable, with no page,
  panel or tested text-container horizontal overflow. Long unbroken titles,
  full UUIDs and hashes are included.
- Final source fingerprints stayed unchanged throughout all 21 checks.
  `qualification-source-freeze.json`, `qualification-checks.json` and
  `qualification-summary.json` retain exact commands, epochs and results.
- Incoming release/Unicode changes were merged normally. Their historical
  evidence is not added to our totals; twelve selected integration files
  are included in the 64-file run. See `incoming-review.md`.

Initial/focused epochs are retained separately, including the corrected
compiler nullability error and browser sizing/wrapping failures. DOM capture
faithfully serializes current select/input state; `ui/mounted-dom/*.html.gz`
contains the final fragments. Browser geometry uses the qualified build's
CSS in the existing MDX/V2 scope; external requests are blocked. These are
component checks, not a live authenticated application or PDF-editor session.

A later canonical reporting merge adds a separate **173 passed across 13 files**,
zero failures/skips, and a successful rebuilt product. All 23 qualified eSTAR
implementation fingerprints remain unchanged. This separate epoch is retained
in `reporting-integration-summary.json`. The normal pre-push compiler then
passed with zero errors on `bcbf5877c`; every normal push gate passed before
Git refused a concurrent remote advance. See `canonical-push-2.json` and its
unmodified compressed output.

A further normal merge integrates Vault passage freshness and saved authoring
section refiling at `5b9b4511c`. Its separate integration epoch has **158 passed
across 12 files**, zero failures/skips, and a successful production build.
All 23 qualified eSTAR source fingerprints remain unchanged. The independent
incoming review found no changed canonical attachment dependency or bounded
compatibility blocker. See `freshness-integration-summary.json`. The integrated publication compiler
gate subsequently passed with zero errors, as recorded below.

The additional saved-text-to-filing contract passes **93 cases in one file**
on that same integrated source, using the real router and canonical migrations
through the existing PGlite harness. This is a separate epoch, retained in
`freshness-filing-contract.json`, and is not added to the preceding run's count.

The next normal push also passed every gate, including zero TypeScript errors,
but Git refused another concurrent remote advance (`canonical-push-3.json`).
The subsequent normal merge incorporates project intake's explicit client
workspace selection and handoff. Its separate local integration epoch passes
**268 cases across 17 files**, zero failures/skips; the production build passes.
All 23 attachment and three safety-gate fingerprints remain unchanged.
See `intake-integration-summary.json` for commands, integrated source and scope.

## Publication gate correction

The first normal push refused an unregistered canonical SQL predicate call.
The existing AST proof now recognizes only this exact source-access caller,
its canonical helper import and literal alias `d`. The proof algorithm and
raw interpolation baseline are unchanged. **35 AST cases and 35 gate
self-tests pass**, including shadowing, wrong import/alias, dynamic arguments
and neighboring raw-value refusals; the real repository SQL gate passes.
All 23 qualified application files remain unchanged. See
`sql-predicate-qualification.json` and the appended independent review.
Pre-existing checker gaps remain documented in its self-tests.

The direct strict-anchor and real eSTAR route/PGlite integration control passes
**8 cases across two files** on the intake-integrated source. This separate
epoch is retained in `intake-attachment-control.json`, without adding it to
the main qualification count. The independent compatibility review found no
bounded blocker.

## Canonical publication

All implementation, merged integration evidence and safety-gate work was pushed
directly to `origin/concept2cure-v2` at `a873595f75c6ee6ca9e14c12203a40ca5938afa9`.
`canonical-push-4.json` and its unmodified compressed log confirm successful
publication, a matching remote head, and all normal pre-push gates, including
zero TypeScript errors. No hook bypass or force push was used.
`publication-source-pins.json` confirms that all 23 qualified application and
three independently qualified safety-gate files retain their fingerprints.
This evidence-only receipt commit preserves those source bytes. Human
acceptance remains **Not run**.
