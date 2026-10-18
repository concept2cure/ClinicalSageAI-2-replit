# D2 / W2 — editor draft termination

Baseline: `aad0eb124bab4e2b9bd80e3186fedfd319ab0471`. Date: 2026-10-18.
Scope: existing Authoring draft → candidate → accept. No new surface, provider,
model, dependency, schema or filing capability. Root owns production code and
Git; delegated sessions own separate named test files only.

## Authority and behavior

1. Immediately after a genuine gateway response, call `draftTurn.served` once
   and check its finishReason using the unchanged canonical classifier.
   `max_tokens`, `length`, `chunk_timeout`, including surrounding whitespace,
   are known cutoffs. Refuse before envelope parsing, drafted/answered filing,
   source/candidate construction or successful response. Return 422 with nested
   code `DRAFT_TRUNCATED`, fixed shorten/split/regenerate instructions and no
   draft, draftId or partial prose. File one failed turn retaining served
   provider/model/request/raw-answer evidence but no successful draft output.
2. Viable new candidates record the gateway's exact finish string or null and
   the derived boolean truncated in their existing server-owned generator JSON.
   Retain optional recorded fields through object/string parsing. Historical
   generators without these fields keep their old shape; no-generator stays
   null. Unknown/absent/unrecognized status is unconfirmed, not complete.
3. At actual acceptance, after server candidate consumption but before source
   reservation/attribution/content writes, reject a stored true cutoff flag OR
   canonical cutoff reason. Caller finish fields cannot override server facts.
   Use a typed error mapped to the same 422 AFTER the existing rollback succeeds.
   Preserve candidate and all saved/lineage/revision/audit/filing state on refusal.
   Preserve current uncertain-commit/rollback handling and connection eviction.
4. One small pure policy helper under existing authoring code supplies the
   assertion/error message; the finish classifier itself remains unchanged.
   Candidate store changes only optional field retention, not direct consume
   semantics or the existing saved-base/source/current-access/single-use gates.
5. Normal and unknown/null/absent reasons retain current behavior. Legacy base
   failures remain failures; this does not reopen old no-base candidates or
   attest scientific correctness. Generic save authority, quick API and nested
   cancellation remain separate increments.

## Fail-first and controls

Freeze test-file SHA256 pins before production edits. Actual HTTP/PGlite generation
cases prove the refusal, failed turn and no new candidate/section writes, including
valid-looking JSON and broken/prose outputs. Store round trips prove exact reason,
flag and legacy shape. Actual HTTP/PGlite acceptance seeds a valid-base candidate
with stored cutoff, contradicts it in the client body, and proves rollback and no
writes. Normal/unknown accept controls remain single-use. Existing client tests
prove fresh refusal creates no usable candidate, failed regeneration preserves a
prior valid candidate and edits, and assembly stops after a failed slot while
retaining completed siblings. Those existing safety controls may already pass on
baseline; they are not presented as fail-first production defects.

Run canonical targeted Vitest with Node22/one worker; scoped lint and warning
comparison; normal pre-commit/pre-push including whole-project TypeScript0.
Retain raw evidence and any unsuccessful attempts honestly. Fetch/inspect/merge
canonical changes normally, resolve conflicts and rerun affected checks. Publish
all code/tests/evidence directly to `concept2cure-v2`; no PR, force or bypass.
