# D2: extraction-bound selected drafting references

16 October 2026. Canonical assessment baseline: `990a687c6` on `concept2cure-v2`.
The lead approves this bounded interface and ownership contract under the user's continuing instruction to improve Data Room/AnA and publish all work directly to the canonical branch. This moves the source-integrity portion of D2 within existing Vault and Authoring; it does not close D2 or add a provider, model, agency route, new product surface or scientific acceptance workflow.

## Problem and client outcome

Upstream S5d already selects a relevant contiguous excerpt anywhere in a document. Original-byte hash plus text length cannot distinguish a same-length OCR/extraction correction: a saved coordinate can silently name different text. New source-linked drafts must preserve the exact extraction and excerpt originally supplied. A changed extraction must refuse a new save or rendition rather than relabel changed text as the earlier evidence. The save tool's opening-only schema must also accept the real absolute offsets the loader produces.

## Shared data contract

`shared/authoring/draft-source-reference.ts` defines type-only interfaces:

- `DraftSourceSpan`: `{ start: number; end: number; totalChars: number }`, half-open UTF-16 offsets into the original extracted string.
- `DraftSourceTextIdentityV2`: `{ version: 2; extractedTextSha256: string; spanSha256: string }`.
- `DraftSourceReferenceV2`: text identity plus `{ documentId: string; contentHash: string; span: DraftSourceSpan }`.
- `LegacyDraftSourceReference`: the historical documentId/contentHash/span shape, with no version or text-digest fields. A separate stored-reference union may be exported for the historical decoder.

`server/services/ana/draft-source-identity.ts` exports `draftSourceIdentityForText(text, span): DraftSourceTextIdentityV2`, the one deterministic factory for both producer and verifier. It validates exact integer bounds/total length and hashes UTF-8 encodings of the entire extraction and the exact `text.slice(start,end)`. SHA-256 is not a signature or proof of model use.

New input uses strictly typed safe-integer coordinates (no numeric-string coercion), explicit start, nonempty spans of at most 12,000 UTF-16 units, one to eight distinct sources, and a 48,000-unit aggregate budget. Digests and UUIDs are strictly validated and normalized; malformed/unknown versions or partly stripped identities refuse. Unknown request qualification, source text and purported authority are not retained.

## Producer, save and historical behavior

1. `loadDraftProjectSources` emits V2 for every new selected source. Bind the actor-derived extraction digest, actual text, original bytes, exact span and retained-source caveats. Snapshot IDs/context before awaits. After assembling the bounded context, recheck every selected current source through the canonical actor facade, recomputing identity from its current text internally, and repeat actor/program scope checks. A changed original/extraction or inaccessible source refuses the entire selection. This is a loader-return checkpoint, not continuous revocation or provider-delivery proof.
2. `DraftSource` includes the V2 identity. Existing batch output strips source text and retains the version/digests/absolute span without reconstruction. Audit metadata retains these fields without raw source text.
3. `parseDraftSourceReferences` is the strict NEW-write decoder and returns V2 references only. `parseDraftInput` continues to use it. Stripping version or either digest cannot invoke historical compatibility. Direct verifier calls also validate and snapshot input before awaits.
4. New saved `projectSourceReferences` groups carry `sourceReferenceVersion: 2`, existing `verification: current_at_save` and `qualification: unassessed`. Verified source entries preserve V2 and may explicitly label `identityVerification: exact_extraction_and_span`.
5. An explicit saved-only decoder supports historical unversioned groups/refs. It preserves their existing original-byte/length/current-authority checks, labels any returned verification `legacy_original_bytes_only`, and never backfills old digests from today's text. Versioned groups require complete V2; partial/unknown versions never fall back. Existing legacy/manual exports remain available under their recorded weaker semantics. Historical records and chained audits are not rewritten.
6. New saves and existing source-linked export/file-to-Vault reservations share ONE source-store reservation helper in the existing reference module: program advisory lock, then Vault document/catalog SHARE reservation, then verification, held through the existing commit/rollback. Recompute current extraction/span hashes from canonical current text. Any mismatch refuses before content or rendition receipts. Keep current actor/project/private-parent/current-version/withdrawal checks and retained eligible text behavior. No receipt ID or history grants authority.
7. `draft_authoring_document` advertises complete V2 fields and nonnegative absolute start/end/total coordinates. Runtime enforces relative width/aggregate budgets; schema must not cap an absolute end at 12,000.

