# Triage group: protocol-history
Returned by the read-only re-check of 2026-09-28 (as returned; scratch paths redacted).

## P11-C-3 — OPEN — medium

### evidence

Read at HEAD 60b0563f (2026-09-28T16:57Z). The defect is unchanged. Nothing merged since 7087f46e2 puts a protocol's history in front of its author or reviewer.

CLIENT
- The ready-made panel is still mounted nowhere. `ProtocolGov.tsx:155` (`export function AuditTrail`) is only referenced by its own window bridge (`:278`). Its row shape (`:26-32`: actor, action, when, audit, hash) has no reason, meaning or record.
- The workspace still has 16 tabs and none of them is history (`ProtocolDevWorkspace.tsx:41-73`).
- The save toast still sends the user to a trail the surface cannot open: `ProtocolDevWorkspace.tsx:413` `'Section saved — the revision is in the audit trail.'`
- P11-C-2 (`fb69b716`) added the §11.50 manifestation: the header `SignatureLine` (`:138`), the review-row signature, and `doc.finalization` (`pdev-view-assembler.ts:585`). That is who signed, not a history.

SERVER READ MODEL
- `assembleOrgPdevDocs` has no history. Its SELECT (`pdev-view-assembler.ts:391`) has no `finalized_*` columns, the returned object (`:543-599`) has no versions or history key, and the risk and review SELECTs (`:415`, `:426`) still omit `created_by` and `created_at`.
- `protocol_versions` has two readers, and neither reaches a person on the surface:
  - `getProtocolDocument` (`protocol-development-service.ts:418-430`) serves `GET /api/protocol-development/documents/:id` (`protocol-development.ts:205`), which no client calls.
  - `readSnapshot` (`protocol-industry-service.ts:257-270`), added by `7f82872d` (…01M8bGFS), serves `GET /documents/:id/redline` (`protocol-development.ts:345`). No client calls it either. It is also used by the AnA tool `review_protocol_redline` (`AnaToolExecutor.ts:21014`). That tool is the only partial reach, and only if the user already knows both version labels: no AnA tool or route lists the versions.
- No AnA tool reads the ledger for a protocol.
- The tenant-wide ledger is unchanged:
  - owner, admin or manager only (`audit-trail-ledger.routes.ts:485`)
  - default limit 200 (`:489`)
  - no target filter; `AdminSurfaces.tsx:1030` fetches it unfiltered
- `GET /api/part11/signatures/by-target` (`part11-compliance.ts:373`) exists and has no client caller.

WHAT THE SERVER ALREADY STORES
1. The ledger. Every protocol write goes through `recordGovernedAction` (`c2c/actions.ts:341-431`), in the write's own transaction. It writes:
   - `audit_logs` with `table_name` = the target type and `record_id` = the id (`:375-399`), plus `ana_action_id`, the chain hash and the reason. It writes no `new_values` and no `ip_address`.
   - `c2c_ana_actions` with `target`, `command`, the jsonb `payload` (sign rows carry `meaning` and `protocolVersion`: `protocol-signature.ts:180`) and `audit_row_id`.
   - The index `idx_audit_table_record(table_name, record_id)` exists.
   - The targets in use (routes plus AnA):
     - protocol-document:<id>
     - protocol-section
     - protocol-visit
     - protocol-soa-assessment
     - protocol-risk
     - protocol-milestone
     - protocol-amendment
     - protocol-deviation
     - protocol-capa
     - protocol-review-assignment
     - protocol-review-comment
   - Design-derivation apply is logged against `study-design:<id>` (`protocol-development.ts:366`), not against the protocol.
2. `protocol_versions`: `(version, change_summary, snapshot text, created_by, created_at)`.
   - The snapshot is `{version, sections:[section_key,title,content,status,order_index]}` only (`protocol-development-service.ts:376-381` snapshotVersionTx; `:396-401` finalize).
   - In practice it holds only finalize rows: no client calls `POST /documents/:id/versions` (`protocol-development.ts:510`).
   - Section saves overwrite in place (`protocol-development-service.ts:240`), and their ledger payload is `{status}` only (`protocol-development.ts:397`). So history can show who, when and why, but not the earlier text.
3. `electronic_signatures`, already read for protocol targets by `readSignatureFacets` (`protocol-signature-manifestation.ts:59-96`).

THE SHARED READER
- `readRecordAuditHistory` (`audit-trail-ledger.routes.ts:430`, SQL `:400-424`) takes ONE `(table_name, record_id)` pair. Its only caller is Vault (`project-vault.ts:1530`).
- It would render a protocol row's event as "C2c Work Update" (`humanizeEventType` `:131`), because these rows carry no `new_values`.

