# Reach device and diagnostics authoring in the existing editor

W1 / D2, `concept2cure-v2`, initial base `0793ee48e`, first merged source base `35f3db346`.
The later [documentation-only fast-forward](catch-up-documentation.json) reaches
`eb4ecf5ac` without changing executed source. The final
[canonical reconciliation](catch-up-final-canonical.json) reaches `67d96c060`,
preserving all 38 owned production/test files and adopting the stronger incoming
Project files fixture. Final qualification binds that merged base and source hashes. This packet follows the
[extension contract](../../../design/DEVICE_DOCUMENT_AUTHORING_2026-10-20.md).
It adds 87 document starts (76 regional/shared device or IVD records, seven
device-only QMS records and four components) to the existing 305, for 392
built-in templates. It reaches existing
regional and component outlines, fixes known wrong-jurisdiction
heading reuse, extends existing AnA preparation and corrects EU project intake.
It creates no second editor, bootstrap, drafting service or submission channel.

## What already exists

- `shared/regulatory/global-document-registry.ts` records device, IVD, software,
  CDx and lifecycle documents. `shared/regulatory/project-bootstrap.ts` supplies
  heading scaffolds; several reused spines incorrectly imply FDA equivalence or
  EU MDR requirements for other filings. No new filing registry is needed.
- `server/services/market-specs/document-template-library.ts` resolves exact
  existing registry outlines and component records. Coverage currently selects
  only pharma. Its output is an authoring scaffold, not an agency schema.
- `server/services/authoring/builtin-authoring-templates.ts` projects existing
  outlines into stable UUIDs, section guidance and recorded filing context.
  Its regional selector excludes devices/IVDs and its component selector excludes
  device-only records. `server/routes/authoring.router.ts` already lists, loads
  and saves these projections into the sole document editor.
- `server/services/ana/{document-template-tool,builtin-template-reference,
  AnaDocumentDraftingService}.ts` and `market-specs/document-preparation.ts`
  already serve inquiry, reference and drafting. Pharma-only guards keep device
  outlines from the same preparation path. Saved template oversight already
  reads recorded UUID/version/hash/context; no second reviewer is needed.
- `client/src/concept2cure/v2/surfaces/Projects.tsx` and
  `server/routes/c2c/projects.ts` initialize projects and governed documents.
  `shared/regulatory/device-class.ts` and `programme-profile-write.ts` already
  define/persist EU MDR and IVDR classes, but the wizard currently renders FDA
  classes for every device family. The modern dossier comes from
  `c2c_rule_packs`, not the shared heading scaffold.
- `server/services/c2c/{document-class,scaffold-project-documents}.ts` and
  `shared/regulatory/filing-document-classes.ts` govern class/pack identity.
  Generic device/ivd is deliberately not a pathway. Canada/Japan project
  creation cannot be enabled just by changing a heading template.
- Submission Center, `device-assembly/assemble-device-submission.ts`,
  `submittabilityCoverage.ts`, `health-canada-gateway.ts`, `pmda-gateway.ts`
  and `transport-refusals.ts` already distinguish preparation from transmission.
  EU device files use the applicable notified body/national authority. Canada
  and Japan gateways refuse transmission; FDA transport lacks agency proof D7.

The seven device/IVD-only `cross_cutting` QMS records are already indexed in
`global-document-registry.ts` and `project-bootstrap.ts`: quality manual, design
controls/DHF, DMR, DHR, MDSAP, QMSR and ISO 13485. Existing template coverage and
the built-in picker exclude their segment. Their exact blueprints reuse generic
QMS headings and legacy QSR citations. Reach these same records as manual
preparation worksheets after correcting only their exact blueprint mappings to
record-specific, explicitly limited platform groups. Keep the generic QMS source
and the earlier medicinal snapshots intact; preserve original signed production,
certification and independent audit records. The existing registry classification
predicate in document preparation is shared rather than duplicated.

