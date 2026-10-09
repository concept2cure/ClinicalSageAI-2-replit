# Part 11 UX lens: the editor family, DocumentWorkbench, 2026-09-28

## Scope actually covered

`client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — all 5,134 lines, read start to finish in sequential, overlap-checked passes (1–400, 400–900, 900–1400, 1400–1900, 1900–2400, 2400–2800, 2800–3260, 3260–3520, 3519–3541, 3540–3660, 3660–3820, 3820–4130, 4130–4330, 4330–4530, 4520–4700, 4700–4920, 4920–5135). No gaps.

Every mutation, fetch, and governed-state render in that file was traced to its server handler:

- `server/routes/authoring.router.ts` — read in detail: the global JWT/tenant middleware (100–186), `canEditSection` and the `/sections/:sectionId` prefix lock guard (205–460), `createAuditTrail`/`createAuditEvent`/`reverifyAuthoringSigner`/printed-name resolution (640–797), `PATCH /sections/:sectionId` (1647–2029), `POST /sections/:sectionId/revert` (2103–2236), `POST /sections/:sectionId/comment` and `PATCH /comments/:commentId` (2254–2448), `POST /sections/:sectionId/cite` (2453–2488), `POST /cite-source` and `DELETE /cite-source/:sourceId` (2515–2571), `POST /docs/:docId/freeze` (3708–3921), `POST /docs/:docId/e-sign` (3924–4123), `POST /refresh-token` (4305–4355), `POST /docs/:docId/apply-template` (4704–4800, frozen-lock portion), `POST /docs/:docId/refresh-all` (4631–4667), `GET /docs/:docId/signatures` (5703–5730), `GET /docs/:docId/audit` (5758–5783), `POST /documents/:id/tracked-change-decisions[/bulk]` (5927–6076), `POST /docs/:docId/sections/reorder` (6171–6254).
- `server/services/authoring/authoring-evidence.ts` (1–330) — the hash-chained revision writer and the audit-trail fail-closed policy.
- `server/services/clinical-regulatory-evidence/source-usage.service.ts` (1–60, 150–350, 460–532) — `citeSource`, `removeSourceCitation`, `refreshSourceCitation`.
- `server/middleware/authoringObjectAuthorization.ts` (full file) and `server/services/authoring/authoring-permissions.ts` (1–240, effectively full) — the document/section-level immutability and role gate mounted ahead of the router.
- `server/routes/governed-reason.ts` (full) and `shared/constants/governed-reason.ts`.
- `server/bootstrap/register-inline-routes.ts` (295–322) — mount order confirming `authoringObjectAuthorization` runs before every `/api/authoring` route.
- Migrations: `db/migrations/20260725_authoring_document_loop_tables.sql` (1–140) and `migrations/20260726_authoring_citation_source_usage.sql` (full), to establish what `authoring_citations.frozen_at` actually is and whether anything sets it (repo-wide grep: nothing in `server/` does; only two test fixtures do).
- Imported client components, read as far as needed to close a governed-action loop: `AuthoringFilingBar.tsx` (full, 267 lines — Freeze/E-sign), `AuthoringSignatures.tsx` (full, 185 lines — §11.50 manifestation), `AuthoringPlaceIntoFiling.tsx` (full, 460 lines — authoring→filing reason capture). `AuthoringCreateExport.tsx`, `AuthoringCollab.tsx`, `AuthoringExports.tsx`, `AuthoringRevisionDiff.tsx`, `AuthoringAiDraft.tsx`, `ProjectFilesPanel.tsx`, `ReviewTasksPanel.tsx`, `FileToVaultDialog.tsx`, `AssignReviewDialog.tsx`, `RichSectionEditor.tsx` were read only at the call-signature level DocumentWorkbench.tsx uses (see "What I did NOT get to").

What held up well, confirmed by direct read rather than carried over: the e-sign ceremony (`authoring.router.ts:3938-3964`, role check before credentials, then `reverifyAuthoringSigner`, printed name from a user-record lookup never the email), the §11.50(b) manifestation panel (`AuthoringSignatures.tsx`), reason-for-change enforcement on section save (client and server), attribution on the audit rail (`actor_email`, not a bare id), comment resolve/reopen (append-only, no delete), and the reorder/rename/track-changes metadata-audit path, which the router's own comments treat as deliberately as content changes are.

No git/shell tool was available in this session (Read/Grep/Glob/SubagentHandback only), so I could not run `git show`/`git log` to independently confirm the working tree equals `7087f46e2`; line numbers below are what `Read` returned against the working tree at task start, which the charge specifies as that commit.

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| P11-A-1 | **blocker** | `DocumentWorkbench.tsx:1790-1969`, `4463-4471`, `4527-4534`, `4619-4626` → `authoring.router.ts:2515-2571,4305-4355,4631-4667` → `source-usage.service.ts:172-260,488-532` | Citing, un-citing and re-resolving a section's evidentiary sources writes zero Part 11 audit trail, on any document, ever; un-citing is a hard DELETE with no trace. |
| P11-A-2 | **medium** | `DocumentWorkbench.tsx:3379-3391` → `AuthoringFilingBar.tsx:157-217,234-239` → `authoring.router.ts:3708-3921` | Freeze — re-verified from `docs/evidence/reviews/2026-09-24/lenses.md` (DP-35) — still requires no re-authentication or signing-credential check, unlike the adjacent E-sign action the same bar exposes. |
| P11-A-3 | **low** | `DocumentWorkbench.tsx:4463-4471,4527-4534,4619-4626` vs `3312-3338,3602-3611,4278-4286` | The Sources rail's citation controls are not hidden/disabled on a frozen/approved document, unlike every other governed control on this canvas; the server refuses correctly (gap, not a bypass). |
| P11-A-4 | **low** | `DocumentWorkbench.tsx:4468`; `source-usage.service.ts:218,256,508`; `db/migrations/20260725_authoring_document_loop_tables.sql:101-114` | `authoring_citations.frozen_at`, and the UI tooltip built on it ("Frozen citations are left alone"), describe a per-citation freeze that no production code ever sets; the document itself is still protected, but by an unrelated gate. |

---

### P11-A-1 — blocker — the citation/evidence-lineage subsystem is entirely unaudited

**What the code does.** Four client actions on the Sources rail each PATCH/POST/DELETE a Part-11-relevant fact — "what evidence was this section drafted from" — and none of the four server handlers, nor the service functions they call, ever write to any audit mechanism (`createAuditTrail`, `createAuditEvent`, `writeChainedAuditRow` — none appear).

- `citeSource` (`DocumentWorkbench.tsx:1790-1801`):
  ```
  1790	  const citeSource = useCallback(
  1791	    async (sourceId: number) => {
  1792	      if (!activeSectionId) return;
  1793	      try {
  1794	        const res = await apiRequest(
  1795	          'POST',
  1796	          `/api/authoring/sections/${activeSectionId}/cite-source`,
  ```
  → `authoring.router.ts:2515-2546` (`router.post('/sections/:sectionId/cite-source', ...)`) calls `citeSource()` from `source-usage.service.ts:172-243`, which does an `INSERT INTO authoring_citations` (226-241) or `UPDATE` (214-220) and returns — no audit call anywhere in either function.
- `uncite` (`DocumentWorkbench.tsx:1836-1848`) → `authoring.router.ts:2549-2571` (`router.delete('/sections/:sectionId/cite-source/:sourceId', ...)`) → `removeSourceCitation()` (`source-usage.service.ts:246-260`):
  ```
  253	  const { rowCount } = await pool.query(
  254	    `DELETE FROM authoring_citations
  255	      WHERE section_id = $1 AND tenant_id = $2 AND source = $3 AND reference_id = $4
  256	        AND frozen_at IS NULL`,
  257	    [sectionId, orgId, CRE_SOURCE_CITATION, String(id)],
  258	  );
  259	  return (rowCount ?? 0) > 0;
  ```
  A hard delete. No audit row, no soft-delete, no tombstone — once removed, nothing in the system says the citation ever existed.
- `reresolve` (`DocumentWorkbench.tsx:1873-1885`) → `authoring.router.ts:4305-4355` (`POST /sections/:sectionId/refresh-token`) → `refreshSourceCitation()` (`source-usage.service.ts:488-532`), which on a checksum mismatch does `UPDATE authoring_citations SET payload_sha256 = $1 ...` (525-529) — again no audit call.
- `refreshAllSources` (`DocumentWorkbench.tsx:1921-1925`) → `authoring.router.ts:4631-4667` (`POST /docs/:docId/refresh-all`), which loops `refreshSourceCitation()` per citation (4650-4659) and responds `res.json({ ok: true, refreshed, changed, skipped })` (4662) — no audit call in the handler either.

**Why it matters.** `source-usage.service.ts`'s own header calls `payload_sha256` "what makes propagation durable rather than a guess" and states it is "read by the document assembler, the freeze path and the citation APIs" (lines 20-26). This is exactly the kind of fact §11.10(e) exists to keep a "who/when/why" record of, and the product treats it that way everywhere else: the same router writes an explicit audit row for a section **rename** or a **track-changes toggle** with the comment "A METADATA CHANGE IS STILL A CHANGE TO A GOVERNED RECORD" (`authoring.router.ts:1939-1954`), for a **comment** creation/resolution (`2308-2314`, `2416-2430`), and for a section **reorder** (`6237`). Citing or un-citing the evidence a regulated section is drafted from is a more consequential fact than any of those three, and it is the one governed action in this file that leaves no trace anywhere. The Audit rail's own empty-state text confirms the product does not think it covers this: `DocumentWorkbench.tsx:4369-4370` — *"Governed acts on this document — saves, reverts, reorders, freezes, signatures, exports — are recorded here"* — citations are not on that list because none is ever produced. Contrast with `POST /sections/:sectionId/ai/draft/accept` (`authoring.router.ts:3178-3270`), which records citations from an AI draft inside the same audited, lineage-gated transaction as the content save — so the omission is not "citations are out of scope for auditing," it is that the one **manual** path to add/remove a citation was never wired to it.

**Evidence standard.** This is not "the UI doesn't show it" — I confirmed by reading every line of all four route handlers and all three service functions that no audit-writing call exists in the successful-write branch of any of them. It is a "the system does not do this" defect.

**Smallest fix.** Add a `createAuditTrail`/`createAuditEvent` call (non-transactional standalone form is sufficient, matching the pattern already used for comments and reorder) after each successful write in `citeSource`, `removeSourceCitation`, and `refreshSourceCitation` (or at their three call sites in `authoring.router.ts`), recording section/doc id, source id, old/new checksum, and actor. Add a `citation_added` / `citation_removed` / `citation_refreshed` entry to `AUDIT_EVENT_LABELS` in `DocumentWorkbench.tsx:207-224` (the fallback humanizer already covers an unmapped key, but an explicit label is clearer). Consider soft-deleting `authoring_citations` rows instead of a hard `DELETE`.

---

### P11-A-2 — medium — Freeze still has no re-authentication or signing-credential check (re-verification of lenses.md DP-35)

**What the code does.** `DocumentWorkbench.tsx:3379-3391` mounts `AuthoringFilingBar`, which renders both **Freeze** and **E-sign** as siblings:
```
3379	            {activeDoc && (
3380	              <AuthoringFilingBar
3381	                docId={activeDoc.id}
3382	                docTitle={activeDoc.title}
3383	                docStatus={activeDoc.status}
```
`AuthoringFilingBar.tsx:236-239` wires Freeze to a dialog whose only field is a typed reason (`FREEZE_FORM`, lines 86-112: `reason` textarea, no password/MFA field), posting to `POST /api/authoring/docs/:docId/freeze` (`doFreeze`, 163-179). Server side, `authoring.router.ts:3708-3722`:
```
3708	router.post('/docs/:docId/freeze', async (req: Request, res: Response) => {
3709	  try {
3710	    const { docId } = req.params;
3711	    const { reason, version } = req.body;
3712	    // §11.10(e): the reason is validated here and recorded as given — never
3713	    // replaced by a placeholder in the ledger.
3714	    const reasonVerdict = requireGovernedReason(reason);
...
3719	    const email = getActorEmail(req) || null;
3720	    if (!email) {
3721	      return res.status(401).json({ error: 'Authentication required' });
3722	    }
```
Nothing between `3708` and `3921` (the end of the handler, read in full) calls `assertSigningAuthority` or `reverifyAuthoringSigner`. Compare the sibling e-sign handler mounted by the same bar, `authoring.router.ts:3938-3964`:
```
3938	    // §11.10(g) authority, checked BEFORE the credentials. Order matters...
3941	    if (!(await assertSigningAuthority(req, res))) return;
...
3961	    // §11.200(a)(1): the signer re-verified, last, so a refusal costs nothing
3963	    const signer = await reverifyAuthoringSigner(req, res);
3964	    if (!signer) return;
```
One nuance the original finding didn't spell out and that I confirmed by reading `authoringObjectAuthorization.ts:29-41` and `authoring-permissions.ts:79-85`: freeze is *not* wide open. `actionFromPath` classifies `freeze` as `'approve'`, so only a caller holding OWNER or APPROVER on the document (or a global admin) may call it at all — and the document's own creator gets OWNER automatically on creation (the trigger cited at `authoringObjectAuthorization.ts:111`). So this is an **authorization** gate (who may act), not an **authentication** gate (proving it is really them, right now) — the exact §11.200 distinction the finding is about. A document's own author, on an already-open session, freezes it with a bearer token and a sentence.

**Why it matters.** Freezing moves the document into a state (`FROZEN`) that this file's own UI treats as sealed and that (per the prior report's unverified-this-pass downstream trace, carried forward — see below) other surfaces treat as approved/complete for leaf-completeness purposes. A control the product visibly applies to E-sign one button over is silently absent for the action that seals the record.

**Not independently re-verified this pass:** the downstream consequence chain (`leaf-source-resolver.ts`, `assemble-from-core.ts`, `ind-checklist-view-assembler.ts` treating FROZEN as complete) — carried forward from `docs/evidence/reviews/2026-09-24/lenses.md` DP-35 without re-reading those three files. What I did independently confirm at this commit is the freeze/e-sign code asymmetry itself.

**Smallest fix.** As DP-35 already proposed: either require `reverifyAuthoringSigner` (a lighter touch than full e-sign — no meaning/intent needed) before `POST /docs/:docId/freeze` commits, or have downstream consumers stop treating an unsigned FROZEN state as complete. That is a product decision, not a cleanup, exactly as the prior report framed it.

---

### P11-A-3 — low (gap) — Sources rail write controls are not hidden/disabled on a frozen document

**What the code does.** Every other governed control on this canvas is gated on `docSealed` (`DocumentWorkbench.tsx:869-870`):
- Save: `3316` `disabled={!dirty || saving || docSealed || ...}`
- Draft with AnA: `3332` `disabled={docSealed}`
- Draft from sources: `3362` `disabled={!activeSection || docSealed}`
- Rename / Move: `3602`, `3612` — both wrapped in `{!docSealed && (...)}`
- Revert: `4282` `disabled={docSealed}`

The Sources rail's four write controls are not:
```
4463	            <button
4464	              className="nda-open"
4465	              onClick={() => void refreshAllSources()}
4466	              disabled={!activeDocId || refreshingAll}
```
```
4527	                {!picking ? (
4528	                  <button
4529	                    className="btn ghost"
...
4531	                    onClick={() => setPicking(true)}
```
```
4619	                          <button className="nda-open" onClick={() => void reresolve(s.citationId)}>
...
4623	                              <button className="nda-open" onClick={() => void uncite(s.source!.id)}>
```
None of these three (`Record a source` / `Re-read source` / `Remove`) checks `docSealed`. Unlike P11-A-1's `refresh-all`, these three specific writes ARE fully enforced server-side — twice over: the router's own `/sections/:sectionId` prefix guard (`authoring.router.ts:413-460`, `canEditSection`) and the separate `authoringObjectAuthorization` middleware (`sectionMatch` at `authoringObjectAuthorization.ts:133-140`, resolving to `documentStatusAllowsAction`'s immutable-status check at `authoring-permissions.ts:121-129`) both refuse a write against a FROZEN/APPROVED document's section. `refresh-all` is likewise covered by the second of those two (`docMatch`, `authoringObjectAuthorization.ts:174-181`), since it is not under the `/sections/:sectionId` prefix the router's own local guard covers.

**Why it matters.** This is the one place left on the canvas where the Hard Rule ("do not let a user click a governed button only to see a 403") is not honored — a click on a frozen document gets an honest, correctly-worded refusal toast (the existing `catch` blocks in `citeSource`/`uncite`/`reresolve`/`refreshAllSources` already surface the server's real message), but the affordance itself should not have been live. This is a **gap**, not a bypass: the server enforces the control the UI fails to reflect.

**Smallest fix.** Wrap the four controls the same way Rename/Move already are: `disabled={docSealed}` (or hide, matching the Rename pattern) with a title explaining the document is frozen — the same treatment Revert (Q6/P6, still fixed) already received.

---

### P11-A-4 — low (advisory) — a citation-level "frozen" flag that nothing ever sets, and a tooltip that claims it does

**What the code does.** `refreshSourceCitation` and `removeSourceCitation` gate on a per-row `authoring_citations.frozen_at` column (`source-usage.service.ts:218,256,508`), and the Sources rail's own tooltip repeats the claim:
```
4468	              title="Re-read every unfrozen citation in this document against its stored source. Frozen citations are left alone."
```
The column is defined at `db/migrations/20260725_authoring_document_loop_tables.sql:101-114` (nullable, no default, no trigger). A repository-wide search for anything that writes it (`UPDATE authoring_citations ... SET frozen_at`) finds exactly two hits, both inside `server/services/clinical-regulatory-evidence/__tests__/source-usage.pglite.integration.test.ts` (lines 362, 440) — nothing in `server/` route or service code, and no DB trigger, ever sets it. `authoring.router.ts:3708-3921` (freeze) and `3924-4123` (e-sign/approve) — both read in full — touch `authoring_documents` and `frozen_documents`, never `authoring_citations`.

**Why it matters.** As P11-A-3 established, a FROZEN/APPROVED document's citations are still fully protected — but by `authoringObjectAuthorization`'s document-status check, a completely different mechanism than the one this column and this tooltip describe. Today that is harmless, because the real gate is upstream of the dead one. It becomes a live hole the day someone "fixes" or bypasses the document-status gate (e.g., adds a new route under `/docs/:docId/...` that forgets the `authoringObjectAuthorization` mount, exactly the class of mistake `refresh-all` would have been vulnerable to if that middleware didn't exist) and trusts the citation-level `frozen_at` as a second line of defense that was never real.

**Smallest fix.** Either set `authoring_citations.frozen_at` at the moment a document freezes/approves (in the same transaction as the `frozen_documents` insert in `authoring.router.ts:3845-3909` and `3994-4105`), giving the column the defense-in-depth the comment already claims, or remove the column/check and the tooltip's claim and rely explicitly on the document-status gate, documenting that decision where the column is declared.

## Earlier findings re-verified

Scoped to findings that are actually located in `DocumentWorkbench.tsx` or in a component it directly mounts, per the charge ("for each earlier finding in your files and lens"). The great majority of the ~35 findings across the five prior reports concern other surfaces (ProtocolDev, QMS, Submission Center, Gateway Transmittals, Vault, Tasks, `SubmissionSeqWorkspaces.tsx`) and are not re-verified here because they are not in this file.

| id | source report | verdict at this commit | evidence |
|---|---|---|---|
| Q3 / P5 (2026-09-22 #5, 2026-09-24 lenses.md, 2026-09-28) — reason-for-change enforced client-only | `docs/evidence/reviews/2026-09-22/part11-ux.md`, `2026-09-24/part11-ux.md`, `2026-09-24/lenses.md`, `2026-09-28/part11-ux.md` | **still fixed** | Client: `DocumentWorkbench.tsx:1987-1994` refuses to POST below 8 characters; input at `3301-3311`; Save disabled at `3316` on the same floor. Server: `authoring.router.ts:1806-1813` calls `requireGovernedReason(req.body?.changeReason)` (`governed-reason.ts:30-34`, floor `GOVERNED_REASON_MIN = 8` in `shared/constants/governed-reason.ts:10`) and returns 400 rather than substituting a placeholder. |
| Q6 / P6 (2026-09-22 #6, 2026-09-24 lenses.md, 2026-09-28) — Revert not disabled on a sealed document | same four reports | **still fixed** | `DocumentWorkbench.tsx:4278-4286`: `disabled={docSealed}` with a title naming the reason. (Note: the 2026-09-28 report's line citation "`2225-2277,3744`" for this item does not match what is at those lines at this commit — comment-anchoring code and an `EmptyState` hint respectively, not the Revert button; the control itself is real and correctly gated, just at different line numbers than that report cited — a citation drift, not a regression.) |
| DP-35 (2026-09-24 `lenses.md`) — Freeze has no re-authentication/signing-authority check | `docs/evidence/reviews/2026-09-24/lenses.md` | **still open** — promoted to a numbered finding above (P11-A-2) with fresh line citations at this commit, plus the authorization-vs-authentication nuance the original finding did not separate out | See P11-A-2 |

Findings from the other four reports I confirmed do **not** touch this file (checked by reading the file in full and finding no matching code): Q1 (artifact review-quorum, `c2c/artifacts.ts`), Q2 (QMS retire, `mdx-qms.ts`), Q4 (`ProjectHome.tsx` actor id), Q5/V1 (Vault filing reason, `Vault.tsx`), P1–P4/T1–T4 (protocol sign, QMP, contradiction resolution, eCTD release-signature panel, task ledger — all other surfaces), Q-0928-1/2/3 and P11-28a/b (QMS AnA tools, Gateway Transmittals, `SubmissionSeqWorkspaces.tsx` freeze/dispatch gate) — none reference `DocumentWorkbench.tsx`, `AuthoringFilingBar.tsx`, `AuthoringSignatures.tsx`, `AuthoringPlaceIntoFiling.tsx`, or `authoring.router.ts`'s authoring-document routes.

## What I did NOT get to

- **`RichSectionEditor.tsx`** (the canonical canvas component) — not read internally. I trusted the `readOnly={docSealed}` / `onSave={saveSectionContent}` contract at the interface `DocumentWorkbench.tsx` uses, on the grounds that even a client-side editor defect cannot matter here: the server's `/sections/:sectionId` prefix guard (`authoring.router.ts:413-460`) and `authoringObjectAuthorization` both fail closed on a frozen document independent of what the client submits. If the editor's own track-changes/tracked-suggestion internals have a Part 11 issue of their own, this pass would not have caught it.
- **`ProjectFilesPanel.tsx`, `ReviewTasksPanel.tsx`, `FileToVaultDialog.tsx`, `AssignReviewDialog.tsx`** — the four Vault/task dialogs `DocumentWorkbench.tsx` mounts (`4659-4691`, `4997-5026`) were not traced to their server routes this pass. `DocumentWorkbench.tsx`'s own wiring (docId/programId passed straight through, real awaited writes, `onChanged`/`onFiled` refetch rather than optimistic update) looks consistent with the Vault/Tasks findings in the 2026-09-22 report (T1–T4, V1, both marked fixed/clean by 2026-09-24), but I did not re-read `vault-placement.service.ts` or `taskManagement.routes.ts` myself this pass to confirm that holds unchanged.
- **`AuthoringCreateExport.tsx`, `AuthoringExports.tsx`, `AuthoringRevisionDiff.tsx`, `AuthoringAiDraft.tsx`, `AuthoringCollab.tsx`** — read only at the call-signature level `DocumentWorkbench.tsx` uses them at (`3117-3139`, `3372-3378`, `3763-3773`, `4298-4301`, `4328`). `AuthoringAiDraft`'s server route (`POST /sections/:sectionId/ai/draft/accept`, `authoring.router.ts:3178-3270`+) was read far enough to confirm it runs citations through the audited lineage gate in one transaction (contrast with P11-A-1's manual path), not to the end of the handler.
- **`authoring.router.ts` routes `DocumentWorkbench.tsx` never calls** — confirmed by grep that this file makes no request to `/submit`, `/workflow`, or `/docs/:docId/sign` (as distinct from `/e-sign`, which it does call via `AuthoringFilingBar`). I did not trace those three handlers (`5212`, `5347`, `5542`) since nothing in this file's call graph reaches them; some other surface presumably owns them.
- **Git/commit verification** — no shell tool was available in this session; I could not run `git show 7087f46e2` or `git log` to independently confirm the working tree matches that commit. Line numbers are as read from the working tree at task start.
- **Live-database verification** — none of the above was checked against a running Postgres instance (e.g., confirming `authoring_citations.frozen_at` really is null on every existing row); the "nothing sets it" conclusion in P11-A-4 rests on a repository-wide source grep, not a data check.
