# Saved-record review database checks

W1 / D2 continuation against canonical branch `concept2cure-v2`, base `87b27c89`.
Contract: [EDITOR_SAVED_REVIEW_CONTINUATION_2026-10-14.md](../../../../design/EDITOR_SAVED_REVIEW_CONTINUATION_2026-10-14.md).

The new `server/services/ana/__tests__/saved-document-critique.pglite.test.ts`
executes `critiqueSavedDocument` on PGlite. Its injected tenant connection
replaces database checkout only: project admission, program access,
whole-document permissions, saved-content rendering, citation policy SQL and
the deterministic writing engine are real. There is no provider request.

The **40 passing checks** cover:

- Conflicting subject counts across actual saved sections, exact ordered
  section identities and one repeatable-read transaction with no write SQL.
- Current project and document-grant revocation, whole-document versus
  section-only grants, persisted email-only grants, other and foreign
  programs, and missing trusted conversation scope.
- Read access to frozen documents; pending insertion text excluded and
  pending deletion text retained in the accepted record; outstanding changes
  produce a review requirement.
- Complete bounded paging over 48 sections with escaped headings, unchanged
  totals and snapshot identity, and rejection of content/title changes,
  permission revocation and invalid or unversioned cursors.
- Exact-section registered citation resolution; refusal to borrow a sibling
  association for a pasted marker; current `remove_data` / `supersede`, deleted
  source and removed association findings; withdrawal between review pages;
  eligible historical citations retained; other-program and unprintable
  sources unresolved.
- Empty documents, malformed section metadata, more than 512 sections and
  over 8 MiB of UTF-8 content return no document score or verdict. Oversized
  bodies are refused before their content is selected. Caller prose cannot
  replace a saved-document input.

The resource limits are review limits, not evidence of production capacity.
The fixture does not qualify live RLS, concurrent connections or writers,
deployment latency, model narration, or scientific evidence sufficiency.
The root-owned handler/schema regression checks record the original failing
tool contract separately; this suite was first executed after the new module
existed, and no missing-import failure is counted as a regression.

## Pre-enable workload measurement

One measured deterministic calculation after fixture setup and module import:

| Sections | Accepted characters | Elapsed milliseconds | Serialized characters | Page-item total |
| --- | --- | --- | --- | --- |
| 96 | 187,392 | 79.67 | 4,926 | 96 |

Each section holds about 1,952 accepted prose characters. The measurement
includes actual authorization and section SQL, complete deterministic
calculation, snapshot digest and first-page serialization. It excludes fixture
creation and provider calls. The check asserts coverage and the 5,000-character
tool budget; it imposes no timing threshold and makes no production latency
claim.

## Validation

- `vitest run server/services/ana/__tests__/saved-document-critique.pglite.test.ts`:
  **40/40 passed**, 8.64 seconds.
- Strict ESLint of that file with `--max-warnings 0`: **passed, zero warnings**.
- Workspace log: `/workspace/scratch/saved-document-critique-pglite-final.log`;
  benchmark is emitted as `saved-document-critique-benchmark` structured data.

This test slice adds no editor, route, provider, model, dependency, table or
production implementation. The fixture tables exist only in the isolated
PGlite process.
