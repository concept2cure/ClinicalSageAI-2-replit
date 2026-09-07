# Medical device and diagnostics — market-readiness verdict

Date: 2026-09-07. Branch `concept2cure-v2` @ `3744075c6`. Four read-only audits, each with
file:line citations, answering one question: can a device or IVD client take a 510(k) from
ideation to a filed eSTAR, receive FDA's letters, respond, and resubmit — on this platform,
today, without fixtures?

**Answer: no.** What is honestly sellable today is governed 510(k) / De Novo / PMA authoring
with FDA eSTAR administrative pre-fill, an audit trail and tenant isolation. Not "file your
510(k) through the platform." The ordered roadmap that closes the gap is in
`docs/handoff/HANDOFF_DEVICE.md` §6.

## 1. The eSTAR export writes an administrative header, not a submission

| | nIVD eSTAR v7.0 | IVD eSTAR v7.0 |
|---|---|---|
| fillable fields in the template's `datasets` | 454 | 538 |
| fields the platform maps (`estar-field-map.ts`) | 20 | 19 |
| attachment slots (`*AddAttachment*` controls) | 112 | 140 |
| attachment slots the platform fills | **0** | **0** |
| typical filled count on real seeded data (device golden journey, steps 13–15) | 5 → 8 of 20 | — |
| of the 20, cleared or replaced by FDA's own scripts on the applicant's first click | 9 | — |

- `POST /official` (`server/routes/510k-estar-routes.ts:957`) writes text into the XFA
  `datasets` packet only. `fillXfaDatasets` (`server/services/forms/fill-official-pdf.ts:1235`)
  appends a **single-object** incremental update (`appendIncrementalUpdate`, `:1060`) that can
  neither allocate new objects nor rewrite the catalog, so it cannot create an `/EmbeddedFiles`
  name tree. Repo-wide grep for `EmbeddedFile | importDataObject | FileAttachment | Filespec`:
  **0 hits**. The route accepts no `attachments` field (`officialSchema`, `:859–872`).
- A real attachment in the template is five coordinated writes across three PDF layers: the
  embedded-file stream plus `/Filespec` plus the catalog's `/Names /EmbeddedFiles` tree; a
  `form`-packet subform occurrence (`instanceManager.addInstance`) with `AttachmentName`; the
  `AttachmentManifest` routing token `<<path|/CHAPTER n/CHn.nn/>>` that CDRH's ingestion reads;
  and the section's completeness indicator. The platform performs one of the five, on none of
  the slots. The repo's own plan records this: `IMPLEMENTATION_TASK_CHECKLISTS_2026-06-15.md:38`,
  item **B4** "attach section files … attachments embedded", unchecked.
- `estar-mapper.ts` maps content to section-completeness booleans, not files (`:21–35`, `:95–99`);
  its two callers (`assemble-device-submission.ts:118`, `cockpit.ts:84`) are not on the
  `/official` path. `POST /build` produces a separate ZIP of rendered section PDFs stamped
  `officialEstarPdf: false` (`:601–617`); neither artifact feeds the other.
- There is no transmission. The gateway registry has no CDRH entry
  (`server/services/submission-gateways/index.ts:41–55`); the FDA ESG leg states in its own
  header that a real endpoint would reject its envelope (`fda-esg.ts:19–32`). "Submit" ends at
  a base64 PDF in the HTTP response (`governedExportConsequence.ts:158–163`).

## 2. Ideation to content: real at the ends, absent in the middle

| step | verdict | decisive citation |
|---|---|---|
| classification / product-code lookup | **works** (openFDA) | `server/services/integrations/openfda-device-client.ts:99`; `DeviceProfilePanel.tsx:327–352` |
| pathway determination | **not wired** | `market-specs/device-classification.ts:216` is a heuristic with zero client callers; the pathway is a free dropdown, `DeviceProfilePanel.tsx:48–52`; Traditional/Special/Abbreviated is not modelled (`estar-catalog.ts:41`) |
| predicate search | **not wired** | `server/routes/predicate-intelligence.ts:78–84` returns 503 without `REVIEW_ADMIN_TOKEN`; the "shadow service" it proxies to is two files in `shadow_service/` and no app |
| predicate persistence | **not wired** | `regulatory_programs.predicate_devices` (`shared/schema/programs.ts:84`) is read by the eSTAR projector but the profile PUT schema (`510k-device-routes.ts:157–176`) cannot write it; the only writer is `seed-demo.ts:84`; the surface's selection is local React state (`K510Surface.tsx:92`) |
| substantial-equivalence table | **display only** | `K510Surface.tsx:385–470`, no editor, no save; the AnA tool "does NOT draft prose" (`legacy-import-tool-defs.ts:611`) |
| pre-sub / Q-Sub | **partial** | real routes (`server/routes/q-sub.ts`), but "New Q-Sub" only opens chat (`PreSubManager.tsx:420–430`) and PreSTAR is `version: 'unset'` (`estar-template-registry.ts:132–135`) |
| content authoring | **partial** | the 36-node eSTAR outline is real and wired to the mapper (`migrations/20260901b_estar_510k_denovo_outlines.sql:66`); readiness reads authored rows fail-closed (`510k-estar-routes.ts:1633–1638`); but the AI draft endpoint (`authoring.router.ts:3516`) is module-agnostic and no 510(k) authoring template is seeded, so 0 of 29 leaves are AnA-draftable out of the box |
| evidence → eSTAR slots | **not wired** | vault taxonomy is CTD-shaped (`vault-taxonomy.ts:71–74`); the classifier assigns one folder `k510` (`vault-filing.service.ts:130–136`); `estar-content-leaves.ts:135` builds leaves only from authored sections |

