# A2.10 — filing-catalogue parity continuation (2026-10-26)

Launch row D2; branch `concept2cure-v2`; discovery base `a0d4ada6`.
Implementation and capability carry are complete for A2.10a. Integrated acceptance on base `f033cc72` passed 460 tests in 29 suites, the
native browser workflow and the production build. The evidence README separates
those final runs from the prior red/green snapshots; publication gates remain
mandatory.

## What already exists

- At discovery, `SLICE_A2_PLAN.md` A2.10 named five remaining folds and the
  historical `FUNCTION_PARITY.md` rows said No: mission-control needs a store/tenant
  migration check; CRO and device portfolios retain recorded functions and
  client-review/engagement gaps; program-journey retains reference/recorded
  fields. A.2 does not retire a screen merely because a competing door exists.
- At discovery, `surfaces/FilingsCatalog.tsx` owned the reference detail and
  browsing screen. Its taxonomy came from `fixtures/filings-catalog-data.ts`, already
  derived from `shared/regulatory/filing-catalog.ts`. It also displayed authored
  lifecycle stages, review-clock prose and return-loop descriptions, and old
  unscoped workflow links. Its Start dropped the selected filing. Those two
  client files are now retired after their functions reached the homes below.
- `surfaces/AnaVerbs.tsx` `RegistryPicker` and `surfaces/Projects.tsx` already
  own the canonical wizard. A2.5 reaches descriptions, agency/format/CTD
  facts, server-derived market/build limits, description search and the shared
  `filingAskPrompt`. Unoffered filings remain refused; reference content cannot
  grant an offer. Existing tests include `registryPickerOffers.test.tsx`,
  `newProjectWizardContext.test.tsx` and the native project-wizard flows.
- `surfaces/ProjectPlan.tsx`, `ProjectHome.tsx` and `ProjectMdxWorkflow.tsx`
  already render the selected project's plan/work packages from accessible
  recorded context. They must own any retained filing lifecycle reference in
  a project; no new stand-alone lifecycle screen, verdict or task source.
- At discovery, `fixtures/filings-catalog-data.ts` owned nine loop archetypes
  and their workflow mappings/labels. These are authored reference prose, not
  recorded agency clocks or deadlines, readiness or an engine output. They
  now have one owner, `shared/regulatory/filing-lifecycle-reference.ts`;
  the wizard and project Plan reuse it. No parallel table or eligibility
  inference was introduced.
- `registryModel.ts`/`routing.ts`/`V2App.tsx` already own alias actions,
  canonical URL/history and scope handling. `projects.new-project` is the
  validated wizard action. `surfaceViews.ts`, shared registries/navigation,
  capability/deferred inventory and in-place catalogue migrations now match
  the retired identity. Formal validation references belong to the control
  tower's publication workstream.
- At discovery, `filingAskPrompt.test.tsx` drove the old detail;
  `projectCreationDoors.contract.test.ts` and OQ Projects catalogue coverage
  also named the old file/route. The Ask assertion now reaches RegistryPicker,
  and the old fixture exemptions are removed from
  `launch-scope-fixture-allowlist.json`. Formal validation references and native
  acceptance remain owned by the control tower's publication workstream.
- Deleted-history searches over `client/**/*Filings*`, `client/**/*filings*`
  and `shared/**/*filing*` returned no deletion commits. The current owners
  above are extended/reached, not rebuilt.

## Work and qualification boundary

The historical parity row was reconciled against the current wizard and project
screens. Missing reference functions now reach those existing owners with exact
recorded filing context. Authored reference remains clearly labelled; it does
not become a live countdown, eligibility, supported-market claim or computed
project deadline. Unknown or ambiguous identity withholds the selected guide.
Offer, workspace, actor, tenant, lifecycle and governing data-source checks stay
in their existing owners.

The old entry, view and catalogue identity folded only after the carry tests
passed. The shared alias/action bus carries copied `filings-catalog` URLs to
Projects with `projects.new-project`; it owns query/hash preservation and scope
clearing. The other four A2.10 screens retain their own parity/store
prerequisites. This work makes no decision to delete stored records, add a
service or grant external sponsor access.

## Completed carry of the 13 original capabilities

These are the old screen's behaviours, including the three distinct lifecycle
functions. The destination is the existing core workflow; a matching guide
never grants permission to start or transmit a filing.

