# Submission Center required deliverables — reviewed W1/D2 contract

Reviewed and approved for bounded W1/D2 implementation on 2026-10-14, on concept2cure-v2. The source assessment was prepared from HEAD 71444466b without SQL or test execution; findings below are not native test results. The control tower approved the production scope and shared response ABI below. Heavy test runners remain separately assigned; verification results will be filed under docs/evidence/D2-PLATFORM-COMPLETION/2026-10-14/submission-required-deliverables/.

## Bounded product result

Use the existing selected submission + sequence and canonical pathway manifest in Submission Center. The result is a current structural/content coverage view of retained, placed material. It does not approve, freeze, assemble, export, dispatch, transmit, replace the existing governed dispatch assessment, or assert complete agency compliance. No parallel WBS/progress store/app/editor is needed.

The reviewed scope includes GET /api/submissions, /:id, /:id/sequences and /sequences/:seqId/leaves as well as /sequences/:seqId/pathway-readiness, /pathway-manifest and /technical-file. Their common request reader lives in server/services/submission-service/submission-request-read.ts, rather than adding an actor argument to every background getSequence caller. Background/system caller semantics remain unchanged. Organization lists contain positively accessible anchored records and retain metadata-only unanchored records for current managers through the existing canMutateProgram policy with a null lead. This keeps the existing anchor remedy reachable. Other readers receive no hidden-row counts. Direct sequence/source reads of unanchored submissions return typed409; metadata-only direct submission reads use the same current manager exception.

## Actual source findings

- submissions.ts:1324-1374 and :1382-1402 call listLeaves then project only sectionCode/title/documentType. They do not read current content, pin or source identity, and they accept any supported query pathway without checking the recorded filing.
- submission-service.ts:626-633 and :2344-2360 use global db, organization + deletion only. listLeaves has no actor/project argument. Existing getSequence also does not prove the parent submission is live.
- current-program-access.ts:83-116 already reads active current organization actor on caller q, proves live program and one unique eligible project anchor, and reuses canonical canAccessReportProject. :121-149 issues a WeakMap-bound evaluated program scope, :57-75 checks caller/executor provenance and current scope at completion. Do not create a role allowlist or accept a caller-supplied authorized-project list.
- requestDb.ts:73-82 provides requestPgClient(req), refuses missing context and never falls back. requestConnectable preserves pinned request ownership when a transaction writer needs it. Neither leaf resolver currently accepts caller q.
- leaf-document-resolver.ts:141-275 is one canonical table-specific content/pin reading; :291-300 has compareDocumentPin, :431-473 resolves each leaf pin separately even when source reads are deduplicated. It uses global db; :368-383 catches a source lookup failure and reports missing. Do not present that legacy catch behavior as an evaluated absence in the new pane.
- Pointer resolution by itself is insufficient: coauthor whitespace may have a non-null digest; rendered_leaf_files lookup checks recorded SHA without fetching bytes; vault lookup checks content_hash/lifecycle but not bytes. unified version content != null counts even {}. Neither a digest field nor a table pointer proves substantive content.
- leaf-source-resolver.ts:620-729 already verifies Vault provider, organization, actual bytes/hash/PDF header and canonical lifecycle. :733-785 does corresponding rendered-file byte verification. The function materializes PDF/staged files and must NOT be invoked by a read-only coverage route.
- coauthor-snapshot.ts:251-299 is the canonical seal comparison, presently internal. :330-377 reads exactly reserved source sections, verifies saved-source references and workflow import release, then checks actual saved section text. :507-511 records metadata {source:'authoring-document',docId,status,sealVersion?,sealContentHash?}; c2c_document_aliases is the independent typed native-to-canonical link. New reads must not re-take/update a filing copy.
- authoring-read-scope.ts:34-54 admits identity/status only via current program + canonical decideAuthoringPermission(action:'view') before prose; :57-69 performs late object-access recheck. authoring canonical bridge :215-248 accepts supplied q and assembles exact sections. getCurrentAuthoringReadScope distinguishes full-document vs section-only visibility.
- estar-content-leaves.ts:107-141 already determines substantive device content from saved body/status/placeholder + existing 40-character floor. Unknown status currently uses length alone; that is NOT proof of approval. Prefer narrowly exporting/extracting this existing pure predicate, with tests preserving its threshold, instead of copying its lists. The new request contract additionally carries an explicit unknown lifecycle axis and never calls it approval.
- CTIS mapper :164-191, MDR assembler :383-395 and PMDA :185 currently count matching leaves without content evidence. eSTAR :462-475, PMA :204-209 and PreSTAR :241-246 require substantive. Opt-in source-aware admission must cover all ten canonical supported pathways; do not silently fix only eSTAR.
- MDR already retains exact leafIndices/titleOnlyLeafIndices. Universal manifest discards indices for sources strings; duplicate codes make any reverse lookup ambiguous.
- pathway-manifest.ts:29/49 carries undetermined/not-applicable and totals.undetermined; shared/types/submission-api.ts:238 supports only six of the ten canonical Pathway values, :470-485 omits actual states/totals. Flat projection also loses explicit not-applicable/manual-applicability/contradiction detail, although it retains engine.ready.
- editorTarget.ts:100-111/152-169 supports exact authoring docId + programId. DocumentWorkbench.tsx:2023-2034 and :2066-2071 resolve section code uniquely INSIDE that exact document and honor current program/late result/unsaved-work gates. Do not use the separate section-only title fallback (:2122 onward) for this pane.

