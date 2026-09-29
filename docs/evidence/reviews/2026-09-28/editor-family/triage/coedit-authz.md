# Triage group: coedit-authz
Returned by the read-only re-check of 2026-09-28 (as returned; scratch paths redacted).

## SEC-A-10 / SEC-B-5 — OPEN — medium (dark in every deploy config found); blocker the moment co-editing is enabled

### evidence

Read at HEAD 60b0563f. HEAD moved from c40d3cca while I was reading, and authoring-permissions.ts changed underneath me (d4176395). None of the relevant lines has changed since the review. `git log -L` on RichSectionEditor.tsx:1081-1109 and DocumentWorkbench.tsx:4126-4133 returns only e128a656 (2026-09-22). `git log -S decideAuthoringPermission -- server/services/collab server/services/hocuspocus-server.ts` is empty. No commit since 2026-09-27 names SEC-A-10, SEC-B-5 or collab. Review README.md:109 still says open.

SERVER
- collab-authorization.ts:94-119 `authorizeResource(resource, tenantId)` runs two checks and nothing else: `SELECT 1 FROM authoring_documents WHERE id=$1 AND tenant_id=$2` (99-106) and the section/doc/tenant join (108-117). It does not check document status or `locked_at`, and it consults no doc_permissions grant.
- hocuspocus-server.ts:170 sets `connectionConfig.readOnly` only from the tenant lifecycle posture.
- Step 7 (285-294) treats 'authorized' as read-write.
- Membership is checked once, at connect (255-266). The check is skipped entirely when the subject is not an integer (`if (userId !== null)`), which is an adjacent fail-open.
- onStoreDocument (364-390) persists room state with no seal check.
- Contrast: canEditSection (authoring.router.ts:308-386) refuses FROZEN/APPROVED unconditionally (343-345), then calls decideAuthoringPermission 'edit' (367-376). The /api gateway authoringObjectAuthorization (mounted at register-inline-routes.ts:311) runs decideAuthoringPermission on every HTTP mutation with no feature flag. The socket gets neither.

CLIENT
- DocumentWorkbench.tsx:4126-4133: `collab={liveCoedit && activeDoc ? {...} : null}` does not look at `docSealed` (951-952), so a sealed document still joins the room. The editor is readOnly, but it shows whatever the room holds.
- RichSectionEditor.tsx:1081-1109 onSynced: when the room is non-empty it adopts the room as `lastSavedRef`, then `setDirty(false)`, `setSaveState('saved')` ('All changes saved', 327). There is no comparison with `value` / boot.html.