## Ownership

- Lead: contract, integration, whole-tree gates, source freeze, direct commits/pushes and final evidence.
- Ingestion owner: shared type file, identity factory, `ana/draft-project-sources.ts` and its focused tests.
- Governance owner: `authoring/draft-source-references.ts`, `authoring-from-draft.ts` where necessary, existing reference/export/reservation unit tests.
- Tool owner: `ana/document-surface-tool-defs.ts`, batch receipt schema tests, existing AnA/HTTP from-draft PGlite fixtures and unrelated drafting-service type fixtures if required. Do not edit producer/governance files.
- Independent owner: separate opt-in held-out tests/evidence and baseline failing controls, no production edits.
- Lifecycle owner: separate genuine database integration and reservation race tests/evidence; no production edits without lead assignment.
- Semantics reviewer: read-only protocol/compatibility/security and final cross-file review; separate review evidence only.

Owners must not change Git history/branch, push, edit another scope, regenerate baselines, add production dependencies, call providers or touch live client/agency services. Lead integrates on the canonical branch. All authored evidence stays under this repository.

## Required evidence and limits

Observe fail-first controls for a same-length change inside the span and outside it, missing/incorrect digest/version and a V2 downgrade. Positive controls cover a window beyond character 80,000, exact Unicode UTF-16 slices, untouched V2 round trips, original-file-unavailable keep_data, and existing historical/manual compatibility. Verify wrong tenant/program/private parent, withdrawn/superseded source, final-recheck change, immutable input and absence of raw source text in receipts/provenance. Exercise actual save/export paths, commit/rollback and relevant source reservations; distinguish embedded/mocked controls from genuine PostgreSQL concurrency and runtime-role proof. Owner counts overlap combined runs.

Use existing Node 22, canonical Vitest/lint/type gates and immutable source hashes. No migrations or SQL interpolation count changes are planned. Broader multirange retrieval, structural table context, provider dispatch/replay, expert scientific decisions and agency acceptance remain separate work. Historical October 14 studies and exports retain their recorded checkpoints.

## Lead clarification after independent fail-first review

The unchanged canonical baseline produces six intended failing assertions and three passing controls in `independent-baseline-fail-first.txt`, with matching source bindings. Implementation may now proceed. The save/export store helper is `reserveDraftSourceStores(q, organizationId, programId)` in the existing reference module; new save and existing excerpt exports use it without duplicating lock logic.

Because UTF-8 encoding replaces unpaired UTF-16 surrogates, the identity factory must reject ill-formed full extraction strings and ill-formed excerpt slices rather than hash lossy replacements as exact text. A producer may move a selected window boundary inward by at most one UTF-16 unit to avoid splitting a legitimate surrogate pair, preserving original coordinates and existing budgets. It must not normalize or replace source characters. Metadata rechecks preserve or refuse changed original-file availability and disposition caveats as well as hashes. Saved-only compatibility is not tamper detection if every version/digest marker in trusted persisted provenance has been erased; no such claim is made.

Metadata minimization applies to the new V2 reference identity: it stores hashes and coordinates, not additional extraction/excerpt bodies. Existing bounded quotations in figure/claim diagnostics remain established evidence and are preserved; this work does not claim all historical provenance is quotation-free.

Final identity rechecks use a private `includeText: true` actor-facade read and the same identity factory. A metadata-only UTF-8 digest cannot distinguish a well-formed U+FFFD character from a later unpaired-surrogate replacement, so actual current text must be checked without returning an additional public source body or widening the catalog API. This does not add a provider/agency call or a dispatch acknowledgement.
