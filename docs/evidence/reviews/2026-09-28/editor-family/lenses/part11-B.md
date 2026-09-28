# Part 11 UX lens: the editor family, RichSectionEditor, 2026-09-28

## Scope actually covered

**Read in full:**
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` — all 2,717 lines, in two passes (1–1352, 1353–2717).
- `client/src/concept2cure/v2/editor/suggestions.ts` — all 1,009 lines (the track-changes mechanism: insertion/deletion marks, accept/reject commands, AI-draft-to-node conversion). Read in full because the lens's "AI-drafted change distinguishable from human" question is implemented here, not in the editor file itself.
- Five prior review documents named in the charge, in full: `docs/evidence/reviews/2026-09-22/part11-ux.md`, `2026-09-24/part11-ux.md`, `2026-09-24/lenses.md`, `2026-09-28/part11-ux.md`, `2026-09-28/ectd-lane-second-pass/part11-ux.md`.

**Traced to the server, targeted ranges** (every UI action in `RichSectionEditor.tsx` that mutates, and each of its three production hosts, since the component itself has no `fetch`/mutation of its own — every write is delegated through host-supplied callback props):
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` (Authoring host) — :78, :651–871, :1960–2170, :2644–2760, :3280–3340, :3745–3930, :4180–4300.
- `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx` (Submission Center / eCTD Co-Author host) — :1–40, :79–120, :357–378, :895–965.
- `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx` (Authoring / protocol-dev host) — :1–200, and `ProtocolDevWrites.ts:149–165`.
- `server/routes/authoring.router.ts` — :200–460 (section write-authorization + lock guard), :690–753 (audit helper), :1646–2035 (`PATCH /sections/:sectionId`), :3168–3290 (`POST /sections/:sectionId/ai/draft/accept`), :5906–6127 (tracked-change-decision routes).
- `server/services/authoring/authoring-permissions.ts` — full file (per-document/per-section `doc_permissions` ACL).
- `server/services/authoring/revision-ledger.ts` — :150–241 (`machineContributors`/`acceptedMachineText` validation).
- `server/services/hocuspocus-server.ts` — full file (the `/collab` live co-editing socket `RichSectionEditor.tsx`'s `collab` prop connects to).
- `server/routes/coauthor.ts` — :1–60, :285–346.
- `server/services/coauthor/coauthor-status-write.ts` — full file.
- `server/services/coauthor/coauthor-audit.ts` — full file.
- `server/routes/protocol-development.ts` — :92, :358–369.
- `server/bootstrap/register-document-routes.ts` — :1–115.

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| P11-B-1 | **blocker** | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:357-378,945-963`; `server/routes/coauthor.ts:285-346`; `server/services/coauthor/coauthor-status-write.ts:241-304`; `server/services/coauthor/coauthor-audit.ts:42-72` | eCTD Co-Author content saves (the canonical `RichSectionEditor` over a regulated document) carry no reason-for-change and write no audit-trail row at all — a governed action that never wrote its ledger entry. |
| P11-B-2 | **high** | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:869-871,3834`; `client/src/concept2cure/v2/editor/RichSectionEditor.tsx:1886`; `server/routes/authoring.router.ts:240-246,299-378,413-454`; `server/services/authoring/authoring-permissions.ts:79-85,185-236` | The full editing ribbon and Save are shown as operable to any tenant member on an unsealed document regardless of the caller's actual per-document/-section grant; refusal (403) arrives only after the author has typed and clicked Save. |
| P11-B-3 | **medium** | `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx:79-83,915-918,940-963`; `server/services/coauthor/coauthor-status-write.ts:112-115,205-230` | `RichSectionEditor`'s `readOnly` prop is never set in `EctdCoauthor.tsx`, so an approved/finalized/signed/locked co-author document's canvas stays fully interactive; the server's correct 409 refusal is discovered only after Save. |
| P11-B-4 | **medium** | `client/src/concept2cure/v2/editor/suggestions.ts:788-808`; `client/src/concept2cure/v2/editor/RichSectionEditor.tsx:1480-1492,1791-1803,2072-2074`; `server/routes/authoring.router.ts:5927-6017` | Undo (⌘Z) immediately after Accept/Reject on a tracked suggestion reverses the local mark edit, but not the already-fired, already-persisted `tracked_change_decision` audit event. |

---

### P11-B-1 — blocker: eCTD Co-Author section saves are ungoverned (no reason, no audit row)

**What the code does.** `EctdCoauthor.tsx` mounts the same canonical `RichSectionEditor` DocumentWorkbench uses (`:945-963`), wired as:

```
957   onSave={saveContent}
```

`saveContent` (`:357-378`) is:

```
358    async (serialized: string) => {
359      if (!activeDoc) throw new Error('No document open');
360      const r = await liveMutateOrNull<{ document?: CoauthorDoc }>(
361        'PUT',
362        '/api/coauthor/documents/' + activeDoc.id,
363        { content: serialized },
364      );
```

It ignores the `systemReason` second parameter `RichSectionEditor`'s `onSave` contract offers, sends `{ content }` alone, and is the **only** client caller of this route (confirmed by a repo-wide grep for the endpoint string). No UI anywhere in this file collects a reason.

Server-side, `server/routes/coauthor.ts:297` destructures `const { title, content, status } = req.body || {};` — no `reason` field is even read. The write itself is `applyCoauthorDocumentPut` (`coauthor-status-write.ts:241-304`), whose only mutating statement is:

```
301      const [document] = await tx.update(coauthorDocuments).set(set).where(scope).returning();
```

There is no call to any audit-writing function in this function, and the PUT route in `coauthor.ts` calls none on a successful update either (only its sibling `DELETE` handler does, at `:376-382`). The table's one audit writer, `recordCoauthorDocumentEvent` (`coauthor-audit.ts:42-72`), has its event type closed to exactly:

```
47       eventType: 'coauthor_document.deleted' | 'coauthor_document.retaken';
```

— there is no `'coauthor_document.updated'` (or equivalent) variant, and a repo-wide grep for `recordCoauthorDocumentEvent` shows it called only from the two `DELETE` handlers (`coauthor.ts:376`, `ectd-documents.ts:354`) and the source-retake path (`coauthor-snapshot.ts:461`) — never from this `PUT`. The route is mounted with only `authenticateToken` (`register-document-routes.ts:96-115`), so no audit middleware wraps it either.

**Why it matters to a regulated user.** `coauthor_documents` is, in this file's own words, "a governed document" (`EctdCoauthor.tsx:906`) holding eCTD Module 2–5 content — this is exactly the "regulated content" class the skill's Hard Rule 1 and the charge's opening paragraph describe: a governed action that looks fine (the canvas saves, the toast is silent-success) and simply never wrote its ledger entry. `coauthor-audit.ts`'s own header proves the team already found and fixed this *exact* defect class for the retake path ("...rewrites an existing regulated row... and wrote no audit row, so the change was invisible after the fact. It now records one.") but never extended that fix to the far more common ordinary content edit. Contrast the sibling canonical path the same `RichSectionEditor` component feeds from `DocumentWorkbench.tsx` — `PATCH /api/authoring/sections/:sectionId` — which requires a governed reason before writing (`authoring.router.ts:1806-1813`, `requireGovernedReason`) and writes a hash-chained audit row in the same transaction as the content (`:1926-1937`), and the third host, `ProtocolDevSection.tsx` → `PATCH /api/protocol-development/sections/:id`, which enforces an 8-character reason both client- and server-side (`ProtocolDevWrites.ts:152`; `protocol-development.ts:92,363`) and routes through `recordGovernedAction`. Two of the three hosts of the *same* canonical editor component meet the product's own standard; this one does not, silently, for every keystroke saved.

Compounding this: the route has no per-document role/grant check beyond authentication (no `requireEditorAccess`/`decideAuthoringPermission`-equivalent), so any authenticated tenant member — not just an author — can make an unaudited, unreasoned change to this content.

**Fix.** Add a `'coauthor_document.updated'` (or `content_changed`) event type to `coauthor-audit.ts`'s `eventType` union and call `recordCoauthorDocumentEvent` inside `applyCoauthorDocumentPut`'s transaction whenever `governedSet` is non-empty, carrying a caller-supplied reason. Add a required reason field to `EctdCoauthor.tsx` next to Save (mirroring `ProtocolDevSection.tsx`'s `SectionReason`), thread it through `saveContent` as the route's new `reason`, and reject a missing/short one server-side the way `authoring.router.ts`'s `requireGovernedReason` does.

---

### P11-B-2 — high: the governed editing ribbon is shown and only rejected server-side

**What the code does.** `RichSectionEditor.tsx` draws its entire formatting ribbon — and everything on it, including Save — gated on nothing but the `readOnly` prop:

```
1886    {full && boot.mode === 'rich' && !readOnly && (
```

In its Authoring host, that prop is driven by document *lock* state only:

```
869    const docSealed =
870      activeDoc != null && ['FROZEN', 'APPROVED'].includes(String(activeDoc.status).toUpperCase());
...
3834                    readOnly={docSealed}
```

But `server/routes/authoring.router.ts` enforces a second, independent control the client never consults: a per-document/per-section grant, **on by default in production** (`:241 if (process.env.NODE_ENV === 'production') return true;`), checked by `canEditSection` (`:299-378`) via `decideAuthoringPermission` (`authoring-permissions.ts:185-236`) against `doc_permissions` rows with roles `OWNER/AUTHOR/REVIEWER/APPROVER/VIEWER` (`:4-10,79-85`) — only the document's *creator* is auto-granted (per `authoring.router.ts:237`); every other collaborator needs an explicit grant, or a global-admin role. The prefix guard applies this to every `PATCH`/`POST`/`DELETE` under `/sections/:sectionId` (`:413-454`) and answers 403 `{error:'No edit permission for this section'}` (`:453`) — after the request has already been made. Neither `GET /docs` (`:1271`) nor `GET /docs/:docId/sections` (`:1545`) computes or returns any per-caller permission field (a whole-file grep of `authoring.router.ts` for `canEdit|myRole|effectiveRole` returns nothing), and `DocumentWorkbench.tsx` contains no reference to permission/role/grant anywhere outside comments.

**Why it matters to a regulated user.** A second author, reviewer, or approver on a CTD/IND document who has not been separately granted access to that specific document sees a fully live ribbon, can type an entire section, and is told only at Save — after the effort — that they were never authorized. The save-failure path itself is honest (`DocumentWorkbench.tsx:2085-2122` surfaces the server's real refusal, and the text stays cached on-device), so no data is lost and no false state is ever asserted — but this is precisely the pattern the skill's Hard Rule 6 and the lens's "role scoping" item name as forbidden: "Actions the caller cannot perform are hidden or disabled with a reason, never shown and then rejected server-side only."

**Fix.** Have `GET /docs` / `GET /docs/:docId/sections` call `decideAuthoringPermission` (already written, already used server-side) once per document/section for the requesting caller and return an `canEdit`/`myRole` field; compute `readOnly = docSealed || !canEdit` in `DocumentWorkbench.tsx`, and give the Save button a tooltip naming the missing role rather than only the frozen-state reason it already has.

---

### P11-B-3 — medium: EctdCoauthor's canvas never reflects the document's lock state

**What the code does.** `EctdCoauthor.tsx` mounts `RichSectionEditor` with no `readOnly` prop at all:

```
945                    <RichSectionEditor
946                      key={activeDoc.id}
947                      ref={editorRef}
948                      value={activeDoc.content ?? ''}
949                      format="html"
950                      onSave={saveContent}
951                      onDirtyChange={setEditorDirty}
952                      autosaveMs={null}
953                      storageKey={'coauthor:' + activeDoc.id}
954                      ariaLabel={...}
955                      placeholder={...}
960                      onAsk={...}
961                    />
```

`readOnly` therefore defaults to `false` unconditionally, so the ribbon and canvas stay fully interactive on a document whose `status` is `approved`, `finalized`, `signed` or `locked` — states `coauthor-status-write.ts` itself defines as verdicts (`isCoauthorVerdictStatus`, `:112-115`) and refuses to let this same `PUT` edit (`coauthorReadOnlyRefusal`, 409 `FINALIZED_DOCUMENT_READ_ONLY`, `:205-230`). The status is already on the client's own data (`CoauthorDoc.status`, used to render `<b>{activeDoc.status}</b>` inline at `:915`), so the client has everything it needs to compute this and simply does not. The only signal a user gets that their edit is refused is a red banner **after** they save:

```
940                    {saveError && (
941                      <div className="ec-empty sp-tone-warn" role="alert" style={{ padding: '6px 10px' }}>
942                        Not saved — {saveError}. Your text is kept on this device; the record is unchanged.
943                      </div>
944                    )}
```

**Why it matters to a regulated user.** This is the same "shown-then-rejected" shape as P11-B-2, but for document *lock* state rather than per-user permission, and on the SAME surface that has no reason/audit capture at all (P11-B-1) — so a person can type substantial edits into an already-signed/approved regulatory document body before being told, after the fact, that the record is unchanged. The refusal message is honest and the record is genuinely untouched (this is a UI-affordance gap, not a control failure — the system does enforce immutability correctly), but there is no persistent "this document is [status] and read-only" banner the way `DocumentWorkbench.tsx:3747-3754` shows for Authoring documents.

**Fix.** Compute `readOnly={['approved','finalized','signed','locked'].includes(String(activeDoc.status).toLowerCase())}` from data the component already has, and show a banner mirroring `DocumentWorkbench.tsx`'s frozen-state one.

---

### P11-B-4 — medium: Undo silently outlives a recorded tracked-change decision

**What the code does.** Accepting or rejecting a suggestion runs `resolveSuggestion` (`suggestions.ts:788-808`), which fires the host's `onResolve` callback **synchronously, as part of the same command** that mutates the document, before setting `SUGGESTION_ACTION_META`:

```
796            notifyResolved(this.options.onResolve, range, action);
797            const keepText =
798              (range.kind === 'insertion') === (action === 'accept');
799            if (keepText) {
800              tr.removeMark(range.from, range.to, range.kind === 'insertion' ? insertion : deletion);
801            } else {
802              tr.delete(range.from, range.to);
803              pruneEmptiedContainers(tr, [range.from]);
804            }
805            tr.setMeta(SUGGESTION_ACTION_META, true);
```

Nothing in `suggestions.ts` or `RichSectionEditor.tsx` ever sets ProseMirror's `addToHistory` meta to `false` for this transaction (confirmed absent by grep of the `editor/` directory), and `RichSectionEditor.tsx`'s own `onKeyDown` (`:1480-1492`) intercepts only `⌘S`/`⌘F`, leaving `⌘Z`/the ribbon's Undo button (`:2072-2074`, `editor?.chain().focus().undo().run()`) to reach TipTap's default History extension unimpeded — so the mark change made above is a normal, undoable entry. Meanwhile, `DocumentWorkbench.tsx`'s `recordTrackedChangeDecision` (`:2740-2759`) queues the decision and `flushDecisions` (`:2679-2727`) `POST`s it on the very next microtask — before the author has any chance to reconsider — to `server/routes/authoring.router.ts:5927`, which immediately `UPSERT`s `authoring_tracked_change_decisions` and writes an immutable, hash-chained audit event via `createAuditEvent`/`createAuditTrail` (`:5988-6010`).

**Why it matters to a regulated user.** If the author presses Accept, then Undo, and then does nothing further (closes the tab, moves to another section without re-deciding), the suggestion reappears as pending in the review strip — the *current* session is never shown a false state — but the append-only audit ledger for this artifact now permanently contains a decision event ("accept", attributed to the real signed-in user, with a real timestamp) that does not correspond to what was ultimately saved. A later auditor reading `tracked-change-decisions` for this artifact sees a decision with no compensating record explaining the reversal. This does not corrupt the section's own content or its primary revision/audit trail (both are computed at Save time from the live, post-undo document state), which is why this is medium rather than high: the trigger is narrow (must undo the specific accept/reject transaction and never re-decide), and the primary governed record (the content itself) is unaffected.

**Fix.** Set `tr.setMeta('addToHistory', false)` on the transaction inside `resolveSuggestion`/`resolveAllSuggestions` (and `insertSuggestedContent`) so a reviewer's decision, once made, cannot be silently taken back by the generic undo shortcut; if "undo my decision" should be possible, model it as an explicit action that itself posts a compensating decision event.

---

## Earlier findings re-verified

None of the specific findings carried by the five prior reports (P1–P7, Q1–Q6, T1–T4, V1, HS-1, PX-1, DP-31/32/34/35, Q-0928-1/2/3, P11-28a/b) are located inside `RichSectionEditor.tsx` itself, and none of their cited evidence lines are on a write-path this file calls, **except** Q3 and Q6/P6, which are the exact server route and UI pattern `RichSectionEditor.tsx`'s primary (Authoring) host uses for every content save and every history-row Revert. I re-traced those directly, at head, as part of tracing this file's own save path:

| earlier id | 2026-09-24/28 status | status at head (this pass) | evidence |
|---|---|---|---|
| Q3 — reason-for-change enforced client-only on section save | fixed (`fde9d704`) | **still fixed** | `server/routes/authoring.router.ts:1806-1813` — `requireGovernedReason(req.body?.changeReason)` runs before any write, returning 400 on failure; `DocumentWorkbench.tsx:1987-1994` refuses client-side first (throws, does not silently no-op) and `:3301-3326` requires ≥8 characters before Save is even enabled. This is the literal endpoint `RichSectionEditor.tsx`'s `onSave={saveSectionContent}` (`:3792`) reaches. |
| Q6 / P6 — Revert not disabled on a sealed document | fixed (`896e96fb`) | **still fixed** (line numbers shifted with unrelated churn) | `DocumentWorkbench.tsx:4278-4286` — `disabled={docSealed}` with `title={docSealed ? 'This document is frozen — its content cannot be reverted.' : undefined}` on the revision-history Revert button. |

All other prior findings are in `TaskBoard.tsx`, `Vault.tsx`, `QmpWorkspace.tsx`, `SopRegister.tsx`/`ChangeControl.tsx`, `mdx-qms.ts`, `AnaToolExecutor.ts`, `SubmissionCenter.tsx`, `GatewayTransmittals.tsx`, `EctdCompile.tsx`, `SubmissionSeqWorkspaces.tsx`, `ProtocolRegisterForms.tsx`/`ProtocolDevWorkspace.tsx`, `quality-management-api.ts`, `contradiction-engine-service.ts`, or `authoring-actions.ts`/`artifact-approval-act.ts` — none of them reachable from `RichSectionEditor.tsx` or its three hosts — and were not re-verified this pass; that would be re-running a different lens pass over different files, not this one.

## What I did NOT get to

- **`PathwayPanes.tsx`** (the MDX dossier drawer), the fourth documented consumer of `RichSectionEditor` (`format='text'`, uses `autosaveMs`) — not opened at all this pass. Given P11-B-1/B-3 turned up in one of the other three hosts, this host's `onSave`/reason/lock-state wiring is worth the same check and is explicitly unverified.
- The signing ceremony proper (`EsignModal`, `AuthoringFilingBar`, `protocol-signature.ts`, and DP-35's freeze-has-no-reverify gap) — not re-traced this pass. It is outside `RichSectionEditor.tsx`'s own code and I relied on the 2026-09-24/28 reports' verification rather than repeating it.
- `../../lineage` (`DataOriginsMenu`, `DocumentAttributionBar`, `useAttributionHighlights`) and the server's `enforceAuthorLineage`/`enforceSourceAndAuthorLineage` — read only through their call contracts and the extensive inline documentation in `RichSectionEditor.tsx`/`authoring.router.ts`, not opened themselves. The attribution-resolves-to-a-name claim rests on `DocumentWorkbench.tsx:4262` (`r.created_by_name ?? r.created_by_email ?? 'Unknown author'`), not on reading the lineage module's own resolution logic.
- `imageNode.ts`, `commentAnchor.ts`, `roundTrip.ts`, `findReplace.ts`, `crossReferenceNode.ts`, `citationNode.ts`, `captionNumbering.ts` — imported extensions relied on through their exported contracts and the calling code's comments, not read line-by-line, per the charge's own allowance.
- Whether `ENABLE_LIVE_COEDITING` / `ENABLE_COLLAB_CRDT` are actually enabled in the live deployment — not checked; I read only the code's default posture and the (well-built, fail-closed) `hocuspocus-server.ts` authentication path.
- Whether `DocumentWorkbench.tsx`'s host re-fetches document lock state live enough to catch a colleague's mid-session freeze — `reloadDocs` is a prop supplied by a parent component I did not open; no polling was found inside `DocumentWorkbench.tsx` itself. Not verified either way.
- `AuthoringAiDraft.tsx`'s full route pair (`ai/draft`, `ai/draft/accept`) — read only through `authoring.router.ts:3168-3290`; its reject/cancel flow and the remainder of the accept handler past that point were not read.
- Whether a caller with no section-level edit grant (only authenticated + org member) can still record a `tracked-change-decision` (`authoring.router.ts:5927-6127` checks authentication and document-frozen state, but I did not confirm it also runs `canEditSection`/an equivalent per-section grant check) — not verified.
- No test was run and no live app was exercised; every finding above is from static reading, consistent with the read-only constraint.
