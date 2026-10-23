# Complete recorded applicant identity in the existing sequence workflow

W5 / D7, MR-10 Stage 4 identity integration. Baseline `b9a48ce7136b8eecb076126d22e387d4d1b0ba84`.
Evidence: `docs/evidence/MR-10/2026-10-21-applicant-identity/`.

## What already exists

- `shared/schema/ind-master-data.ts`, `migrations/20260609_ind_master_data.sql`,
  `server/services/ind-master-data/ind-master-data-service.ts` and
  `server/routes/ind-master-data.routes.ts`: reusable, tenant-scoped sponsor
  records with name, address, DUNS and contact name/phone/email, CRUD and explicit
  audit-write outcomes. Mounted by `register-ind-lifecycle-routes.ts`, deployed
  by `scripts/db/migration-set.mjs`. No product client calls these sponsor routes.
  The route strips identity keys but does not actually run the advertised Zod
  validation. Sponsor writes currently have no required reason.
  The same registry already stores `signatory_name`/`signatory_title`, and
  `form-context-assembler.ts` maps them to authorized representative fields.
  Once bound program forms pin those recorded facts, the reached registry
  editor must expose these existing two fields too; otherwise users cannot
  complete required signatory facts through the UI.
- `docs/evidence/D7-IND-MASTER-DATA-ON-DEPLOY-PATH/README.md` explicitly names
  `ind_sponsors.duns` and its contact columns as the intended home for CAT2-02.
  The MR-10 work order's proposal to copy them into program columns predates
  this discovery. Do not create a second store for those facts.
- `shared/schema/programs.ts`: recorded application number, sponsor address
  and IND type; no sponsor-record binding. `server/routes/ind-forms.routes.ts`
  resolves UUID/code within the tenant, reads the organization as sponsor name,
  and writes address/type through `/program-facts`. It logs an audit failure
  without returning its outcome. The existing product panel
  `client/src/concept2cure/v2/surfaces/IndFormsPanel.tsx` edits those facts inside
  Submission Center; it has no DUNS/contact or registry selection yet.
- `server/services/ind-forms/form-context-assembler.ts` maps sponsor records
  into forms; IND forms/documents/filing routes already read a supplied,
  tenant-scoped sponsor ID. The program-based form path currently uses program
  facts and the organization name. Preserve a coherent recorded identity.
- `server/services/ectd/package-identity.ts`: canonical recorded identity
  reader shared by compile, export, transmit, AnA and run identity. It reads
  the program application number and organization name, and refuses their
  absence. It does not read sponsor DUNS/contact. `run-package-identity.ts`
  labels a missing/mismatched record as a dry run. Placeholder identifiers are
  legitimate only in `dryRunPackageIdentity` and clearly labelled dry runs.
- `server/routes/ectd-compile.ts`, `server/services/ectd/assemble-from-core.ts`,
  `server/services/submission-service/submission-service.ts`, and
  `server/services/ana/AnaToolExecutor.ts` still supply `UNASSIGNED-ORG-*` on
  sequence packaging paths. `package-from-core.ts` and `core-to-packager.ts`
  already share the canonical packager adapter but do not thread contacts.
- `server/services/ectd/regulatory-identifiers.ts`: canonical usable-value,
  nine-digit DUNS, six-digit FDA application number and complete regulatory
  contact checks. Reuse these rather than adding another parser.
- `server/services/submission-gateways/ectd-packager/types.ts` and
  `regional-packager.ts`: existing contact type and FDA contact serializer.
  Missing contact and unresolved telephone-number-type are honestly reported
  as conformance gaps. The telephone vocabulary and actual agency DTD assets
  are not present; no invented code or conformance claim is acceptable.
- `server/routes/submission-ops.ts` already records a reasoned, audited
  per-package identity snapshot in `c2c_submission_packages.metadata.regulatory`
  and clears stale package/preflight data on change. This is a distinct package
  spine, not a reusable sponsor registry or program binding. Do not mirror or
  silently migrate its snapshots. E*STAR establishment and supply-chain DUNS
  records are also distinct business records, not applicant registries.