**IVD landmine:** `PROGRAM_TO_DOC_TYPE` (`server/services/c2c/document-class.ts:33–46`) maps
`510k → k510` but leaves `ivd` and `device` unmapped, so a project created as
`program_type='ivd'` gets no governed document, outline or filing binding.

## 3. Honesty on the demo path: four leaks at HEAD — **closed the same day**

WO-8 Phase 3 requires every value on screen to trace to a database row. At `3744075c6`, before roadmap item 1 (closed in the commit that carries this report, guarded by `client/src/concept2cure/mdx/__tests__/k510HonestEmptyState.test.tsx`):

1. `K510Surface.tsx:38, 119, 126, 129–130` — with no program selected the surface renders
   "510(k) pathway · BX-204 Continuous Glucose Monitor", "Stage 5 of 7 — Substantial
   equivalence", "FDA filing · 41 days", and carries "BX-204 CGM" into the SE header and AnA prompts.
2. `K510Surface.tsx:90 → 482` — `estarBlockerCount` falls back to the fixture ungated, so an
   empty tenant reads "0 sections · 1 blocker".
3. `K510Surface.tsx:214–225` — the shadow-service banner promises "canonical example data"
   below it that the sample gate correctly withholds outside sample mode.
4. `Overview.tsx:63` — `MDX_HEALTH` renders for an empty tenant: "Active programs 14 · 9 510(k)
   · 4 PMA", "Average readiness 56%", "FDA review cycle 87d", "Blockers open 4".

Everything else is clean: zero imports of `v2/fixtures` in the MDX tree, `useSampleRows` gates
the predicate, SE, eSTAR, IVD, vault, analytics, postmarket, workbench, pre-sub and CER panels,
and the dossier fixture sits behind an explicit `enableSampleFixtures()` boundary.

## 4. The FDA letter loop does not exist for devices

| step | verdict | decisive citation |
|---|---|---|
| (a) ingest / record an FDA letter | **partial, none complete** | text-only intake `POST /api/regulatory-correspondence/correspondence/intake` (`regulatory-correspondence.ts:449`) has **zero client callers** and stores no bytes (`:464–476`); the eSTAR tracker stores a status enum only (`510k-estar-routes.ts:1697–1702`, `shared/schema/estar-submission.ts:42–92`) |
| (b) extract deficiencies | **not wired for device** | the parser is drug/CTD: six regexes, no RTA / AI-hold / SE / NSE pattern, sections `2.5 / 2.7 / 3.2.S` (`issue-parser.ts:34–118`) |
| (c) draft responses | **mock** | `AnaDrafter.tsx` makes zero network calls and adopts fixture prose (`:78, 126–139`); its Send button is hardcoded `disabled`, "Send — not connected" (`:641–651`); live rows can never open it (`PathwayPanes.tsx:1148–1151`) |
| (d) update affected sections | **not wired** | issue→section resolution targets `c2c_package_sections` (`operating-layer.ts:83–93`), never the 510(k) store `cerv2_510k_sections` |
| (e) amended eSTAR / response package | **not wired end to end** | `POST /response-packages` (`:806`) has no client caller; the eSTAR catalog has no 510(k) amendment key (`estar-catalog.ts:44–50`) |

The HAQ Manager surface, the nearest thing to the requested workflow, can never show a letter:
no code path inserts one (`haq-manager.ts:85`, its own header).

## 5. Enterprise readiness

| property | verdict | citation |
|---|---|---|
| tenant isolation | **ready** | every route resolves the org first; both eSTAR tables are inside the RLS sweep, last in `C2C_MIGRATION_FILES`; cross-tenant refusal proven in the golden journey (steps 18–20) |
| deployment of the templates | **ready** | `Dockerfile.optimized:87`; `deploy-migration-mechanism.contract.test.ts:91–138` derives the drop-points from source and asserts them |
| failure honesty on export | **ready** | `useEstarExport.ts:178–186, 293–329`; no 5xx body leaks internals (13 sites) |
| roles | **ready** | `middleware/orgMembership.ts:453–460`, the ungrantable roles are gone |
| entitlements | **partial** | `ENTITLEMENTS_ENFORCE` defaults to off with no production startup assertion (`require-entitlement.ts:61–67, 207`); the gate is correct when on |
| Part 11 on the governed export | **partial** | the placed path writes four rows in one transaction with the delivered bytes' sha256 (`artifactWriteback.ts:42–140`); **but** the delivered PDF is never retained anywhere (`510k-estar-routes.ts:1022` stores the inputs; `governedExportConsequence.ts:114, 162` only hashes and base64-encodes the output); draft→filed is an unsigned `PATCH` with a client-supplied `filedAt` and free-text tracking number bound to no artifact (`:1697–1702`, `estar-submission-service.ts:184`); the unplaced-export path's "failure propagates" guarantee (`governedExportConsequence.ts:222–223`) calls `auditService.logAction`, which never rejects (`auditService.ts:399–405`) |
| transmission | **missing** | §1 |
| data completeness | **missing** | §1 |
