# IND development — recorded context, relevant expertise and regional controls

D4 governed drafting, existing P-73 / D2 Authoring. User explicitly requested
implementation of the 2026-10-30 audit. Starting source `9c4085a39`; canonical
branch only. Existing P-73 owner contracts govern; no parallel IND application,
new model/provider, composition admission, database store or readiness verdict.

## What already exists

- `draft-submission-context.ts` and `program-registry-context.ts` resolve the
  recorded application. `recordedFilingDraftContext` reaches the current
  requirements resolver from the editor. Extend these rather than duplicate
  region/application inference.
- `admitAnaProjectScope`, `program-project-anchor`, active membership and
  report-project access already verify the exact canonical program/PM project.
  Product facts must use this admission before reading a charter or program.
- `regulatory_programs` owns product_type/indication; `project_charters` owns
  therapeutic_area, development_stage and target_population on integer
  projects.id plus organization_id. Workflow phase is not clinical phase.
  Multiple charters are ambiguous; do not silently pick one. Recorded facts
  remain unqualified, even when a charter says approved.
- `AnaDocumentDraftingService` owns the existing shared generation gateway;
  its private product advisory renders caller labels. The editor has a separate
  prompt builder. Reuse one advisory renderer and the existing TA/modality
  owners in both, retaining provenance and visible caller conflicts.
- `therapeutic-area-profiles/index.ts` already renders rules, references and
  clinical arrays. Extend its section/document relevance and use the existing
  currency checker for known references; unidentified or stale references are
  unresolved. No invented regulatory source or automatic legal waiver.
- `AuthoringAiDraft`, `useProgramSummary`, existing admitted document/section
  readers and saved template validation already carry the needed screen scope.
  Add exact section-region projection to that existing read if needed, not a
  new endpoint. Server generation still verifies the actual recorded template.
- Existing source windows, current-source receipts, source/manual restrictions,
  cancellation, scientific review and signed-release gates remain authoritative.
  This delivery must not present generated context as scientific evidence.
- Deleted/history searches from the audit and current owner/caller searches
  found the live implementations above. This delivery completes and reaches
  them; it creates no second drafting service or knowledge registry.

## Delivery contract

1. Read recorded product facts only for the authenticated actor's admitted
   project on the caller's SQL executor. Preserve charter identity/version and
   source field names. Missing and ambiguous facts are explicit. Recheck current
   scope and facts around generation, so a changed target cannot yield a stale
   parked draft. A database failure refuses the recorded-context read.
2. Recorded TA, modality derived by the existing product-type bridge, clinical
   stage, population and indication take precedence over declared advice.
   Conflicts remain visible and are not promoted to source evidence. Unknown
   broad product types do not become a specific modality.
3. Carry the same context and relevant TA/modality knowledge through editor,
   nested/legacy drafting and assembly entry points while preserving exact
   saved-template jurisdiction and explicit mismatch handling.
4. Fix relevant clinical guidance selection (including 2.5, M5, protocol and E3),
   protect safety-relevant material from arbitrary first-N truncation, surface
   reference currency limits and keep unrelated CMC/nonclinical content out.
5. Use one supported writing-agency map and exact admitted section/template
   context for editor defaults, including reload/mixed-template cases. Unknown
   scope requires a visible choice; never silently choose FDA.
6. Qualify actual captured gateway requests and source/context change refusals,
   all-area wiring and representative cross-region/modality cases with mocked
   model calls. These tests do not substitute for live model assessment or
   independent scientific/regulatory review.

Show behavior red before each production change. Root owns recorded context and
server generation wiring; focused workers own therapeutic selection and regional
UI/projection helpers. Serialize broad tests, compiler and warning ratchet;
retain normal commit/push gates and exact source/evidence receipts.

## Implemented behavior

- The editor and shared drafting service load product type/indication from the
  admitted program and TA/clinical stage/population from its sole charter. No
  charter and multiple charters remain distinct. Declared fallback has its own
  field origins; a broad recorded biologic cannot be sharpened by caller input.