## Reviewed request reader ABI

```ts
type SubmissionReadInput = {
  organizationId: number; userId: number;
  sequenceId: number;
  expectedProgramId?: string; // new UI always sends actual selected UUID
  expectedSubmissionId?: number; // new UI always sends selected submission id
};

readSubmissionSequenceForRequest(q: RequestSqlClient,
  actor: {organizationId:number;userId:number}, sequenceId:number,
  selection?: {expectedProgramId?:string;expectedSubmissionId?:number})
  -> Promise<AdmittedSubmissionSequence>;

readSubmissionLeavesForRequest(q: RequestSqlClient, admitted: AdmittedSubmissionSequence)
  -> Promise<SubmissionLeaf[]>;

readSubmissionLeafSourceEvidence(q: RequestSqlClient,
  input: {organizationId:number;userId:number;programId:string;projectId:number;
    sequenceId:number;submissionId:number;leaves:SubmissionLeaf[]})
  -> Promise<{leaves:SourceAwarePathwayLeaf[];sourceIssues:DeliverableSourceIssue[];
    sourceDocuments:LeafDocumentResolution[];admission:SubmissionLeafSourceAdmission}>;

requireSubmissionLeafSourceEvidenceStillCurrent(q:RequestSqlClient,
  admission:SubmissionLeafSourceAdmission) -> Promise<void>;

requireSubmissionReadStillCurrent(q: RequestSqlClient, admitted: AdmittedSubmissionSequence)
  -> Promise<void>;
```

AdmittedSubmissionSequence is an internal branded/WeakMap-bound object, tied to q/org/user/sequence; it carries actual sequence/submission IDs, recorded program/project, current actor and verified program scope. It cannot be reconstructed from JSON or HTTP. A simpler private composition that never exposes the intermediate grant is also acceptable. No exported public allowlist parameter is necessary.

Order:
1. requestPgClient(req); parse bounded positive seqId and optional expected program/submission inputs. Read current actor on q; stale token/req role never grants access.
2. Read only sequence/submission parent identity + scope/routing facts on q, with explicit organization_id on BOTH sides and deleted_at IS NULL. Read no title, leaves, source body/path or counts before parent admission.
3. Require recorded submissions.program_id; unanchored is typed409 (existing UNANCHORED_SUBMISSION meaning), not adoption of expectedProgramId. expectedProgramId/expectedSubmissionId must match actual rows; mismatch404 without other-program labels. Use requireCurrentProgramAccess/getCurrentAccessibleProgramScope(q,actual program) and canonical same-type alias equality against recorded program_type. Missing/duplicate/deleted anchors refuse; no numeric UUID coercion.
4. Only now read nondeleted leaves belonging to actual sequence + organization on q in deterministic id/section order. Lifecycle delete placements do not supply content/presence and do not cause byte reads. Keep withdrawal/disposition facts separately rather than silently treating them as evidence of a current document.
5. For every exact source pointer, read parent ID/provenance identity only first, admit its actual recorded parent and object view rights, then body/status/bytes. Conflicting recorded source vs submission program refuses; an accessible sibling cannot satisfy this submission. Do not expose sibling title/path/hash while refusing. Missing/unbound source parent stays unresolved; placement's program does not retroactively prove the source's parent.
6. Reuse canonical table key/pin/status/content and stored-source/seal functions, always with supplied q. Deduplicate only actual store reads; apply each leaf's pin separately. Pure presentation/mappers see no storage paths or prose.
7. Before any res.json: re-read sequence/submission parent facts and verify unchanged; requireProgramScopeStillCurrent for parent/source programs and requireAuthoringReadScopeStillCurrent for authoring identities. Current READ COMMITTED rechecks must see access withdrawal committed during the read; do not wrap this read in an older repeatable-read snapshot that hides revocation. Failed recheck returns safe503/no assembled metadata.

