# Existing authoring re-filing and version audit

Read-only inspection on `concept2cure-v2`, starting at `30afd3bd1`.
No production/test edits, test execution, Git mutation, provider, compiler or
build. This report is an audit recommendation, not implementation evidence.

## What already exists

- `server/services/authoring/authoring-file-to-vault.ts:430` files both PDF and
  DOCX under the exact `authoring-<doc UUID>` code with a hash-suffixed version.
  It does not name a predecessor. It requires creation proof and checks source
  headers/sections before export recording, then carries approval separately.
- `server/services/vault/vault-version-checkin.ts:72` owns explicit-UUID
  check-in. It scopes the live head, follows valid successors, rejects stale or
  foreign heads and known bytes, and assigns a numeric next major. Canonical
  ingest plans before storing and repeats under the head's row lock.
- `server/services/vault/vault-version-family.ts:97` reads family membership
  through actual valid predecessor/successor links. The migration
  `migrations/20260930_vault_documents_version_lineage.sql` enforces same
  organization/program/code, a live predecessor and a single live successor.
- `migrations/20260926_vault_documents_record_immutability.sql` freezes recorded
  version labels and makes deletion a one-way tombstone; it does not release
  `(program_id, document_code, version)` uniqueness. FD1 in the Vault parity
  plan requires server-assigned sequential majors. It supplies no mapping from
  old draft/hash labels to a number.
- `authoring-file-to-vault.ts:307`, `authoring-export.ts:683` and the existing
  chained audit writer record exact source/Vault identities and rendered-byte
  hashes. Approval carryover separately records the signed sections digest.
- The existing leaf writer pins an exact UUID and content hash. The Vault
  compiler stages those bytes, and `vault-lifecycle.ts:157` rejects an old
  pinned version once a valid live successor exists. No version check-in
  updates the submission leaf to another UUID automatically.

## Findings that bound automatic authoring check-in

1. **Legacy labels have no declared numeric continuation.**
   `nextMajorVersion` (`vault-version-checkin.ts:60`) deliberately returns null
   for `draft-<sha8>` and `<source-version>-<sha8>`.
   `planCheckIn` then gives `VERSION_SCHEME_UNKNOWN` at line 160. Parsing a
   source-version prefix, treating a draft as 1.0, or relabelling old rows
   introduces a mapping not supplied by FD1. Existing immutable labels must
   remain intact.
2. **Starting every new authoring family at 1.0 needs tombstone handling.**
   Confirmed compensation leaves the admitted row tombstoned
   (`authoring-file-to-vault.ts:225`). That row still occupies the unique
   version slot. `readRecordedVersion` intentionally includes it, and the
   same-hash UPSERT may return it without reviving it; authoring correctly
   refuses reused admission. Different bytes collide with its occupied slot.
   Canonical `planCheckIn` refuses a tombstoned predecessor. An empty *live*
   head query therefore cannot safely imply that version 1.0 is free.
3. **A document code is not a proved predecessor.**
   Historical exports of one authoring document are independent roots sharing
   a code. The schema allows multiple initial roots with different labels.
   `currentVersionOfCode:197` currently chooses one by
   `ORDER BY created_at DESC LIMIT 1`; this must not become an automatic
   authoring predecessor selector or an assumption that every same-code row
   belongs to one verified successor chain.
4. **The current format action is not explicit replacement intent.**
   PDF and DOCX exports share the code. Converting every subsequent export
   into a check-in could let choosing a Word working export supersede an
   approved PDF already pinned by a live leaf. The existing compiler correctly
   blocks that old PDF as superseded and refuses DOCX as a submission PDF.
   Family/rendition and replacement intent must be specified before adopting
   that behavior.
5. **Placement must stay canonical on a real check-in.**
   `checkInArgumentRefusal` rejects caller version/folder/section overrides;
   ingest uses `inheritedPlacement`. Authoring currently places every new
   export again using its derived or requested folder. Reusing the check-in
   API while still running that placement would override the filing that the
   canonical check-in promises to retain.
6. **Only a confirmed source receipt can support source identity.**
   Filing details identify tenant, source document resource, Vault UUID,
   artifact hash, format and correlation `exportId`; `logExport` generates its
   own actual history row ID. Thus metadata `exportId` is not that row's primary
   key. `doc_sha256` is in the history row, while ordinary filing's chained
   details omit the rendered sections digest; approved carryover records it
   separately. The examined history DDL supplies no immutability proof by
   itself. A reader must not infer a governed predecessor from the most recent
   history timestamp, current editable source text or document-code text.
7. **Concurrency and leaf selection remain explicit.**
   A numeric selected head already gets the proper preview/recheck-under-lock
   and database successor guards. A first-family admission lacks a head to
   lock; any future allocator must cover simultaneous first filings and the
   gap between admission and authoring recording. A new version must leave the
   old leaf's UUID/hash untouched; explicit leaf replacement and its existing
   audit are separate actions.

## Recommended bounded correction

Prefer completing the companion byte-bound traceability work during this
increment rather than claiming that these legacy/future-family decisions are
resolved by changing one version string.

A separate, small version-lane correction is supported by current semantics:
complete `currentVersionOfCode` so a conflict offers `headDocumentId` only when
there is exactly one scoped live valid-chain head at the code. Read at most two
candidates and return no hint for ambiguity; do not choose by date. Explicit
UUID check-in remains the existing canonical behavior. This guards the
reachable `VaultDataRoomFiling.tsx:248` “add as version” remedy, which currently
uses that hinted UUID. It does not reassign old labels, create a new version
engine or claim to close the authoring re-filing TODO.

## Existing meaningful fixtures to extend if approved

- `server/services/vault/__tests__/vault-version-checkin.pglite.test.ts` executes
  the real helper over SQL. Add two independent live roots / an old fork at the
  same code and prove no arbitrary hint; preserve unique numeric-chain head,
  cross-tenant and tombstone controls.
- `server/services/vault/__tests__/vault-ingest-storage.test.ts` already proves
  when a conflict includes or omits `headDocumentId` (its SQL transaction client
  is an explicit mock). Keep this seam distinct from real SQL coverage.
- `server/routes/__tests__/vault-ingest-conflict.pglite.integration.test.ts`
  executes actual ingest conflict behavior. Add the ambiguous-code refusal
  without a prescriptive head hint, retaining original rows and bytes.
- `server/services/vault/__tests__/vault-version-checkin-race.test.ts` covers
  a declared between-query concurrency seam. Native scheduling and the
  lineage-trigger guards belong to `tests/db/vault-version-checkin.dbtest.ts`;
  no native concurrency qualification is claimed by this audit.
- `server/services/ectd/__tests__/placement-vault-leaf-parity.pglite.test.ts`
  already proves exact leaf pins, approval gates and the retained re-filing
  TODO; retain it until an actual source-identity and version-family contract
  has been implemented and qualified.

Root must approve the exact implementation/files before any of these changes.
