# Authoring current read boundary

Status: root-approved next W1 / D2 READ contract after published `1bd3af0bc`
and healthbot `4997`, focused backend RED/GREEN recorded below, pending native and release qualification.
The owned runtime refresh closed before root released implementation sources.
Approval of this contract does not by itself qualify its
implementation, native behavior, or deployment.

## Problem and bounded outcome

The existing `GET /api/authoring/docs`, `GET /api/authoring/docs/:docId`, and
`GET /api/authoring/docs/:docId/sections` read tenant metadata/counts/content
through the shared pool before, or without, current object admission. The
general object middleware skips those GETs. The list section join additionally
needs its matching tenant predicate.

These three reads will use one request-owned compositor. Current organization
membership, program/project sharing and exact document or section ACL must be
verified before returning parent metadata, aggregate counts or prose. An exact
section grant remains a usable editor path without exposing sibling content.

This increment changes no schema, policy, review, signature, audit writer,
source snapshot service, or other writer. The incoming peer-review repair and
RequiredDeliverables direct source reader retain their separate contracts.
Other Authoring GETs remain outside this qualification.

## Exact backend ownership

| File | Change |
| --- | --- |
| `server/routes/authoring.router.ts` | Replace only the three GET bodies; import requestPgClient and the compositor; move the existing detail-read ceremony hint projection into that compositor, removing its old copy |
| `server/services/authoring/authoring-document-read.ts` | New small canonical compositor containing moved read SQL/projections and the existing read hint projection; no permission policy, parallel endpoint or pool fallback |
| `server/services/authoring/authoring-read-scope.ts` | Add the already verified current role to the internal actor; compare role in the existing late recheck; preserve current ACL/program behavior and default-false NULL-program opt-in |
| `shared/authoring/read-projection.ts` | Only shared wire types for the two additive fields below; no permission decision or runtime policy |
| `docs/design/AUTHORING_CURRENT_READ_BOUNDARY.md` | This approved contract, with exact RED/GREEN qualification added after execution |

Do not modify the snapshot writer, object middleware classifications, shared
signing policy, review flow, migrations, roles, grants, or RLS. A second helper
is not planned; split an overlong compositor only with root coordination.

## Canonical compositor interfaces

The compositor imports the existing canonical read-scope functions and uses
`RequestSqlClient`. Its exported functions receive only an actual request q,
captured identity and ordinary filters. They never accept admitted IDs, a
caller-supplied principal, a prior scope, or an Express request/ALS role.

```ts
interface AuthoringReadIdentity {
  organizationId: number;
  userId: number | undefined;
  programId?: string | null;
}
interface AuthoringDocumentReadIdentity extends AuthoringReadIdentity {
  documentId: string;
}
interface AuthoringDocumentFilters {
  module?: string;
  product_code?: string;
  status?: string;
  conversationId?: string;
  source?: string;
}

readAuthoringDocuments(q, identity, filters); // existing list envelope
readAuthoringDocument(q, documentIdentity);  // existing detail/access envelope
readAuthoringDocumentSections(q, documentIdentity); // existing sections envelope
```

The route captures user/org from authenticated helpers, resolves exactly
`requestPgClient(req)`, validates/normalizes supplied UUIDs and calls the
matching function. Invalid/multivalued UUID input is a generic 400; a private,
foreign or missing document is generic 404. A supplied program must never be
silently ignored. No body field, arbitrary header or userRole claim supplies
identity or current authority.

Each function mints `getCurrentAuthoringReadScope(q, capturedInput)` before
metadata/prose/count SQL. SQL binds only admitted full-document/section-parent
IDs and exact admitted section IDs, with matching tenant predicates on every
join. A list does not query/page/count all tenant records then filter them.
Call the existing late recheck on the same q and exact captured input after
all response components/hints are assembled, immediately before returning.

