# Complete Authoring refiling through canonical Vault check-in

W1 / D2. Product and publication branch: `concept2cure-v2`. Evidence:
`docs/evidence/D2-AUTHORING-REFILING-VERSIONS/2026-10-23/`.

## What already exists

- `server/services/authoring/authoring-file-to-vault.ts` renders, admits,
  places and records an exact source snapshot, compensates proven admissions,
  and carries eligible approval. Its hash-labelled independent rows do not
  supersede the copy pinned by a submission leaf.
- `server/services/vault/vault-version-checkin.ts` assigns sequential major
  versions, locks and rechecks the explicit current head, refuses known bytes,
  and preserves filing. It cannot number legacy hash labels and currently
  retries an occupied numeric slot after a successor is tombstoned.
- `vault-version-family.ts` and
  `migrations/20260930_vault_documents_version_lineage.sql` define the existing
  scoped lineage and one-live-successor rules. Retained labels/bytes are
  immutable; no table, schema migration or parallel version store is needed.
- `authoring-vault-filing-receipt.ts` verifies the exact source/project/Vault
  UUID/hash through the canonical audit payload/link/seal reader. It records
  `no-key` separately from HMAC authenticity. A document code alone is not
  evidence that an uploaded row came from this source.
- `client/src/concept2cure/v2/editor/FileToVaultDialog.tsx` is shared by the
  Workbench and Canvas, validates scoped receipts, retains uncertain outcomes,
  and opens the exact admitted Vault UUID. It does not report version lineage.
- `useVaultUpload.ts` and `surfaces/Vault.tsx` already reach explicit UUID
  check-in. `placement-vault-leaf-parity.pglite.test.ts` retains the missing
  refiling regression. Existing resolvers block superseded or unapproved
  versions; a new version must never rewrite an existing sequence leaf.

- `scripts/design/generate-surface-text-ramp.mjs` already generates the
  surface-specific text overrides in `v2/styles/surface-text-ramp.css` from
  existing tinted-surface selectors. The latest incoming company preview
  styles leave that generated sheet stale; regenerate through this tool.

Searches covered refiling, supersession, check-in, version family, routes,
services, schemas/migrations, editor/surfaces and AnA writers. Exact-name and
broader `git log --all --diff-filter=D` searches found retired display helpers
and editor generations, not a competing canonical refiling engine to restore.
The 2026-10-21 refiling design explicitly retained this numbering gap; its
traceability work remains the provenance implementation used here.

## Bounded contract

1. New source renditions use `authoring-<source UUID>-pdf` or `-docx`, starting
   at `1.0` only when that scoped code has no retained rows. PDF and Word are
   separate renditions; changing format never supersedes the other format.
2. Any retained legacy `authoring-<source UUID>` row blocks automatic filing.
   Do not migrate, renumber, infer order from time/title, or choose among old
   roots. Explain that existing records require review. Likewise refuse an
   all-retired family, ambiguous heads, unknown numbering, mismatched MIME,
   absent/unverified/unavailable receipt, or a different recorded source.
3. For a unique numeric head, verify the existing receipt against its scoped
   native Vault UUID, stored hash and source UUID. Pass only its explicit UUID
   to canonical ingest. Ingest assigns the next major, locks/rechecks current
   head, preserves placement and refuses duplicate bytes. No placement writer
   is called after check-in, and an explicit conflicting folder is refused.
   Successors omit an initial classification default so confidentiality, type
   and retention continue through canonical inheritance.
4. Canonical check-in advances past retained tombstoned numeric majors under
   the same program/organization/code, rather than reusing their labels. This
   preserves history and permits recovery after compensated admission. Live
   independent roots are not silently skipped. Existing lock/recheck and
   duplicate-content rules still apply.
   The locked recheck also compares the prepared head's inherited metadata;
   a Move or details change during storage refuses rather than copying stale
   filing or confidentiality. The existing source-admission callback repeats
   the Authoring family/receipt decision at preview and commit and requires
   the same head. This catches storage interleavings; it does not serialize
   arbitrary independent-root writers after that check.
5. Return and retain server-confirmed `version` and nullable
   `supersedesDocumentId` in the existing filing receipt/export/audit. The
   dialog explains per-format versions and pinned sequence placements using
   existing controls/classes. Invalid optional lineage metadata makes a
   successful HTTP response unconfirmed; legacy response shapes remain
   readable without invented version facts.
6. Exact source recheck, withdrawal/import gates, compensation, uncertain
   commit holds, approval carryover, native identity, PDF checks and submission
   approval/current-version gates remain canonical and fail closed.

## Ownership and qualification

Backend worker: existing Vault check-in service/test, a narrow Authoring
version-plan helper/test, and existing Authoring filer. UI worker: existing
filing dialog and its focused client tests. Root: existing route response,
placement parity integration fixture, design/evidence/human guide and merged
qualification. No worker commits, global compiler/build or overlapping edits.

Retain meaningful RED before source changes. Qualify actual filing → canonical
ingest → linked successor → old leaf remains pinned and blocked, separate
formats, scoped/tampered/ambiguous/legacy refusals, compensation retry, and
unchanged receipts/bytes. Run affected editor/access/approval/placement/version
regressions, zero-baseline compiler, production build, lint warning ratchet and
normal repository publication hooks. Local fixtures are not human acceptance,
native concurrent PostgreSQL, live providers, deployment or agency transmission.

Exact bytes already retained in a compensated/tombstoned version remain refused
by the existing duplicate-content policy. Skipping reserved labels enables a
changed-byte retry; it does not restore retired bytes. All-retired families
and historical labels require review. Editable-source tests do not authorize
editing a frozen/sealed Authoring record or define its revision-copy policy.
