# Complete shared planning in the existing intelligent editor

W1 / D2; canonical `concept2cure-v2`; local/Codespaces only.

## What already exists

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`, `DocumentCanvas.tsx`
  and `surfaces/DocumentAuthoring.tsx` deliver the one editor and document start.
  `surfaces/AuthoringTemplatePicker.tsx` already searches loaded metadata in the
  native picker; no second picker, editor, sector workspace or UI pattern is added.
- `shared/regulatory/global-document-registry.ts` already registers RI_STRATEGY,
  RI_GAP_ANALYSIS, RI_COMPETITIVE and RI_HA_MEETING. Their exact shared project
  blueprints in `shared/regulatory/project-bootstrap.ts` already carry five
  `REGULATORY_INTELLIGENCE_SECTIONS`. This increment reaches these existing
  structures; it does not invent document requirements or copy a heading registry.
- `authoring/builtin-authoring-templates.ts` already projects existing IND,
  regional drug/device/IVD and component outlines with stable UUIDs and snapshots.
  `market-specs/document-template-library.ts` already serves the RI registry
  outlines directly, but its coverage list and the editor builtin roster omitted
  them. `ana/builtin-template-reference.ts` rejected their UUID scope.
- `market-specs/document-preparation.ts` and `ana/document-template-tool.ts`
  already supply paged reference/preparation. Their broad GLOBAL clinical-document
  classifier gave the four internal RI documents medicinal preparation defaults.
  The existing AnA persona consumes the shared authoring guidance.
- `authoring/authoring-assembly*.ts`, recorded-template source parsing and
  `ana/saved-document-critique.ts` already retain selected source manifests,
  per-section template context and saved-review evidence. These engines remain
  canonical; no parallel writer or reviewer is added.
- All nine `qms/sopTemplates.ts` structures already seed the same authoring
  store through `qms/controlled-document-service.ts::createControlledQmsDocument`:
  quality manual, policy, SOP, work instruction, form, validation protocol,
  change-control SOP, change-request form and training curriculum. Owned program,
  native QMS identity, creator grants and audit remain in their governed flow.
  Nonclinical reports, protocols, SAP and specimen consent already have existing
  source structures and authoring projections. The analytical method-validation
  engine supplies deterministic calculations, not another editor.

Root and two read-only audits searched surfaces, routes/services, shared schemas,
registry/blueprints, AnA tools, SOP/nonclinical/protocol/consent paths and deleted
history. No retired alternative canonical lab/research editor was found. The
[design](../../../design/CROSS_SECTOR_AUTHORING_2026-10-23.md) records exact source
paths, scope and ownership. Device-only cross-cutting QMS entries are already
reachable. The excluded GMP/GCP/GLP blueprints reuse old device QMS headings;
a blanket segment expansion would misrepresent them and is not performed.

## Result

The existing editor can select the four shared planning documents: regulatory
strategy, gap analysis, competitive landscape and health-authority meeting
minutes. Their five original headings remain Objective & Scope; Regulatory
Landscape & Precedent; Analysis & Findings; Recommendations & Next Steps;
References & Source Records. Their descriptions are searchable for device,
diagnostics, biotech, pharma, laboratory and research work.

One exact predicate admits only those four active, GLOBAL, cross-cutting
regulatory-intelligence records with no submission format/standard. Builtin
projection, coverage and AnA scope reuse it. The new documents keep manual
preparation eligibility, null CTD module, empty package families and empty bodies.
The ICH registry field is retained as classification with explicit limits;
it is not an ICH-prescribed template, receiving authority or delivery destination.
All 392 previous builtin objects and snapshots are unchanged.

AnA reads the same exact outline by registry ID or editor UUID. Its internal
questions address purpose/audience, source versions, as-of date, comparisons/gap
basis, actual meeting records and reviewers as relevant. No market is required.
An optional US/CA/EU/JP focus creates no delivery route or drug-specific defaults.
Conflicting registry/component/package-family requests are refused even for
outline-only reads. Existing bounded pages, three-question batches and discussion
markers remain; readiness stays not_assessed and evidenceReviewed stays false.

Actual source assembly retains the selected-source manifest, prior authored
text and parent identity, appends empty structure, and exposes the recorded
outline/limitations to saved AnA review. Existing filing guards refuse the
internal outline on bound FDA/drug or device filings before source reads/writes.
This does not widen automatic narrative drafting eligibility or bypass approvals.

## Qualification record

- `source/`: meaningful RED with five missing-projection/coverage failures;
  GREEN 279 tests across four suites. The prior 392-object snapshot digest is
  preserved from RED through GREEN; existing registry lint warning is unchanged.
- `preparation/`: meaningful direct-tool RED with four medicinal-default failures;
  qualified GREEN 159 tests across four suites. Initial complexity warning was
  corrected without a baseline change; final strict owned lint passed.
- `http-red.json`: four actual editor roster assertions failed before production
  changes. Missing exports or fixture setup failures are not called feature RED.
- `composed-green.json`: initial integration check had ten passes/four failures
  because the old shared HTTP fixture lacked the request-owned database client
  required by incoming canonical reads. Production access requirements remain.
  `_template-editor-fixture.ts` now models that client using its real PGlite query
  surface and retains normal JWT/tenant middleware. `composed-qualified-green.json`
  passes all 14 selected HTTP/assembly/saved-review cases, with 75 unrelated cases
  skipped. It does not qualify native RLS, connection lifetime or concurrency.
- Final combined regression, compiler/build and static gate results are retained
  in the corresponding root receipts and final qualification index. Worker and
  focused counts overlap; they must not be summed into a unique test total.

Every root receipt retains actual argv, UTC time, exit, frozen before/after
source hashes and compressed raw-output SHA-256. Historical/initial receipts
retain their original pins. The 38-suite regression and owned lint use `release-source-freeze.json` (70 pins).
After the reviewed canonical fast-forward, affected regressions, compiler/build
and gates use `publication-source-freeze.json` (122 pins).
`independent-review.md` records the read-only six-production-path review, with
no blocking findings; it is not an expert regulatory or security certification.
`canonical-catchup.json` records the initial 1335-path fast-forward with unchanged
instructions/dependencies/compiler/Vitest config. `qualification-sync.json`
records a later documentation-only fast-forward with all qualified pins intact.

## Human testing and limits

The [local guide](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
contains 70 sequential cases, all Not run. Cases 68–70 cover these shared documents,
source assembly, saved oversight, scope refusals and the existing governed QMS
path across the named customer use cases. Existing UI principles are preserved.

This is shared planning coverage, not every lab/research, diagnostic, drug or
device document or a regional regulatory-completeness verdict. Sector-specific
GLP/GCP/GMP outline review, source-selection continuity across new-document
creation and historical hash-labelled re-filing remain separate gaps. Existing
CMC composition stays limited to small-molecule US IND work. Original forms,
signed records, actual scientific results, approvals, dedicated technical
validation and any agency delivery retain their existing requirements.

Tests use declared PGlite/in-memory/request-context seams and deterministic
preparation. No live AI/provider connectivity, human acceptance, native PostgreSQL
RLS/concurrency, agency transmission or deployment is claimed. All work stays on
the canonical branch with normal commit/push hooks and no PR.

The original `merged-regressions` run retained 1052 passes and 41 failures across
four suites. The coverage fixture now expects the four approved RI entries.
The three UI fixtures now model the existing signed-in actor and project-scoped
read URLs; their 60 focused tests and strict lint pass. POST assertions additionally
pin actor headers. Production UI/access policy and negative assertions are
unchanged. See `preparation/ui-fixture/` and `ui-fixtures/`; this historical failure
is retained rather than labelled feature RED or GREEN.

`final-document-review.md` verifies the six production hashes and corrected
70-case human handoff. It also records the initial duplicate case numbers,
which were resolved while preserving existing case IDs 1–67.

The reviewed canonical fast-forward `aa09f55f` → `0a7abf31` preserves every owned
file. `incoming-review.md` explains the incoming strict Word-to-PDF converter,
pre-write refusal/outcome distinctions and native served-model provenance.
`publication-sync.json` retains the normal fast-forward and exact changed paths;
`post-sync-selection.json` names the 15 affected safety/integration suites.
Historical pre-sync results keep their original source pins. They are not
relabelled as post-sync runs or summed with overlapping counts.

Final qualification summaries are indexed in `final-qualification.json`.
The normal canonical commit/push and exact published source verification are
recorded separately in `publication.md` and its linked receipts.

## Final recorded results

| Check | Actual result |
| --- | --- |
| Cross-sector/editor/source/AnA regression before reviewed fast-forward | 1093 passed, 38 suites |
| Post-sync affected export/Vault/native-AnA integration | 197 passed, 15 suites |
| Owned TypeScript/TSX lint | 16 files; 0 errors; 1 unchanged registry max-lines warning |
| Warning comparison against current canonical base | No file gained a warning |
| TypeScript zero-error gate | Passed; baseline unchanged at 0 |
| Production build | Passed |
| Single editor, UI tokens/design, gateway, SQL, migration and repo-health gates | All 16 passed |
| Final 122 pinned inputs | No drift |
| Human acceptance | 70 cases, all Not run |

The two regression rows overlap and are not a combined unique-case count.
All results above have actual command/exit/raw-output/source-pin receipts in
`final-qualification.json`; neither compiler nor warning/size baselines increased.