Keep canonical 403 current-actor denial, 404 identity refusal, 409 selected
program reconciliation, and 503 verification/change failures, with the
existing sanitized Authoring failure envelope. Missing request context fails
closed; no fallback. Verification faults never become an empty library.
The late guard refuses changes it observes; no serializability claim is made.
Initial canonical 403/404/409 remains unchanged. After a scope was positively
minted, a late Authoring 404 or ProgramReadAccessError 403/404/409 is translated
to generic 503 AUTHORING_READ_ACCESS_CHANGED; a genuine verification 503 keeps
its existing unavailable code. This prevents a late withdrawal from exposing
a differently shaped response or masquerading as an initial lookup.

## Minimal authoritative UI wire fields

```ts
export type AuthoringReadProjection = 'document' | 'sections';
export type AuthoringSourceMetadataState = 'available' | 'unavailable';
```

`readScope` is mandatory on each returned list document, inside the detail
`document`, and on the sections response. Full `documentIds` admission gives
`document`; admission only through `sectionDocumentIds` gives `sections`.
It says what this response covers, not what future writes are allowed.

Detail `document.sourceMetadataState` is mandatory:
- `available`: full document admission and the existing provenance reader
  positively found the provenance store present. A stored NULL remains NULL,
  meaning no recorded source; availability does not mean complete provenance,
  qualified models, approval, or filing readiness.
- `unavailable`: section-only projection, or the existing provenance reader
  reports absent/unknown store. Do not read full stored provenance for partial
  access, and do not assert its stored value or store status. Full readers keep
  the existing top-level absent/unknown `provenanceStore` qualification.

For partial detail, omit the raw `provenance` property and omit provenanceStore
storage claims. Template/import/model/source-reference/figure/claim facts are
unavailable because they live in that whole-document JSON. Do not substitute a
fake source value or a NULL that claims no record. References use section code,
not stable section ID, so duplicate codes preclude safe provenance filtering.

Full detail example:
```json
{"success":true,"document":{"id":"<uuid>","readScope":"document","sourceMetadataState":"available","provenance":null},"access":{"freeze":null,"esign":null,"esignReview":null,"fileToVault":null,"assignReview":null,"placeIntoFiling":null}}
```
Partial detail example:
```json
{"success":true,"document":{"id":"<uuid>","readScope":"sections","sourceMetadataState":"unavailable","section_count":"1"},"access":{"freeze":null,"esign":null,"esignReview":null,"fileToVault":null,"assignReview":null,"placeIntoFiling":null}}
```
The examples abbreviate unchanged headers; counts keep their existing JSON
shape. Gate values come from the actual canonical hint decision, not literals.

## Full versus section projection

List the union of full document IDs and section-parent IDs. Retain necessary
parent header fields for section navigation. Use explicit SQL column projection
for partial detail, never SELECT d.* or a future-column expansion. Existing
header fields and
counter keys remain; all partial counters and content length describe only
admitted sections. Do not return hidden sibling IDs/titles/order, whole-document
comments, or hidden aggregate totals. Partial detail comments are counted only
when linked to an admitted section; revision/citation counters also bind exact
visible IDs. Full document view with zero sections is valid 200/[]; an
inaccessible parent is not that empty response.

Partial list rows omit `provenance_source` and `conversation_id`. Source or
conversation filters may select only full admitted documents, preventing the
predicate itself from revealing withheld associations. Project/unfiltered
lists still reach section-only grants. Full readers retain existing filter
semantics; no module or status default is introduced. Case-insensitive status,
absent/all/empty status, ordering and success/documents/document/sections/count/
filters/access keys remain. Use rows.length where q has no rowCount.

Full sections retain existing structure findings. Partial sections return
`structure:null`; inspecting a subset cannot claim whole-document uniqueness
or ordering. Tenant-scoped comment/revision/citation counters remain aligned
with each visible section. A stable final ID tiebreak may be added to the
existing stored order without replacing it with lexical CTD ordering.

## Historical organization mode