FILES OTHER LANES CHANGED TODAY
- …01M8bGFS (Protocol build lane):
  - `ProtocolDevIndustryProjections.ts`: 7f82872d, 10206e13, cb7be0cc, a8f1fddb, 7a3d8e4d, 05286bf0
  - `ProtocolDevPlanningProjections.ts` (new) and `projectionFormat.ts`: 05286bf0
  - `ProtocolDevProjections.tsx`: 7f82872d
  - `server/routes/protocol-development.ts` (+spirit and redline GETs), `protocol-deviations.ts`, `protocol-redline.ts` (new): 7f82872d
  - `protocol-industry-service.ts`: all six commits
  - 79088392 touched only the `study-design/trial-schema*` files.
  - b7f4dbb9 (protocol export/docx) is a net-zero withdrawal of its own side-branch addition.
- …01KiDof7:
  - 780a0639 (05:02:45Z): `ProtocolDevWorkspace.tsx` and `ProtocolDevReviews.tsx`
  - 9d2134b5 (04:33:27Z): `protocol-development.ts`, `protocol-budget.ts`, `protocol-deviations.ts`, `protocol-reviews.ts`, `protocol-risks.ts`, `protocol-soa.ts`
- …01PwLFr8, 53237f62 (11:44:44Z): `audit-trail-ledger.routes.ts`, `part11-compliance.ts`, `Vault.tsx`, `AdminSurfaces.tsx`. These are not ProtocolDev files, but the fix needs the first and the third.
- Merge 20394617 (05:26Z) resolved a conflict in `ProtocolDevReviews.tsx`. It has no session trailer.
- The board (`docs/work-orders/README.md:86`) says further editor-family work must be claimed first, because 01KiDof7 works in these files.

### proposedFix

Smallest honest fix: one read route, one service and one tab. No schema change.

SERVER

1. **The shared reader: `readRecordAuditHistory`** (`audit-trail-ledger.routes.ts:430`). This file is held by 01PwLFr8 until 2026-09-29T11:44:44Z.
   - Accept `records: ReadonlyArray<{tableName, recordId}>`. The Vault call at `project-vault.ts:1530` becomes a one-element list.
   - In `RECORD_HISTORY_SQL`, replace `a.table_name=$2 AND a.record_id=$3` with `JOIN unnest($2::text[],$3::text[]) r(table_name,record_id) ON a.table_name=r.table_name AND a.record_id=r.record_id`.
   - Add `LEFT JOIN c2c_ana_actions x ON x.id=a.ana_action_id AND x.org_id=a.tenant_id`. Select `x.command` and `x.payload`, and map `meaning` from `x.payload->>'meaning'` when `new_values` has none.
   - Return `truncated = data.length === limit`.
   - Interim that touches no held file: call the current reader once per pair, passing a memoized verifier as its 4th argument so the chain is verified once. It is correct but costs N indexed queries.

2. **New service `server/services/protocol-development/protocol-history.ts`: `readProtocolHistory(client, orgId, docId, {limit})`.**
   - (a) Check `SELECT id FROM protocol_documents WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`. No row returns null, which the route turns into 404.
   - (b) Enumerate exact pairs, and do NOT filter `deleted_at`: a removed visit or assessment must keep its history.
     - `protocol-document:<id>`
     - sections → `protocol-section`
     - visits → `protocol-visit`
     - `protocol_soa_assessments` → `protocol-soa-assessment`
     - risks, milestones, amendments, deviations → their own prefixes
     - `protocol_capa_actions` joined to deviations → `protocol-capa`
     - review assignments and review comments → their own prefixes
     - Label each pair (section title, visit name, and so on) and flag it `removed`.
     - A 42P01 on an optional table (`protocol_amendments` is install-fresh only) is reported in `notCovered`, never silently dropped.
     - Never use `LIKE 'protocol-document:<id>%'`: id 2 would also match 20 and 200.
   - (c) Read the ledger through the shared reader.
   - (d) Read `protocol_versions`: `pv.id, version, change_summary, created_at`, with `created_by` resolved to `users.name`, newest first. Add a fixed `holds:'sections'`.
   - (e) Attach signer, meaning and time to sign rows from `readSignatureFacets` (`signer_name` as recorded at signing, never re-resolved).
   - (f) Label events with a pure `protocolEventLabel(command, targetType)`.
   - Response: `{entries, chain, versions, truncated, limit, notCovered}`.