Missing request q, database error or unreadable access policy fails safely; no shared-pool retry and no success-empty result. Known absent source after admitted parent is a source evidence result; failed source verification is not the same fact. Safe public errors only, with server log detail.

## Store-specific identity / evidence reuse

| Placed table | Actual recorded parent to admit before body | Current evidence | Exact editor handoff |
| --- | --- | --- | --- |
| coauthor_documents (integer) | canonicalIdFor(q,{org,store,nativeId}) -> authoring_documents.client_program_id, verify metadata.docId agrees if present; current authoring object view | actual retained copy body hash compared with THIS leaf pin; heading-only assembled copies need actual retained/sealed saved sections proof before substantive. When claiming finalized source, reuse canonical seal integrity/fidelity; do not compare a frozen historical copy with a mutable current draft as if they were one record | Only verified canonical authoring_documents UUID. Actual section code only if one exact source section is retained; multi-section copy opens exact doc, not leaf filing code |
| c2c_document_sections (integer/bigserial) | JOIN c2c_documents (org_id + project_id actual UUID program); live parent/scope | sectionPlainText(content) body/pin, canonical existing status; an empty JSON outline, HTML-only blank/placeholder or draft is not finished content | This is NOT authoring_documents. Default no authoring docId link; a canonical recorded alias/section association would need positive verification. Existing legacy outline handoff must not infer a doc by title |
| vault_documents (UUID) | vault.documents.program_id + actual live regulatory program; follow current parent/scope policy and tenant-consistency rules | getStorageProviderFor(recorded provider).get(recorded version,org), actual SHA equals record AND pin; retained bytes existence differs from substantive scientific content. Canonical vaultVersionNotTransmittable(q) is lifecycle axis. Unsupported/unreadable format stays undetermined unless existing content reader yields verified body | sourceRef of exact Vault UUID; no authoring editor link without actual saved imported-authoring association |
| ctd_onboarding_documents (integer) | document -> ctd_onboarding_projects.project_id -> actual numeric projects/org/program anchor, with all ownership predicates | readLocalUploadBuffer only after source admission, exact bytes hash/pin; actual existing extracted/readable content may establish body, otherwise verified binary existence only | no editor ID inference |
| unified_documents (integer) | no normalized parent field in shared schema; require a canonical recorded module/source association if one exists; metadata guesses prohibited | exact latest organization-scoped workflowDocumentVersions content and existing canonical body converter; {} or pointer-only cannot presence | no editor ID inference |
| rendered_leaf_files (integer) | no normalized program field in shared schema; require an actual retained writer source association or explicitly disclose unresolved source parent | provider.get(recorded handle,org), hash/pin and byte-format verification; recorded sha256 alone insufficient. Forms requiredFieldsMissing null is unverified, not complete | no editor ID inference |

Do not create new migration/association heuristics merely to mark unsupported unbound legacy material green. Existing canonical source policies (savedDraftSourceReferences, verifySavedImportSource/verifySavedWorkflowImport) remain authoritative for actual authoring lineage; they accept caller q. A new view may state why retained records cannot establish current substantive content.

Narrow extension candidate: make the canonical table lookup in leaf-document-resolver.ts accept supplied executor and return internal content/parent evidence from ONE read; keep existing default legacy ABI for background callers. Extract reusable read-only provider/hash proof from leaf-source-resolver, without PDF rendering/staging/writes. Export/use canonical read-only seal verification from coauthor-snapshot if needed, no writer invocation or copied seal algorithm. Root must review exact extraction ownership before editing these helpers.

## Reviewed shared response shape

Keep existing manifest fields and sources display labels for compatibility. Add typed sourceRefs and evidence; all identities originate from matched leaf objects/indices, not reconstruction of source strings.