FLAGS, CONFIRMED OFF
- Client `ENABLE_LIVE_COEDITING` is compiled `enabled:false` (featureFlags.ts:74-81). It is read in one place (DocumentWorkbench.tsx:2366). `setFeatureEnabled` (329-338) has no production caller, only a test.
- Server `ENABLE_COLLAB_CRDT==='true'` (hocuspocus-server.ts:88-90). The attach is a no-op when it is off (410-414; startup/services.ts:554-567). .env.example:240 leaves it empty.
- Neither flag appears in terraform (the stack's boot/signer environment feeds api_environment at stack/main.tf:305; ecs-fargate/main.tf:140-145), helm, deploy, infra, .github, the compose files or app.yaml.
- However, CloudFront already routes `/collab` and `/collab/*` to the ALB (terraform/modules/cloudfront/main.tf:12-13). The only things between production and a live room are therefore one env var and a one-line client change.
- SECURITY_AUDIT_2026-09-24.md:133 (IAM-19) also records a residual: the collab socket has no periodic session re-check, and needs one before ENABLE_COLLAB_CRDT is turned on.

BOARD
No section 0 claim names collab-authorization.ts or hocuspocus-server.ts. The D4 editor-family row (01TTTQ1h) says 01KiDof7 works in the editor files and that further work must be claimed first. Hand-on item 6 gives DocumentWorkbench.tsx editor-family findings to 01KZK3jg until 2026-09-29 01:58.

### proposedFix

SERVER — both files are cold and can be fixed now, test first. Import only from held files; edit neither held file.

1. collab-authorization.ts, `authorizeResource(resource, tenantId, principal: AuthoringPrincipal)`
   - New return type: 'read-write' | 'read-only' | 'denied' | 'unavailable'.
   - Resolve the scope: `resource.sectionId ? resolveAuthoringSectionScope(pool, tenantId, sectionId) : resolveAuthoringDocumentScope(pool, tenantId, documentId)` (authoring-permissions.ts:140,163).
   - Return 'denied' if there is no scope, or if `scope.docId !== resource.documentId`. That second check keeps today's doc/section pairing check.
   - `view = decideAuthoringPermission({pool, principal, scope, action:'view'})` (authoring-permissions.ts:194). Not allowed → 'denied'.
   - `edit = decideAuthoringPermission({..., action:'edit'})`.
   - `lock = sectionId ? checkSectionWritable(pool, sectionId, tenantId) : checkDocumentWritable(pool, documentId, tenantId)` (document-lock.ts:88,126). This honours FROZEN/APPROVED and `locked_at`.
   - Return `edit.allowed && lock.writable ? 'read-write' : 'read-only'`. Keep the existing catch that returns 'unavailable'.
   - Make this unconditional, not behind `sectionPermsEnforced()`. It then matches the /api gateway, which is the decision every HTTP write actually gets. canEditSection itself cannot be reused: it is private and takes an express Request.

2. hocuspocus-server.ts
   - Add `roles?: string[]` to CollabTokenClaims (117-129).
   - At step 7 (285-294), build the principal the way HTTP does: `{ id: subject, email: payload.email?.trim().toLowerCase() || null, roles: expandRoleClaims(payload.role ?? undefined, payload.roles).map(r => String(r).toUpperCase()) }` (auth.ts:249,394-401 + authoringPrincipalFromRequest).
   - 'denied' or 'unavailable' → `throw denied('forbidden-document')`.
   - 'read-only' → if there is no connectionConfig, `throw denied('document-read-only')` (fail closed, as the tenant-posture step does); otherwise set `connectionConfig.readOnly = true`. Hocuspocus already drops updates on read-only connections (hocuspocus-server.cjs:1422-1448).
   - Step 5 (255): refuse when `userId === null` instead of skipping the membership check.
   - onStoreDocument (364-390): re-read `checkDocumentWritable(pool, ctx.resource.documentId, ctx.tenantId)` and skip `storeCollabState` when the document is not writable. This covers a document frozen while a read-write socket was open.

CLIENT — both files are HELD, so hand these on rather than edit.

3. DocumentWorkbench.tsx:4127: `liveCoedit && activeDoc && !docSealed`.

4. RichSectionEditor.tsx:1081-1109 onSynced
   - When `frag.length > 0`, compare the room's serialization with the stored record serialized through the same schema: html → `generateHTML(generateJSON(boot.html, extensions), extensions)`; text → `docToPlainText(generateJSON(...))`, as the boot gate at 832-850 does.
   - Equal → 'saved', as today.
   - Different → set `lastSavedRef.current` to the stored baseline, `setDirty(true)`, `setSaveState('dirty')`, and show a notice that the live session holds text that is not in the saved section. Never 'saved'.

TESTS THAT FAIL FIRST

Server: server/services/collab/__tests__/collab-governance.pglite.integration.test.ts
- Also apply db/migrations/20260727_authoring_object_permissions.sql after the loop tables. It already applies on PGlite in authoringWritesBoundAndAudited.pglite and draft-authoring-document-tool.pglite.
- Seed:
  - an AUTHOR grant for USER_A on DOC_A, or the two existing 'admits…' cases go red;
  - an ORG_A member with no grant;
  - a VIEWER grant;
  - a FROZEN document with an OWNER grant;
  - a revoked grant.
- New cases:
  - (a) 'refuses a tenant member with no grant'. It is admitted at HEAD, so this is the first red.
  - (b) 'a VIEWER grant opens a read-only socket'. HEAD leaves readOnly false.
  - (c) 'a FROZEN document is read-only even for its OWNER'. Red at HEAD.
  - (d) 'a FROZEN document is refused when the socket cannot be downgraded'. HEAD resolves.
  - (e) 'a revoked grant is refused'.
  - (f) 'a section of another document in the same tenant is refused'. This passes at HEAD and stays as a regression guard.

Client (for the holder): a new client/src/concept2cure/v2/__tests__/richSectionEditorCollabBaseline.test.tsx.
- `vi.mock('@hocuspocus/provider')` with a fake provider that has on/off/destroy and emits 'synced' after divergent text is written into `doc.getXmlFragment('default')`.
- Assert the footer is not 'All changes saved' when the room differs from `value`.
- Plus a workbench case: `setFeatureEnabled('ENABLE_LIVE_COEDITING', true)` with a FROZEN document; the provider constructor is never called.

### risk

- **Stricter than HTTP reads, by design.** GETs skip the gateway (SAFE_METHODS), so a tenant member with no grant can read the section over HTTP but is refused the room. The client's existing 'denied' fallback to solo editing (RichSectionEditor.tsx:1111-1125) handles this. The alternative is to admit ungranted members read-only. I recommend refusing, because the room holds unsaved drafts that are not the record.
- **Org-role 'admin' tokens.** They expand to ADMIN and are therefore global authoring admins, exactly as on HTTP. This is parity, not a new grant.
- **Checks run at connect only.** A grant revoked, or a document frozen, while a socket is open stays live in memory until the client reconnects. The onStoreDocument re-check stops it being persisted but not relayed. A periodic re-check (the IAM-19 residual) is still a precondition before ENABLE_COLLAB_CRDT is turned on; it is not part of this smallest fix. server/socket/sessionRecheck.ts is Socket.io-specific and held by 01KiDof7 (494b4fc1, 2026-09-28T03:14Z).
- **Room state is never reset** on a governed save, revert or freeze. The client comparison in step 4 is what stops a stale room being shown as the record. Resetting it on the server is a later hardening.
- **Two status sets are combined.** decideAuthoringPermission's immutable set (LOCKED, SUBMITTED, EFFECTIVE…) is wider than document-lock's FROZEN/APPROVED plus `locked_at`. Using both gives their union, the strictest reading.
- **Import of server/middleware/auth.ts** for expandRoleClaims: check it creates no import cycle. If it does, inline `payload.roles ?? [payload.role ?? 'user']`.
- **Existing tests** that assume tenant-only admission need grants seeded.
- **Held file:** do not add a claims-to-principal factory to authoring-permissions.ts; it is held.

### failingTest

server/services/collab/__tests__/collab-governance.pglite.integration.test.ts: 'refuses a tenant member with no grant on the document'. At HEAD, authenticateCollabConnection resolves for that member; it should reject with reason 'forbidden-document'. Next: 'a FROZEN document opens read-only even for its OWNER' (connectionConfig.readOnly stays false at HEAD).

### files

- `server/services/collab/collab-authorization.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2 (no board claim)
- `server/services/hocuspocus-server.ts` — held: False — 171e02df 2026-09-23T15:06:04Z — session_01TTTQ1hpdMr1yAMVYH4nYdE (no board claim)
- `server/services/collab/__tests__/collab-governance.pglite.integration.test.ts` — held: False — 613c6e00 2026-09-25T01:38:08Z — session_0194UQPxy9Er2ibRAjog8Ven
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` — held: True — e1ce5501 2026-09-28T05:17:26Z (also de430222 04:49 and b43ec3af 04:34 by 01TTTQ1h) — session_01KiDof7JE6LiaZhRvh2hJrb, held until 2026-09-29T05:17Z. The board's D4 editor-family row says to claim first.
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z (merge 1de78ea8 11:53, same session; 8a74ed55 11:22 by 01KiDof7) — session_01PwLFr89hq8E7ZHUcAH96HK, held until 2026-09-29T11:44Z. Board hand-on item 6 gives DocumentWorkbench editor-family findings to 01KZK3jg until 2026-09-29 01:58.
- `server/services/authoring/authoring-permissions.ts` — held: True — d4176395 2026-09-28T16:48:56Z — session_01KiDof7JE6LiaZhRvh2hJrb (import only; no edit needed)
- `server/services/authoring/document-lock.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2 (import only)
- `server/middleware/auth.ts` — held: False — 58a1140f 2026-09-26T05:02:20Z — session_0194UQPxy9Er2ibRAjog8Ven (import expandRoleClaims only)

## Notes

I worked read-only: no repository edits and no state-changing git. I wrote no scratch files.

HEAD moved from c40d3cca to 60b0563f during this pass, and server/services/authoring/authoring-permissions.ts changed between two of my reads. That was d4176395 (01KiDof7, 16:48Z), which added an 'export' action. It has nothing to do with this item, but it shows that file is being worked on now.

The server half of the fix touches only cold files (collab-authorization.ts, hocuspocus-server.ts and the collab pglite test) and can be done now, failing first. It reuses the exported helpers decideAuthoringPermission, resolveAuthoring*Scope and check*Writable without editing any held file.

The client half is held and must be handed on:
- RichSectionEditor.tsx: onSynced must compare the room with the stored record before saying 'saved'. Held by 01KiDof7 until 2026-09-29T05:17Z.
- DocumentWorkbench.tsx: add `!docSealed` to the collab condition. Held by 01PwLFr89 until 11:44Z, and board item 6 routes it to 01KZK3jg.

The flags are off in every configuration I could find. CloudFront already routes /collab to the ALB, so this must land, together with the IAM-19 periodic re-check residual, before anyone sets ENABLE_COLLAB_CRDT or flips the client flag.

Adjacent defect found: hocuspocus-server.ts:255 skips the org-membership check entirely when the token subject is not an integer. It is included in the fix as a one-line fail-closed change.