The scope helper remains default false. These three read composition callsites
explicitly set `includeOrganizationDocuments:true` only with no selected
programId. An organization-wide list or document-ID read can therefore reach a
legitimate historical NULL-program record with current OU and actual ACL.
Selected-program detail and sections GETs also carry the exact programId UUID;
organization mode omits that parameter. There is no include_unfiled HTTP flag: the
server explicitly chooses canonical helper opt-in in organization mode.
A supplied program excludes NULL and other-program documents. No project,
visibility or permission is inferred or backfilled. The review board's
explicit unfiltered opt-in remains unchanged.

## Verified current actor and existing UI hints

The internal scope actor becomes `{userId,email,role}` using the role already
verified by canonical current-program admission; it is never accepted from a
client or serialized as a public authority credential. The late guard compares
role as well as current user/email and admitted identities.

Move, do not duplicate, the existing six-field detail hint projector. Build its
principal from that actor. Resolve its object scope and permissions on actual
q. Apply the existing `isSigningAuthorized`, GOVERNED_WRITE_ROLES,
vaultWriteRefusal(actualRole), role expansion and roleClaimsSatisfy policies to
the verified role. No shared pool, cached req.user.roles, req.userRole or ALS
role is used. Preserve current reason copy and unknown optional hint behavior;
read admission itself remains mandatory and cannot be settled into unknown.
If a scope lookup observes a saved status different from the returned header,
refuse the combined read as changed rather than project mismatched facts.

Whole-document ceremony controls must consume explicit partial readScope from
either detail or sections; their required full source was not supplied.
Unavailable source metadata alone does not block every ceremony on a full read.
This UI condition creates no
writer grant or denial. Existing section-specific writes still decide section
edit/comment authority under their unchanged rules.

## UI delegate contract and ownership

UI ownership is separately coordinated after root READY:
`DocumentCanvas.tsx`, `DocumentWorkbench.tsx`, `savedTemplateContext.ts`, and
`surfaces/placeIntoFilingCopy.ts`, and one canonical
`editor/authoringCurrentRead.ts` helper for captured session/account revision,
read URL/refusal parsing and the moved Canvas loader, plus focused existing
tests. Root also approves narrow compatibility updates to the 42 existing
legacy auth-service factory / GET-route fixtures that this canonical helper
exposes: give them the real required session/query boundary, preserve their
assertions and retain actual 403/404 negative controls. No blanket role or
permission grant, global fallback, deleted assertion, or policy waiver.

For explicit partial scope, show an existing-style short notice, keep the
actual admitted section outline/deep link and save/discard behavior, and do not
describe the assembled subset as the complete document. Suppress Canvas's
fromThisConversation AnA fallback. Unavailable source metadata gives the saved
template adapter `templateSourceState:'unavailable'`, not `not-recorded`, and
does not emit template/import/figure/claim facts. No new dialog, theme or page.
The current document/program selection and canonical authService
captureSessionReadGuard same-revision check guard body acceptance and render,
so responses cannot cross a session or selected project change. UI-owned six
existing focused suites remain within the root-assigned UI scope.
Contradictory partial+available flags are treated as unavailable. Missing flags
retain existing legacy display behavior; this backend always emits the fields.

The existing takeFilingCopy read consumer refuses explicit partial scope before
the coauthor snapshot POST. Preserve context-switch and uncertain-outcome
behavior. This is client mitigation only; it does not qualify the server
snapshot admission path and must not be reported as that repair.

The 17 October canonical reconciliation also preserves upstream `access.edit`
and its existing editor restrictions, embedded creation/recovery, assembly
review and navigation guards. A section projection retains the actual edit
hint independently of its whole-document ceremony refusals. The existing
assembly control consumes a partial/current-read refusal before a new
structure operation; already-sent requests retain their real receipts.
Root approved a narrow integration expansion to
`editor/assemblyBuildTransport.ts` and the existing
`editor/__tests__/authoringAssemblyBuild.test.tsx` and
`editor/__tests__/workbenchAssemblyBuild.test.tsx`: saved-document inspection
uses `authoringCurrentReadPath` with the exact selected program on detail and
sections GETs, refuses explicit section-only inventory/detail/sections before
claiming a complete saved-document check, and preserves captured owner,
receipt and source-write guards. Full reads with unavailable provenance remain
usable. This adds no assembly capability or policy grant.