- Current actor/project/anchor access and product/application snapshots are
  checked at generation boundaries. Editor checks also run before parking.
  Recorded-context streaming is buffered until final checks pass. An unavailable
  record refuses generation instead of supplying a default.
- Existing generator JSON retains context origins, conflicts, charter identity
  and snapshot digest, plus exact automatic-source excerpt receipts. Malformed
  modern context/excerpt audits refuse acceptance rather than erasing the rest
  of the generator, source receipts or termination status. No migration added.
- Legacy draft, stream, batch and registered-tool paths forward selected scope
  through server-owned SQL executors. Posted identity/executor fields confer no
  authority. Typed project refusals remain actionable per batch slot.
- The section read privately projects the effective saved reference's agency,
  then rechecks current access. The panel, assembly queue and receipt validator
  reuse the shared 12-agency writing vocabulary. Exact section context wins;
  unresolved/GLOBAL scope has no FDA default. Existing MHRA support is retained.
- Clinical profile guidance reaches appropriate CTD clinical locations and
  canonical protocol/CSR documents; CMC/nonclinical sections exclude those
  clinical arrays. Relevant cited references take priority over first-N order.
  Existing dated currency facts and unresolved/stale limits remain visible.
- Automatic evidence uses at most 2,400 source characters per retrieved chunk
  and 12,000 total, with separate prompt-overhead counts. Clinical windows retain
  distant methods/population/denominator/safety/limitations where selected;
  omissions and exact UTF-16 offsets/hashes remain explicit. Individual shown
  spans are the quote-check haystacks; repeated spans of one source do not count
  one generated quotation twice. Explicit assembly-source manifests are unchanged.
- Automatic Vault receipt currentness is checked before dispatch, after the
  response and before parking; acceptance still reserves current Vault/assembly
  versions in its existing transaction.

## Evidence and practical limits

Detailed red/green reports: `therapeutic-selection.md`,
`product-advisory-review.md`, `region-ui.md`, `excerpts.md`, `quote-spans.md` and
the root qualification results below. Synthetic gateway tests exercise real
requirements/admission/currentness owners where stated; they do not qualify a
model's medical or regulatory performance. No provider calls were made.

Product-currentness receipts attest generation boundaries, not a new product-fact
acceptance reservation. Existing source acceptance checks remain separate.
The 12 writing labels do not expand the saved-template source schema or establish
regional content completeness. The 25 profiles remain static advisory knowledge.
Live rules still lack complete indexed phase/modality/population conditions;
unknown applicability remains undetermined. Clinical PK/biopharm 5.3.3 remains
outside the new endpoint-array selection pending topic-level metadata.

P-73 slices 4–7 still require region-specific dated Module 1 sources, nonclinical
study/source binding, populated applicability conditions and independent
scientific/regulatory assessment. No worldwide IND-equivalent filing, SME
qualification, composition admission, readiness or agency acceptance is claimed.

## Root qualification

The test groups below overlap; they are not an aggregate case count.

| Boundary | Retained result |
| --- | --- |
| Actual editor request, recorded loader over SQL, exact template/document kind | 61/61; editor initially had four behavioral reds before wiring. Includes late product/filing/access refusal and typed read failures. |
| Automatic excerpts/current Vault version, candidate JSON round trip and source adapter | 52/52; a changed Vault version initially returned stale prose, then refused with no parked candidate. Malformed product audit initially erased generator metadata, then refused. |
| Actual accept transaction | Both new malformed-product/excerpt cases pass with 409, unchanged prior state and retained candidate, within the existing nine-case accept suite. |
| Product advisory helper and existing declared-product capture | 309/309; separate actual-service SQL/gateway capture 17/17, including three genuine streaming reds fixed by buffering. |
| Therapeutic renderer | 28/28 focused; all-area/modality traversal is wiring, not SME qualification. |
| Shared writing vocabulary and panel | 35/35; all 12 central agencies plus historical aliases, missing/retained choices and manual controls. |
| Region/assembly read, queue and receipt boundaries | 106/106 final focused; related 116/116 editor, 79/79 actual HTTP/unit and 32/32 current-read cases. These overlap. |
| Legacy draft/stream/batch/tool | 62/62 focused; real private-scope SQL fixture 39/39; related route regressions 55/55, with overlap. |
| Existing source/cancellation/leaf-requirement scaffolding | 108/108 after replacing only the newly unrelated product boundary with an explicit test-local unassessed record. Real source issuer/consumer/currentness/cancellation checks remain exercised. |
| Existing editor no-provider, structured, passage, revise and assembly-safety doors | 98 cases across seven suites; explicit-region and bounded-passage fixtures updated, without weakening provider/source/termination assertions. |
| Separate shown-span quote attribution | 31/31; duplicate same-source quotations failed before per-range/source deduplication. Distinct sources and omitted gaps retained. |
| Latest canonical CSR/source-session owners | 46/46 after clean integration of `162f2845e`; workbench edits merged without conflict. |

