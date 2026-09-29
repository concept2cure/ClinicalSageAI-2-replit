# Triage group: handons-status
Returned by the read-only re-check of 2026-09-28 (as returned; scratch paths redacted).

## HS-B-1 — PARTLY — high

### evidence

Fixed part: DocumentWorkbench.tsx:878 adds projectSourcesState, set at :1799-1805. The rail picker branches on it at :4765-4779.

Still open, reproduced at HEAD with a scratch harness that mounts the real DocumentAuthoring → DocumentWorkbench → RichSectionEditor (probe-run.txt: 5 defect probes fail, 2 controls pass):
(1) Cite picker. With the data room read failing 500, the bar reads 'No sources are available to this document yet. Add one in the Sources panel…'. The state is never passed on: citationsApi at DocumentWorkbench.tsx:4109-4124 carries sources/precedingSourceIds/onCite only. The contract at RichSectionEditor.tsx:308-312 has no status. The bar has one branch on the data (:2605 vs :2650-2655). openCite (:1715-1719) seeds citeSource once and never re-seeds it.
(2) Existing citations. When both reads fail, a citation paints '[Citation unresolved — the cited source is not available to this document]' with the title '…Cite another source or delete it.' (citationNode.ts:266-274), because the lookup is built from an empty library (RichSectionEditor.tsx:710-719).
(3) Vault rail. ProjectFilesPanel receives projectSources with no state (DocumentWorkbench.tsx:4911; prop at ProjectFilesPanel.tsx:74). matchingProjectSource (:149-152) finds nothing on a failed read, so every upload says 'Not a data-room source, so it cannot be cited… Add the file to the project's data room' (:597-601).

Probe: <scratchpad>/triage/wb/wb.triage.test.tsx, 'HS-B-1' block.

### proposedFix

1. DocumentWorkbench.tsx:4109: add `status` to citationsApi. It is 'error' if sourcesState or projectSourcesState is 'error'; 'loading' while either is idle or loading (having no programId counts as ready); otherwise 'ready'.
2. The same file, :4904-4916: pass `projectSourcesState` to ProjectFilesPanel.
3. RichSectionEditor.tsx:308-312: add an optional `status?: 'loading'|'ready'|'error'`, defaulting to 'ready' so existing hosts and tests are unchanged. In the bar (:2605-2656):
   - 'No sources are available…' only when the status is ready;
   - 'Reading the sources…' while loading;
   - on error, 'The sources could not be read, so none can be cited. This is not the same as having none.';
   - a non-empty list with one read failed gets an 'may be incomplete' note;
   - re-seed citeSource when citationSources changes while the bar is open (:1715-1719).
4. citationNode.ts: add a `status` getter option beside `lookup` (:70). At :265-274, when status !== 'ready' and the id does not resolve, paint 'could not be checked' with no 'delete it' advice. Add the status to the repaint key (RichSectionEditor.tsx:731-733).
5. ProjectFilesPanel.tsx: add an optional `projectSourcesState` prop. When it is 'error', replace the :597-601 sentence with 'The data room could not be read, so whether this file can be cited is not known.'

