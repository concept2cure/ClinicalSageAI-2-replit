# AnA source tools and drafting integration

14 October 2026; D2 continuation on local `concept2cure-v2`. This note covers the source-tools owner's registered handlers, caller integration and metadata-display fence. The contract and root evidence cover canonical policy, catalog facades, retrieval, receipts and serving hosts independently.

Existing list/read/text search/passage search handlers now take identified actor and open-project identity from server `ToolContext`. Discovery uses the actor catalog facades. Ranked retrieval receives the admitted server scope, allowing its adapters to filter SQL before ranking, counts and limits and revalidate after asynchronous work. Selected drafting sources use current actor-aware metadata and body facades and revalidate the pinned scope before returning the source set. Model/body actor IDs, accessible-program arrays and role assertions have no authority.

Read results bind the actual stored text digest and expose source availability/currentness. Historical text remains available when canonically admitted and earns no new current-source receipt. Stored legacy text can be presented without repairing an extraction catalog; it explicitly has unrecorded metadata and earns no new receipt. Retained `keep_data` text preserves the original-file-unavailable disclosure.

The read handler repeats actor-aware metadata loading after the aggregate coverage await, compares original source organization/program/document/byte identity, exact extraction digest, currentness, disposition, original availability and stored extraction status, then revalidates pinned actor scope before returning text. Delivery-dependent metadata projections are kept separate from source eligibility: a metadata-only final projection has `receiptEligible:false` even when the earlier body can legitimately defer a receipt. Actual facade/registered-handler composition controls pin that distinction.

The deferred receipt uses the exact server-loaded text length/digest, document/program identity, admitted actor and bounded UTF-16 span. Result coverage is explicitly prospective aggregate legacy byte-bound history. It does not acknowledge an INSERT, provider serving, extraction-specific durable coverage or a current-actor durable read. The existing guarded writer and host handoff supply their own checks; no receipt is inserted by the read handler.

Catalog descriptions retain their existing feature gate, governed-write role checks and final canonical writer fences. Scientific preview stays read-only and off by default. No new tool, model, provider, migration or production dependency was added.

The small step-title metadata reader was added to this owner's scope after inspection found same-org private filenames could otherwise bypass the protected tool result. Its source SQL now checks recorded organization, live parent and server-admitted programs before returning titles, runs under a short canonical executor, validates returned row identity and revalidates scope. A denied or unavailable title becomes the existing generic step label. This does not qualify every platform metadata reader.

Chat-format ID guidance now describes the identifier's store without asserting that the file exists. A source lookup that returns nothing describes the actor scope and does not assert organization-wide absence. Unexpected SQL/policy failures are safe unavailable/refusal results, not successful empty results.

## Validation

- Actual registered-handler fail-first run: eight expected failures and one positive control, in `tools-fail-first.log`.
- Step-title SQL fail-first run: three expected failures and six positive controls, in `tools-title-fail-first.log`; all nine passed after the fix. PGlite validates the SQL and test authority seam; it is sequential and has no deployed RLS claim.
- Final focused run: 953 tests across 16 files, including existing registry/gating, actual facade composition, keyless search, drafting, historical/legacy reads, executor budget and scoped metadata controls. `tools-final-results.json` and `tools-final.log` are the machine-readable result and command output. These are not 953 new scientific facts or filing qualification cases.
- Scoped TypeScript checks use repository compiler options and explicitly report only owned-target diagnostics. Imported graph diagnostics are separately counted and excluded from the local pass claim. The initial 4 GB check exhausted its heap; its output is retained in `tools-types-initial-oom.log`. The rerun uses Node 22 with an 8 GB heap, checks 23 files and writes per-file SHA hashes plus a source-unchanged check to `tools-type-source-manifest.json`.
- Scoped ESLint output is retained in `tools-lint-current.log`. Source hashes and independent held-out/real PostgreSQL evidence are consolidated by the root owner.

The tests use synthetic source/admission seams where labelled. Root-owned canonical authority, independent review and PostgreSQL cases provide the separate policy/concurrency evidence. No live provider, agency, client repair, deployment, commit or push was performed.

## Mounted step-title follow-up

The existing mounted stream step-presentation suite initially had one positive-title failure and seven passes. Inspection found both its old scope/query fixture and an actual serving caller omission: `turnToolContext` does not include actor identity, so the `resolveStepDocumentTitles` call in the streaming host needed its authenticated `guardUserId` forwarded explicitly. Root changed that small caller block; this owner changed only the test fixture to carry an explicit actor-admitted public-project DTO, scoped executor/revalidation seam and allowed-program row projection. The actor-required production reader was preserved.

All eight mounted controls then passed, including correct document titles, other-project redaction, denied scope, generic unknown-tool labels and absence of IDs in step presentation. Scoped lint on this adjacent test is clean. `tools-mounted-step-final-manifest.json` records its frozen test hash and the separate eight-test result; it does not alter the original 23-target/953-test evidence.
