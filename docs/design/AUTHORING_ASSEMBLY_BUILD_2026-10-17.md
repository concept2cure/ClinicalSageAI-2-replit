# Document and section assembly in the existing editor

W1 / D2. Canonical `concept2cure-v2`; initial source `eceb747d3`.
User-authorized extension of the one DocumentWorkbench, in the full editor and
expanded AnA canvas. Local Codespaces qualification; normal direct publication.

## Outcome

One existing-editor disclosure, **Build document or section**, connects template
selection, an ordered build plan, automatic structural assembly and optional
AnA drafting. Reuse existing disclosure, form, notice, activity and review
patterns. Add no editor, CSS, provider configuration, background scheduler or
parallel document store. The existing New document action starts a working
document; assembly acts on that exact open document.

**Without AnA** deterministically appends missing template sections in template
order, with stored organization-template content where present. Built-in/global
reference outlines remain honestly empty where no prose exists. Existing text,
section identity, citations, metadata and stored order are preserved. Missing
scientific content is reported as missing, never generated or inferred. A
single-section selection assembles only that missing template section. Existing
sections are preserved; assembly does not overwrite an empty or populated row.

**With AnA** uses the same confirmed structure and exact section IDs, then
sequentially generates retained candidates for selected empty, eligible sections
through the existing section draft endpoint. Completed candidates remain
available for individual review in the SAME AuthoringAiDraft panel. Never accept
automatically. Keep edits, stated reason, refusal and candidate identity across
review switches. Existing nonempty sections remain preserved. Provider refusal,
explicit stop or context loss stops further generation; completed candidates
remain distinguishable from failed/not-started slots. Retry is explicit and
does not regenerate completed candidates. Use existing AnA oversight for the
saved result. This is automatic preparation, not approval or filing.

## Canonical server contract

Shared contract in `shared/authoring/assembly.ts`:

```ts
type AssemblySelection = { target: 'document' } | { target: 'section'; code: string };
// POST /docs/:docId/assembly/preview
type AssemblyPreviewInput = { programId: string; templateId: string; selection: AssemblySelection };
// POST /docs/:docId/assembly/commit
type AssemblyCommitInput = AssemblyPreviewInput & { fingerprint: string; reason: string };
```

Success envelopes are `{success:true,data:AssemblyPlan}` for preview and
`{success:true,data:{docId,programId,plan,sections}}` for commit. Plan is version1,
with docId/programId/templateId/selection, targetSnapshot/templateSnapshot and
fingerprint; ordered rows carry code/title/content/ordering, disposition
`append|preserve`, existingSectionId when preserved, aiDraftable,
aiDraftableReason and gaps. Commit sections carry exact id/doc_id/code/title,
content/order_index/updated_at. Use existing template roster and canonical
resolver for organization, global and built-in templates. No client-submitted
row content is trusted. Eligibility and applicability must come from the
template, with unknown eligibility refused rather than invented. Preserve
built-in template guidance and preparation/original-format restrictions.

Preview performs no writes. Commit recomputes the full plan with fresh current
project/document authority, locked parent/sections/template and immutable
built-in snapshot. Compare the parent snapshot BEFORE its canonical writable
reservation touches its timestamp. Refuse stale fingerprints, sealed/foreign
targets, module/applicability conflicts, malformed or normalized duplicate
codes, null/invalid existing indexes and INT32 append overflow. Preserve all
existing indexes; append after the maximum. Refuse every prohibited regional
filing scope using the canonical rule.

Extract the canonical transaction-owned section seed writer from
insertDocumentTx. New-document seeding, single createSection and assembly reuse
that one writer for INSERT, lineage, genesis and CREATE audit. Assembly performs
one commit; any section/evidence failure rolls back the whole batch. Current
single-section genesis/audit move inside that transaction as part of this
refactor and require rollback regression. Repeating an old fingerprint never
creates duplicates. No schema/dependency is needed.

Template resolution inside a transaction must not swallow a missing optional
schema error that aborts PostgreSQL. Use safe presence probes or savepoints.
Store the assembly/template snapshot in each new section's audit metadata;
preserve parent provenance and template identity.

## Existing AnA path, made safe for orchestration

Extract generation/decode and acceptance transport from AuthoringAiDraft into
one module; existing panel and coordinator reuse it. Public panel defaults stay
compatible. Controlled review sessions include candidate, body, reason, refusal
and exact identity; host validates exact returned section/doc before adopting.
Generate/accept use mount, auth revision, project visit, target and attempt
guards. Dirty edits block acceptance synchronously as well as in presentation.

Bind the candidate to its saved section base under the existing accept write
lock; concurrent saved changes refuse before candidate consumption. Keep
existing single-use/expiry/lineage rollback behavior. Unknown accept outcomes
require an explicit exact saved-record check, never an automatic repeat or a
claim that nothing changed. Preserve existing standalone draft behavior.

Generation must enforce current project scope when retrieving project evidence;
do not claim selected-source grounding without exact selected-source receipts.
This workflow uses the canonical current-project catalogue/Data Room/Vault
retrieval and retained evidence path. Preserve version-bound Vault source
receipts and reserve them inside acceptance after the saved-base check, before
the content update. A failed reservation rolls the whole acceptance back.
Organization reference material must remain distinguishable from project
evidence. Template guidance travels as bounded reference data, separate from
the user's requirements.

## Client ownership and recovery

Build state belongs to account/organization/project/document and mount. Hold
one synchronous preview/commit/run lane. Invalidate plans after selections or
source/target context change. Guard after every await and before later work.
Dirty work blocks assembly and review switching through the existing leave
guard; later edits must not be lost to a late completion. The exact known
parent can always be inspected; uncertain commits remain held until an explicit
fresh check. Never retry a structural write automatically. This component-owned
guard does not promise idempotency across reload, remount or tabs.

Honor the existing editor's explicit edit refusal with its exact server reason.
A permission denial and later restoration invalidate an old plan or request.
Preserve canonical mounted-target navigation, unsaved-work and ceremony guards.
If a COMMIT reply is lost, discard the uncertain connection rather than returning
it to the pool as a confirmed clean transaction.

## Evidence

File under `docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/assembly-build/`.
Retain meaningful initial failing tests, then actual PGlite transaction and
HTTP authorization tests, existing creation/lineage regression, actual
Workbench/controller/AI review tests, and bounded browser captures in existing
desktop/touch light/dark styles. Verify without-AnA mode makes no generation
request and AnA mode never auto-accepts. Capture compiler/build, unchanged
warning counts and existing editor/UI gates. Update local human cases without
marking unperformed cases passed. No live provider, human review, deployment or
regulatory-readiness claim follows from synthetic generation tests.
