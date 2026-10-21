# Company legal lifecycle and filing requirements

The company-document workflow now records legal custodianship, renewal,
replacement and revocation separately from Vault inventory retirement. The
reachable settings editor also records signing authority, delegated authority,
reviewed external signature evidence and certified-translation evidence.

## What already exists

- `server/services/company-documents/profile.ts` owns company-document revision,
  membership and audited settings writes. Lifecycle and requirement reviews use
  that writer; presentation metadata does not grant legal approval.
- `server/services/vault/vault-lifecycle.ts` owns exact-version Vault approval,
  and `vault-where-used.ts` owns affected filing references. This work extends
  their refusal and display rules; it does not replace their lifecycle.
- `server/jobs/taskDueSweep.ts` and
  `server/services/notifications/notification-service.ts` own native scheduling
  and in-app delivery. Legal renewal uses those paths and does not send email.
- `server/services/global-ri/regional-module1-requirements.ts` provides regional
  checklist components. Explicit reviewed legal-kind and version mappings are
  still necessary; a checklist does not establish agency acceptance.
- `server/services/ectd/assess-dispatch-readiness.ts`, `assemble-from-core.ts` and
  `server/services/submission-service/submission-service.ts` own filing verdicts,
  assembly and placement. Saved legal requirements join those canonical gates.
- `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx` provides the shared
  `VaultVersionPicker`. Company settings and the lifecycle editor use it for
  version selection; the duplicate company picker was removed. Existing
  pagination/retry and scoped-read behavior are retained on the shared picker.

## Governance and identity

- Registered legal identity remains the immutable Vault document ID, version,
  program and SHA-256 in the canonical tenant registry. Metadata never grants
  Vault approval or copies an approval into another program.
- Supporting evidence must be a current, approved Vault version in the same
  program. The server resolves and retains its exact identity; the client cannot
  supply hashes, reviewer identity, timestamps or a trusted verification verdict.
- Signature evidence records what an external report or human review reported.
  It does not establish cryptographic verification by Concept2Cure. A recorded
  invalid finding cannot be cleared by deleting the metadata or relabeling the
  same evidence. New approved evidence reporting valid is needed to resolve it;
  revocation preserves the invalid finding.
- Revocation is retained independently of archival and cannot be undone through
  the lifecycle editor. Canonical placement/transmission rules refuse revoked
  or reported-invalid originals, including archived records.
- Metadata, task projection, due notification and audit commit through the
  existing company-profile transaction. Exact sources, current custodian access
  and evidence are checked again before commit. A failed projection or notice
  aborts the lifecycle change.

An explicitly copied company original retains server-derived ancestry from the
native ingest audit, including when its later library-registration step fails.
Registration stores the exact source registration, Vault version, project and
hash as immutable server-only provenance. Public library and report DTOs omit
those ancestor identifiers, since the copy's reader may lack source-project
access. Canonical Vault placement and transmission follow this explicit chain
and refuse a revoked or reported-invalid ancestor with a generic reason.
Conflicting, cyclic, missing known ancestry, foreign-tenant or drifted original
identity fails closed. An audit read failure also refuses filing. An ordinary
upload with no recorded parent remains independent: equal bytes do not create
ancestry. An archived source alone does not revoke a separately reviewed copy,
and every copy still needs its own canonical approval.

## Renewal and affected filings

Lifecycle edits project into `c2c_project_work_items` using a tenant/project-bound
`company_legal_renewal` source reference. The due date is the earliest configured
reminder interval before expiry. Repeated projections preserve human work-item
status and do not update unchanged rows.

The existing hourly task deadline sweep invokes the legal renewal processor.
It uses the existing cross-process lease, entitled tenant selection, a scoped
connection with no super-admin role, the organization row lock, native in-app
notifications and the chained audit ledger. Each expiry/hash/custodian/threshold
is notified once. Removed custodian/project access suppresses delivery. No email
delivery or external messaging is implied. Notifications contain generic prose;
their destination is resolved through current program admission.

The editor uses the canonical Vault where-used reader to show the actual live
submission/sequence placements, including dispatch status. A replacement link
does not itself withdraw an original; revocation or the existing filing
replacement process records that separate decision.

## Requirement coverage

Canonical market and submission-type selectors reuse the platform registries
and aliases. Unknown legacy labels stay restricted; new registrations require a
recognized value. The existing regional Module 1 engine supplies initial
marketing-application suggestions with explicit legal-document-kind mappings.
It does not infer a document's legal meaning from its title.

Submission Center evaluates an admitted sequence's actual program, jurisdiction
and application type. A custodian records applicability and rationale, exact
legal versions, required section/language and any authority, signature-evidence
or certified-translation prerequisites. A filing-specific review is bound to
that sequence on the server. Specializing an organization policy retains the
policy and creates a filing review rather than overwriting another program's
mapping. Unresolved applicability remains visible as unresolved.

The canonical dispatch-readiness assessor and eCTD assembler both enforce
applicable **saved** requirements against current Vault approval, original
hashes, legal lifecycle, supporting evidence and exact sequence placements.
Assembly refuses before staging when a saved requirement is unresolved,
missing or blocked. An existing filing with no configured company requirements
retains its prior behavior; unreviewed regional suggestions are advisory until
recorded. Other regional, technical, approval and release gates still apply.

This assesses legal companions under recorded customer reviews. It does not
establish full Module 1 completeness, universal agency acceptance or new gateway
support. Unsupported filing checklist coverage requires an explicit customer
review rather than a guessed requirement list.

## API and UI

All paths are below `/api/client-branding/company-documents` and use current
membership, delegated legal capability and existing project admission.

| Method/path | Purpose |
| --- | --- |
| `GET /legal-workflows/catalog` | Canonical selectors and regional source suggestions |
| `GET /legal-workflows/readiness?sequenceId=…` | Actual filing-bound legal completeness |
| `POST /legal-workflows/requirements` | Audited applicability and exact-version mapping review |
| `GET /legal-documents/:id/lifecycle` | Lifecycle, renewal state and current affected placements |
| `GET /legal-documents/:id/custodians` | Current active members with access to this source program |
| `PUT /legal-documents/:id/lifecycle` | Governed lifecycle/evidence review, optimistic revision check |
| `POST /legal-documents/:id/remind` | Audited refresh of the saved renewal and due notice |

The editor and filing checklist use paged server inventory searches for related
versions and mappings. Selected exact IDs survive pagination. Tenant/auth/filing
changes discard old reads and mutation receipts; the UI never treats a failed
read as an empty or complete checklist.

## Verification

Meaningful regressions cover alias resolution, explicit review, exact placement
hashes, language/kind mismatches, hidden program references, sequence policy
specialization, invalid-signature metadata removal, live source rechecks and
atomic lifecycle failure. PGlite executes the native renewal task/notification
SQL and proves deduplication, scoped delivery, audit rollback and revocation.
Browser component tests exercise explicit revocation, evidence wording,
sequence-bound mapping and stale-context response rejection.

`company-legal-requirements.pglite.test.ts` executes the canonical readiness and
assembly paths over real sequence/Vault/registry SQL. Its test-only
`C2C_COMPANY_REQUIREMENTS_REDPROOF=1` mutation bypasses the new helper; the same
missing-companion assertion must fail, showing that removing the gate is
detected. It changes no production code or runtime setting.

`company-legal-copy-lineage.pglite.test.ts` exercises actual registry, audit and
Vault SQL through the native approval and placement gates. It covers ancestor
revocation and invalidity, multiple generations and unregistered copied
originals, missing or conflicting provenance, tenant isolation, cycles, exact
source identity, generic refusal privacy and independent copy approval.