| # | Original capability | Reachable home and retained boundary |
|---|---|---|
| 1 | Browse segment/category, with counts and category descriptions | `surfaces/AnaVerbs.tsx` RegistryPicker uses the existing canonical taxonomy and `FILING_CATEGORY_METADATA`; supported offerings retain their category descriptions and counts. |
| 2 | Search names, authority, description, CTD and workflow label; name the result's segment | RegistryPicker's shared match rule searches offered and refused rows, and search results display their segment. |
| 3 | Read every filing type, including types the platform does not offer | RegistryPicker's Not offered group retains the server's reason, description, authority/region, format, CTD, workflow-family facts and any admitted guide. These rows have no start action. |
| 4 | Read the filing description as visible text | RegistryPicker's filing card and chosen-filing note show the canonical description; refused rows retain it too. |
| 5 | Read authority/region, transmission format, CTD module and workflow family | `FilingReferenceFacts` in `surfaces/AnaVerbs.tsx` renders the canonical facts and explicit missing-field wording. A workflow-family label conveys reference, not executable support. |
| 6 | Read the authored lifecycle stages | `surfaces/FilingLifecycleReference.tsx` renders the retained ordered stages beside a selected filing in RegistryPicker and on `ProjectPlan.tsx`. |
| 7 | Read the authored review-clock prose | The same component labels the prose Timing examples under Authored filing-family guidance and directs users to recorded agency requirements and correspondence for actual dates. |
| 8 | Read the agency return loop and response description | The same shared guide renders the retained If it comes back label and description. It does not create a response, deadline or task. |
| 9 | Read How you'll build it | RegistryPicker's chosen-filing note uses the existing server market/build verdict and distinguishes author-only, unclaimed and unreadable build details. It does not retain the old blanket support claim. |
| 10 | Start the selected filing | RegistryPicker selection continues through the existing `Projects.tsx` wizard's configure/review/create steps with its exact selected ID. This corrects the old Start navigation, which lost the filing selection. |
| 11 | Ask AnA about the selected filing | RegistryPicker calls the existing shared `filingAskPrompt` through `onAsk`; the wizard publishes the same selected filing and guide facts. No model request is needed to prefill the question. |
| 12 | Reach the work across the whole loop | Existing `ProjectHome.tsx` Plan, Author, Submit and Respond own project-scoped work, documents, sequence/market gates and correspondence; Plan retains the existing team and task panels. The old unscoped links and redundant journey door are retired. |
| 13 | Give AnA the visible segment, query and selection | `Projects.tsx` publishes `filingBrowse`, selected canonical filing facts and the authored guide through the existing Projects context; `ProjectHome.tsx` publishes the admitted guide for the current accessible project. Account/organization changes retire wizard selection; entered/private configure fields are not published. |

The shared component has no separate surface identity or context publisher.
The old registry/view/module/deferred/collaboration identity and obsolete fixture
exemptions are removed; the URL alias remains. No standalone catalogue service,
new regulatory engine or replacement project store was introduced.

## Exact identity and authored-reference boundary

`shared/regulatory/filing-lifecycle-reference.ts:161` exposes
`filingLifecycleReferenceFor(id, recorded?)`. A match returns
`basis: 'authored_reference'`, `state: 'matched'`, `scope: 'filing_family'`, the
exact canonical filing identity and its guide. Everything else returns `null`;
the UI explicitly states that no guide is available.

- Intake requires an exact canonical catalogue ID (client lowercase or canonical
  uppercase), present in the explicit admission map. A coarse workflow family,
  generic `IND` or legacy alias cannot identify a selection.
- Project Plan supplies the accessible project's exact public
  `submission_type_id`, recorded `program_type` and recorded `primary_agency`.
  Both context fields must match the admitted types and the catalogue's actual
  agency. Missing, conflicting or unrecognised fields withhold the guide.
  `server/routes/c2c/projects.ts:488` exposes only the exact recorded catalogue
  identity from intake metadata, or `null`; it does not expose raw metadata or
  invent a filing from a broad program type.
- Program-type spelling follows the existing case/space/hyphen convention;
  agency aliases are restricted to the existing `AGENCY_LABEL` storage keys and
  display labels. No regional or workflow guess can select a US clock.
- `EU_SCIENTIFIC_ADVICE`, `EU_PRIME`, `EU_ORPHAN` and `EU_VARIATION_II` retain
  intake family references but have no admitted project type, so their Plan
  guide stays withheld until that recorded model is explicit.