Scoped ESLint reports zero errors; the existing warnings remain subject to the
normal warning ratchet. Production client/server builds pass. The first compiler
run found two narrow type errors, corrected without baseline changes; the next
run reports zero errors. Normal publication gates must qualify the final merged
source again. The supplemental broad AnA run and final publication results are
recorded separately from these focused passes.

One root combined test run timed out while cold imports competed with the large
compiler/broad run; its following case inherited the unfinished mock request.
The same editor context suite passes in the final 61-case run. No timeout or
assertion was relaxed to obtain that pass. This is distinct from the intentional
red cases described above.

The supplemental whole-AnA sweep was stopped with SIGINT after more than twenty
minutes. It ran while the explicitly documented fixture corrections were being
made and has no complete final result; `ind-dev-ana-regression.txt.gz` is retained
as incomplete diagnostic output, not counted as a passing suite. The focused
changed-owner runs above are the regression evidence.

The first normal push attempt stopped at the SQL-interpolation gate: the new
assembly helper interpolated a constant optional `FOR SHARE` clause. It was
replaced with two fixed SQL statements retaining the same bound identities and
locking behavior. Its existing assembly-filing suite passes 70/70 after the fix.
No SQL/lint/typecheck baseline was expanded and no hook was bypassed. The first
rejected push log is retained separately; the subsequent normal push is the
publication gate.

The next normal push reached the warning ratchet and correctly refused five net
new warnings. Cohesive context/prompt, region presentation, passage control and
per-span quote helpers remove the introduced complexity/function/file-size
warnings. Refactor checks pass 342/342 server cases, 71/71 panel/passage cases and
31/31 quotation cases. Existing warnings and all baselines are retained. The
new `writingAgencyPresentation.ts` is an extraction of the existing panel's
display decisions, not a filing resolver or new workflow. Both rejected gate
logs are retained; only a subsequently successful normal push establishes
publication.

The later push run passed the warning ratchet (net -1) and reached the compiler,
but its process ended without a compiler or push result. It is retained as an
interrupted run and is not a passing publication receipt. New canonical CSR
changes through `6747c4470` were then merged cleanly; five focused merged-owner
suites pass 56/56. Build/compiler/publication checks are serialized from here.

Final legacy parity review found that `submissionType: ''` or whitespace skipped
the recorded filing through the direct service while the existing batch path
treated it as omitted. Two real-service cases failed before correcting only
blank-choice normalization and the conflict comparison. The resulting 19
real-service, 287 declared-product and 39 batch-context cases pass 345/345;
nonblank literal choices remain unchanged. See `blank-submission-selection.md`.

Normal gates subsequently completed for source `1fe5921e5`: the full compiler
reported zero errors against the unchanged zero baseline, all publication gates
passed, and the warning ratchet reported net -1. The remote ref advanced from
`669aa2236` to `1ce6adc68` while those checks ran, so Git correctly refused that
push without changing the remote. The passing gates and ref-race status are
retained in `normal-gates-pass-remote-race*`. The Vault upload-receipt changes
were merged normally and the client/server build passed again before retrying.
No force push or hook bypass was used.