3. **Route `GET /api/protocol-dev/:id/history` in `server/routes/protocol-dev.routes.ts`.** This file is cold and already mounted with `authMiddleware` (`register-inline-routes.ts:1017`). Keep it off `protocol-development.ts`, which is held by 01M8bGFS and 01KiDof7.
   - Org from the session, else 403. Integer id, else 404.
   - `BEGIN` and `setTenantContextTx` on a pool client, then `COMMIT`, as in the Vault route (`project-vault.ts:1505-1547`).
   - 404 before any ledger read when the protocol is not this org's.
   - Failure returns 500 or 503 `HISTORY_UNAVAILABLE`, "Nothing is shown rather than an incomplete history". Do not copy this router's 42P01→`data:[]` branch (`:41-43`).
   - No `requireAuditReader`: this follows the Vault per-record precedent, where anyone who can read the record reads its trail (§11.10(e)). The tenant-wide ledger stays admin-only.
   - Omit `ip` from the payload.

CLIENT

4. **New `client/src/concept2cure/v2/surfaces/ProtocolDevHistory.tsx`.**
   - `useLiveData` (`dataConnect.tsx`) with a shape guard. A body without an entries array and a chain object is a failed read.
   - Fetch lazily, when the tab opens.
   - Render: the chain verdict; entries through `PG.AuditTrail`, extended in `ProtocolGov.tsx` (cold) with optional reason, meaning, record label and removed flag; the versions list (v1.0 · Finalized · name · UTC).
   - State plainly:
     - "A version records the section text only. The schedule of assessments, objectives, eligibility, cover page and team are not stored in versions."
     - "Section saves record who, when and why, not the earlier text."
     - When truncated: "showing the newest N; older entries exist".
     - The `notCovered` targets: design-derivation applies are in the study design's history, and consent and IRB records have their own.

5. **`ProtocolDevWorkspace.tsx`.** This file is held by 01KiDof7 until 2026-09-29T05:02:45Z.
   - Append `{id:'history', label:'History', icon:'history'}` to `TABS` (`:41-73`). The `history` icon exists at `icons.tsx:239`, and the tablist at `:317` gives it keyboard support for free.
   - Add `case 'history'` to `TabBody` (`:270`).
   - Change the toast at `:413` to name the History tab.

6. **Optional second commit: who and when on register rows.** Add `created_by` → name and `created_at` to the risk, amendment, deviation, budget and review SELECTs in `pdev-view-assembler.ts:415-426`. This is this lane's own file. There is no `updated_by` column, so the ledger supplies the last change.

TESTS THAT FAIL FIRST
- `server/services/protocol-development/__tests__/protocol-history.pglite.test.ts`. The module does not exist, so it fails first. Setup: org A has protocols 2 and 20; org B has one. Writes through `recordGovernedAction`: a document update, a section update, a visit added then soft-removed, a risk update. It asserts all of these are present for doc 2, the removed visit included and labelled; no row for doc 20; and null for org B.
- `server/routes/__tests__/protocol-dev-history-route.test.ts`, modelled on `vault-document-history-route.test.ts`:
  - a foreign document returns 404 and the reader is never called
  - a reader that throws gives 500 `HISTORY_UNAVAILABLE`
  - 42P01 never gives an empty 200
- Extend `vault-document-history.pglite.test.ts`: with a multi-record set, `prevHash` is still the tenant-chain predecessor.
- `client/src/concept2cure/v2/__tests__/protocolDevHistory.test.tsx`:
  - `getByRole('tab',{name:'History'})` fails first
  - clicking it GETs `/api/protocol-dev/:id/history`
  - asserts actor, reason, meaning, record label, chain verdict and the "section text only" statement
  - a 500 shows "could not be read", never "No audit entries have been recorded"

ORDER
Claim on the board now (line 86 requires it). Land the whole change after 2026-09-29T11:44:44Z, or hand step 1 to 01PwLFr8 and step 5 to 01KiDof7.

### risk