All nine original guides and their labels/mapping table remain verbatim in the
shared owner: marketing, device, clinical, presub, designation, euconformity,
postmarket, cmc and clindoc. The old mapping table preserves authored reference
content; the resolver uses the explicit exact-ID map instead. The existing
multi-region family prose remains labelled family guidance, not a verified
clock for the selected project.

Known withheld examples include `EU_CTA`, `CA_CTA`, `CA_ANDS`, `JP_SHONIN`,
`CA_MDL`, `JP_TODOKEDE`, `EU_MDR_CLASS_I`, `EU_IVDR_CLASS_A`, `EU_CER`,
`US_PRIORITY_REVIEW` and `US_RFD`. This corrects the old coarse mappings that,
for example, attached the US IND/IDE clock and clinical-hold prose to EU CTA or
applied Notified Body prose to an unrelated regional filing. Preserving those
misassignments would be a defect; every original guide remains available in its
single shared owner. No new clock, stage, return-loop prose, computed readiness,
eligibility or deadline was added.

## Catalogue retirement preserves history

The absence of a literal `filings-catalog` SQL branch is intentional.
`db/migrations/20260810_reconcile_module_catalog.sql:228` already retires every
existing catalogue row whose ID is `NOT IN` its live keep-list by merging
`{"deprecated": true}` into its metadata. Removing the old ID from that list
and its later upsert makes replay retire it without resurrecting it. The
existing row and other metadata keys remain; there is no catalogue DELETE,
subscription rewrite or new migration. The dated in-place amendment records
the change, following the dossier retirement precedent and Rule 1.

`db/migrations/20260823_module_catalog_commercial_packaging.sql` also removes the
old packaging assignment. Its unclassified-row guard excludes deprecated rows
(`:328-332`), and its matched packaging update preserves unrelated metadata
(`:339-350`). A fresh database need not create the old row; a database carrying
it retains its history. `server/services/license-manager.ts:272` excludes
deprecated rows from the live catalogue.

The executable replay assertion is
`tests/schema-contract/catalog-module-claims.contract.test.ts:236`. After all
catalogue writers have run in actual deploy order, it inserts a historical old
row with a metadata marker, adds an `ON DELETE CASCADE` subscription foreign
key, and stores a disabled subscription with its own metadata. It replays
reconcile and packaging twice, then proves that exactly one deprecated old row
remains with its marker and that the subscription's organization, ID, enabled
state and metadata are unchanged. Removing the identity does not delete
subscription or project records and does not infer replacement entitlements.

## Qualification

Prior implementation evidence belongs under
`docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice-A2/A2.10a/README.md`; these
scratch logs record runs before the control tower's post-fast-forward rerun:

- Shared reference reds: `a210-reference-missing-owner-red.txt` records the
  missing-owner import failure. `a210-reference-coarse-red.txt` records 25
  intended identity/context/regional-mapping failures plus one test key-order
  correction; that correction is not a product defect. The focused green run
  `a210-reference-final-green.txt` passed 87/87 across three suites, including
  the 61-case shared guide contract. `a210-reference-prose-parity.txt` records
  verbatim AST declaration comparisons for the original labels, mapping and
  all nine guide tables.
- Core carry reds/green: `a210-picker-confirmed-red.txt` records three confirmed
  picker parity failures; `a210-plan-context-red.txt` records the Plan/context
  failures. `a210-carry-final-green.txt` passed 42/42 across RegistryPicker,
  actual ProjectPlan and wizard context, including offers, unknown/conflicting
  recorded context, browse context and actor/organization isolation.
- Retirement reds/green: after correcting an initial test's allowlist-key
  mistake, `a210-metadata-red.txt` records six intended retirement failures
  against unchanged production metadata. `a210-metadata-final-green.txt`
  passed 123/123 across six suites, including real SQL replay with the cascade
  foreign key. `a210-metadata-tests-lint-final.txt` is clean.
- Prior focused gates: `a210-launch-scope-green.txt` passes launch-scope checks;
  `a210-surface-context-green.txt` passes with the precisely reduced publisher
  baseline of 113 after retiring the old catalogue publisher. Existing Projects
  and ProjectHome publishers carry the reference facts; no new publisher ID
  was added.

All named scratch logs originated under `/workspace/scratch/`; durable compressed
logs, final accepted source hashes, screenshots and integrated verification
results are in the evidence README and its `accepted/` folder. The final browser
run includes the shared Ask prefill, exact created/read identity, recorded Plan,
reload and desktop/mobile proof. These engineering checks do not execute or
sign formal OQ, and do not complete the other four A2.10 folds.