- Existing governed-write/session/project guards, audit outcome helpers,
  normal migration applier and tenant sweeps must be extended in place.
  Existing DTD proof/gates and the Compile/history viewer remain authoritative.
- `server/services/submission-package-orchestrator.ts` already owns
  `AssembledPackage`, `SignedPackageSnapshot` and
  `computeBoundPayloadDigestFromComponents`;
  `server/services/ectd/signed-package-export.ts` verifies and projects that
  frozen snapshot. `signed-manifest-covers-sequence.ts` compares current leaves
  only; `release-signature-status.ts` composes that coverage with the existing
  sequence signature fallback. Extend these existing contracts to cover
  identity, preserving historical integrity verification.
- `server/services/ectd/sequence-release-signature.ts` classifies any current
  digest mismatch as invalid, while `release-signature-status.ts` intentionally
  refuses to sign over tamper evidence. The existing sequence lifecycle is
  forward-only after dispatch; `SubmissionSeqWorkspaces.tsx` exposes dispatch
  signing only while frozen. There is no reopen/renewal path. Identity-bound
  approval must complete safe renewal in these existing controls, otherwise a
  legitimate identity edit strands an unsent dispatched sequence.
- `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx` already runs the
  governed freeze/dispatch sign-and-act chain and owns the readiness refresh
  generation. Waiver/disposition refresh it; ordinary dispatch currently only
  refreshes sequence rows. An initial same-status renewal refresh concern was
  refuted by mutation: the existing sequence reload masks then remounts the
  workspace, refreshing its assessment. Preserve this working infrastructure;
  no additional production refresh is needed.

Searches covered applicant/sponsor/identity/DUNS/regulatory-contact names in
client, routes, services, AnA, shared schema, migrations and work orders;
`git log --all --diff-filter=D` for package-identity, regulatory-identity,
Applicant/applicant, Duns/duns, regulatory-contact, ind-master-data and
Sponsor/sponsor paths found no deleted replacement to restore. The existing
sponsor REST routes had no production client caller in the whole client tree.

## Scope boundary

Complete the existing registry-to-program-to-sequence connection and reach it
inside the existing forms panel. The exact binding, write receipts and caller
contracts require a focused trace before implementation. No production
dependency, new module/surface, parallel identity store or second validator.

Licensed agency acquisition remains outside this slice: the existing
`docs/runbooks/ectd-dtd-vendoring.md` requires counsel sign-off before acquisition.
Telephone vocabulary, generated agency headings/form nesting, agency-qualified
conformance and actual pilot customer facts remain open. This integration must
not claim full MR-10 Stage 4 or D7 closure.

## Approved implementation contracts

1. Add only nullable `regulatory_programs.applicant_sponsor_id UUID`, exposed
   as `applicantSponsorId`. Add a unique sponsor `(id, organization_id)` index
   and composite same-tenant FK. Register an additive, replayable migration
   after the existing master-data migration and before final tenant sweeps.
   Mirror the link in the existing schema and apply the real migration in the
   PGlite harness. DUNS/contact stay solely in `ind_sponsors`.
2. Extend existing `/api/ind-forms/program-facts`, with
   `{projectIdent, expectedFactsVersion, reason, applicationNumber?,
   applicantSponsorId?, sponsorAddress?, indType?}`. Omitted facts remain;
   null clears. Reason is 8–2000 trimmed characters. FDA application numbers
   use the canonical six-digit rule when present. Under the existing governed
   program-write authority check, lock program then selected sponsor, compare
   an exact revision, update and write the existing chained audit atomically.
   Read and receipt return `factsVersion`, all resulting recorded facts,
   `applicantSponsorId`, `boundSponsor`, and `auditTrail`; write receipt also
   has `programId`. Generate revision from the database timestamp at full
   precision in a stable UTC text representation; never round to JS Date.
   Both GET and write must use the same revision expression. Missing/stale
   revision refuses, and an audit failure rolls the program write back.