Searches covered device/diagnostic/IVD/CDx/SaMD, FDA/PMDA/Health Canada/MDR/IVDR,
project creation, templates, routes, services, shared taxonomy, AnA and migrations.
`git log --all --diff-filter=D` over the same names found retired device/template
paths, including the explicit canonical-510(k) convergence. None warrants a
second editor, bootstrap, registry, drafting service or submission channel.


[Canonical reconciliation](catch-up.json) preserves the incoming actor/recovery and
source-operation cancellation work. The one overlapping AnA file retains both
its new cancellation signal and this device guidance extension.

## Current qualification

The final merged [regression run](canonical-integration.json) passed **1,244 tests
across 49 suites**. The [compiler](canonical-typecheck.json) passed with **zero
errors against baseline zero**. All **361 captured source/test/configuration
hashes** were stable and remain current. The [warning comparison](canonical-warning-ratchet.json)
found no per-file growth across 38 changed code/test files. All ten
[editor/design/gateway/repository gates](static-gates-canonical.json) passed.
The [production build](canonical-build.json) passed after the
[report-only refresh](catch-up-report-refresh.json); the repository-health gate
passed again against that refresh. The source-bound [index](checks.json) records
actual commands, receipts, source hashes and remaining limits.
[Packaging](packaging.json) verifies stored files, links, JSON, output hashes
and staged source bytes.

The [inventory](template-inventory-final.json) and [inventory receipt](inventory-final-summary.json)
identify each exact template UUID, source snapshot, filing context and outline size.
The earlier 305 medicinal/IND snapshots are preserved in
[the before record](medicinal-snapshots-before.json); current comparison verifies
that they are unchanged. New device/diagnostics entries remain limited authoring
scaffolds. Only explicitly eligible narrative components use AnA drafting;
original forms, data, signed records and technical artifacts are not replaced.

- [Template RED](template-red.json): 22 expected pre-fix failures and one passing
  guard. [Alias RED](ivdr-alias-red.json): three failures showing unresolved IVDR
  aliases and a wrong FDA PMA deficiency substitution. [Notification RED](notification-red.json):
  the missing Japanese Class I notification could not be loaded.
- [EU initialization](initialization/README.md): regional vocabulary, stale-field
  retirement, existing-column persistence, audit/anchor behavior and rejection of
  conflicting facts, preserving FDA tests. The last focused run's test process
  passed but its wrapper refused registry drift; the combined replay supersedes it.
- [AnA checks](ana/README.md): scoped device inquiry, exact UUID references,
  existing saved oversight and device-specific evidence guidance. The focused
  result is historical after the final shared registry addition; the combined
  replay qualifies current bytes.
- [Earlier combined integration](integration.json) passed **1,014 tests across 39 distinct suites**,
  including the real JWT/PGlite template list/create/save/reopen/review loop and
  incoming cancellation/authority checks. All 196 captured hashes stayed stable.
  One repeated suite argument is deduplicated by Vitest; only actual suites count.
  Later component/class fixes and QMS reachability supersede its source bytes;
  the later 1,150/43 replay also passed before the final canonical source update.
  Final merged qualification is linked at the start of this section.
  The earlier [template/editor candidate](template-editor-candidate.json) passed
  20 cases but its wrapper refused concurrent source drift, and is not release proof.
- [Warning comparison](warning-ratchet.json) records no per-file growth; this device increment adds no
  suppression, baseline increase or gate bypass.
- [Earlier compiler](typecheck.json) passed with zero errors against baseline zero;
  [earlier production build](build.json) passed. Each completed with 196 unchanged
  hashes at execution. Later source fixes require final qualification.
- [Static gates](static-gates.json) passed all ten checks for the one canvas/editor,
  design tokens, gateway/SQL boundaries and repository health.
- [Narrative metadata RED](narrative-metadata-red.json) exposed missing lookup
  metadata; the [green receipt](narrative-metadata-green.json) verifies eligible
  device narratives and manual-only forms. [CDx RED](cdx-class-red.json) caught
  the unsupported blanket Class D label, now corrected in the canonical record.