- **Held files.** `ProtocolDevWorkspace.tsx` is held by 01KiDof7 until 2026-09-29T05:02:45Z. `audit-trail-ledger.routes.ts` and `Vault.tsx` are held by 01PwLFr8 until 2026-09-29T11:44:44Z; `Vault.tsx` also has 01KiDof7 02:15Z and 01KZK3jg 01:16Z.
- **Zero duplication.** `Vault.tsx:279-360` has its own `DocumentHistory` and `ChainVerdict`, and `PG.AuditTrail` is a second renderer. Converge them after 01PwLFr8's window, or the fix leaves two record-history panels.
- **Cost.** The whole tenant chain is verified on every read, as the Vault history already does. Fetch only when the tab opens.
- **Unchained rows.** Rows with `sha256_chain IS NULL` are not shown.
- **Read-time names.** Actor names are `users.name` resolved when read, the same as the org ledger (F-42 adds `actorRef`). Sign rows must show `signer_name` from `electronic_signatures` instead.
- **Visibility.** Colleagues' names become visible to any member who can read the protocol, following the Vault precedent. That is a product decision stated here, not hidden.
- **Labels must stay unique.** The redline reader (`protocol-industry-service.ts:266-268`, 01M8bGFS) refuses a version label recorded twice, so any new snapshot writer must bump the label.
- **Coverage gaps.** Design-derivation applies land on `study-design:<id>`, not the protocol. Consent, IRB and template records have their own targets. The view must name these gaps, not imply it is complete.

### files

- `server/routes/protocol-dev.routes.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2
- `server/services/protocol-development/protocol-history.ts` — held: False — new file — 
- `server/routes/audit-trail-ledger.routes.ts` — held: True — 53237f62 2026-09-28T11:44:44Z (window closes 2026-09-29T11:44:44Z); earlier af305e8a 00:47Z by 01TTTQ1h — session_01PwLFr89hq8E7ZHUcAH96HK
- `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx` — held: True — 780a0639 2026-09-28T05:02:45Z by 01KiDof7 (window closes 2026-09-29T05:02:45Z); later fb69b716/e8f448d1 05:18Z by 01TTTQ1h; merge 20394617 05:26Z (no trailer) — session_01KiDof7JE6LiaZhRvh2hJrb
- `client/src/concept2cure/v2/surfaces/ProtocolGov.tsx` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2
- `client/src/concept2cure/v2/surfaces/ProtocolDevHistory.tsx` — held: False — new file — 
- `client/src/concept2cure/v2/surfaces/Vault.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z (also e2d36a2b 02:15Z 01KiDof7, a75e3845 01:16Z 01KZK3jg) — only for the ChainVerdict convergence follow-up — session_01PwLFr89hq8E7ZHUcAH96HK
- `server/services/protocol-development/pdev-view-assembler.ts` — held: False — fb69b716 2026-09-28T05:18:40Z (own lane) — optional step 6 only — session_01TTTQ1hpdMr1yAMVYH4nYdE
- `server/routes/c2c/project-vault.ts` — held: False — not changed since 2026-09-27T17:00Z by another lane (not in the 24h list) — one-line caller update for the pair-set signature — 

## P11-C-3-SNAP — NEW — medium

### evidence

Found during this re-check. What a protocol signature binds is not retained anywhere a person can produce it.

WHAT A VERSION HOLDS
- `protocol_versions.snapshot` holds `{version, sections:[section_key,title,content,status,order_index]}` and nothing else:
  - `protocol-development-service.ts:376-381` (snapshotVersionTx)
  - `protocol-development-service.ts:396-401` (finalizeProtocolTx)

WHAT THE SIGNATURE BINDS
- Both the finalization and every review-disposition signature bind a sha256 over much more (`signature-persistence.ts:554-617`, `protocolContentBinding`):
  - the `protocol_documents` cover page and synopsis (kind, number, title, design, phase, therapeutic area, synopsis, sponsor, PI)
  - sections, including `required`
  - objectives
  - eligibility
  - visits, including procedures
  - SoA assessments
  - SoA cells, including notes
  - team
- So a version row can neither reproduce nor re-verify what was signed:
  - the SoA and every other non-section facet are absent
  - `required` is missing from sections
  - the ordering differs (`order_index` vs `order_index, section_key`)

FINALIZED PROTOCOLS
- The live rows are frozen by `assertEditable` (`:88-90`) and `requireProtocolForWriteTx` (`:103-105`, SEC-C-2), so the digest can be re-derived today.
- Nothing does re-derive it. `bound_payload_digest` is compared only in the ectd and submission services.

REVIEW DISPOSITIONS
- These are signed while the protocol is still editable. No snapshot is taken at that point.
- The next save overwrites content in place (`:240`), and its ledger payload is `{status}` only (`protocol-development.ts:397`).
- So the text a reviewer approved cannot be recovered after the next edit.
- The Reviews row keeps showing "Signed by X as Review": the P11-C-2 facet reads no digest (`protocol-signature-manifestation.ts:63-72`).

This is adjacent to §11.10(e) and §11.70.

### proposedFix