## Focused actual-PGlite RED/GREEN and owned tests

Add `server/routes/__tests__/authoringCurrentRead.pglite.integration.test.ts`
and, if required to keep suites bounded, a non-test sibling
`_authoring-current-read-fixture.ts`. Run actual router/canonical authority SQL
on a real PGlite request executor, real active OU/program sharing and explicit
ACL fixtures. Do not mock admission or replace canonical scope with allowlists.
Observer wrappers may record query order or defer after a real read settles.

Existing owned neighbors are only `authoringDocsStatusFilter.test.ts`,
`authoringDocsByConversation.test.ts`, and
`authoringDocAccess.pglite.integration.test.ts`. Their setup gains actual
request context/current identity only where needed. Preserve their positive
filter and permission assertions. An existing assertion requiring private
metadata without a grant becomes a genuine refusal, not a blanket fixture
grant. Keep original raw RED evidence before corrections.

Required controls: same-org private project versus document ACL independently;
foreign rows and mismatched-tenant children; current viewer despite stale admin
claims; inactive/removed OU; expired/revoked grants and changed email; whole doc
versus exact section-only hidden markers/counts/provenance; genuine zero-section
doc versus missing parent; legitimate NULL organization mode versus selected
program; original mixed-module/status/conversation behavior; real policy fault
503 rather than 200/empty; and deferred real read followed by actual sharing,
OU, role or section-grant withdrawal before the late check.

Root controls heavy/native/compiler/global gate slots. No native or runtime-RLS
claim follows from PGlite tests. After focused GREEN and exact lint warning
comparison, freeze sources and file raw results/source pins for root gates.

## Explicit separate snapshot admission residual

Source trace: coauthor.ts checks regulatory-author role for a source snapshot;
takeAuthoringSnapshot first reads tenant source status via shared pool and then
assembles saved source sections on its own transaction. State/seal/imported
binary references are checked, but current Authoring source document/program
ACL was not found in that path. This is preexisting, separate from incoming
Claude peer-review work, and is not a demonstrated runtime disclosure.

The server writer requires a separately approved actual writer repair with
real request-owned executor/current source admission and meaningful restricted-
runtime negatives. No writer/snapshot-service source changes belong to this
first READ increment. The client guard cannot make a server authority claim.


## Focused backend qualification (2026-10-14)

The original 19 actual-router cases produced 16 failures / 3 passes before
production repair, zero skips (10.00s). A first fixture-only attempt was
separately retained and unqualified: the canonical unique-code constraint
refused the synthetic duplicate and all 19 cases skipped; no index was relaxed.
Expanded FK controls assert physical 23503 refusals and retain legitimate
foreign rows. No malformed row was made admissible to exercise a query.

A separate actual valid-schema counter control failed before the final join
repair: a comment named this document but pointed at a private section of a
different document. The fixed join counts only admitted section IDs, with
NULL-section document-wide comments retained only for a full document read.
Its filtered RED has one failure / 31 name-filtered skips, not a full-suite
claim. The stored synthetic row is retained; no history repair is performed.

Final backend: 49 cases / four focused suites passed, zero skips (45.12s).
Exact scoped lint has zero errors and 23 existing router warnings; the
published router baseline has identical rule counts and all other eight
scoped files have zero warnings. Raw phases and source pins are filed in
`docs/evidence/D2-PLATFORM-COMPLETION/2026-10-14/authoring-current-read/`.
PGlite qualifies actual canonical SQL and request composition; it does not
establish native restricted-role/RLS, full platform, compiler, browser,
deployment or snapshot-writer correctness. Root owns those next gates.