Tests that fail first (new files, so no held test file is touched):
- client/src/concept2cure/v2/__tests__/workbenchSourcesReadFailure.test.tsx: fail /api/c2c/projects/:pid/sources with 500. Assert the Cite bar does not say 'No sources are available', a `<a data-cite>` is not painted 'unresolved'/'delete it', and the Project files rail does not say 'Not a data-room source' (the scratch probe's three cases).
- A control with an empty, readable data room still says 'No sources are available'.

### risk

citationsInCanvas.test.tsx:116-126 pins the empty-library sentence. The 'ready' default keeps it green.

The repaint key change repaints every citation node on each status transition. That is cheap, but it must not fire on every keystroke.

The DocumentWorkbench and RichSectionEditor halves are held, so the citationNode and ProjectFilesPanel halves (this lane's own files) can land first with defaults and be wired later.

### files

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z (last authored; merge 1de78ea8 11:53:54Z) — session_01PwLFr8 (until 2026-09-29T11:44Z); also session_01KiDof7 8a74ed55 (until 11:22Z) and session_01KZK3jg a75e3845/df10de68 (until 01:16Z / 01:58Z). Board: hand-on item 6 and this lane's row 78
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` — held: True — e1ce5501 2026-09-28T05:17:26Z — session_01KiDof7 (until 2026-09-29T05:17Z); this lane's de430222 at 04:49Z. Board: row 78
- `client/src/concept2cure/v2/editor/citationNode.ts` — held: False — 26e0b3a8 2026-09-28T05:05:46Z — session_01TTTQ1h (this lane)
- `client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx` — held: False — 49f5ad82 2026-09-28T04:37:36Z — session_01TTTQ1h (this lane)

## HS-A-1 — OPEN — medium

### evidence

The server still never returns a revision count:
- PATCH answers `section: result.rows[0]` (authoring.router.ts:2209-2213) from RETURNING *.
- Revert answers `section: result.rows[0]` (:2433-2438).
- AI-draft accept answers `section: saved.rows[0]` (:3705-3707).
- revision_count exists only as COUNT aliases in the list query (:1681, :1730).

The client spreads the returned row over the old one, so the stale revision_count survives:
- save, DocumentWorkbench.tsx:2192-2195;
- revert, :2389-2391;
- AI accept, :2800-2803.

'History N' (:3348-3350) and '· N revisions' (:3861-3862) therefore never move. The toast branch 'revision N recorded' (:2208-2209) is dead in production. The only test of it stubs a revision_count the server never sends (documentAuthoringEditor.test.tsx:95).

The history list cannot supply the count: its route has a LIMIT (authoring.router.ts:2233+, `LIMIT $3`).

### proposedFix

Server, authoring.router.ts: after COMMIT in PATCH /sections/:sectionId (:1823), POST …/revert (:2302) and POST …/ai/draft/accept (:3502), attach `revision_count` to the returned section. Use the list's tenant-scoped count, `SELECT COUNT(*) FROM doc_revisions WHERE section_id=$1 AND tenant_id=$2`.

No client change is needed: the spread adopts it, and the toast then says the true number. Correct the fixture at documentAuthoringEditor.test.tsx:95 in the same change.

Test that fails first: a new server/routes/__tests__/authoringRevisionCount.test.ts. PATCH with content, then revert; assert `body.section.revision_count` equals the doc_revisions count for the section. Today it is undefined.

Interim client-only fix, if the router stays held and DocumentWorkbench frees first:
- on save, bump by 1 only when `revision_created === true`;
- on revert, always bump by 1 (the revision is minted inside its transaction, :2373);
- on AI accept, do NOT bump (its revision is post-commit and non-fatal; see NEW-AIACCEPT-POSTCOMMIT) — re-read the section list instead.

### risk

AI accept's revision is written after COMMIT and can silently fail, so a count read there can be one short. That is correct, since it counts what exists.

authoring.router.ts is held by two sessions until 2026-09-29T17:05Z.

### files

- `server/routes/authoring.router.ts` — held: True — f0147f45 2026-09-28T17:05:50Z — session_01PwLFr8 (until 2026-09-29T17:05Z); session_01KiDof7 d4176395 16:48:56Z (until 2026-09-29T16:48Z); this lane 63b43274 04:52Z. Board: row 50 (session_01WcyqbqW) names it only in stale window text
- `client/src/concept2cure/v2/__tests__/documentAuthoringEditor.test.tsx` — held: False — 4cf0a8a6 2026-09-05T19:06:33Z — session_015oLV2v
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr8 / session_01KiDof7 / session_01KZK3jg (only if the interim client fix is taken)

## HS-A-2 — OPEN — medium

### evidence

uncite (DocumentWorkbench.tsx:1971-2002) runs `fireToast('Citation removed.'); void loadSources(...)` (:1993-1994) and never calls setSections.

addReply (:2496-2528) runs setReplyText/setReplyTo/fireToast/loadComments (:2517-2520) and never calls setSections.

citation_count and comment_count are written only at :1956 (cite +1) and :2464 (addComment +1).

Reproduced: after a successful Remove, the toolbar still reads 'Sources 1' (scratch probe 'HS-A-2').

### proposedFix

- In uncite's success branch (after :1993): `setSections(ss => ss.map(s => s.id === activeSectionId ? { ...s, citation_count: Math.max(0, num(s.citation_count) - 1) } : s))`.
- In addReply's success branch (after :2519): bump comment_count on `parent.section_id`, not activeSection.id. The Comments rail lists every thread in the document, so the reply may belong to another section.

Test that fails first: a new client/src/concept2cure/v2/__tests__/workbenchCountsAfterWrite.test.tsx.
- Remove the only citation, then assert the Sources toggle no longer reads 'Sources 1'.
- Reply to a thread whose section_id is S2 while S1 is open, then assert S2's tree dot title reads '1 comments' and S1's count is unchanged.

### risk

A server-side 404 'frozen citation is immutable' path throws into the catch, so no decrement happens on a refusal. That is correct.

The reply bump must key on parent.section_id, as noted above.

### files

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr8 (until 2026-09-29T11:44Z); session_01KiDof7 (until 11:22Z); session_01KZK3jg (until 01:58Z). Board: hand-on item 6

## A-A-1 — PARTLY — medium

### evidence

Fixed by GA-1:
- the field is aria-required with aria-describedby a persistent note (DocumentWorkbench.tsx:3482-3505);
- Save is described by it (:3511).

Still open:
(a) There is no aria-invalid when 0 < trimmed length < 8. grep finds no aria-invalid in the file.
(b) ⌘S typed in the reason field still opens the browser's Save dialog. The only ⌘S binding is RichSectionEditor.tsx:1598, on `.rse-root`'s onKeyDown (:1947), and the reason input sits in the header outside it. DocumentWorkbench has no metaKey or ctrlKey handler.
(c) The literal 8 remains at :2122, :3501, :3512 and :3518, instead of GOVERNED_REASON_MIN (shared/constants/governed-reason.ts:10).

### proposedFix

DocumentWorkbench.tsx:3485-3494, on the reason input:
- add `aria-invalid={changeReason.trim().length > 0 && changeReason.trim().length < GOVERNED_REASON_MIN}`;
- add an onKeyDown: `if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='s') { e.preventDefault(); void editorRef.current?.save(); }`. That goes through the one save funnel, which already refuses a short reason with a role=alert toast.

Import GOVERNED_REASON_MIN and replace the four literals.

Test that fails first: a new client/src/concept2cure/v2/__tests__/workbenchReasonFieldKeys.test.tsx. authoringReasonForChange.test.tsx is held by session_01KiDof7 until 05:17Z.
- Type 3 characters, assert aria-invalid='true'.
- keyDown {key:'s', metaKey:true} on the field: assert defaultPrevented, and that the save funnel's alert toast appears.

### risk

A ⌘S in the field saves with the reason as typed, which is the intended behaviour: the funnel validates it. Take care not to double-fire when focus is inside .rse-root.

### files

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr8 (until 2026-09-29T11:44Z); session_01KiDof7 (until 11:22Z). Board: hand-on item 6

## A-A-2 — PARTLY — medium

### evidence

The AnA listener is DocumentWorkbench.tsx:1176-1189. Its only guard is `event.key !== 'Escape' || event.defaultPrevented` (:1183). It has no dialog check; the other rails' listener has one (:1219).

useDialog's Escape branch calls only `e.stopPropagation(); closeRef.current()` (useDialog.ts:58-63), with no preventDefault. It registers on document at :94.

The AnA rail is open by default (:804), so its listener is registered first and runs first: defaultPrevented is still false when it runs. Four dialogs are affected:
- FileToVaultDialog;
- AssignReviewDialog;
- AuthoringPlaceIntoFiling (mounted at :3600);
- the leave guard (:5328).

Reproduced: pressing Escape in the File-to-vault dialog closes the dialog and the AnA rail (scratch probe 'A-A-2'). The control, Escape on body, closes AnA as designed.

### proposedFix

DocumentWorkbench.tsx:1183: `if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')) return;`. This mirrors :1219. All four panels declare aria-modal="true".

Do not change useDialog to the capture phase: it would pre-empt inner React Escape handlers in every dialog that uses it.

Test that fails first: a new client/src/concept2cure/v2/__tests__/workbenchAnaEscapeDialogs.test.tsx (workbenchA11ySweep.test.tsx is held by session_01KiDof7). With AnA open, open file-to-vault-dialog, keyDown Escape on it, and assert the dialog is gone and the AnA aside is still present. This is the scratch probe verbatim.

### risk

While any modal is open, Escape can no longer close AnA. That is intended.

AnA's own sign-off, if it declares role=dialog, is also skipped. That is already the behaviour via defaultPrevented.

### files

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr8 (until 2026-09-29T11:44Z); session_01KiDof7 8a74ed55 (until 11:22Z). Board: hand-on item 6
- `client/src/concept2cure/v2/useDialog.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy (not to be changed)

## A-A-4 — OPEN — medium

### evidence

The Move up and Move down buttons are still bare `nda-open` icon buttons, adjacent, with no whitespace between them (DocumentWorkbench.tsx:3816-3842).

The base rule gives them no minimum size: `.c2c-v2 .nda-open{…font-size:11.5px}` and `svg{width:12px;height:12px}` (app-v2.css:2663-2664).

The only floor, `.ed-doc .nda-open, .ed-comments .nda-open {min-height:44px;min-width:44px}` (authoring-v2.css:1688-1692), is inside `@media (max-width: 760px)` (opened at :1552). At desktop width each button is 12×12 and the two touch, failing WCAG 2.2 SC 2.5.8. There is no other reorder control.

### proposedFix

CSS only, in a file no lane holds. authoring-v2.css, outside any media block, near the `.ed-dot` rules (:197):
`.ed-doc .nda-open, .ed-comments .nda-open { min-width: 24px; min-height: 24px; justify-content: center; }`
Keep the 44px phone rule. Do not change `.nda-open` in app-v2.css: that class is used on every surface, and the file is held by session_01PwLFr8.

Test that fails first: a new client/src/concept2cure/v2/__tests__/workbenchMoveTargetSize.test.ts, copying the A-C-8 pattern (protocolSoaTargetSize.test.ts). Parse authoring-v2.css with media blocks stripped and assert a rule reaching `.ed-doc .nda-open` gives min-width and min-height of at least 24px. Also assert the Move pair in DocumentWorkbench.tsx is still `className="nda-open"`, so the rule reaches it.

### risk

A 24px minimum height on every .ed-doc and .ed-comments link (Rename, Check, Retry, Close) slightly changes the vertical rhythm of the section heading and rail rows at desktop width. Check it visually.

### files

- `client/src/concept2cure/v2/styles/authoring-v2.css` — held: False — c6526a36 2026-09-24T20:45:05Z — session_01FSu2RL. No board claim names it

## A-A-5 — OPEN — medium

### evidence

The dot is still `<span className="ed-dot" data-s="ok" title={node.status} />` (DocumentWorkbench.tsx:3072), rendered when nodeHasDraft is true (:3071).

`.ed-dot` backgrounds exist only for complete, review and draft (authoring-v2.css:203-211), so 'ok' paints a transparent 6×6 box.

The title is the governed store's status, which is 'todo' for a section drafted only here.

### proposedFix

1. authoring-v2.css, which no lane holds and can land now: add `.ed-dot[data-s='ok'] { background: var(--text-400); }`. --text-400 measures 3.37:1 light and 4.27:1 dark against --bg-000 (app-v2.css:2406); --idle is about 2.2:1.
2. DocumentWorkbench.tsx:3072, after the hold lapses: make the dot aria-hidden, drop `title={node.status}`, and put visually hidden 'has a draft' text inside the row button.

Tests that fail first:
- A new static CSS test: every data-s value the workbench renders on .ed-dot has a background rule. It is red today for 'ok'.
- A render test modelled on outlineProvenanceVisible.test.tsx: the outline row's accessible name contains 'has a draft' and not 'todo'.

### risk

Do not use data-s='complete' (--success), which would read as governed completion.

The CSS half alone makes the dot visible but leaves the 'todo' title. Land both, or say that only part is done.

### files

- `client/src/concept2cure/v2/styles/authoring-v2.css` — held: False — c6526a36 2026-09-24T20:45:05Z — session_01FSu2RL
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr8 / session_01KiDof7 / session_01KZK3jg. Board: hand-on item 6

## AUDIT-LABELS-CITATION — OPEN — low

### evidence

AUDIT_EVENT_LABELS (DocumentWorkbench.tsx:207-224) has no CITATION_ADDED, CITATION_UPDATED, CITATION_REMOVED or CITATION_REFRESHED. The server emits all four (authoring.router.ts:2696 type, :2763, :2835, :2877, :4669, :5017).

auditEventLabel (:331-334) falls back to the humanised raw value, so the rail shows 'citation refreshed' rather than the agreed 'source re-read; recorded checksum updated'.

The Audit rail's empty-state hint (:4593-4598) lists 'saves, reverts, reorders, freezes, signatures, exports' and not citations.

### proposedFix

DocumentWorkbench.tsx:207-224: add these labels:
- CITATION_ADDED: 'source cited';
- CITATION_UPDATED: 'citation text changed';
- CITATION_REMOVED: 'citation removed';
- CITATION_REFRESHED: 'source re-read; recorded checksum updated'.

In :4597, add 'citations' to the hint's list.

Test that fails first: a new client/src/concept2cure/v2/__tests__/auditRailCitationLabels.test.tsx. Feed the audit read one CITATION_REFRESHED row and assert the rail text 'source re-read; recorded checksum updated'. auditEventLabel is not exported, so go through the rail, or export it for the test.

### risk

None beyond wording. Keep the labels factual, per the microcopy rules.

### files

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr8 (until 2026-09-29T11:44Z); session_01KiDof7; session_01KZK3jg. Board: hand-on item 6

## RECITE-TOAST — OPEN — medium

### evidence

citeSource's toast is still `created ? 'Source recorded — …current checksum.' : 'Source re-resolved against its current content.'` (DocumentWorkbench.tsx:1946-1950).

The server records the opposite: 'A second cite of the same source writes nothing unless it brings new citation text; it never re-reads the checksum' (authoring.router.ts:2830-2831, since 63b43274).

Reproduced: a POST answering created:false shows 'Source re-resolved against its current content.' (scratch probe 'second-cite toast'). That is a false statement about a governed record's checksum.

### proposedFix

DocumentWorkbench.tsx:1949: 'This section already cites that source. Its recorded checksum is unchanged — use Re-read to compare it with the source as it is now.'

Test that fails first: a new test (it can share a file with HS-A-2's). Record a source whose POST answers `{created:false}`, assert no text matches /re-resolved against its current content/, and assert the new sentence is shown.

### risk

None. Wording only.

### files

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr8 / session_01KiDof7 / session_01KZK3jg. Board: hand-on item 6

## ANCHOR-REFUSED-TOAST — OPEN — low

### evidence

The host toasts 'Comment created — anchoring it to the selected text…' (DocumentWorkbench.tsx:2456). commentsApi passes only onCreate, onOpen and onAnchored (:4066-4075).

The editor's contract documents that onAnchored is not called when the quoted words changed (RichSectionEditor.tsx:241-245). The refused branch only sets the editor's own actionNotice (:1372-1376).

So the host's 'anchoring it…' toast gets no follow-up. This is mitigated, not fixed: the editor's in-canvas notice does state the outcome.

### proposedFix

1. RichSectionEditor.tsx:235-246: add `onAnchorRefused?: (commentId: string) => void` to commentsApi, and call it in the :1374 branch after setActionNotice.
2. DocumentWorkbench.tsx:4066-4075: pass `onAnchorRefused: () => fireToast('Comment created, but the words it quotes changed, so nothing is highlighted. The thread is in the Comments rail.', 'error')`.

Simpler alternative, host only: reword :2456 to 'Comment created.' and leave the outcome to onAnchored and the editor's notice.

Test that fails first: a new test that drives requestAnchoredComment with the quoted text mutated before onCreate resolves, then asserts a host toast naming the refusal.

### risk

The same outcome would be reported in two places, a toast and the canvas notice. Keep the wording aligned.

RichSectionEditor is held until 2026-09-29T05:17Z; the host-only alternative needs only DocumentWorkbench.

### files

- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` — held: True — e1ce5501 2026-09-28T05:17:26Z — session_01KiDof7 (until 2026-09-29T05:17Z). Board: row 78
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr8 / session_01KiDof7 / session_01KZK3jg. Board: hand-on item 6

## SEC-C-5 — OPEN — medium

### evidence

The tool schema still makes reason optional: `reason: { type: 'string' }`, `required: ['section_id']` (notifications-study-memory-tool-defs.ts:392-399).

The handler still records `reason: fcoiReason(input, 'Protocol section edited via AnA')` (AnaToolExecutor.ts:11620). fcoiReason (:10127-10131) returns the model's text if it is 8 characters or more, else the fixed sentence.

The confirm path carries no person's reason:
- the register classes the tool 'confirm' (tool-authorization.register.json:3847-3851);
- governed-tool-gate.ts:134 gives every registered tool tier 'confirm';
- utility.ts:595-597 checks only `body.confirm === true` for that tier;
- runConfirmedTool (utility.ts:221-245) passes no reason into ctx;
- ToolContext (AnaToolExecutor.ts:212-240) has no reason field.

No commit since the review touches this handler line. The role door is closed by 41e7c539, as the board says.

The same fcoiReason fallback is used by 59 handlers in the file, for example add_protocol_objective, create_irb_submission and cast_committee_vote.

### proposedFix

Smallest correct fix, for this tool:
1. part11-governance.ts: add a `REASON_TIER_TOOLS` set containing 'update_protocol_section', consulted in governedTierOf (:168) before the 'confirm' fallback. Keep it out of PART11_GOVERNED_COMMANDS, which is coupled to the command-rbac manager-tier anti-drift guard.
2. governed-tool-gate.ts:134: use `tier: governedTierOf(call.name)` instead of the literal 'confirm'. GovernedActionSignoff.tsx:81 then shows the reason field, because confirmOnly is tier==='confirm'.
3. utility.ts: the route already requires reasonForChange of at least MIN_REASON_FOR_CHANGE_LEN for a non-confirm tier (:595). Pass it through runConfirmedTool as `ctx.humanReason`.
4. AnaToolExecutor.ts:
   - ToolContext gains `humanReason?: string`, documented as never read from input;
   - update_protocol_section refuses before BEGIN when ctx.humanReason is under 8 characters, and records ctx.humanReason, not fcoiReason;
   - drop `reason` from the tool schema (defs :397).

Test that fails first: a new server/services/ana/__tests__/update-protocol-section-reason.test.ts. Mock the pool, updateSectionTx and recordGovernedAction, then call getToolHandler('update_protocol_section')({section_id:1, content:'x'}, {organizationId:1, userId:1, humanConfirmed:true}). Assert a refusal and that recordGovernedAction was not called. Today it records 'Protocol section edited via AnA'. Add a second case with humanReason 'Aligns §5 with SAP v2' and assert that exact reason is recorded.

### risk

A person now types a reason for each AnA protocol-section write. That is the intended Part 11 behaviour.

The 58 sibling handlers keep the substitution. Changing fcoiReason centrally to take ctx would raise all 59 tools to the reason tier: a product and UX decision for the lane, not a silent widening.

Four held files. AnaToolExecutor.ts has a live board claim by session_019ZvHmh (row 76).

### files

- `server/services/ana/AnaToolExecutor.ts` — held: True — 25cfc551 2026-09-28T17:18:50Z — session_01M8bGFS (until 2026-09-29T17:18Z); also session_019ZvHmh (13:26Z; board row 76 claimed, names the file), session_01KiDof7 (04:33Z), session_01KZK3jg (04:10Z). Board: hand-on item 7
- `server/routes/ana-ri/utility.ts` — held: True — 8a74ed55 2026-09-28T11:22:55Z — session_01KiDof7 (until 2026-09-29T11:22Z)
- `server/services/ana-ri/part11-governance.ts` — held: True — dc48d926 2026-09-28T17:32:30Z — session_01KiDof7 (until 2026-09-29T17:32Z)
- `server/services/ana/governed-tool-gate.ts` — held: False — aa4d5552 2026-09-26T13:35:32Z — session_01471vSK
- `server/services/ana/notifications-study-memory-tool-defs.ts` — held: False — 41b5b43e 2026-09-23T15:42:51Z — (no Claude-Session trailer)

## P11-B-1 — OPEN — blocker (per its verifier)

### evidence

Unchanged since the review:
- The client sends `{ content: serialized }` only (EctdCoauthor.tsx:357-363).
- The route reads `const { title, content, status } = req.body` (coauthor.ts:297), with no reason and no actor, and calls applyCoauthorDocumentPut (:327-332).
- The shared writer's transaction (coauthor-status-write.ts:276-303) makes one write, `tx.update(coauthorDocuments).set(set)` (:301). It writes no coauthor_document_versions row and no audit event.
- recordCoauthorDocumentEvent's eventType is still closed to deleted | retaken (coauthor-audit.ts:47).
- grep finds no 'coauthor_document.updated' anywhere.
- ectd-documents.ts:283 shares the writer.
- check-lineage-save-gate.mjs still does not see the writer's `.set(set)`.

The hand-on (board item 5) to session_01KiDof7 is unclaimed and unfixed.

### proposedFix

1. coauthor-status-write.ts applyCoauthorDocumentPut (:241): accept `actor` and `reason`. Inside the FOR UPDATE transaction, whenever `set` changes content, title or status:
   (a) when current.content is non-empty, insert it into coauthor_document_versions (the batch-draft-routes.ts:470-485 pattern);
   (b) call recordCoauthorDocumentEvent(tx, {eventType: 'coauthor_document.updated', reason, metadata: {beforeSha256, afterSha256, supersededVersion, fields}}), widening the union at coauthor-audit.ts:47.
   Do both on status-only PUTs too, which can withdraw an approved copy to draft.
2. coauthor.ts:297 and ectd-documents.ts: `requireGovernedReason(req.body?.changeReason)`, returning 400 before any write, and pass `coauthorAuditActor(req)`.
3. EctdCoauthor.tsx:357-363: collect the author's reason before Save and send `{ content, changeReason }`.
4. Add the writer to check-lineage-save-gate.mjs's population.

Test that fails first: a new server/routes/__tests__/coauthorPutAudit.test.ts on the existing PGlite harness (as coauthorPutStatus.test.ts does). Then:
- a content PUT without changeReason gets 400 and nothing is written;
- with a reason, one coauthor_document_versions row holds the prior text, and one audit_events row 'coauthor_document.updated' carries the reason and both hashes, in the same transaction.

All of these are red today.

### risk

The co-author canvas uses autosaveMs null, so there is one reason per Save. The UX is the same as the Authoring header field.

ectd-documents.ts callers must send changeReason, or they will now get 400; find every caller first.

coauthor.ts is held until 2026-09-29T02:15Z and EctdCoauthor.tsx until 11:44Z. The cold writer and audit files could land first behind an optional reason, but the only client caller goes through coauthor.ts.

### files

- `server/routes/coauthor.ts` — held: True — e2d36a2b 2026-09-28T02:15:12Z — session_01KiDof7 (until 2026-09-29T02:15Z). Board: hand-on item 5
- `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr8 (until 2026-09-29T11:44Z)
- `server/services/coauthor/coauthor-status-write.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdG
- `server/services/coauthor/coauthor-audit.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdG
- `server/routes/ectd-documents.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdG
- `scripts/ci/check-lineage-save-gate.mjs` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy

## NEW-AIACCEPT-POSTCOMMIT — NEW — medium (possibly high: same shape as GE-P-1, graded blocker)

### evidence

Found while checking HS-A-1's third path. POST /sections/:sectionId/ai/draft/accept (authoring.router.ts:3502) commits content and lineage at :3644. Then:
- createRevision runs on the pool after COMMIT and is caught as non-fatal (:3669-3673), so a failure leaves AI-drafted content saved with no revision row;
- createAuditTrail runs on the pool after COMMIT (:3674-3703). Its pool path throws in production (:690-694), so the route answers 500 (:3721-3724) for content already committed.

This is the exact pattern GE-P-1 (59b0d8f9) removed from revert (:2402-2423, 'a failed audit write left a committed, unaudited revert').

No lens read this part: part11-B read :3168-3290 only and lists the rest of the handler as not read.

### proposedFix

authoring.router.ts: move createRevision(…, client, 'ai-draft-accept') and createAuditTrail(…, client) inside the transaction, before COMMIT at :3644, as revert does at :2373 and :2413-2423. A failure then rolls the accept back.

Test that fails first: a new server/routes/__tests__/authoringAiDraftAcceptAtomic.test.ts. Make the audit write throw and assert the section content is unchanged and the draft is not consumed; today both are committed. Make the revision write throw and assert the same.

### risk

An accept now fails as a whole if the revision or audit write fails. That is the intended fail-closed behaviour, but the client's error path at DocumentWorkbench.tsx:2796+ (onAccepted is called only on success) should be checked.

The file is held until 2026-09-29T17:05Z. Hand this to the holder or file it on the board.

### files

- `server/routes/authoring.router.ts` — held: True — f0147f45 2026-09-28T17:05:50Z — session_01PwLFr8 (until 2026-09-29T17:05Z); session_01KiDof7 (until 16:48Z)
- `server/routes/__tests__/authoringAiDraftAccept.test.ts` — held: False — 4cf0a8a6 2026-09-05T19:06:33Z — session_015oLV2v

## Notes

Checked at HEAD 3c87da01 (2026-09-28T17:42:18Z). Read-only: the working tree is clean, and the only files written are under <scratchpad>/triage/wb/. The probe is wb.triage.test.tsx, its run is probe-run.txt (5 defect probes fail, 2 controls pass), and node_modules is a symlink to the repo's.

**Nothing on this list is fully fixed at HEAD.** Everything a later lane closed was closed by session_01KiDof7, not by the AnA-drive lane (…01KZK3jg):
- 59b0d8f9: HS-B-1, the rail picker only;
- e1ce5501: A-A-1, aria-required and the persistent note;
- 8a74ed55: A-A-2, the defaultPrevented guard only.

**DocumentWorkbench.tsx commits since 2026-09-28T00:00Z** (authored, non-merge):
- a75e3845, 01:16:06Z, session_01KZK3jg: "AnA says only what the screen did…" (+11/−3, AnA drive-program choices);
- 59b0d8f9, 04:21:02Z, session_01KiDof7: "Authoring editor: revert audited atomically; failed reads say so…" (+28/−2; GE-H-1, GE-P-*);
- e1ce5501, 05:17:26Z, session_01KiDof7: "Editor offers only the governed acts the server will allow; rail and ribbon a11y" (+268/−54; GA-1, GA-4);
- 8a74ed55, 11:22:55Z, session_01KiDof7: "ESG transmit via AnA…" (+5/−1; AnA Escape defaultPrevented);
- 53237f62, 11:44:44Z, session_01PwLFr8: "Part 11 console…" (+9/−4; Save label and title with no section).

Merges that touch the file only carry trunk, with the result equal to the trunk parent:
- df10de68, 01:58:27Z, session_01KZK3jg;
- 1de78ea8, 11:53:54Z, session_01PwLFr8;
- e49d62f6 (14:08:02Z) and 0ae4040c (14:59:13Z): no session trailer; they are merges onto session_01M8bGFS's branch (parents bf9022be and 7f82872d).

**When the holds lapse:**
- The AnA-drive lane's hold (…01KZK3jg) lapses at 2026-09-29T01:58:27Z, counting its merge df10de68 as the board does, or 01:16:06Z counting only a75e3845.
- That lapse no longer frees the file. session_01KiDof7 holds it until 2026-09-29T11:22:55Z and session_01PwLFr8 until 2026-09-29T11:44:44Z (11:53:54Z counting merge 1de78ea8).
- So the earliest time this lane can take back the DocumentWorkbench findings is **2026-09-29T11:53Z**, if nobody touches the file again.
- Board item 6's line "until 2026-09-29 01:58 … After that time, this lane takes back" is stale and should be corrected to name session_01KiDof7 and session_01PwLFr8.

**Can be done now in files no other lane holds:**
- A-A-4 in full (authoring-v2.css, cold since 09-24);
- the CSS half of A-A-5;
- the citationNode.ts and ProjectFilesPanel.tsx halves of HS-B-1 (this lane's own files), landed with defaults and wired once the workbench frees;
- the writer and audit halves of P11-B-1 (coauthor-status-write.ts, coauthor-audit.ts, ectd-documents.ts, all cold since 09-23). coauthor.ts frees at 2026-09-29T02:15Z.

**Waiting on holds:**
- the whole of SEC-C-5: AnaToolExecutor.ts until 2026-09-29T17:18Z (…01M8bGFS; also a live board claim, row 76, …019ZvHmh); utility.ts until 11:22Z; part11-governance.ts until 17:32Z;
- HS-A-1 through the router, until 2026-09-29T17:05Z;
- NEW-AIACCEPT-POSTCOMMIT, same file.

**Other board rows naming these files:**
- row 50 (…01WcyqbqW, "claimed" since 09-24) names DocumentWorkbench.tsx and authoring.router.ts only in expired window text, and its own list is closed;
- row 28 (…01E8btkB) names AnaToolExecutor.ts only as handed on.

**Scope note on SEC-C-5:** 59 AnA handlers use the same fcoiReason fallback. Fixing it centrally is a product decision; it is flagged, not assumed.

**Test fixture:** documentAuthoringEditor.test.tsx:95 still stubs a revision_count the server never returns. Correct it together with HS-A-1.