```ts
type DeliverableSourceRef = {
  leafId: number; sequenceId: number; submissionId: number;
  programId: string; projectId: number; label?:string;
  document: { table: PlaceableDocumentTable; keyKind:'integer'; id:number }
          | { table:'vault_documents'; keyKind:'uuid'; id:string }
          | null;
  section: { id:string; code:string|null } | null; // ACTUAL source identity only
  editor: { kind:'authoring-document'; documentId:string;
    programId:string; sectionCode:string|null } | null;
  evidence: { content:'substantive'|'non-substantive'|'undetermined';
    pin:'match'|'mismatch'|'unpinned'|'unverifiable';
    lifecycle:'finalized'|'draft'|'unverified'|'not-applicable';
    reasonCode:string|null };
};
```

No source body, storage reference, invented author/model/approval/confidence or arbitrary public error text in this envelope. sourceRef.programId/projectId identify the verified retained-placement container, not proof of an unknown source origin. The source's actual parent is independently admitted before content; an unbound source keeps SOURCE_PARENT_UNVERIFIED with no guessed parent, label or editor association. editor:null is an honest reference without a button. `sectionCode` must never substitute leaf.sectionCode (a filing location) for the actual source section code.

Add response.scope {organizationId,programId,projectId,programCode?:string,programTitle?:string,submissionId,sequenceId,sequenceRegion,recordedApplicationType,recordedPathway:string|null,evaluatedPathway,memberStates:string[],regulation:'mdr'|'ivdr'|null,inputOrigin:'recorded'|'explicit-compatible',evaluation:'retained-placement-content-coverage',dispatchReadiness:'separate-governed-assessment'}. Programme/source labels are actual retained values read on q after admission and included in late verification, not shell labels or identity substitutes. memberStates is the exact validated/deduplicated/canonical ordered set actually evaluated, never a UI label; ISO GR stays GR, without an inferred GR-to-EL source rewrite. The UI must compare all selected scope/framework/state values before rendering; neither sequence number nor title supplies identity. Local request/session revision belongs to the UI's existing late-result guard, not an authorization claim. A pin-change remains the evidence.pin mismatch with a specific source issue even when its required slot is undetermined; do not collapse it into ordinary structural missing or approval state.

Preserve all ten existing server pathways in shared types. Do not add a Health Canada technical-file/transport capability: canonical PATHWAYS contains none. Use existing registry alias resolution/format/market facts for requested pathway compatibility; explicit query selection is permitted only when compatible with the actual filing, never because PATHWAYS includes it. Where recorded submission_regions.pathway conflicts with canonical application/regional facts, report typed409 instead of choosing the friendlier source. seq.type is lifecycle operation, NOT submission filing type.

Applicability facts: read recorded deviceFlags via pure deviceFlagsFromMetadata on q-read program metadata (avoid global loadProgramDeviceFlags); missing metadata array means unknown, empty array means explicitly answered none. Preserve actual IVDR/IVD variant only from recorded product facts. No default false flags. CTIS memberStates are validated explicit scope inputs; no state assignment from titles. No recorded CTIS NA, Q-Sub subtype, PMA supplement subtype or PMDA clinical answer was found in the examined submission schema: do not mint one from seq.type/default. Return unanswered input reason/undetermined or existing canonical refusal. Retained recorded authoritative inputs may be added only after locating their real writer/reader.

For source-aware assessment use optional leaf.sourceRef + contentEvidence (opt-in caller flag if needed), propagated by each mapper from exact matching objects. A matched source with unknown/mismatched/unpinned verification is undetermined with reason; verified empty/placeholder/draft is non-substantive. Slot applicability remains separate: known not-applicable stays not-applicable; absence of an answer remains undetermined; conditional manual-check detail must not be relabeled required or waived. Content alone never supplies the answer. Required-present counts only positively admitted substantive sources; ready false for required content undetermined and existing contradictions. Preserve canonical engine match rules/authority/registries, especially MDR titleOnlyLeafIndices and exact indices; do not rebuild slot taxonomy in a route/UI.

## Approved production ownership