1. **One function for the signed content.** Extract `readProtocolSignedContent(client, orgId, docId)` from `protocolContentBinding` (`signature-persistence.ts:554-617`; cold, last changed by 0194UQPx 2026-09-25). The binding hashes its result, so the snapshot and the digest cannot drift apart.
2. **Finalization snapshot.** `finalizeProtocolTx` (`protocol-development-service.ts:389-404`, own lane) and `snapshotVersionTx` store that object and its digest as additive JSON keys: `{version, sections, content, contentDigest}`. The redline's `parseSnapshot` requires only `sections` (`protocol-industry-service.ts:231-236`), so it keeps working.
3. **Changed since signed.** The assembler compares each signature's `bound_payload_digest` with the current content digest, once per read, and the review row says "content changed since this was signed".
4. **Retaining a disposition's content is a product decision.** The options:
   - a minor version per signed review, which changes the version label on each review and must stay unique for the redline
   - a dedicated store in `public` with `organization_id INTEGER NOT NULL`, added to `C2C_MIGRATION_FILES` before the final pair

Tests:
- Finalize, then assert the snapshot contains the SoA cells and that `sha256(canonical(snapshot.content)) === electronic_signatures.bound_payload_digest`.
- Sign a disposition, edit a section, then assert `review.signature.contentChanged === true`.

Both fail first.

### risk

- The finalization snapshot grows, since it now carries the full content. The field holding it is text.
- `ProtocolDevReviews.tsx` (the display) and `protocol-reviews.ts` are held by 01KiDof7 until about 2026-09-29T05:02Z and 04:33Z respectively.
- `protocol-redline.ts` and `protocol-industry-service.ts` are held by 01M8bGFS until 2026-09-29T16:03Z. They need no edit, but their contract (the `sections` array, unique labels) must be kept.
- The disposition store is a founder decision, not a cleanup.

### files

- `server/services/part11/signature-persistence.ts` — held: False — 3d09bf2a 2026-09-25T23:00:56Z — session_0194UQPxy9Er2ibRAjog8Ven
- `server/services/protocol-development/protocol-development-service.ts` — held: False — 29d80fe9 2026-09-28T04:18:29Z (own lane) — session_01TTTQ1hpdMr1yAMVYH4nYdE
- `server/services/protocol-development/pdev-view-assembler.ts` — held: False — fb69b716 2026-09-28T05:18:40Z (own lane) — session_01TTTQ1hpdMr1yAMVYH4nYdE
- `client/src/concept2cure/v2/surfaces/ProtocolDevReviews.tsx` — held: True — 780a0639 2026-09-28T05:02:45Z by 01KiDof7; later fb69b716/d848acf3 05:18Z by 01TTTQ1h — session_01KiDof7JE6LiaZhRvh2hJrb
- `server/services/protocol-development/protocol-industry-service.ts` — held: True — 05286bf0 2026-09-28T16:03:23Z (reader of the snapshot; no edit needed) — session_01M8bGFSEfJx3f5WzKXJe4yR

## Notes

Read-only. No repository file was edited and no git state was changed.

**P11-C-3 is OPEN at HEAD 60b0563f.** Two commits came near it and neither fixes it:
- P11-C-2 (`fb69b716`) shows who signed, on the header, the review rows and the export. That is signer manifestation, not history.
- 7f82872d (…01M8bGFS) added the first working reader of `protocol_versions`: a redline route with no client caller, and the AnA tool `review_protocol_redline`. The tool needs version labels that nothing lists.

**The smallest fix avoids `server/routes/protocol-development.ts`,** which is held by 01M8bGFS and 01KiDof7. The route goes on the cold `protocol-dev.routes.ts` instead. Two small edits still sit in held files:
- the `TABS` entry and `TabBody` case in `ProtocolDevWorkspace.tsx` (01KiDof7, until 2026-09-29T05:02:45Z)
- the pair-set extension of `readRecordAuditHistory` in `audit-trail-ledger.routes.ts` (01PwLFr8, until 2026-09-29T11:44:44Z)

**Recommendation:** claim P11-C-3 on the board now, since `README.md:86` requires a claim for further editor-family work. Then either land the whole change after 2026-09-29T11:44:44Z, or hand those two edits on as hand-on items.

**Stale comment, trivial:** `ProtocolGov.tsx:152-153` says the real org history is at `GET /api/mdx/audit`. AdminSurfaces reads `/api/audit-trail/ledger` (`AdminSurfaces.tsx:1030`).

**New finding P11-C-3-SNAP:** the signed content is not retained. Version snapshots hold section text only, while the signature digest also covers the SoA, objectives, eligibility, visits, team and cover page. A reviewer's signed content is lost at the next save. The disposition-retention store is a founder decision.
