# Part 11 UX lens: the editor family, the ProtocolDev family, 2026-09-28

Head reviewed: `7087f46e23ae763cc88c3ec3a05b3c0575649aec` (confirmed by reading `.git/refs/heads/concept2cure-v2` directly — no shell/git tool was available in this session, so all evidence below is from the working tree at that exact ref, read file-by-file; no gate was run, no file was edited).

## Scope actually covered

All fifteen files read in full, start to end, no truncation (line counts below are each file's last line number):

- `client/src/concept2cure/v2/surfaces/ProtocolDev.tsx` (1–234)
- `ProtocolDevCompliance.tsx` (1–211)
- `ProtocolDevDerivation.tsx` (1–458)
- `ProtocolDevDesign.tsx` (1–318)
- `ProtocolDevForms.tsx` (1–393)
- `ProtocolDevPanes.tsx` (1–203)
- `ProtocolDevProjections.tsx` (1–305)
- `ProtocolDevRegisters.tsx` (1–295)
- `ProtocolDevReviews.tsx` (1–159)
- `ProtocolDevSection.tsx` (1–284)
- `ProtocolDevShared.tsx` (1–56)
- `ProtocolDevSigning.tsx` (1–113)
- `ProtocolDevSoa.tsx` (1–285)
- `ProtocolDevWorkspace.tsx` (1–525)
- `ProtocolDevWrites.ts` (1–426)

Total 4,265 lines by my count (charge states ~4,250 — consistent).

Server files traced to a write, read the full mutation/signature path:
- `server/routes/protocol-development.ts` (1–532, full)
- `server/routes/protocol-reviews.ts` (1–219, full)
- `server/routes/protocol-risks.ts` (1–130, full)
- `server/routes/protocol-deviations.ts` (1–200, full)
- `server/routes/protocol-budget.ts` (1–92, full)
- `server/routes/protocol-soa.ts` (1–99, full)
- `server/routes/protocol-dev.routes.ts` (1–50, full)
- `server/services/protocol-development/pdev-view-assembler.ts` (1–673, full — this is the assembler behind `GET /api/protocol-dev`, the only document read every one of the 15 files uses)
- `server/services/protocol-development/protocol-development-service.ts` (lines 75–414 read; every write function's body confirmed: `updateSynopsisTx`, `updateDocumentHeaderTx`, `bindStudyDesignTx`, `unbindStudyDesignTx`, `updateSectionTx`, `addObjectiveTx`, `addEligibilityCriterionTx`, `addVisitTx`, `updateVisitTx`, `removeVisitTx`, `removeSoaAssessmentTx`, `addTeamMemberTx`, `snapshotVersionTx`, `finalizeProtocolTx`, `getCompleteness`, `listProtocolDocuments`, `getProtocolDocument`)
- `server/services/protocol-development/protocol-signature.ts` (1–233, full — the shared finalize/disposition signature ceremony)
- `server/services/protocol-reviews/protocol-reviews-service.ts` (`assignReviewerTx` 49–79, `assertMaySignDisposition`/`setDispositionTx` 97–173)
- `server/services/part11/signature-persistence.ts` (1–927, full — `persistElectronicSignature`, `persistGovernedActionSignature`, `persistGovernedSignSignature`, the protocol content-binding derivation)
- `server/middleware/orgMembership.ts` (`GOVERNED_WRITE_ROLES` 503–511, `requireEditorAccess` 531–547)
- `server/auth.ts` (186–230, `authMiddleware`)
- `server/bootstrap/register-inline-routes.ts` (mount lines 591–593, 600–602, 620–622, 629–631, 719–721, 728–730, 737–739)
- `server/services/ana/AnaToolExecutor.ts` (`finalize_protocol_document` 11598–11632; grepped for a disposition-signing tool, none registered)
- `client/src/concept2cure/_shared/components/EsignModal.tsx` (355–414, the post-sign manifestation screen only)
- `client/src/concept2cure/v2/surfaces/ProtocolGov.tsx` (98–137 `CompletenessGate`, 155 `AuditTrail` export — read only as far as needed)
- `server/routes/protocol-export.ts` — grepped for `finalized_by`/`finalized_at`/`signature`: zero matches.

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| P11-C-1 | **blocker** | `server/bootstrap/register-inline-routes.ts:592,601,621,630,729,738`; `ProtocolDevWorkspace.tsx:317-318` | Every ProtocolDev governed write except finalize/disposition has no authority check at all — a `viewer` can mutate a regulated protocol's sections, risks, deviations, budget, schedule of assessments, cover page and study-design link. |
| P11-C-2 | medium (gap) | `pdev-view-assembler.ts:54-70,385-393`; `protocol-reviews-service.ts:155-158`; `ProtocolDevReviews.tsx:39-79` | §11.50 signature manifestation (printed name, time, meaning) is shown once in the sign modal and then nowhere on the record: the read model never selects `finalized_by`/`finalized_at`, and `protocol_review_assignments` itself never records who signed a disposition or when. |
| P11-C-3 | medium (gap) | `ProtocolGov.tsx:155`; `pdev-view-assembler.ts:536-589` | No audit trail or version history is reachable from the ProtocolDev workspace at all — a shared `AuditTrail` component exists and is unused; `protocol_versions` is populated at finalize and never read back; no register row shows who/when. |
| P11-C-4 | medium (gap) | `ProtocolGov.tsx:129-134`; `ProtocolDevPanes.tsx:47,63-67`; `ProtocolDevReviews.tsx:61-72` | Finalize and Record-disposition stay fully enabled after the protocol is already finalized / the disposition is already signed; the server correctly refuses (honestly), but only after a full password re-authentication has already been spent. |

---

### P11-C-1 — blocker — no authority check on ~15 of the ~17 ProtocolDev governed-write routes

**What the code does.** `ProtocolDevWorkspace.tsx:317-318` is the *only* gate the client applies to every write control in the workspace (Add visit/assessment/risk/budget line, cover-page edit, bind/unbind study design, apply design derivation, request a review, and the schedule-of-assessments grid):

```
317:  const numericDocId = Number(doc.id);
318:  const canWrite = Number.isInteger(numericDocId) && numericDocId > 0;
```

The same shape recurs at `ProtocolDevSoa.tsx:243` (`const editable = Boolean(canWrite) && reason.trim().length >= MIN_REASON;`) and `ProtocolDevSection.tsx:87` (`const writable = Boolean(canWrite) && Number.isInteger(sectionId) && sectionId > 0;`). None of the 15 files reference the caller's org role anywhere except the narrow, correctly-implemented "is this review assigned to me" check in `ProtocolDevReviews.tsx`.

Server-side, every one of these routers is mounted with authentication only:

```
server/bootstrap/register-inline-routes.ts:592:    app.use('/api/protocol-development', authMiddleware, protocolDevModule.default);
server/bootstrap/register-inline-routes.ts:601:    app.use('/api/protocol-risks', authMiddleware, protocolRisksModule.default);
server/bootstrap/register-inline-routes.ts:621:    app.use('/api/protocol-deviations', authMiddleware, protocolDeviationsModule.default);
server/bootstrap/register-inline-routes.ts:630:    app.use('/api/protocol-reviews', authMiddleware, protocolReviewsModule.default);
server/bootstrap/register-inline-routes.ts:729:    app.use('/api/protocol-soa', authMiddleware, protocolSoaModule.default);
server/bootstrap/register-inline-routes.ts:738:    app.use('/api/protocol-budget', authMiddleware, protocolBudgetModule.default);
```

`authMiddleware` (`server/auth.ts:186-226`) verifies the JWT/session only — it never reads or checks role. Inside these routers, only the two *signed* acts add a role gate:

```
protocol-development.ts:496: router.post('/documents/:id/finalize', requireEditorAccess, signingAttempts, async (req, res) => {
protocol-reviews.ts:165:     router.patch('/assignments/:id/disposition', requireEditorAccess, signingAttempts, async (req, res) => {
```

Every other handler I traced — `POST /documents` (`protocol-development.ts:183`), `PATCH /documents/:id` cover page (`:242`), `POST`/`POST …/remove` study-design bind/unbind (`:266`, `:281`), `POST …/design-derivation/apply` (`:328`), `PATCH /sections/:id` (`:358`), `POST …/objectives|eligibility|visits|team` (`:374-475`), `PATCH /risks/:id` (`protocol-risks.ts:105`), `POST /deviations/:id/assessment` (`protocol-deviations.ts:124`), `POST …/items` / `PUT …/params` (`protocol-budget.ts:58,71`), `POST /cells` / `/cells/clear` (`protocol-soa.ts:70,81`) — has **no** `requireEditorAccess` and no other role check. `GOVERNED_WRITE_ROLES` (`orgMembership.ts:503-511`) excludes `viewer`; `requireEditorAccess` (`:531-547`) is the codebase's own established, opt-in gate for exactly this class of write, and it is used two lines away in the same file for the signed acts — so this is an inconsistency, not a documented design choice.

**Why it matters to a regulated user.** §11.10(g) requires authority checks so only authorized individuals can alter a record. A viewer-tier organization member — who the product's own role model says must not write — can today add or remove schedule-of-assessments rows, change a risk's residual rating, assess a deviation's severity and safety impact, add budget lines, rebind the study design a protocol claims to be a projection of, and edit the cover page of a regulated clinical/IRB/IACUC/IBC protocol, all without ever being told they lack permission and without the server ever refusing.

**Fix.** Add `requireEditorAccess` to every mutating route in `protocol-development.ts`, `protocol-risks.ts`, `protocol-deviations.ts`, `protocol-budget.ts`, `protocol-soa.ts`, and the non-disposition mutations in `protocol-reviews.ts`, matching the pattern already used for finalize/disposition. On the client, extend `canWrite` (and the SoA `editable`/section `writable` derivations) to also require an editor-tier role, and disable/hide the affected controls with a reason for a viewer, rather than showing them and having the server accept the write.

---

### P11-C-2 — medium, gap — §11.50 manifestation is shown once, then nowhere on the record

**What the code does.** The signing ceremony itself is correctly built: `EsignModal.tsx:365-414` shows, immediately after signing, "Signed by" (printed name + email), "Meaning", "Reason", "When" (`GovernedTimestamp`) and the chain hash, and `protocol-signature.ts:142-221` (`signProtocolAct`) persists all of it into `electronic_signatures` via `persistGovernedSignSignature` (`signature-persistence.ts:792-799`), which resolves the real name server-side (`resolveSignerIdentity`) rather than trusting the client. Finalize additionally writes `finalized_by`/`finalized_at` onto the protocol row itself:

```
protocol-development-service.ts:388:  await client.query(`UPDATE protocol_documents SET status = 'finalized', version = $3, finalized_by = $4, finalized_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2`, [docId, orgId, version, userId]);
```

None of this is ever read back by the surface. The document list query the workspace actually uses does not select it:

```
pdev-view-assembler.ts:385-393:
  const docsRes = await pool.query(
    `SELECT id, protocol_kind, protocol_number, title, design_type, phase, version, status, updated_at, sponsor, principal_investigator,
            study_design_id, study_design_linked_at
       FROM protocol_documents
      WHERE organization_id = $1 AND deleted_at IS NULL ...
```

For a review disposition it is worse: `protocol_review_assignments` itself is never given a signer/time/meaning column to update —

```
protocol-reviews-service.ts:155-158:
  await client.query(
    `UPDATE protocol_review_assignments SET disposition = $3, status = 'completed', updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [assignmentId, orgId, disposition],
  );
```

— so the read model (`mapReviews`, `pdev-view-assembler.ts:54-70`, backed by the `SELECT id, protocol_document_id, reviewer_name, reviewer_user_id, role, status, disposition, due_date FROM protocol_review_assignments` at `:421`) and its render, `ReviewerRow` (`ProtocolDevReviews.tsx:39-79`), can only ever show the *assigned reviewer's name*, role, due date and the disposition word — never who actually signed (materially different when signed `responsibility`/on-behalf-of, a case the write path itself tracks as `onBehalfOf` at `protocol-reviews-service.ts:171` and then discards on read), when, or under which declared meaning. `ProtocolHeader` (`ProtocolDevWorkspace.tsx:117-149`) shows only a status badge and a generic "updated" date, never a signer. The exported protocol (`protocol-export.ts`) carries no signature block either (grepped, zero matches for `finalized_by`/`finalized_at`/`signature`). The only feedback that ever named the signer is the ephemeral toast at `ProtocolDevWorkspace.tsx:497-505`.

**Why it matters to a regulated user.** §11.50(b) requires the signature's printed name, date/time and meaning to be included in *any* human-readable form of the record, not just a one-time modal. An inspector or QA reviewer opening this protocol a week later has no way, from this surface, to see who finalized it or who signed a given disposition and under what meaning — even though every one of those facts is captured correctly and durably in `electronic_signatures`.

**Fix.** Add `finalized_by`/`finalized_at` (resolved to a name) to the `/api/protocol-dev` read model and show it on `ProtocolHeader` once `status==='finalized'`. Record a `signed_by`, `signed_at` and `meaning` on `protocol_review_assignments` at disposition time (or join `electronic_signatures` by `signed_target='protocol-review-assignment:<id>'`), and render it on `ReviewerRow`, the same way `EctdCompile.tsx` renders `signatureMeaningLabel(...)` for release signatures.

---

### P11-C-3 — medium, gap — no audit trail or version history reachable from this surface

**What the code does.** `ProtocolGov.tsx:155` exports a ready-made panel for exactly this purpose (`export function AuditTrail({ entries }: { entries?: AuditEntry[] }) {`), and it is imported nowhere in `ProtocolDev.tsx` or `ProtocolDevWorkspace.tsx` (grepped for "Audit" in both files: zero matches). `protocol_versions` is populated on finalize (`protocol-development-service.ts:365-369,386`) and even has its own read path (`getProtocolDocument`, `protocol-development.ts:403-414`), but the assembler behind the *only* endpoint the workspace calls, `assembleOrgPdevDocs`, never includes it — its returned object (`pdev-view-assembler.ts:536-589`) ends at `studyDesign` with no `versions`/`history` key at all. Register rows carry the same gap: risks are mapped at `pdev-view-assembler.ts:561-567` with no `created_by`/`updated_by`, and `RiskTab`/`RiskRow` (`ProtocolDevRegisters.tsx:86-171`) render hazard, score, status, mitigation and owner but never who logged the risk or when — the same is true of `AmendmentsTab`, `DeviationsTab`, `MilestonesTab` (`ProtocolDevPanes.tsx`) and `BudgetTab` (`ProtocolDevRegisters.tsx`). Even "who requested this review" is dropped: `protocol_review_assignments.created_by` is written (`protocol-reviews-service.ts:76-78`) but never selected by `mapReviews`.

**Why it matters to a regulated user.** The skill's hard rule 5 and the charge's own lens both require a reachable, in-context change-history view for a regulated artifact. Every mutation here *is* correctly hash-chained through `recordGovernedAction` — this is not a "the ledger entry never happened" defect — but nothing in 4,265 lines of this surface lets a reviewer reach that ledger from the artifact itself.

**Fix.** Wire `PG.AuditTrail` (or an equivalent list) into the workspace, backed by a per-protocol read of `c2c_ana_actions`/`audit_logs` filtered on `target LIKE 'protocol-document:<id>%'` and `protocol_versions`; surface `created_by`/`updated_by` (resolved to a name) on at least the risk, deviation, amendment and budget rows.

---

### P11-C-4 — medium, gap — Finalize and Record-disposition don't reflect a terminal state before the user acts

**What the code does.** The "Finalize protocol" action's only enablement check is completeness, never `doc.status`:

```
ProtocolDevPanes.tsx:47:  const ready = !findings.some((f) => ['critical', 'blocking'].includes(str(f.sev)));
...
ProtocolDevPanes.tsx:63-67:
      <div className="pd-outline-gate">
        <PG.CompletenessGate pct={Number(doc.completeness ?? 0)} complete={counts.reqComplete} total={counts.reqTotal}
          findings={findings as never} ready={ready} readyLabel="Finalization readiness"
          actionLabel="Finalize protocol" onAction={onFinalize} />
```
```
ProtocolGov.tsx:129-134:
      {onAction && (
        <button className="pg-btn primary block" disabled={!ready} onClick={onAction}>
```

So a protocol that is already `status:'finalized'` still shows "Finalize protocol" as clickable; clicking it runs the *entire* re-authentication ceremony (password, meaning, reason) before the server refuses with the honest, correct message from `assertEditable`'s caller: `protocol-development-service.ts:376: if (doc.status === 'finalized') throw new ProtocolDevError('INVALID_STATE', 'Protocol is already finalized.');`. The same shape recurs for a signed disposition: `ReviewerRow`'s button is disabled only for "assigned to someone else," never for "already signed" —

```
ProtocolDevReviews.tsx:61-72:
          <button
            type="button"
            className="pg-btn outline"
            aria-label={'Record disposition for ' + (name || 'this reviewer')}
            disabled={someoneElses}
            title={someoneElses ? 'Assigned to another user. Only they can sign this disposition.' : undefined}
            onClick={() => onEdit('review-disposition', {
              id: Number(r.id), label: name,
              defaults: disposition ? { disposition } : undefined,
```

— even though the code is plainly aware a disposition may already exist (it pre-fills `defaults: disposition ? {...} : undefined`). The server correctly refuses re-signing: `protocol-reviews-service.ts:150-152: if (row.status === 'completed' || row.disposition != null) { throw new ProtocolReviewError('INVALID_STATE', 'A disposition is already signed for this review. Nothing was recorded.'); }`.

I confirmed the underlying content protection this masks *is* solid: every write function in `protocol-development-service.ts` (`updateSynopsisTx`, `updateDocumentHeaderTx`, `bindStudyDesignTx`, `unbindStudyDesignTx`, `updateSectionTx`, `addObjectiveTx`, `addEligibilityCriterionTx`, `addVisitTx`, `updateVisitTx`, `removeVisitTx`, `removeSoaAssessmentTx`, `addTeamMemberTx`, `snapshotVersionTx`) calls `loadDoc` then `assertEditable(doc.status)` (defined at lines 80-90) before touching a row, and `ProtocolDevWrites.ts:84-96`'s `refusal()` surfaces the server's own sentence rather than inventing one — so nobody is deceived, only inconvenienced, and for finalize/disposition a full re-authentication is wasted.

**Why it matters to a regulated user.** This is the same class of defect as the already-fixed `DocumentWorkbench.tsx` Revert-button gap (2026-09-24 finding Q6, fixed by disabling on `docSealed`) — just unaddressed here, and worse for the two signed acts because the wasted attempt costs a password re-entry, not just a click.

**Fix.** Gate the Finalize action on `doc.status !== 'finalized' && doc.status !== 'superseded'` in addition to `ready`; gate `ReviewerRow`'s button on `!(disposition)` in addition to `!someoneElses`, and relabel it (e.g. "Disposition signed") once recorded. Extend `canWrite` similarly so every other register control is disabled with a reason once the protocol is finalized/superseded, rather than relying on the server's after-the-fact refusal.

## Earlier findings re-verified

| Earlier id | Where | Status at `7087f46e2` | Evidence |
|---|---|---|---|
| 2026-09-22 Critical #1 / 2026-09-24 lenses.md "P1" (finalize + disposition ledgered as `sign` with no ceremony) | Originally `ProtocolRegisterForms.tsx`, `ProtocolDevWorkspace.tsx` | **still fixed**, re-verified fresh at this commit | `protocol-development.ts:492-529` and `protocol-reviews.ts:151-206` both route through `signProtocolAct` (`protocol-signature.ts:142-221`): meaning validated against a closed, act-specific vocabulary, `requireEditorAccess` + `signingAttemptLimiter` before the handler runs, `verifyReauth` (password + conditional TOTP, never session-inferred) before any write, a separation-of-duties check (`checkMeaningAgainstAuthorship`) run inside the transaction before the domain write, then `recordGovernedAction` + `persistGovernedSignSignature` on the same client, one COMMIT. The client-side capture also moved: finalize/disposition now live in `ProtocolDevSigning.tsx` + `ProtocolDevWrites.ts:360-382`, with `ProtocolRegisterForms.tsx` (outside my 15 files) now used only for the four register *create* forms, per `ProtocolDevWrites.ts`'s own header comment. |
| 2026-09-24 lenses.md residual note ("Protocol consent-form approve and deviation close write a `sign` ledger row through plain `governed()`", `protocol-consent.ts:157`, `protocol-deviations.ts:192`) | `protocol-deviations.ts` | **still open at the route**, confirmed **still unreached** by this file family | `protocol-deviations.ts:187-197`'s `POST /deviations/:id/close` still calls `governed(req, res, 'sign', ...)` — the plain ledger-only helper, no `signProtocolAct`, no re-auth, no `electronic_signatures` row — for a command it records as `'sign'`. I confirmed no client in the 15 files calls it: `DeviationsTab` (`ProtocolDevPanes.tsx:165-202`) offers only "Report deviation" (→ `ProtocolRegisterForms.tsx`, outside scope) and "Assess"/"Re-assess" (→ `assessProtocolDeviation`, a correctly non-signing `POST .../assessment`), never "Close." `ConsentTab` (`ProtocolDevReviews.tsx:114-158`) is read-only with no write affordance at all, confirmed by reading the full function. This matches the 2026-09-24 report's own note that "No client calls either one" — unchanged, and out of this family's reach. |
| 2026-09-28 part11-ux.md's own stated gap ("did not deep-trace protocol-dev... beyond confirming `finalize_protocol_document`'s AnA tool correctly refuses to sign in chat") | `server/services/ana/AnaToolExecutor.ts` | **re-confirmed, still clean; extended** | `AnaToolExecutor.ts:11598-11632`: `finalize_protocol_document` performs **zero** writes — no `recordGovernedAction`, no DB mutation — and returns `signatureRequired: true` directing the user to sign from the workspace with their password. Unlike the QMS `retire_qms_document` regression the 2026-09-28 ectd-lane pass found (an AnA tool that bypassed re-auth for an equivalent HTTP-gated act), there is no equivalent regression here. I additionally checked for a disposition-signing AnA tool and found none registered (`registerToolHandler` grep for disposition/sign-shaped names returns nothing beyond `finalize_protocol_document`'s own refusal) — so that vector doesn't exist to bypass either. |
| 2026-09-24 lenses.md Q1/Q3/Q6, Q2/QMS, DP-34/DP-35, and the 2026-09-28 reports' Submission Center / eCTD / QMS findings | Not this family | **not applicable** | All confirmed, by file path, to be outside the 15 `ProtocolDev*.ts(x)` files and their direct server call paths (they concern `artifacts.ts`, `authoring.router.ts`, `DocumentWorkbench.tsx`, `mdx-qms.ts`, `qms.ts`, `SubmissionSeqWorkspaces.tsx`, `GatewayTransmittals.tsx`); no regression of any of them was found reachable from ProtocolDev. |

**What held up well, worth recording so it is not re-litigated:** reason-for-change is enforced server-side (not just the client) with an identical `z.string().trim().min(8)` schema on every governed mutation I traced across `protocol-development.ts`, `protocol-risks.ts`, `protocol-deviations.ts`, `protocol-budget.ts` and `protocol-soa.ts` — no "reason the server ignores" defect anywhere in this family. Reviewer-assignment eligibility is validated server-side against `GOVERNED_WRITE_ROLES` (`protocol-reviews-service.ts:60-74`), matching the client's own filtering comment. Section-save optimistic concurrency (`expectedUpdatedAt`/`SECTION_CHANGED`) is implemented end-to-end and reported as a named refusal, never swallowed. A deviation's "Assess"/"Re-assess" control is correctly hidden once the deviation is closed (`ProtocolDevPanes.tsx:187`). Content immutability of a finalized/superseded protocol is comprehensively enforced at the service layer (`assertEditable`, called by every write function in `protocol-development-service.ts` I read) — the defect in P11-C-4 is that the UI doesn't anticipate this, not that the record can actually be altered.

## What I did NOT get to

- **`ProtocolRegisterForms.tsx`** — imported by `ProtocolDevWorkspace.tsx:22` for the four register *create* forms (objective, eligibility, milestone, amendment, deviation-create, risk-create). Not one of the 15 assigned files; I traced only enough to confirm its current scope (create-only) and that it is no longer where finalize/disposition live. Its own reason-enforcement and role-gating were **not** independently verified — it is the natural companion to every register whose *edit* half I did audit, and is worth a follow-up pass.
- **`ProtocolGov.tsx`** — read only the two exports load-bearing to my findings (`CompletenessGate`, the `AuditTrail` signature). `StatusBadge`, `FindingsList`, `Btn`, `Citation`, `labelize`, `SEV_TONE`, `Ic` were not read.
- **`design-derivation-service.ts`, `protocol-risks-service.ts`, `protocol-deviations-service.ts` (besides `assessDeviationTx`'s route wiring), `protocol-budget-service.ts`, `protocol-soa-service.ts`** — read only through their route files; the `*Tx` implementation bodies themselves (`addRiskTx`, `updateRiskTx`, `createDeviationTx`, `addCapaActionTx`, `setCapaStatusTx`, `closeDeviationTx`, `addBudgetItemTx`, `setBudgetParamsTx`, `addAssessmentTx`, `setCellTx`, `clearCellTx`) were not opened. Given the identical, verified pattern in every route file I did open, I judge this low-risk, but it is unverified.
- **`protocol-development-service.ts` lines 1-74 and any lines after 414** — not read (file header/imports/`createProtocolDocumentTx`, and whatever, if anything, follows `getProtocolDocument`). Nothing in my findings depends on this range.
- **`protocol-amendments.ts`, `protocol-milestones.ts`, `protocol-consent.ts`, `protocol-templates.ts`, `protocol-portfolio.ts`** route files — not read. Amendments/milestones have no add/edit affordance in my 15 files beyond `onAdd` (routed to the out-of-scope `ProtocolRegisterForms.tsx`); consent is read-only in this family as established above.
- **The other `review_protocol_*` AnA tools** (`review_protocol_budget`, `_timeline`, `_review_status`, `_risk_register`, `_completeness`, `_portfolio`/`_portfolio_analytics`, `_design_derivation`, `_regulatory_rules`, `_design_gates`) — not individually read; I relied on the `review_` naming convention and the file's own header comment that they are read-only. This should be treated as an assumption, not a verified fact.
- **A cross-app Audit Trail / Part 11 console** that might let a user reach the ProtocolDev ledger *outside* this artifact — not opened. I only confirmed, from `part11-compliance.ts`'s route list, that `GET /api/part11/signatures/by-target` exists server-side; whether some other in-app surface links to it for protocol targets specifically was not checked. This doesn't change P11-C-3's finding (the charge's own rule requires reachability *without leaving the artifact context*), but it bears on how bad the practical gap is.
- **`EsignModal.tsx` and `GovernedTimestamp`** — read only the ~60 lines directly answering the manifestation question; the re-authentication network call, retry/lockout handling and the rest of the component were not read (this shared component was already vetted "Clean" for a different call site in the 2026-09-22 report).
- No live database was queried and no CI gate was run (read-only constraint honored throughout).