- [Cross-lane initialization](initialization/cross-lane-green.json) passed 95
  focused checks. [Recipient checks](submission-scope/current-tests.json) passed
  46 focused checks, preserving medicines routing and refusing unqualified device
  defaults. These checks overlap the combined replay; counts are not added.

Raw logs with terminal padding or final blank lines are stored losslessly as
`*.txt.gz`. Their receipts retain the SHA-256 of decompressed output and record
the archive SHA-256 separately; no whitespace is removed from captured output.

Final receipt JSONs record `completionObserved: true`, actual exit status, output
SHA-256 and before/after source hashes. Their `*-execution.json` companions record
start state only (`completionObserved: false`); they are not completion verdicts.
The disconnected compiler/test attempt in
[the interruption record](canonical-catch-up-interruption.json) has unknown
outcomes. Earlier failing, drifting or superseded receipts remain as history,
not current passing proof. The final source-bound [index](checks.json) identifies
current qualification and its limits.

The official PMDA [device route page](pmda-device-reference.json) was retrieved
HTTP 200. Its text distinguishes Class I notification to PMDA, certification by a
registered certification body for eligible Class II/III devices, and MHLW approval
with PMDA review. The [regulatory landing page](pmda-reference.json) is retained
separately. These reads verify the cited route distinctions; they do not verify
all current agency forms or every section in a platform authoring scaffold.

## Existing device-only Quality records

The read-only [QMS reachability audit](qms-existing-audit.json) identifies seven
existing device/IVD-only cross-cutting registry records that were excluded from
built-in listing and exact UUID lookup before this extension. All seven already
resolved to exact shared blueprints through the registry tool, but reused a
generic seven-group QMS scaffold. The audit records exact IDs/mappings, stable projected UUIDs, existing
Quality module ownership, historical source pins and bounded deleted-history
searches. It distinguishes reachability from a dedicated DHR, DMR or MDSAP
record schema. Its source pins precede the record-specific repair and are
historical, not final release pins. The existing Quality module already hosts
the same editor; ordinary preparation worksheets do not become registered,
signed or effective Quality records.

The same audit contains the follow-up static review of the seven-record
reachability change and eight exact record-specific blueprint repairs. It
confirms the manual/original-record boundary and records the internal-QMS
preparation-route copy follow-up reported to root. That notice now describes
internal quality work and preserves original records instead of proposing an
agency route; final tests cover both named and UUID preparation. Its review-time hashes are
historical source receipts; the final integration receipts qualify the release.

## Scope still requiring qualification

HDE and Canada/Japan generic device/IVD project creation still refuse because exact
governed regional project classes and rule packs are absent. Their working
preparation documents can be started from the existing Authoring picker; they are
not silently substituted for an FDA dossier. Adding heading templates does not
qualify transactional dossier creation.

Cross-category searches retain the selected filing identity: MDR/CER are device
instruments, explicit diagnostic rows remain IVD, and the generic FDA 510(k)
can still be refined by a Diagnostics starting lane. The legacy CDx template ID
remains stable while its displayed title no longer asserts blanket Class D.

Health Canada and PMDA transports remain refused. FDA transport lacks agency
acceptance proof D7. EU device recipients include the applicable notified body, national authority
or reference laboratory; their recipient-specific channels are not connected.
A draft is prepared for the recipient's prescribed process; a preparation outline is not an EMA submission.
EMEA includes jurisdictions beyond this recorded EU scope. The product does not
yet support every agency submission inside the platform.

The [local guide](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
adds device cases 40–45, including conflicting component/class scope and
internal QMS preparation boundaries. All 45 human cases remain **Not run**. These automated
checks do not establish live model consumption, human acceptance, scientific or
regulatory adequacy, complete current agency requirements, native PostgreSQL
RLS/concurrency, agency acceptance or deployment.