1. NEW server/services/submission-service/submission-request-read.ts: actual request parent/source admission and late current checks. Keep background getSequence/listLeaves ABI unchanged.
2. server/routes/submissions.ts: the seven existing selector/Builder/manifest read routes + safe typed refusal handling/query validation. Adjacent create/write/sign/export/assemble remain canonical and unchanged in this increment. No private-row notOffered count is returned.
3. server/services/ectd/leaf-document-resolver.ts: supplied executor/read-only evidence extension; preserve default behavior for existing gate callers. Shared content/seal/provider extraction only after parent approves exact files.
4. server/services/pathway-engines/index.ts + pathway-manifest.ts + technical-file-manifest.ts and existing six mapper files: typed stable matched sourceRefs/contentEvidence, opt-in truthful states; no parallel matcher lists/new agency claims.
5. shared/types/submission-api.ts (and narrow shared source type module if imports would otherwise cross into server): exact server status/pathway/evidence/scope contract.
6. UI owner: existing SubmissionCenter.tsx, SubmissionSeqWorkspaces.tsx and one sibling required-deliverables renderer; existing editorTarget exact document handoff, no title fallback. Follow published REGULATED_WORKFLOW_UI_CONTINUITY.md and native v2 visual patterns/dirty/stale guards.

## Meaningful verification plan (results filed separately)

- Real authenticated native app_service NOSUPERUSER/NOBYPASSRLS + FORCE RLS; seed unique synthetic tenant/program/private/public/sequence/leaf rows, no history delete/grant/trigger disable. Observe actual request q/backend identity; missing req.dbClient must refuse, not hit global pool.
- Genuine owner/explicit member/reviewer/manager controls through existing sharing policy; same-org unassigned private sequence denied before leaves/source metadata. Foreign seq/sub/program and duplicate/missing anchor controls. Valid selected expectedProgramId vs different selected program/submission refuses before metadata, same exact record succeeds.
- Deferred actual parent identity read/source metadata barrier with separate committed sharing withdrawal or actor disable/demotion; late current recheck refuses complete assembled pane with no private title/code/source hash. Must prove committed change/actual barrier, not mock token role.
- Actual persisted source body + canonical pin gives presence; title-only no pointer, empty outline {}, HTML-only/whitespace, known placeholder, long draft/review, null pin, stale per-leaf pin, unknown lifecycle and unavailable bytes do not yield substantive. Two leaves of one doc with different pins prove dedupe cannot share verdict.
- Real storage retained bytes hash mismatch/recorded SHA only/unreadable body; receipt of binary alone is separately disclosed. Actual finalized filing copy seal positive; missing/corrupt/changed seal and heading-only sealed sections negative; no writer or stage directory side effects.
- Same-code different MDR leaves preserve exact leaf identity/leafIndices; private sibling source cannot satisfy public selected sequence and must never disclose sibling source labels. Exact canonical coauthor alias+metadata agrees; conflicting/missing alias retains no guessed editor link. Provenance pointer alone is not original content/approval proof.
- CTIS state DE cannot satisfy FR; unanswered applicability, explicit valid NA, conditional check detail and required row unwaivable. eSTAR false flag + actual contradictory substantive content remains not-ready; unknown flag remains undetermined. Unknown Q-Sub subtype, PMA supplemental type, PMDA clinical requirement cannot silently default.
- Real recorded application/pathway incompatible query rejected; submission-type aliases normalize consistently; seq.type='amendment' is not filing framework. Canonical dispatch readiness/sign/freeze/assemble behavior remains unchanged.
- Native UI safe empty/error/undetermined distinction, exact stored doc/section handoff, no title match, unsaved-work gate, late programme/sequence/framework/member-state suppression. Desktop/mobile light/dark after green source/gates.

Focused existing coverage to preserve: server/services/pathway-engines/__tests__/dispatcher.test.ts, pathway-manifest.test.ts, technical-file-manifest.test.ts and mapper suites; server/services/ectd/__tests__/leaf-document-resolver.pglite.test.ts plus source-resolver/dispatch-readiness tests; submission-service/__tests__/leaf-source-pin.test.ts, leaf-source-tenancy.pglite.test.ts; routes/__tests__/submissions-program-anchor.test.ts, submissions-list-program-scope.test.ts, submission-readiness.test.ts, submissions-dispatch-readiness-signer.test.ts; client tests submissionCenterHonesty/ProgramAnchor/OpensOnSequence/BuilderSourceDocument/editorTarget and exact-source handoff tests. Test presence/gates must include any new actual .dbtest.ts suite.

## Explicit adjacent limits

The approved reader adoption includes the ordinary submission selectors and Builder leaves identified above. Existing anchor-candidate/mutation, technical-file assemble/export and governed signature/dispatch writers retain their current paths; this increment does not establish their complete privacy or content-readiness posture. Those writes require separately reviewed ownership and verification.

This increment adds no schema, no dependency, no progress adoption, no source rewrite, no retained-history repair and no new assurance model. Verification completion must be evidenced separately rather than inferred from this plan.