3. Reach existing sponsor CRUD, keeping raw row plus `auditTrail`. Add exact
   `revision` to sponsor reads/write receipts and require `expectedRevision`
   on HTTP PATCH; require reason on POST/PATCH. Strictly allowlist existing
   sponsor business fields, strip trusted tenant/actor keys as before, reject
   other unknown fields. Validate present name/DUNS/contact with canonical
   helpers; incomplete draft records may save, invalid nonblank values may
   not. Preserve create/update service compatibility with optional governance
   options, but all reached HTTP writes provide them. Preserve its existing
   committed-mutation plus explicit ancillary audit outcome policy; record
   reason and bounded before/after business facts. Agents/investigators stay
   unchanged. No automatic retry after an uncertain receipt.
4. Existing forms use the explicitly bound registry name as sponsor of record,
   with its contact metadata through the existing assembler. Program address
   remains the existing recorded program fact, avoiding a silent competing
   address authority. Unbound legacy form reads retain organization name.
   A broken/foreign explicit binding must not fall back to another sponsor.
5. Canonical `RecordedPackageIdentity` adds `applicantSponsorId:string|null`,
   `applicantId:string|null` (DUNS), and `contact` with nullable normalized
   `name/phone/email`. Read program, organization and bound sponsor in one
   tenant-scoped joined statement. `packageIdentityRefusal(identity, outcome,
   {fda:true})` requires explicit binding, valid DUNS, six-digit application
   number and complete contact via existing regulatory identifier helpers.
   Non-FDA callers retain existing application/name requirements. A packager
   receives an empty unknown non-FDA ID rather than an invented placeholder;
   a supplied usable non-FDA ID may retain its existing contract. FDA caller
   overrides cannot replace the recorded identity. Contacts thread through
   `BuildPackagerInputArgs`, `assembleSequence`, `PackageFromCoreParams` and
   existing FDA packager shape with type `regulatory` (the registry contact).
   Do not remove unresolved telephone type/agency conformance gaps.
6. Extend the existing FDA governed sequence digest with a versioned canonical
   recorded identity payload. The binding result exposes that exact captured
   identity to internal callers. Old FDA signatures honestly require re-signing;
   non-FDA recipe stays unchanged. Freeze/dispatch recheck under sequence,
   program and bound-sponsor locks, in that order. Export one canonical
   `lockRecordedPackageIdentity` helper to take program then sponsor share
   locks; program binding writes lock program before sponsor, and sponsor
   updates only their own row, avoiding reverse lock order.
7. Transmit obtains the signature verdict digest, then claims its existing
   send slot under the same locks, re-derives the binding and captures exactly
   the identity it checked. Only that captured identity feeds assembly. The
   assembly wrapper echoes the supplied identity snapshot. Before gateway
   entry, compare that captured proof and freshly re-derived binding with the
   authorized digest; on any movement refuse and release the pre-wire claim.
   This final checkpoint is the attempt's snapshot boundary. Later edits
   cannot alter immutable assembled bytes; no DB transaction spans network
   transmission. Refusals name changed leaves or applicant/application facts.
8. Existing orchestrator recorded FDA runs carry the same versioned identity
   snapshot through `AssembledPackage`, `SignedPackageSnapshot`, bound digest
   and `SignedExportDescriptor`. Optional absence preserves verification of
   historical snapshots, but cannot prove coverage of a current FDA sequence.
   Extend existing signed-manifest coverage, not a second release gate, to
   compare current recorded identity. An older intact snapshot without this
   proof is not labelled tampered; it simply does not cover the current FDA
   identity. Missing/mismatched run identity stays an explicit unsigned dry run.
9. Extend `IndFormsPanel` in place with application number, sponsor selection,
   required reason and a compact existing-registry editor, including its
   existing signatory name/title used by program-backed forms. Registry save and
   program binding are separate explicit actions/receipts. A newly created
   sponsor is unbound until selected and saved to the program; editing shared
   sponsor data states that every bound program uses it. Reuse existing
   session/project visit guards and `mutateVerbatim` (add PATCH to its type).
   Key the whole existing panel by owned scope, guard every late read/write,
   verify exact receipts, and hold uncertain/204/malformed/mismatched writes
   until explicit read/reconciliation. Read errors never appear as empty lists.
   Saved forms use recorded facts, never unsaved identity edits.

## Ownership and verification

