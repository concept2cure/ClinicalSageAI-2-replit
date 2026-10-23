# Existing authoring filing traceability evidence

W1 / D2; canonical `concept2cure-v2`; local/Codespaces only.

## What already exists

`FileToVaultDialog.tsx` and its two existing editor hosts already confirm scoped
Vault receipts and hold uncertain outcomes. The existing Vault and placement
dialog carry the same admitted UUID into a submission leaf. `90043b5ea` retains
616-pass combined qualification for that previous increment; those counts are
historical, not results for this work.

`authoring-file-to-vault.ts` already records the source document, Vault UUID,
artifact hash and export history after exact source checks; canonical ingest,
check-in, version-family and lineage guards already own Vault version identity.
The authoring filer still uses hash-suffixed labels without a predecessor.
FD1 requires server-assigned sequential majors and write-once version labels.

`leaf-source-resolver.ts` already attaches co-author lineage and validates Vault
bytes and approval. Its Vault branch lacks the authoring lineage that the
existing placement parity fixture records as a gap. Existing source-evidence,
manifest, export ledger and carryover services must be reused where qualified.

Code/schema/route/AnA/design and deleted-history searches found no retired
competing canonical authoring/Vault lineage service to restore. Legacy version
helper deletions do not justify rebuilding the current check-in engine. See
the [discovery contract](../../../design/AUTHORING_REFILING_TRACEABILITY_2026-10-21.md)
for paths, current limitations and read-only audit ownership.

The alias map already admits Vault aliases but its unique representation rule
must not be stretched into per-version derivation. Existing `audit/chain-row.ts`
and Vault history readers already verify payload, chain links and HMAC seals;
reuse them for an audited receipt, keeping alias identity separate.

The version audit found a bounded correction: `currentVersionOfCode` selects by
date even when multiple live roots share a code. Its existing Data Room hint
will be offered only for exactly one scoped head. This does not invent legacy
numbering or change explicit UUID check-in. Its actual ingest no-hint mapping
will be proved in the existing real PGlite parity fixture, because the separate
ingest-conflict fixture only extracts shipped SQL.

The traceability contract now approves a read-only projection of the existing
filing receipt through canonical payload/link/seal verification, matched to the
exact staged Vault UUID/project/hash. Optional staged/governance `derivation`
remains separate from alias identity and explicitly states recorded, absent,
unverified or unavailable provenance. Future filing payloads add the existing
sections digest and captured version; absent historic values remain unknown.
No current body, title/date ordering, approval or substantive-content inference
is permitted. See `trace-audit.md` and the appended design for exact ownership.

## Implemented outcome

Future editor filings retain the captured source version and sections digest
in the existing chained receipt. After the existing resolver verifies the
retained Vault bytes, the existing package governance artifact carries a
separate `derivation` with source UUID, recorded version/digest when available,
exact Vault UUID/program/artifact hash, receipt correlation, and explicit
canonical link/seal verdict. Alias identity remains independent. No current
source body is read to manufacture historical facts.

Native uploads without a filing receipt state `not-recorded`. Malformed,
ambiguous, tampered, scope/hash-mismatched or unsequenced receipts state
`unverified`; missing storage or failed reads state `unavailable`. Configured-key
seals must verify. `no-key` explicitly lacks HMAC authenticity. These states do
not replace source-format, substantive-content, approval or current-version
gates. Derivation stays outside the agency backbone.

The existing conflict remedy now suggests a Vault version only when the scoped
code has exactly one live valid-chain head. It does not choose among independent
roots by creation date. Actual ingest/SQL qualification verifies that admitted
rows/bytes remain intact and only the rejected candidate object is cleaned up.
Explicit UUID check-in and existing UI actions retain their existing rules.

## Qualification and integration

The packet began on 2026-10-21 and resumed on 2026-10-23. Historical receipts
retain their original inputs; they are not represented as current integrated
qualification. `resume-integration.json` records the 419-commit canonical
fast-forward and clean reapplication of the preserved task patch. All work
remains directly on `concept2cure-v2`; there is no PR or deployment.

- Historical meaningful RED: version helper 3 failures; actual filing/staging
  derivation 2 failures; actual governance projection 1 failure. The initial
  governance harness setup failure is retained separately, not called feature
  proof. See `version/README.md` and `trace/README.md`.
- Fresh actual-ingest RED against the incoming unchanged helper: 1 failure
  because an ambiguous same-code conflict still suggested a head. See
  `ingest-hint-red.json` and its compressed raw output.
- `merged-regressions.json`: **849 passed across 62 suites, one retained TODO**,
  exit 0, source pins unchanged. Includes incoming Vault lifecycle/withdrawal
  and regional applicant-identity changes in shared assembly paths.
- `qualified-focused-green.json`: **56 passed across four suites, the same TODO**,
  exit 0 on final source pins. These overlap the combined run; counts are not
  additive. The only subsequent production delta is equivalent TypeScript row
  typing; `release-delta.json` verifies identical emitted runtime output. The
  final parity assertion compares editable hashes before/after the actual edit.
  The new receipt fixture also validates record-shaped rows at its initially
  unknown-typed database harness boundary.
- The initial compiler run (`typecheck.json`) found 14 type errors at calls
  from the new receipt fixture's unknown-row adapter. The adapter now checks
  record shape before passing rows to the reader; production typing and the
  zero baseline are unchanged. Its final rerun is `typecheck-final.json`.
- `qualified-warning-ratchet.json`: zero net warning growth. The initial +1
  resolver file-length warning and its failed receipt remain retained; the
  baseline was not changed. `qualified-lint-summary.json` records 10 files,
  zero errors and six existing warnings.
- `typecheck-final.json`: compiler completed with **zero errors**, unchanged
  zero baseline. `build.json`: production build passed. All **16 safety gates**
  passed, including single-editor/canvas/design/token, gateway/SQL, migration
  ordering/reachability/drop-safety and the current downward-only repository
  size ceilings (56 files over the byte threshold, 114 over the line threshold). See
  `qualification-summary.json` for exact receipt labels and source freezes.

Each deterministic receipt retains actual argv, UTC timing, exit status,
before/after source pins, compressed raw output and its SHA-256. Final checks
use `release-qualified-source-freeze.json`; the earlier focused/initial compiler
checks retain `release-source-freeze.json`, and combined checks retain
`source-freeze.json`. `integrated-review.md` records two independent read-only
reviews and the resolved correlation/hash-policy clarifications.

## Limits and human handoff

This is W1 / D2 progress, not all-product launch acceptance. The
[local/Codespaces guide](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
has **61 sequential cases, all Not run**, including cases 59–61 for this work.
The existing editor and established UI interactions are preserved.

Historical hash-labelled authoring versions still require an explicit migration
and replacement policy before automatic re-filing can safely supersede them.
No version labels are rewritten, no predecessor is guessed, and the existing
supersession TODO remains open. A sections digest is not a full document-header
snapshot; `exportCorrelationId` is not an export-history row ID. The reader
verifies one canonical audit link, not a whole-chain walk. Receipt-bound input
SHA-256 does not describe normalized shipped PDF/A leaf bytes.

Real PGlite SQL and canonical services are exercised with declared in-memory
storage and PDF-engine seams. No native multi-connection concurrency, faithful
Chromium rendering, provider connectivity, human acceptance, package suitability
for every regional filing, or agency transmission is claimed. No provider calls
or deployment were performed. Runtime network-policy readiness was reported
unknown on resume; the local policy snapshot and successful Git fetch do not
establish provider readiness.