- Registry worker: existing master-data routes/service, sponsor validation,
  revision projection and focused tests; no program or UI files.
- Program worker: additive migration/set/schema/PGlite harness, existing forms
  route/context assembler and focused tests; no registry-service edits.
- Core worker: canonical identity reader/locks, existing core adapter and
  assembly wrappers, run identity and real orchestrator package contact thread,
  their tests; no caller routes or main orchestrator.
- Caller worker: compile, AnA and submission-service consumers, including
  claim/final-checkpoint governance integration and focused tests; no signature
  derivation file or main orchestrator.
- Snapshot worker: main submission-package-orchestrator and existing signed
  snapshot/export/coverage/release modules, plus focused tests.
- UI worker: existing forms panel and adjacent extracted subsection, PATCH
  mutation type and focused tests; no backend files.
- Root: existing signature-persistence digest, independent review, integration,
  browser/native/build/compiler evidence and normal direct canonical publication.

Each worker records meaningful failing-first output before implementation and
green evidence under the evidence directory. No commits/pushes by workers.
Contracts may be corrected after evidence, with coordinated file ownership.
Native replay/tenant-FK/CAS checks, actual packaged XML, stale signature/snapshot
refusals, role/audit/session tests, Chromium, build and normal push gates are
required. No baselines or production dependencies change.

## Review-driven recovery completion

Independent backend review reproduced a stranded unsent FDA sequence after a
legitimate identity edit, including pre-integration dispatch signatures. Complete
the existing dispatch action for FDA sequences already dispatched with status
null/pending/rejected only. Require a fresh independent dispatch signature,
current full content/package/filing/Shadow gates, current captured identity and
an under-lock dispatch-status CAS. Preserve status, leaves and prior history;
record `reauthorized:true` and prior status on the existing chained dispatch
audit. Never permit renewal after transmitting, sent or acknowledged states.
Generic lifecycle transitions remain forward-only. The existing assessment
must expose explicit eligibility/refusal; the Builder offers “Renew dispatch
authorization” only on that server verdict, using the same sign dialog/action.

New FDA governed binding results and attributed signature manifests retain the
versioned identity snapshot and `sequenceContentDigest`, the exact old
sequence/leaf recipe. On mismatch, classify identity-only staleness as unsigned
only if current nonidentity digest matches that retained proof, the old identity
snapshot is well shaped and different, and the attributed manifest still
matches its signature hash and stored bound digest. Historical pre-integration
FDA signatures are stale (not tampered) only when their bound digest equals the
current exact legacy sequence/leaf digest and they carry no modern identity
proof. A changed leaf/sequence digest, malformed proof or bad manifest hash
remains invalid. This preserves the existing tamper refusal and sign-now rule.
Old rows are never rewritten. Root owns signature derivation/persistence and
sequence-release resolver/tests; caller worker owns backend renewal; UI worker
owns its reachable Builder affordance after wire contract coordination.
UI worker verifies the existing confirmed governed-success continuation in
`SubmissionCenter.tsx`. Its redundant proposed refresh line was removed after
the passing mutation refuted the gap; continuation/refusal regressions remain.


## Normal-gate correction and publication

The normal pre-push ownership gate refused the writer's standalone lock-only
`SELECT id` query. The existing full-facts `resolveProgramIdent` reader now
optionally applies Drizzle `FOR UPDATE OF regulatory_programs`; only the program
row is locked, preserving its nullable sponsor join. It runs before the unchanged
canonical `requireGovernedProgramWriteTx` authority check, exact revision CAS and
selected-sponsor share lock. No ownership policy, gate, baseline or exception was
added. The same 97 program/form tests, unchanged gate/selftest and lint pass.
The evidence records the refused attempt and later normal publication gates.

The full compiler then caught six static type errors. The signature writer now
reuses `GovernedBinding` members while retaining its existing caller-supplied
string basis. Renewal preserves the distinction between unknown and explicitly
null unsent status; the claim boundary represents an absent program as null.
The malformed-proof fixture explicitly crosses `unknown`. These corrections
preserve the governed contract and are followed by focused regression replays,
a rebuilt source, refreshed native pins and the unchanged normal compiler gate.
