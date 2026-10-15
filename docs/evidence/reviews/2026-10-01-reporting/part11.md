# Reporting & analytics review, 2026-10-01: Part 11 UX

Generated from workflow `wf_527b6067-e34`: the lens's own report, then the refuting verifier's verdict on every blocker, high and medium. Low findings were not independently verified. Paths are as the agents wrote them. Line numbers are at the head they read and may have moved since. The README in this directory records which findings were fixed afterwards, and by which commit.

## PART11-1. [blocker] Finalize (seal and lock) is a side effect of the 'Export report' button: no confirmation, no reason, no re-authentication, no signature meaning, in the UI or on the server

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:704`
- **Impact:** SYSTEM DOES NOT (not a display gap). A manager or admin who clicks 'Export report' to get a PDF irreversibly turns the run 'final' and seals it; the page never says so beforehand. No reason is captured or persisted, no password is asked, no meaning (approve/review) is declared, and there is no void or supersede path afterwards (a second finalize is 409 RUN_ALREADY_FINAL). The platform's own convention for the same act is stricter elsewhere: finalize is an e-signature with password re-entry (AnA refuses to do it in chat), and 'lock' is a high-risk command needing re-auth and a reason of 8+ characters. The registry also declares compliance.audit_assurance_pack as `part11: true, signatureChain: true` and nothing reads that. The DP-47 fix (role gate, atomic chain row, no overwrite) is real but is the only control; the three Part 11 lenses on the launch diff did not register this.
- **Evidence:** Insights.tsx:704 `<button className="sp-primary" onClick={() => onExport && onExport(report)}>{I.download || I.fileText} Export report</button>`; Insights.tsx:991 `const res = await apiRequest('POST', `/api/report-os/runs/${runId}/finalize`);` (no body, no dialog before it); Insights.tsx:1007 `... provenance atoms · run locked final`. Server: report-os.ts:1846 `router.post('/runs/:id/finalize', requireRole('owner', 'admin', 'manager'), async (req, res) => {` (the only input is the path); report-os.ts:531-545 the chain row is written with `action: 'report_os.run_finalized'` and `details: { runUuid, reportTypeId, sealHash, algorithm, canonVersion, atomCount, sealedAt }`, no `reason`, no prior status, although auditService.ts:297 `const reason = typeof entry.reason === 'string' && entry.reason.trim() ? entry.reason : null;` shows the writer supports one; report-os.ts:482-504 writeFinalize overwrites `status = 'final'` in place. Platform convention: c2c/actions.ts:105 `HIGH_RISK_COMMANDS ... 'sign', 'lock'`; c2c/actions.ts:647-649 `body.reason.trim().length < 8 ... 'REASON_REQUIRED'`; c2c/actions.ts:654-660 `verifyReauth` for high-risk; AnaToolExecutor.ts:12111 `Finalizing is an electronic signature: the user finalizes it from the protocol workspace and enters their password.`; taxonomy.ts:62 `governanceRequirements: { part11: true, signatureChain: true }` on compliance.audit_assurance_pack, with `grep governanceRequirements` finding no reader outside taxonomy.ts.
- **Suggested fix:** Split Finalize from Export. Give Finalize its own control and a governed dialog (artifact, run id, type, scope, 'completed/partial -> final', consequence: 'locks this run and cannot be undone here'). Server: require a reason (8+ chars, same rule as c2c/actions.ts), pass it through writeReportEvent into writeChainedAuditRow, record the prior status in details, and either route through verifyReauth (password) with a declared meaning if the product treats finalize as an approval, or say in the UI that the seal is not an electronic signature (as ComplianceReportResult.tsx:126-131 does) and still require confirmation and reason. Add a void/supersede path so a mistaken seal is retired visibly rather than permanent.
- **Verifier:** real = `True`, severity = `medium`.

  > I checked this at HEAD (14c17341, concept2cure-v2). The mechanism is real and a user can reach it from the launch surface. The finding's line numbers have shifted a little, but the code is the same.
  > 
  > What the code does:
  > - Client: Insights.tsx:706 renders only `<button className="sp-primary" onClick={() => onExport && onExport(report)}>... Export report</button>`. There is no title, warning or dialog. exportRep (Insights.tsx:1014) calls `apiRequest('POST', `/api/report-os/runs/${runId}/finalize`)` with no body at :1021, then downloads the PDF at :1056.
  > - The user only learns about the lock afterwards, from the toast: `... provenance atoms · run locked final` (:1037).
  > - The code comment at :989-1012 shows this ordering is on purpose ("The seal is attempted first because sealing changes what the PDF states"). It is not an accident.
  > - Server: report-os.ts:1838 `router.post('/runs/:id/finalize', requireRole('owner', 'admin', 'manager'), ...)` reads only the path id.
  > - finalizeOnChain (:504-545) locks the row and refuses a run already in status 'final'. writeFinalize (:473) runs `UPDATE report_runs SET status = 'final'` in place.
  > - The chained row (:521-534) holds runUuid, reportTypeId, sealHash, algorithm, canonVersion, atomCount and sealedAt. It holds no reason and no prior status. writeReportEvent (:343-354) never passes a `reason`, although auditService.ts:297 accepts one.
  > - The routes (POST /program-groups, /runs, /runs/:id/finalize, /bundles, /deliveries; PATCH /program-groups/:id) include no void or supersede path.
  > - requireEditorAccessForWrites (orgMembership.ts:571) is only a role check, with no re-auth.
  > - `governanceRequirements` is only declared, seeded and asserted in tests. No runtime code enforces it.
  > 
  > The platform's own conventions are as cited:
  > - c2c/actions.ts:105 lists HIGH_RISK_COMMANDS including 'lock'.
  > - c2c/actions.ts:647 requires a reason of at least 8 characters.
  > - c2c/actions.ts:654 calls verifyReauth.
  > - AnaToolExecutor.ts:12111 says protocol finalize is a password e-signature.
  > 
  > Not already registered: DP-47 (SECURITY_AUDIT_2026-09-24.md:251, and the D6 README table) covers only the role gate, overwrite and atomicity. It says nothing about confirmation, reason, re-auth or the coupling to Export.
  > 
  > Why the severity drops from blocker to medium:
  > - The platform itself says a seal is tamper-evidence, not an electronic signature (ComplianceReportResult.tsx:126-131: 'It is not an electronic signature.'). Insights does not call finalize a signature either. So 11.50, 11.200 and re-auth (password plus meaning) do not strictly apply, and that part of the finding is overreach.
  > - 11.10(e) holds: the audit row records the actor, time, action and seal hash on the tenant chain, atomically.
  > - 11.10(g) holds: the role gate is in place.
  > - The truthfulness gate means only a run that is eligible for final can be sealed.
  > - The harm is limited. Nothing is destroyed, the user can create a fresh run, and the role gate keeps out members, viewers and outside attackers.
  > 
  > The defect that remains is real. A governed, irreversible change of state happens as a hidden side effect of a control labelled 'Export'. It has no confirmation beforehand and no reason is captured (Annex 11 §9 expects a reason for this kind of change). A manager who only wanted a PDF gets a permanent 'report_os.run_finalized' entry on the trail against their name, for an act they did not knowingly choose. Nothing can retire that seal visibly afterwards.

  Correction: Severity is medium, not blocker. Drop the e-signature, password and meaning parts of the finding, because the seal is documented as not being an electronic signature (ComplianceReportResult.tsx:126-131) and Insights never presents it as one. Keep these parts:
- Finalize runs as a side effect of 'Export report' (Insights.tsx:706 → exportRep at :1021).
- There is no confirmation or warning before the lock.
- No reason or prior status is recorded in the chain row (report-os.ts:521-534).
- There is no void or supersede path.

Corrected line references:
- Insights.tsx:706 (button), :1021 (POST finalize), :1037 (toast).
- report-os.ts:1838 (route), :473-492 (writeFinalize), :504-545 (finalizeOnChain).

Fix:
- Split Finalize from Export, so that Export only downloads the run's current status.
- Give Finalize a confirmation dialog stating the consequence ('locks this run as final; cannot be undone here').
- Require a reason and pass it through writeReportEvent with the prior status.
- Add a supersede path.
- Add re-auth only if the product decides that finalize is an approval.

## PART11-2. [blocker] Truthfulness rules `forbidFinal` and `requireDisclosure` are declared on the two prediction report types and enforced nowhere; an unvalidated advisory forecast can be sealed 'final'

- **Where:** `server/services/report-os/truthfulness.ts:53`
- **Impact:** SYSTEM DOES NOT. The canvas tells the user a prediction 'is advisory ... held at partial, never final', and the registry (now deployed to every database by migrations/20260930_report_type_registry_seed.sql) carries `forbidFinal: true`. But evaluateTruthfulness has no branch for it, the canvas runs predictions through the generic POST /runs (not the advisory /api/insights/predictions/run that does emit a disclosure), and finalize evaluates a forced 'final' request. For both prediction types no downgrade rule applies, so even a run with outstanding blockers and low confidence is sealed final, the PDF says 'Status: final', and no disclosure block exists in the generic render. This is the 'control that implies a guarantee it does not provide' case. Not in the D2/D6 register.
- **Evidence:** truthfulness.ts:17-24 `TruthfulnessRules` lists allowPartial, requireBlockers, requireConfidence, forbidFinalIfMissingCritical, requireExplicitGaps; the function (53-117) reads none of forbidFinal or requireDisclosure. taxonomy.ts:462 and :480 `truthfulnessRules: { allowPartial: true, forbidFinal: true, requireDisclosure: true }`. Repo-wide grep for `forbidFinal` and `requireDisclosure` outside taxonomy.ts, the seed migration and a client type literal finds no reader. Insights.tsx:525 `Running the ${t.label} for ${p.code}. It is advisory — the model is not validated, so every projected value carries a disclosure and the result is held at partial, never final.`; Insights.tsx:870 the run is `apiRequest('POST', '/api/report-os/runs', ...)` with `reportTypeId: type.typeId`; report-os.ts:1871 `buildRenderedFromRun(run, reportType, 'final')` then :1872 `if (truthfulness.allowedStatus !== 'final')` is the only gate; report-os.ts:1775-1786 the generic renderReport adds no disclosure block (render.ts has none).
- **Suggested fix:** Enforce `forbidFinal` in evaluateTruthfulness (downgrade to partial with a reason, and make finalize refuse with 409 and that reason) and `requireDisclosure` (refuse to render or seal without a disclosure block). Route the canvas's prediction tiles through the advisory assembler, or add the disclosure block to the generic render for the prediction family. Add a test that finalizing prediction.regulatory_forecast returns 409, shown failing first.
- **Verifier:** real = `False`, severity = `none`.

  > Refuted at HEAD. The finding describes the code before commit f6d2c089 ("Reporting: a prediction is never sealed final, and 'No gaps detected' is printed only after a gap check", 2026-10-01 06:43). That commit is in HEAD 14c17341 on concept2cure-v2, and `git show HEAD:server/services/report-os/truthfulness.ts` contains the enforcement. The finding's line references (TruthfulnessRules at 17-24 with five keys, the function at 53-117, report-os.ts:1871-1872) match the old file, not the current one.
  > 
  > Current code:
  > - server/services/report-os/truthfulness.ts:24-26 declares `forbidFinal?: boolean;` and `requireDisclosure?: boolean;`. `RunTruthfulnessState` has `disclosure: boolean` at :43.
  > - truthfulness.ts:73-78: `if (rules.requireDisclosure && !state.disclosure && status !== 'draft') { status = 'draft'; reasons.push('This report type must disclose its method and limits, and this rendering carries no disclosure; it is held at draft.'); }`
  > - truthfulness.ts:79-82: `if (rules.forbidFinal && status === 'final') { status = rules.allowPartial === true ? 'partial' : 'draft'; reasons.push('This report type is advisory and is never final.'); }`
  > - server/routes/report-os.ts:1738 reads the rules from the registry row: `const rules = (reportType?.truthfulnessRules ?? {}) as TruthfulnessRules;`. :1753-1754 passes `disclosure: false` ("The generic renderer and the stored lineage report emit no disclosure block.").
  > - report-os.ts:1863-1869 (finalize) calls `buildRenderedFromRun(run, reportType, 'final')`, then `if (truthfulness.allowedStatus !== 'final') return res.status(409)...`. So for prediction.regulatory_forecast and prediction.crl_rtf_premortem, finalize now always answers 409 with downgradedTo 'draft' and both reasons. Nothing is sealed, and the PDF cannot say "Status: final".
  > - The rules reach every deployed database. migrations/20260930_report_type_registry_seed.sql:81 (and the forecast row) carries `{"allowPartial":true,"forbidFinal":true,"requireDisclosure":true}`, and the upsert is `ON CONFLICT (type_id) DO UPDATE SET ... truthfulness_rules = EXCLUDED.truthfulness_rules`, so a stale row cannot keep looser rules.
  > - No other write path seals a run. The only `status = 'final'` UPDATE is writeFinalize (report-os.ts:476), and finalizeOnChain is called only after that gate. insights-canvas-routes.ts and report-os-insights.ts have no finalize or seal.
  > - Tests: server/services/report-os/__tests__/truthfulness.test.ts:250-279 ("advisory report types"). It asserts draft when there is no disclosure, partial when a disclosure is present, and draft for forbidFinal without allowPartial. I ran it at HEAD: 21/21 pass.
  > 
  > The canvas offers only these two prediction tiles (Insights.tsx:114-115, 524). The other prediction.* types in prediction/report-types.ts are not on the canvas, so the canvas promise is now upheld by the server.

  Correction: Fixed at HEAD by f6d2c089. evaluateTruthfulness now enforces requireDisclosure (truthfulness.ts:73-78, held at draft) and forbidFinal (truthfulness.ts:79-82). POST /runs/:id/finalize returns 409 for both prediction types (report-os.ts:1863-1869), and unit tests cover it (truthfulness.test.ts:250-279, passing). One cosmetic gap remains, with severity at most low and not a Part 11 control failure. The canvas copy at Insights.tsx:527 says the result "is held at partial, never final". Because the generic renderer always passes `disclosure: false` (report-os.ts:1754), the server actually holds these runs at draft, which is stricter than what the canvas says. The copy is inaccurate but promises nothing the system fails to deliver.

## PART11-3. [blocker] POST /api/report-os/correspondence/capture writes the regulatory correspondence register with no audit row, no role gate, client-asserted source channel, and a duplicate, weaker parser

- **Where:** `server/routes/report-os.ts:2269`
- **Impact:** SYSTEM DOES NOT. Reporting & analytics claims the /api/report-os prefix, so in production every organisation reaches this route. Any authenticated member, including the read-only 'viewer', can file an inbound or outbound letter against a real submission of their organisation: a c2c_correspondence row, c2c_correspondence_issues rows (keyword-classified, confidence a constant 0.72) and a high-importance project memory entry that later AnA context draws on. Nothing is written to the audit chain, no timeline event, and the memory entry carries no user. The caller also chooses `sourceChannel` (`mailbox_sync`, `api_import`), so provenance of the record is a claim by the person typing. The canonical intake route (regulatory-correspondence.ts) does all of this in one transaction with a governed parser and a central audit row; this is a second, ungoverned writer of the same table, which also breaks CLAUDE.md zero-duplication. A route that mutates regulated content and does not record it is a blocker by the review standard. Not in the register (only /deliveries is, as DP-50 second half).
- **Evidence:** report-os.ts:2269 `router.post('/correspondence/capture', async (req: Request, res: Response) => {` with no requireRole or editor guard; the handler (2269-2337) calls persistCorrespondenceToPlatform (2288) and captureLearningMemory (2305) and never calls recordReportEvent or writeChainedAuditRow. report-os.ts:141-142 `direction: z.enum(['inbound', 'outbound', 'internal']).default('inbound'), sourceChannel: z.enum(['manual_upload', 'mailbox_sync', 'api_import']).default('manual_upload'),`. report-os.ts:971 `const issues = parseKeywordIssues(params.body);` and :1028 `0.72,` :1029 `'pending'`. report-os.ts:1036-1038 `} catch { return { issues, persisted: false }; }`. report-os.ts:683-688 `sourceDocumentType: 'report_os_correspondence', ... extractedBy: 'report_os_delivery'` (no actor). Canonical: regulatory-correspondence.ts:625 `extraction = runGovernedIssueParser(...)`, :650-720 one transaction incl. `addTimelineEventDB`, :722-729 `Central audit trail ... logAction`.
- **Suggested fix:** Delete the route and its parseKeywordIssues path and point any caller at /api/regulatory-correspondence (replacement by path must be named in the commit per the working agreement; no client caller exists in client/src). If it must stay: requireEditorAccessForWrites, one transaction, a chained audit row via writeChainedAuditRow, server-set sourceChannel, actor on the memory entry.
- **Verifier:** real = `False`, severity = `none`.

  > This is refuted at HEAD: the route the finding names no longer exists. On branch concept2cure-v2 at HEAD 9dbd9442, server/routes/report-os.ts has 2323 lines. Line 2269 is now inside GET /health, and lines 2261-2267 are a comment: "/* POST /correspondence/capture was removed 2026-10-01 (reporting review). It wrote the regulatory correspondence register, its issues and a project memory entry with no audit row, no role gate, a client-chosen source channel and a second keyword parser at a constant 0.72 confidence. No client called it. The canonical intake is POST /api/regulatory-correspondence/correspondence/intake ...". It was removed by commit e14fa01d ("Reporting: a viewer can read reports and change none of them; one correspondence intake"), which is an ancestor of HEAD. The working tree is clean. A grep of server, client and shared for "correspondence/capture" finds only that comment. The commit names the replacement by path and its tests, as the working agreement requires.
  > 
  > The other parts of the finding are also closed:
  > - **Role gate:** the router now mounts `router.use(requireEditorAccessForWrites)` at report-os.ts:61, so a viewer cannot write anywhere under /api/report-os.
  > - **Client-asserted sourceChannel:** the only remaining caller of persistCorrespondenceToPlatform is POST /deliveries (report-os.ts:2195-2210). It hard-codes `sourceChannel: 'api_import'` and `direction: 'outbound'`, so the caller does not choose them.
  > 
  > The finding's mechanism (viewer-reachable, ungoverned capture with a provenance the caller chooses) is no longer reachable by any user. Severity: none.
  > 
  > One leftover, outside this finding's scope: the platform_send branch of POST /deliveries (report-os.ts:2140-2259) still writes c2c_correspondence through the duplicate parseKeywordIssues path with constant 0.72 confidence. It does not call recordReportEvent or writeChainedAuditRow, and its catch at :1026-1028 swallows failures. The swallowed failure is already registered as DP-50 (second half), Open, plan P1-44. The missing audit row and the duplicate parser on /deliveries are not registered on their own. They are a separate finding at most, medium severity, because the route now requires an editor role and the server sets the channel. They do not keep this finding alive.

  Correction: Refuted: POST /api/report-os/correspondence/capture was removed in commit e14fa01d, an ancestor of HEAD. Only a removal comment remains, at server/routes/report-os.ts:2261-2267. The router is now editor-gated: report-os.ts:61 `router.use(requireEditorAccessForWrites);`. If anything is reported, it should be a separate, narrower finding on POST /deliveries platform_send (report-os.ts:2195-2210 calling persistCorrespondenceToPlatform at :955-1029). That path writes c2c_correspondence with the duplicate keyword parser at a constant 0.72 and no chained audit row. It is editor-only and the server sets sourceChannel 'api_import'. Its swallowed-failure half is already DP-50, Open. Suggested severity for that residual is medium, not blocker.

## PART11-4. [high] The report seal cannot be re-verified: the sealed document is not stored and not reproducible, nothing reads the stored seal, and a finalized run re-renders as partial/draft

- **Where:** `server/routes/report-os.ts:1871`
- **Impact:** SYSTEM DOES NOT (read from the code; not executed here). The UI says 'Sealed · sha256 abc123def456… · N provenance atoms' and the code calls this 'Part 11 record sealing'. An auditor who asks how to verify it gets no answer: (1) the hash is over a render built at finalize time with `generatedAt = now`, a different document from the one on screen and from any later render; (2) only `{seal, finalizedAt}` is stored, not the document; (3) `verifySeal` has no caller outside tests, and no route returns the stored seal; (4) the sealed text says 'No gaps detected as of <seal time>' although the data is the run's earlier computation, so currency is stated as of sealing; (5) after finalize `run.status` is 'final', which buildRenderedFromRun maps to a 'partial' request, so GET /runs/:id/rendered (and any AnA or API consumer) shows a sealed report as partial, or draft for types without allowPartial. Tamper-evidence is claimed and unavailable.
- **Evidence:** report-os.ts:1871 `const { rendered, truthfulness } = buildRenderedFromRun(run, reportType, 'final');` :1880 `const seal = buildSealedRecord(rendered);`. report-os.ts:1775-1786 `renderReport({ reportTypeId, ..., status: truthfulness.allowedStatus, truthfulness })` with no `generatedAt`. render.ts:52 `const generatedAt = input.generatedAt ?? new Date().toISOString();` :144 ``No gaps detected as of ${generatedAt}.`` :153 `generatedAt,` (inside the hashed object). seal.ts:137 `contentHash: computeContentHash(report),`. report-os.ts:498 `const merged = { ...(latest.snapshot_metadata ?? {}), seal, finalizedAt: at };` (hash and atoms only). Repo grep: `verifySeal(` appears in seal.ts:150 and tests only; `snapshot_metadata` is read nowhere in server code outside writeFinalize. report-os.ts:1754-1755 `const requestedStatus: ReportRunStatus = forceRequestStatus ?? (run.status === 'completed' ? 'final' : 'partial');` and report-os.ts:486 writes `status = 'final'`.
- **Suggested fix:** Persist the exact sealed document (or a canonical byte string) with the seal, render with a stored `generatedAt` and the run's computation time, add GET /runs/:id/seal that returns seal, sealer, time and a re-verification result, and make buildRenderedFromRun treat status 'final' as final. Until then the UI and PDF must not describe the seal as tamper-evidence. Show a test that re-renders a finalized run and fails today.
- **Verifier:** real = `True`, severity = `medium`.

  > I checked this at HEAD 9dbd9442 on concept2cure-v2. I edited nothing in the repo. I ran one scratch tsx script against the real render.ts, seal.ts and truthfulness.ts.
  > 
  > CONFIRMED
  > - No verification path exists. In report-os, verifySeal is defined at server/services/report-os/sealing/seal.ts:150 and is called only from tests (sealing.test.ts, seal-canon-version.test.ts). The verifySeal callers in server/services/audit belong to a different function in audit-hmac-seal.ts. No report-os route returns the stored seal. The route list is /runs, /runs/:id/dependencies, /export.pdf, /rendered and /finalize. The only read of snapshot_metadata is inside writeFinalize (report-os.ts:481-489). The merge at report-os.ts:488 is `const merged = { ...(latest.snapshot_metadata ?? {}), seal, finalizedAt: at };`, so the rendered document is never stored.
  > - The sealed render carries a timestamp nobody passes in. report-os.ts:1863 calls `buildRenderedFromRun(run, reportType, 'final')`, which then calls renderReport with no generatedAt. render.ts:104 sets `const generatedAt = input.generatedAt ?? new Date().toISOString();`, and render.ts:181 puts generatedAt into the hashed object. buildRenderedFromRun has no parameter for generatedAt. In the scratch run, re-rendering the same run with the same status gave `verifySeal -> { ok:false, 'content hash mismatch' }`.
  > - A final run re-renders as partial or draft. writeFinalize sets `status = 'final'` (report-os.ts:476). At report-os.ts:1744-1745, `requestedStatus = forceRequestStatus ?? (run.status === 'completed' ? 'final' : 'partial')`, so a 'final' run is requested as 'partial'. GET /runs/:id/rendered (report-os.ts:1814) calls it with no force. The scratch run showed `{allowPartial:true} -> partial` and `{} -> draft ['This report type does not allow a partial status.']`.
  > - The gap sentence states the wrong time. render.ts:89 prints `No gaps detected as of ${generatedAt}.`, where generatedAt is the render or seal time. The gap evaluation itself ran at run creation (computed.summary, report-os.ts:1548). The computation time is stored in run.freshness.generatedAt (report-os.ts:1555) and is not used. Since f6d2c089 this applies only to scopes where gaps were actually evaluated and none were found.
  > - The D6 register (DP-45..DP-57) has no entry for this. DP-48 is about the compliance-report export. The defect is open at HEAD.
  > 
  > OVERSTATED
  > - "Not reproducible" is too strong. In the normal case generatedAt and sealedAt are the same millisecond: the scratch run printed `generatedAt 2026-10-01T07:18:02.777Z sealedAt 2026-10-01T07:18:02.777Z`. sealedAt is stored in the snapshot seal and in the chained audit row (report-os.ts:523-533, `sealHash`, `sealedAt`). Rendering with requested status 'final' and `generatedAt = seal.sealedAt` verified as ok:true. So someone off-platform with database access could usually rebuild the sealed bytes. The product still provides no way to do it, and nothing guarantees it works.
  > - Reach from the launch UI is limited. The Insights canvas calls /rendered only right after creating a run (Insights.tsx:921). After finalize it just sets status 'final' locally (Insights.tsx:1036), so nobody sees the partial or draft mislabel in the UI. It shows up only through GET /api/report-os/runs/:id/rendered, which any member can call; no AnA tool calls it.
  > - The PDF part of the suggested fix does not apply. createRunPdf (report-os.ts:703-760) prints only `Status: ${run.status}` and makes no seal claim. The seal appears to the user only in the canvas toast at Insights.tsx:1037: `Sealed · sha256 <hash>… · N provenance atoms · run locked final`.
  > - The mitigations limit the harm. No route modifies a run after finalize. The finalize event and its seal hash sit on the chained audit trail, written in the same transaction (finalizeOnChain, DP-47). This is not a path to altering or losing a record.
  > 
  > SEVERITY
  > I rate it medium. A sealed record shows a toast claiming tamper-evidence that the product cannot verify. The API re-renders a sealed final run as partial or draft. The sealed text dates the gap check to seal time. These are real Part 11 overclaim and honest-state defects. They are not high: the bytes are usually reconstructable, the record is immutable through the API with the event on the chain, and the launch UI never shows the mislabel.
  > 
  > The cited line numbers have drifted. The real lines are render.ts:104/89/181 (the finding says 52/144/153), report-os.ts:1863/1871 (finding: 1871/1880), report-os.ts:488/476 (finding: 498/486) and report-os.ts:1744-1745 (finding: 1754-1755).

  Correction: Downgrade to medium and restate the finding as: "A report seal has no verification path, and a finalized run re-renders as partial or draft." Evidence at HEAD:
- report-os.ts:1744-1745 maps status 'final' to a 'partial' request, so GET /runs/:id/rendered shows a sealed run as partial, or as draft when the type does not allow partial.
- verifySeal (seal.ts:150) has no production caller, and no route returns the stored seal.
- buildRenderedFromRun cannot take generatedAt (render.ts:104), so the hash covers a timestamp the product never re-supplies. It equals sealedAt only by accident of timing.
- render.ts:89 dates "No gaps detected" to seal time, not to the gap check's time (run.freshness.generatedAt).
Drop the claim that the bytes cannot be reproduced; offline they usually can, by forcing 'final' and setting generatedAt = sealedAt. Drop the PDF wording item; the PDF makes no seal claim.

Fix:
- Treat 'final' as 'final' in buildRenderedFromRun.
- Thread a stored generatedAt (the seal's own, persisted) into the render.
- Persist the canonical sealed bytes, or that generatedAt, alongside the seal.
- Add a GET /runs/:id/seal route that re-renders the run and returns the verifySeal result.
- Add a test that finalizes, re-renders and verifies. It should fail at HEAD.

## PART11-5. [high] The sealed/final state is not manifested anywhere a reader can see it: no sealer, time, meaning or hash on the canvas or the PDF, no run history, status shown as a bare badge

- **Where:** `client/src/concept2cure/v2/surfaces/Insights.tsx:678`
- **Impact:** UI DOES NOT SHOW, and the PDF does not carry, what the server knows (the chain row has user, time and seal hash). After clicking Export, the only trace is a toast that auto-dismisses ('Sealed · sha256 abc… · N atoms · run locked final'); the header then shows a 'final' pill and the original 'generated' time. Who sealed it, when, and under what meaning are not stated; the prior status is not shown (rule 7); the PDF handed to an auditor lists type, scope, status, confidence, providers and blockers only, so it carries neither the seal hash nor who ran or sealed the report nor an export time. The surface holds the run id only in component state ('Only a freshly-run governed report can be exported'), so after a reload or navigation a sealed run cannot be reopened, re-exported or inspected from the UI although GET /runs exists. Times render in browser-local time with no year or zone.
- **Evidence:** Insights.tsx:688-692 header: `<span className={'ro-status st-' + stTone}>{report.status}</span> <span className="ro-gen">generated {new Date(report.generatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`; Insights.tsx:430-439 `RenderedReport` has no seal, sealer or sealedAt field; Insights.tsx:1006-1007 the only seal output is `setReport(r => (r ? { ...r, status: 'final' } : r))` and the toast string; toast.tsx:100-103 `setTimeout(() => setState({ msg: '', tone }), tone === 'error' || m.length > LONG_MESSAGE ? HOLD_LONG : HOLD_BRIEF)`; Insights.tsx:844 `const [reportRunId, setReportRunId] = useState<number | null>(null);` and :985 `Only a freshly-run governed report can be exported — run one first.`. PDF: report-os.ts:737-743 the five lines are Report Type, Scope, Status, Confidence, `Generated: ${safeIso(params.run.createdAt)}`; no `requested_by`, seal, finalize time or export id. No consumer reads `snapshot_metadata.seal` (see previous finding).
- **Suggested fix:** Return the seal, sealer (resolved to a person, not an id), sealed-at in UTC, meaning and prior status from a seal read endpoint and render them as a provenance stamp in the report header ('Final · sealed by Jane Smith 2026-10-01 14:32 UTC · sha256 abc123def456… · was: completed'). Print the same block plus run-by, export time and export id on the PDF. Add a runs list (GET /runs exists) so a sealed report can be reopened in context. Show UTC with year.
- **Verifier:** real = `True`, severity = `medium`.

  > I could not refute the mechanism. I checked it at HEAD (9dbd9442, concept2cure-v2, clean tree), and it is reachable by any owner, admin or manager who runs a report on the Insights canvas and clicks Export report.
  > 
  > What the code does:
  > - Insights.tsx:432-441 `RenderedReport` has no seal, sealer or sealedAt field.
  > - The header (Insights.tsx:691-693) shows only `{report.status}` as a pill and `generated {new Date(report.generatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`. That is browser-local time with no year and no zone.
  > - A successful seal only does `setReport(r => (r ? { ...r, status: 'final' } : r))` (Insights.tsx:1036) and builds a toast string (1037). The toast fires at 1073, and toast.tsx:77-79/102 dismisses it after 4.2 s, or 8 s for an error or long message.
  > - The run id lives only in component state (`useState<number | null>(null)`, Insights.tsx:861). It is cleared on a segment change (872). With no run id, export answers 'Only a freshly-run governed report can be exported — run one first.' (1015).
  > - Nothing in client/src calls `GET /api/report-os/runs` (route at report-os.ts:1892). So after a reload, a sealed run cannot be reopened, re-exported or inspected from the launch surface.
  > - `createRunPdf` (report-os.ts:703-765) prints run #/uuid, then Report Type, Scope, Status, Confidence and `Generated: ${safeIso(params.run.createdAt)}` (727-733), then providers and blockers. It has no seal hash, no finalizer, no finalize time and no export id. It does not carry the report sections either.
  > - `SealedRecord` (sealing/types.ts) has no sealer field. `writeFinalize` (report-os.ts:473-492) stores `{seal, finalizedAt}` in snapshot_metadata. No reader in client/ or server/ reads it back, and `GET /runs/:id/rendered` (1790-1817) does not return it.
  > 
  > The finding also understates one point. `buildRenderedFromRun` sets `requestedStatus = forceRequestStatus ?? (run.status === 'completed' ? 'final' : 'partial')` (report-os.ts:1745). So re-rendering a run already stored as 'final' requests 'partial' and returns partial (or draft). Even the API path a future reopen would use shows a sealed report below final, with no seal.
  > 
  > What is not a duplicate: the D2 README and D6 register DP-45..57 cover finalize role gating and atomicity (DP-47), "independent verification" wording on the compliance-report seal (DP-48), and other items. None covers how the report-os seal is shown on the canvas or the PDF.
  > 
  > Why the severity drops from high to medium:
  > 1. The repo describes its seals as platform tamper evidence, not electronic signatures (D6 README:39, said there of the compliance-report package seal). Finalize is a role-gated status change with a content hash, not a signing act with a meaning. So §11.50 name/date/meaning manifestation does not strictly apply, and the "under what meaning" part of the finding is overreach.
  > 2. Who sealed and when is not lost. `finalizeOnChain` writes a chained `report_os.run_finalized` row with sealHash, algorithm, canonVersion, atomCount and sealedAt, attributed to the request principal (report-os.ts:520-534). The PDF export also writes `report_os.run_exported` (1700-1712). An inspector can recover attribution from the audit trail.
  > 3. Nothing is falsified and nothing is exploitable. The gap is that the human-readable record (canvas and exported PDF) cannot be tied to its seal: the PDF says "Status: final" without the hash, finalizer or finalize time, and the sealed run cannot be reopened. That is a real §11.10(b)/(e) record-completeness and usability gap for a regulated customer, but it is not a launch blocker the way a forged or unrecorded seal would be.
  > 
  > Line numbers in the finding are slightly stale but point at the right code: the header is at 691-693 not 688-692, run-id state at 861 not 844, the refusal at 1015 not 985, the seal setReport at 1036-1037 not 1006-1007, and the PDF lines at report-os.ts:727-733.

  Correction: Severity medium, not high: the report-os seal is not an electronic signature (the repo calls its seals platform tamper evidence, not signatures; D6 README:39), so §11.50 meaning does not apply, and the sealer, time and hash are on the audit chain (report-os.ts:520-534). Everything else is confirmed at HEAD.

Corrected line references: Insights.tsx:691-693 (header), 1036-1037 (seal output), 861 (run-id state), 1015 (refusal), 1073 (toast); report-os.ts:727-733 (PDF lines).

Add a related defect: report-os.ts:1745 `forceRequestStatus ?? (run.status === 'completed' ? 'final' : 'partial')` re-renders an already-final run as partial or draft. Any reopen via GET /runs/:id/rendered would therefore show a sealed report below final, with no seal.

Suggested fix as proposed, plus:
- make buildRenderedFromRun treat a stored 'final' as final;
- return snapshot_metadata.seal/finalizedAt and the chain row's actor on the rendered read;
- print sealHash, canonVersion, finalizedAt (UTC, with year) and the finalizer's name on createRunPdf.

## PART11-6. [high] Role scoping: only finalize is role-gated; every other write under /api/report-os and /api/insights is open to the read-only 'viewer', and the canvas offers Run and Export to everyone

- **Where:** `server/routes/report-os.ts:1421`
- **Impact:** SYSTEM DOES NOT enforce the platform's own viewer-reads rule on these routes (requireEditorAccessForWrites is mounted on the protocol routers and not here), so a viewer can create runs, bundles, program groups, snapshots, deliveries, captured correspondence and report subscriptions. UI SHOWS then the server refuses (finalize only): the canvas never consults the session's `governed:write` permission (only TaskBoard.tsx uses canGovernedWrite, the fix for exactly this complaint, T2 2026-09-22), shows Export to every role, and a member or viewer who clicks it gets a PDF plus an error-styled toast 'Not sealed — finalizing a report is for organisation owners, admins and managers.' The server refusal itself is correct (clean item); the defect is that the click was offered, that Export always attempts the seal first, and that the writes are not gated at all.
- **Evidence:** report-os.ts:49 `import { requireRole } from '../middleware/auth';` is used once, report-os.ts:1846. No requireEditorAccess or role check on report-os.ts:1230 (POST /program-groups), :1276 (PATCH), :1365 (snapshots), :1421 (POST /runs), :1992 (POST /bundles), :2148 (POST /deliveries), :2269 (correspondence/capture); report-os-insights.ts:381 and :403 (subscriptions) likewise. orgMembership.ts:571-574 `requireEditorAccessForWrites` and :484-486 `viewer is the one org role this set excludes ... a viewer reads, everyone else in the organization can work`. shared/constants/permissions.ts:4-10 describes the same defect on the task board. Insights.tsx has no reference to permissions or canGovernedWrite; Insights.tsx:704 renders Export unconditionally; Insights.tsx:818 `if (status === 403) return 'Not sealed — finalizing a report is for organisation owners, admins and managers.';` and Insights.tsx:1042-1043 `const failed = fileNote.startsWith('no file saved') || sealNote.startsWith('Not sealed'); fireToast(..., failed ? 'error' : undefined);`. insights-canvas-routes.ts `/overview` returns no capability field.
- **Suggested fix:** Mount requireEditorAccessForWrites at the top of both routers (finalize keeps its narrower requireRole). Add `canFinalize` and `canWrite` to /api/insights-canvas/overview (or read the session permission with canGovernedWrite); with Finalize split from Export (first finding), disable Finalize with a tooltip naming the required role.
- **Verifier:** real = `False`, severity = `none`.

  > The finding describes an older tree, not HEAD. Its line numbers (POST /runs at :1421, finalize at :1846) match the file before commit e14fa01d (2026-10-01 07:10, "Reporting: a viewer can read reports and change none of them; one correspondence intake"). That commit fixed exactly this, and HEAD (9dbd9442 on concept2cure-v2) contains it.
  > 
  > Server side, at HEAD:
  > - server/routes/report-os.ts:50 imports `requireEditorAccessForWrites`, and :61 mounts it with `router.use(requireEditorAccessForWrites);` right after authMiddleware. It therefore covers POST /program-groups (:1220), PATCH /program-groups/:id (:1266), snapshots (:1355), POST /runs (:1411), POST /bundles (:1984) and POST /deliveries (:2140).
  > - Finalize keeps its narrower gate: :1838 `requireRole('owner', 'admin', 'manager')`.
  > - POST /correspondence/capture has been removed (:2261 comment "POST /correspondence/capture was removed 2026-10-01").
  > - server/routes/report-os-insights.ts:69 mounts `router.use(requireEditorAccessForWrites);`, covering /predictions (:250), /predictions/run (:288) and /subscriptions POST/PATCH (:388, :410).
  > - Each router is mounted only once (server/bootstrap/register-inline-routes.ts:213 and :217), so no ungated alias exists.
  > - /api/insights-canvas has only GET /overview, so there is no write to gate.
  > - The gate is the platform's standard one: orgMembership.ts:571-574 lets GET/HEAD/OPTIONS through and sends every other method to `requireEditorAccess`, which refuses any role outside GOVERNED_WRITE_ROLES {admin, manager, member, owner, super_admin}, i.e. it refuses a viewer.
  > - Confirmed by running it: `npx vitest run server/routes/__tests__/report-os-viewer-writes.test.ts` passes 24/24. That covers every write route refusing a viewer, a member passing, a viewer's reads answering, and "never reaches the subscription service".
  > 
  > Client side, at HEAD:
  > - Insights.tsx:8 imports canGovernedWrite, and :868 `const canWrite = canGovernedWrite(useAuthUser());`. Session permissions come from sessionPermissions in orgMembership.ts, so /overview does not need to return a capability field.
  > - runReport returns early for a viewer (:887-890) with the message "needs an editor role".
  > - The canvas shows a "View only. Running or exporting a governed report needs an editor role" note (:1150-1153), and the pack tiles get canRun={canWrite} (:1214).
  > - Export is not reachable by a viewer. It only renders inside ROReport when `report` is set. That happens only through runReport (:941-942, which a viewer cannot reach) or by re-showing an existing report (:965). The other paths (:872, :967, :978) clear it, and :1036 only changes the status of an existing report.
  > 
  > Leftover, already covered elsewhere: a 'member' (a writing role, but not owner/admin/manager) can run a report, sees Export (:706), and clicking it tries finalize first. The 403 then produces an error-styled toast saying 'Not sealed — finalizing a report is for organisation owners, admins and managers.' (:835 and :1072-1073) while the PDF still downloads. That is the Finalize/Export split finding (the finding itself defers to it as "first finding"). It is not a role-scoping hole: the server refusal is correct and no unauthorized write happens. This finding should not be re-reported. The viewer-writes part is fixed at HEAD, and the member Export UX belongs to the Finalize/Export finding at low severity.

  Correction: Refuted at HEAD: fixed by e14fa01d (2026-10-01). report-os.ts:61 and report-os-insights.ts:69 mount requireEditorAccessForWrites, the capture route is removed, and Insights.tsx:868 gates runs on canGovernedWrite with a View-only note at :1150. Verified with report-os-viewer-writes.test.ts passing 24/24. What remains is a member seeing Export, which tries finalize and shows an error toast on its 403. That is the separate Finalize/Export split finding, low severity UX, and the server refusal is correct.

## PART11-7. [high] POST /api/report-os/deliveries still records 'sent' / 'exported' with no audit row and no role gate (registered open as DP-50 second half / P1-44; confirmed open at HEAD, with facts not in the register)

- **Where:** `server/routes/report-os.ts:2148`
- **Impact:** SYSTEM DOES NOT. Registered as open, so only the additions are new: (a) no chain row is written for either channel, (b) no role gate, so a viewer can create it, (c) channel `external_pdf_export` stores status 'exported' for an export that never happened through this route, (d) `platform_send` writes an outbound `c2c_correspondence` row with status 'responded' and the delivery says 'sent' whether or not that row was written, and (e) the platform's own delivery rule, which requires an e-signature before external send of a final report and a draft watermark otherwise, is not applied here. A regulated customer's delivery register can therefore show a regulator transmittal that did not happen, by a role that should be read-only, with nothing on the chain.
- **Evidence:** report-os.ts:2233 `status: payload.channel === 'platform_send' ? 'sent' : 'exported',`; :2218 `correspondenceId = persisted.correspondenceId;` (`persisted.persisted` is never read); :2238 `await persistDeliveryRecord(delivery);`; report-os.ts:1000 `params.direction === 'outbound' ? 'responded' : 'new',`; :1036-1038 `} catch { return { issues, persisted: false }; }`; no recordReportEvent or writeChainedAuditRow anywhere in 2148-2267. delivery.ts:4-5 `no external send of a sealed/final report without an e-signature; non-final (draft/partial) exports are watermarked`, used only at worker-register.ts:67. Register: D6 README row `Deliveries report "sent" whatever the correspondence write did (DP-50, second half) | Open — plan P1-44`.
- **Suggested fix:** One transaction: correspondence row, delivery record and chain row, with 'sent' only when the correspondence row was written; refuse with 503 otherwise. Gate with requireEditorAccessForWrites and apply decideDelivery (e-signature for final, watermark for non-final) before recording.
- **Verifier:** real = `True`, severity = `low`.

  > I read the code at HEAD (9dbd9442, concept2cure-v2, clean tree for these files). The core problem is real and still open, but the register already has it. The most damaging new claim, that a viewer can create a delivery, is false. And no launch surface reaches the route.
  > 
  > **What is real and still open (already registered as DP-50 second half / P1-44):**
  > - report-os.ts:2210 `correspondenceId = persisted.correspondenceId;` never reads `persisted.persisted`.
  > - report-os.ts:2225 `status: payload.channel === 'platform_send' ? 'sent' : 'exported',` sets the status no matter what was written.
  > - report-os.ts:1036-1038 `} catch { return { issues, persisted: false }; }` swallows a failed correspondence write.
  > - Nothing in 2140-2259 calls recordReportEvent or writeChainedAuditRow.
  > - Addition (a), "no chain row", is not new. REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md:98 P1-44 already reads: "the correspondence row, the delivery record and the chain row in one transaction; `sent` only when the row was written".
  > 
  > **Refuted, addition (b) "no role gate, so a viewer can create it":**
  > - report-os.ts:61 `router.use(requireEditorAccessForWrites);` is committed at HEAD.
  > - orgMembership.ts:571-574 lets reads through and sends every other method to requireEditorAccess.
  > - requireEditorAccess (orgMembership.ts:545) returns 403 unless the role is in GOVERNED_WRITE_ROLES (admin, manager, member, owner, super_admin; :504-511). A viewer gets 403.
  > - server/routes/__tests__/report-os-viewer-writes.test.ts:61 lists `['post', '/api/report-os/deliveries']` among the writes a viewer is refused.
  > 
  > **Weak or not defects:**
  > - (c) Real but minor. With `external_pdf_export` the route only records the caller's word that an export happened. The actual export (GET /runs/:id/export.pdf, sendRecordedPdf at :425ff) writes a chain row carrying the bytes' SHA-256 before anything is sent.
  > - (d) Status 'responded' for an outbound row is the platform's own convention, not a defect of this route. The canonical outbound path, regulatory-correspondence.ts:257, also sets `status: 'responded'`. The "'sent' whether or not the row was written" part is DP-50 itself.
  > - (e) decideDelivery (scheduling/delivery.ts:16-45) returns `allowed: true` on every path. requiresESignature and watermark are advisory flags only, and the scheduled worker (worker-register.ts:67-79) just logs them. POST /deliveries sends nothing anywhere; it writes a register entry. So "the delivery rule is not applied here" does not mean a regulator receives anything unsigned.
  > 
  > **Reachability:**
  > - No client code calls POST or GET /api/report-os/deliveries. A grep of client/src finds report-os calls only in Insights.tsx (runs, rendered, finalize, export.pdf), AnaCommand.tsx and Orchestration.tsx (portfolio/org). AnaToolExecutor has no delivery tool.
  > - So neither 'insights' nor 'compliance-reports' creates or shows a delivery. The route is reachable only by a direct API call from an admin, manager or member session. The impact claim "a regulated customer's delivery register can show..." has no screen on the launch app that renders that register.
  > 
  > **A fact the finding missed (the same defect, slightly worse):**
  > - With `platform_send` and no project (a run whose scope is not a project and has no project lineage, resolveProjectIdForRun :606-621, and no body projectId), nothing is written at all. The correspondence write is skipped by the `&& projectId` guard at :2195, and persistDeliveryRecord returns early at :899 `if (!delivery.projectId) return;`.
  > - The route still answers 201 with `status: 'sent'`. This falls under P1-44's "'sent' only when the row was written" and should be added to the P1-44 test.
  > 
  > **Severity:** the register rates DP-50 Low–Medium (SECURITY_AUDIT_2026-09-24.md:254). With the role gate in place and no UI path, low is right, not high.

  Correction: Narrow the finding to the registered DP-50 second half / P1-44, confirmed open at HEAD.

1. **Status ignores the write.** POST /api/report-os/deliveries sets 'sent' / 'exported' (report-os.ts:2225) whatever persistCorrespondenceToPlatform returned; its `persisted` flag is never read (:2210). The route writes no chain row, which P1-44 already plans to add.
2. **Remove claim (b).** Writes are refused to a viewer by router.use(requireEditorAccessForWrites) at report-os.ts:61, tested at report-os-viewer-writes.test.ts:61.
3. **Drop (d) and (e) as defects.** 'responded' is the canonical outbound status (regulatory-correspondence.ts:257). decideDelivery is advisory: it returns allowed:true always, and this route transmits nothing.
4. **Add the missed case.** platform_send with no resolvable projectId answers 201 'sent' with nothing persisted: :2195 skips the correspondence write and persistDeliveryRecord returns at :899.
5. **Reachability.** No client calls this route; it is reachable only by a direct API call from an admin, manager or member session.

Severity: low (the register says Low–Medium). Fix as planned in P1-44: one tenant transaction for the correspondence row, the delivery record and the chain row; 'sent' only when the row was written, 503 otherwise. Refuse platform_send when no project resolves.

## PART11-8. [medium] PDF exports are not faithful, marked copies: non-final PDFs are not watermarked, content is silently truncated or clipped, and the bundle PDF reports status as of bundle creation

- **Where:** `server/routes/report-os.ts:713`
- **Impact:** SYSTEM DOES NOT. §11.10(b) asks for accurate and complete copies in human-readable form. The run PDF is a one-page cover sheet, not the report body. Blockers are capped at 20 without a marker; the 'Known Blockers' section is omitted entirely if the providers list consumed the page; long lines are not wrapped so they run off the 612pt page; non-ASCII characters (µ, ≥, °, accents) become spaces; nothing in the PDF says any of this happened. A partial or draft report downloads as a normal-looking PDF (status is one text line) although the delivery rule in code says such exports are watermarked, and the canvas deliberately downloads the PDF even when the seal was refused. The bundle PDF drops items past the page, prints 'Generated' as the bundle's creation time rather than the export time, and lists each run's status as it was when the bundle was created, not now.
- **Evidence:** report-os.ts:276-278 `return text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').slice(0, 1000);`; :286-289 `toBlockerArray ... .slice(0, 20)`; :756 `if (y < 80) break;`; :759 `if (params.blockers.length > 0 && y > 120) {`; :764 `page.drawText(`- ${sanitizePdfText(blocker)}`, { x: left + 8, y, size: 9, font: regular });` (no maxWidth); :814 `if (y < 70) break;` (bundle); :794 `Generated: ${bundle.createdAt}`; :811 status from the stored bundle item. delivery.ts:16-45 `watermark: true` for non-final, called only by worker-register.ts:67. Insights.tsx:1024-1040 the PDF is fetched whether or not the seal succeeded.
- **Suggested fix:** Wrap and paginate instead of break, print 'N more not shown' when anything is capped, keep non-ASCII (embed a Unicode font), render the report body or state plainly that this is a cover sheet, apply decideDelivery's watermark to non-final PDFs, and print run-by, export time (UTC) and export id. Take bundle item status at export time.
- **Verifier:** real = `True`, severity = `medium`.

  > I read the code at HEAD (9dbd9442, concept2cure-v2). The main mechanism is real and a real user reaches it. Several parts of the finding are overstated, though, and the cited line numbers have moved.
  > 
  > **Confirmed: no watermark and no draft marking.**
  > - GET /runs/:id/export.pdf (report-os.ts:1642-1712) builds the file with createRunPdf (report-os.ts:703-761) and returns it through sendRecordedPdf (report-os.ts:426-452). Neither function calls decideDelivery or draws any watermark.
  > - delivery.ts:5 states "non-final (draft/partial) exports are watermarked". delivery.ts:43 returns `watermark: report.status !== 'final'` for the platform channel. The only caller is worker-register.ts:67, and it only logs the decision.
  > - Runs are created with `status: computed.blockers.length > 0 ? 'partial' : 'completed'` (report-os.ts:1544). A partial or completed run therefore downloads with a single line, `Status: ${...run.status}` (report-os.ts:730), and nothing else marks it as a draft.
  > - 'completed' is also not final, and a reader could take it for final.
  > 
  > **Confirmed: the canvas downloads the PDF even when the seal is refused.** Insights.tsx:1006-1009 says the download "runs EVEN WHEN the seal is refused". Insights.tsx:1057 calls `apiRequest('GET', /api/report-os/runs/${runId}/export.pdf)` whatever the finalize result was. This is the 'Export report' action on the launch canvas.
  > 
  > **Confirmed: the PDF is a cover sheet, not the report body.** createRunPdf draws only the title, run id, type, scope, status, confidence, the createdAt time, the provider lines and the blocker lines. The rendered report body from GET /runs/:id/rendered is never included. Even so, the canvas comment at Insights.tsx:1000 calls it "the governed PDF".
  > 
  > **Confirmed: long lines run off the page.** Neither the provider line (report-os.ts:744) nor the blocker line (report-os.ts:754) has a maxWidth, wrapping or pagination. I checked this against a real critical gap from readinessEvaluator.ts:144-149, using pdf-lib's own Helvetica width function at 9pt:
  > - The line is 1166pt wide; the usable width is 554pt.
  > - Only 141 of 297 characters are drawn. They stop at "...(us_ind), so no a".
  > - The qualifier "treat the artifact half as unassessed, not as complete" falls off the page, and the PDF does not say so.
  > 
  > **Confirmed: non-ASCII characters become spaces.** sanitizePdfText (report-os.ts:266-268) applies `text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').slice(0, 1000)`. This includes the route's own " — " separator at report-os.ts:743, and symbols such as ≥ or µ in gap text.
  > 
  > **Confirmed, but API only: the bundle PDF.**
  > - createBundlePdf (report-os.ts:764-807) prints `Generated: ${bundle.createdAt}`, which is the bundle's creation time, not the export time.
  > - It prints each item's `status` as stored when the bundle was created (report-os.ts:2023). Nothing refreshes it at export (loadBundleById, report-os.ts:890-896).
  > - It stops at `if (y < 70) break;` (report-os.ts:803).
  > - No client code calls /bundles/:id/export.pdf, so this is reachable through the API but not from the launch UI.
  > 
  > **Overstated:**
  > - The 20-blocker cap (toBlockerArray, report-os.ts:276-279) does not bind in practice. orchestrator.ts adds at most about 10 blockers: one each at lines 95, 112, 129 and 154, up to 4 at line 287 (`.slice(0, 4)`), up to 2 at line 300 (`.slice(0, 2)`), plus one domain blocker.
  > - The providers list does not push the 'Known Blockers' section off the page either. About 37 provider lines fit before `y < 80`, and the orchestrator emits fewer than 10 providers.
  > - So the "silently capped or omitted section" parts are theoretical. Horizontal clipping is the truncation that actually happens.
  > 
  > **Not previously registered.** I found no PDF fidelity or watermark finding in docs/evidence/D6/2026-09-30-compliance-reports/ (DP-45..DP-57) or in docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/README.md.
  > 
  > **Mitigations exist, but none fixes the content.**
  > - Every export is recorded on the audit chain with the PDF's sha256 (report-os.ts:432-441).
  > - The export is checked against the plan entitlement (report-os.ts:1669-1680).
  > - The status line is present, so a partial run is not misrepresented as final.
  > - None of these changes what the PDF says.
  > 
  > **Severity: medium is right.** A regulated customer can download a partial run as a plain-looking PDF. The PDF is a cover sheet, not the report, and critical qualifying blocker text is cut off with no marker. This is a §11.10(b) accuracy and completeness gap on the launch surface's Export action. It does not reach high, because status is printed, the export is audited with a hash, and the cap and overflow parts are not reachable in practice.
  > 
  > READ-ONLY note: while measuring the line width I briefly wrote a scratch script, .w-tmp.mjs, at the repo root and deleted it in the same command. It was never staged or committed. The three modified or untracked files that git status shows were already there and are not mine.

  Correction: Narrow the finding to what is reachable:
1. **Missing watermark.** The run export PDF (report-os.ts:1642-1712, createRunPdf at 703-761) never applies decideDelivery's draft watermark (delivery.ts:5 and :43), so partial and completed runs download unmarked. The canvas fetches the PDF even when the seal is refused (Insights.tsx:1006-1009 and :1057).
2. **Cover sheet only.** The PDF does not render the report body.
3. **Line clipping.** Blocker and provider lines have no maxWidth or wrap (report-os.ts:744 and :754). A real critical gap from readinessEvaluator.ts:144-149 is cut at 141 of 297 characters, dropping "treat the artifact half as unassessed, not as complete".
4. **Non-ASCII replaced.** sanitizePdfText (report-os.ts:266-268) turns non-ASCII characters into spaces.
5. **Bundle PDF, API only.** It prints the bundle's creation time as "Generated" and each run's status as of bundle creation (report-os.ts:764-807 and :2023), but no client code calls it.

Drop the 20-cap and "Known Blockers omitted" claims. orchestrator.ts bounds blockers at about 10 and providers below 10, so neither the cap nor the page-break path is reached in practice. Update the cited line numbers to the HEAD values above. Severity stays medium.

## PART11-9. [medium] Bundles, program groups and their snapshots are written with no audit row, no reason and no prior state; membership is replaced by hard DELETE then INSERT

- **Where:** `server/routes/report-os.ts:1276`
- **Impact:** SYSTEM DOES NOT record these. A program group decides which projects a portfolio board pack covers; a bundle is the packaging record for what is handed to a regulator. Editing a group's membership or archiving it leaves no from-to, no actor trail, and the previous membership is gone (snapshots exist only if someone remembered to take one, and their `snapshotReason` is stored but is not an audit record). Bundle creation is likewise unledgered, although bundle export is recorded. Reachable by any member (see role-scoping finding).
- **Evidence:** report-os.ts:1316-1318 `await db.delete(reportProgramGroupProjects).where(eq(reportProgramGroupProjects.programGroupId, id));` inside PATCH /program-groups/:id (1276-1334) with `status`, `archivedAt` at :1305-1306 and no recorder; POST /program-groups (1230-1274) and POST /program-groups/:id/snapshots (1365-1419, `snapshotReason` at :1374) likewise; POST /bundles (1992-2064) ends at :2059 `await persistBundleRecord(bundle);` which inserts project memory entries (:849-867) and writes no chain row.
- **Suggested fix:** Write one chained row per mutation with the actor, prior and new membership or status, and the reason where one is accepted; stop deleting membership in place (versioned membership or an append-only change table).
- **Verifier:** real = `True`, severity = `low`.

  > The mechanism is real at HEAD (9dbd9442). The cited line numbers are off by about 8 to 10 lines. The impact and reachability are overstated, so I am lowering it from medium to low.
  > 
  > **What I confirmed in HEAD:server/routes/report-os.ts**
  > - **The audit vocabulary has no program-group or bundle-creation action.** `ReportAuditAction` (:308-312) is only `'report_os.run_created' | 'report_os.run_finalized' | 'report_os.run_exported' | 'report_os.bundle_exported'`. Nothing else in the file calls `recordReportEvent`, `writeReportEvent` or `writeChainedAuditRow`.
  > - **POST /program-groups (:1220)** inserts `reportProgramGroups` and the member rows with no audit row.
  > - **PATCH /program-groups/:id (:1266)** writes a raw `req.body` `status` (no schema), sets `archivedAt: new Date()` when archived (:1296), then hard-deletes every member (:1306-1308, `.delete(reportProgramGroupProjects).where(eq(reportProgramGroupProjects.programGroupId, id))`) and re-inserts. There is no transaction, no prior state, no reason and no audit row. The `report_program_group_projects` schema (shared/schema/report-os.ts:42-56) has `addedBy`/`addedAt` and no removed or version column, so earlier membership is gone.
  > - **POST /program-groups/:id/snapshots (:1355)** stores `snapshotReason` (:1364) in its own table only.
  > - **POST /bundles (:1984)** ends with `await persistBundleRecord(bundle)` (:2051). That function (:839-857) only inserts `projectMemoryEntries` and writes no chained row.
  > 
  > **Mitigations I looked for and did not find**
  > - `server/middleware/auditLogger.js` is mounted nowhere: grep finds no caller.
  > - `migrations/0014_report_os_foundation.sql` has no trigger on these tables, and no generic audit-trigger sweep exists.
  > - The register has no matching entry: DP-45..DP-57 and the D2 README cover finalize (DP-47), bundle export (DP-50) and deliveries, not group or bundle creation.
  > - The uncommitted working-tree diff to report-os.ts only touches finalize.
  > 
  > **Membership does matter downstream**
  > - `fetchPortfolioSummary` (server/services/report-os/portfolio/fetch.ts:92-130) builds the board pack from current membership.
  > - The in-scope AnA tool `get_portfolio_readiness` (AnaToolExecutor.ts:20880+) calls it, so a group's membership does decide what a portfolio board pack covers.
  > 
  > **Why medium is too high**
  > 1. **"Reachable by any member" is outdated.** Commit e14fa01d added `router.use(requireEditorAccessForWrites)` at :61, so a viewer is now refused on every write. Only editor-capable roles can do this.
  > 2. **No launch-surface UI calls these routes.** grep of client/src finds no `program-groups` or `report-os/bundles` caller; the launch surfaces call only `report-os/portfolio/org` and `report-os/runs*`. `fetchOrgPortfolioSummary`, which drives the canvas, does not read program groups. The path is direct API or reads through AnA.
  > 3. **These are reporting configuration and packaging metadata, not governed content or signed records.**
  >    - The bundle record is append-only and carries `createdBy`/`createdAt`, and nothing edits or deletes a bundle.
  >    - The act that hands a bundle to a regulator, its export, is chained (`report_os.bundle_exported` at :2110).
  >    - A program group keeps `updatedBy`/`updatedAt`, so the last actor is known even though earlier states are not.
  > 
  > The real residual is narrow. There is no §11.10(e) trail for creating or changing a program group, the earlier membership is destroyed, and the delete-then-insert has no transaction around it: a failed insert would leave the group empty. That is a genuine gap, but a low one.

  Correction: Cited lines at HEAD:
- POST /program-groups: :1220
- PATCH /program-groups/:id: :1266, with the membership delete at :1306-1308 and `archivedAt` at :1296
- POST /program-groups/:id/snapshots: :1355, with `snapshotReason` at :1364
- POST /bundles: :1984, with `persistBundleRecord(bundle)` at :2051
- `persistBundleRecord`: :839-857

Correct "reachable by any member": since e14fa01d, `requireEditorAccessForWrites` (:61) refuses viewers, so only editor-capable roles can call these routes. No launch-surface UI calls them; the paths are the direct API, plus the AnA `get_portfolio_readiness` tool and /portfolio reading membership.

Bundle export is already chained (`report_os.bundle_exported`). The bundle record is append-only and carries `createdBy`/`createdAt`.

Severity: low. Fix:
- Add `report_os.program_group_created`, `report_os.program_group_updated` (from/to membership and status) and `report_os.program_group_snapshot_created`, plus optionally `report_os.bundle_created`, to `ReportAuditAction`.
- Write each row with the mutation in one `inTenantTransaction`.
- Make membership change append-only (`removed_at`/`removed_by`) instead of DELETE then INSERT.
- Validate `status` against an enum.

## PART11-10. [medium] Report subscriptions: the creator is whatever the request body says (or null), enable/disable is unrecorded, and the e-signature gate for external delivery is computed and only logged

- **Where:** `server/routes/report-os-insights.ts:381`
- **Impact:** SYSTEM DOES NOT attribute. POST /api/insights/subscriptions binds the organisation from the session but takes `createdBy` from the body, so a member can attribute a schedule (including `channel: 'external'` with free-text recipients) to any user id, and when it is omitted the row has no creator at all. Neither create nor PATCH enable/disable writes an audit row. The sweep that is meant to deliver them currently only logs 'scheduled report fired' and nothing is sent, so the exposure is latent: if sending is wired later, the e-signature requirement that decideDelivery computes for final reports is not enforced anywhere. The canvas lists 'Scheduled reports' as a plan feature but has no control for it.
- **Evidence:** report-os-insights.ts:195 `createdBy: z.number().int().positive().nullable().optional(),`; :393-396 `const row = await createSubscription({ ...parsed.data, organizationId, });`; subscription-service.ts:84 `createdBy: input.createdBy ?? null,`; report-os-insights.ts:403-422 PATCH `setEnabled(...)` with no recorder; worker-register.ts:66-79 `const decision = decideDelivery({ status }, sub.channel as DeliveryChannel); ... log.info('scheduled report fired', { ..., requiresESignature: decision.requiresESignature, ...})` and no send.
- **Suggested fix:** Strip `createdBy` from the schema and stamp the session user; write a chained row on create and on enable/disable; gate with requireEditorAccessForWrites; when delivery is built, refuse external sends of final reports without a signature.
- **Verifier:** real = `True`, severity = `low`.

  > The core claim holds at HEAD 9dbd9442: the creator of a subscription comes from the request body. Most of the rest of the finding is overstated or out of date.
  > 
  > What is real:
  > - `server/routes/report-os-insights.ts:202` is `createdBy: z.number().int().positive().nullable().optional(),`.
  > - `:400-403` passes `...parsed.data` straight into `createSubscription`.
  > - `server/services/report-os/scheduling/subscription-service.ts:84` writes `createdBy: input.createdBy ?? null`.
  > - Neither path ever looks at the session user. The column is only an FK to `users.id` (`shared/schema/report-os.ts:223`). That means any existing user id is accepted, including one from another org, and an omitted value is stored as null.
  > - `governedActorId(req)` (`server/middleware/orgMembership.ts:585`) is the canonical session-actor helper, and it is not used here.
  > 
  > Why it is low and not medium:
  > 1. **Who can reach it.** Since commit e14fa01d, `router.use(requireEditorAccessForWrites)` at `:69` blocks read-only viewers from POST and PATCH, so only writing-role members can do this. That also means one item of the suggested fix is already in place.
  > 2. **No UI.** No file in `client/src` calls `/api/insights/subscriptions`. `docs/reports/orphan-endpoints-latest.json` lists all three routes as orphan / needs-review. Only someone calling the API directly with their own login can use it.
  > 3. **Nothing uses the forged value.** No code reads `createdBy` back:
  >    - the worker and sweep never use it;
  >    - `suggestion-service.ts` reads only `reportTypeId`;
  >    - no surface displays it;
  >    - it is only returned in the raw GET response.
  > 4. **The changes are recorded.** `server/startup/audit-trail.ts:104-140` writes a tamper-proof row for every POST and PATCH on `/api`. The row holds the real session `userId`, method, path, status, IP and timestamp, and `/insights/` is not on the skip list. Production requires this: `.github/workflows/deploy-aws.yml:386-455` refuses a task definition without `AUDIT_TRAIL_ENABLED=true` and `AUDIT_REQUIRE_ENFORCE=true`. So the true actor of a create or a toggle is recorded, and a forged `createdBy` can be contradicted from that trail. What is missing is a domain row with the values: the new `enabled` value, the created row's id, and its channel and recipients. That is a §11.10(e) completeness gap, not "unrecorded".
  > 5. **The e-signature part is not a defect at HEAD.** `worker-register.ts:61-66` sets status to `'partial'` or `'draft'` only, and the comment says "sealing/final is a separate governed action ... never automatic". As a result `decideDelivery` (`delivery.ts:20-29`) can never return `requiresESignature: true` on this path, and nothing is sent. This part is speculation about future code.
  > 
  > Net: the remaining defect is attribution forgery in a configuration row's own `createdBy` column. It is reachable only by an editor using the raw API, nothing reads the value, and the mandatory request-level audit trail records the real actor. That makes it low severity.

  Correction: Title: Report subscription `createdBy` is taken from the request body (or left null) instead of the session; create and toggle have only the generic request-level audit row.

Severity: low.

Where:
- `server/routes/report-os-insights.ts:202`: `createdBy: z.number().int().positive().nullable().optional(),`
- `server/routes/report-os-insights.ts:400-403`: `createSubscription({ ...parsed.data, organizationId })`
- `server/services/report-os/scheduling/subscription-service.ts:84`: `createdBy: input.createdBy ?? null,`

What it allows: an editor-role member (viewers are blocked at `:69`) can call the API directly, since no UI calls it, and name any existing user id as the creator, or leave it null.

Existing mitigation: the global tamper-proof request audit (`server/startup/audit-trail.ts:104-140`, mandatory in production per `deploy-aws.yml:386-455`) records the real actor for `POST /insights/subscriptions` and `PATCH /insights/subscriptions/:id`. It does not record the row id on create, the enabled value, or the channel and recipients.

Fix:
- Drop `createdBy` from `createSubscriptionSchema`.
- Stamp `governedActorId(req)`, and refuse when it is null.
- Optionally write a domain audit row with the values on create and on toggle.

The `requireEditorAccessForWrites` part of the suggested fix is already in place. Drop the e-signature claim: scheduled runs are never 'final' (`worker-register.ts:61-66`), so `requiresESignature` is always false on this path and nothing is sent.

## PART11-11. [low] Controlled document register: change-control approvals show no signer name and no meaning

- **Where:** `server/services/audit/compliance-reports/queries/controlled-documents.ts:118`
- **Impact:** UI and the report omit it; the system stores it. The document section shows `approval_signer_name` and `approval_meaning`, but the change-control section shows only the signature id, signing time and digest, plus `approved_by` from the change record, which is a different column and can differ from the signer. An inspector cannot confirm §11.50(a)(1) and (a)(3) manifestation for change approvals from the register.
- **Evidence:** controlled-documents.ts:48-49 `sa.signer_name AS approval_signer_name, sa.signature_meaning AS approval_meaning,` (documents) versus :118-122 `SELECT s.id, s.signed_at, s.bound_payload_digest ... 'qms-change:' || c.id` and :106-109 `an.name AS approved_by, sg.id AS approval_signature_id, ${isoNaiveUtc('sg.signed_at')} AS approval_signed_at, sg.bound_payload_digest AS approval_digest,`; columns list :203-208 has no signer or meaning for changes.
- **Suggested fix:** Select `s.signer_name` and `s.signature_meaning` in the lateral join and add 'Approval signed by' and 'Approval meaning' columns to the changes section.
- **Verifier:** not run (low).

## PART11-12. [low] Ledger rows for report_os.* acts read 'Report Os Run Finalized' with a bare id target, and carry no prior status or reason

- **Where:** `server/routes/report-os.ts:403`
- **Impact:** UI DOES NOT show a reviewer-grade sentence. The compliance-report row sets `details.description` so the ledger shows 'Ran Electronic signature register (...), export ...'; the four report_os rows set none, so the ledger falls back to a title-cased action token and a `report_run:42` target. The actor is resolved to a name (good), but a reader cannot tell which report type or scope was finalized or exported without opening the payload, and no row records the from-to status.
- **Evidence:** audit-trail-ledger.routes.ts:143-151 `humanizeEventType` (splits 'report_os.run_finalized' into 'Report Os Run Finalized') and :238 `event: metaString(payload, ['description', 'summary', 'title', 'message']) ?? humanizeEventType(row.action),`; report-os.ts:403-418, :531-545, :1708-1718, :2113-2124 details objects have no `description`; compare audit-compliance-reports.ts:165 `description: `Ran ${def.title} (...), export ${manifest.exportId}``.
- **Suggested fix:** Add a `description` to each report_os row ('Finalized and sealed Executive Readiness Digest for program 12 (was: completed), seal sha256 abc123…') and record `previousStatus`.
- **Verifier:** not run (low).

## PART11-13. [low] 'Verify a saved report' says the report verifies without saying which report, export or organisation it checked

- **Where:** `client/src/concept2cure/v2/surfaces/ComplianceReportsVerify.tsx:130`
- **Impact:** UI DOES NOT show it; the verifier does not check it. The outcome names only the signing key. The verifier takes any sealed package from any organisation and answers valid, so a customer can verify a report the platform sealed for someone else and read 'The saved report verifies' with nothing tying it to the file they meant to check. The manifest does carry organizationId, exportId, period and generatedAt.
- **Evidence:** ComplianceReportsVerify.tsx:76-83 `outcomeOf` reads only `valid`, `signingKeyId`, `errors`; :135-137 `The saved report verifies: its data matches its seal, made with key ${outcome.keyId}.`; audit-trail-routes.ts:726-756 the handler checks no organisation and returns `valid`, `errors`, `signingKeyId`, `verifiedAt`; signed-report.ts:80 `organizationId: data.organizationId` is in the manifest.
- **Suggested fix:** Echo report, period, export id, generated-at and run-by from the verified manifest, and say when the manifest's organisation is not the caller's.
- **Verifier:** not run (low).

## PART11-14. [low] POST /api/insights/predictions renders caller-supplied probabilities and a caller-supplied generatedAt into a platform-formatted report with no provenance

- **Where:** `server/routes/report-os-insights.ts:243`
- **Impact:** SYSTEM DOES NOT mark the numbers as caller-supplied. /api/insights is claimed by the Reporting surface, so every organisation reaches it. Any member can post `rtfProbability`, `crlProbability`, `firstCycleApprovalProbability` and a back-dated `generatedAt` and receive a report that looks like the platform's own advisory output. It is not persisted and cannot be finalized (it is not a run), which keeps this low, but it is a way to mint a formatted-looking figure that no engine produced.
- **Evidence:** report-os-insights.ts:255-264 `const input = parsed.data.input as PredictionInput; ... generatedAt: parsed.data.meta.generatedAt, ... const renderedReport = assemblePredictionReport(input, meta);`; assembler.ts:265 `generatedAt: meta.generatedAt ?? new Date().toISOString(),`; assembler.ts has no provenance block (grep for 'provenance' and 'caller' finds only the comment at :22).
- **Suggested fix:** Remove the route if unused (client/src has no caller) or mark its output 'caller-supplied input, not a platform computation' and ignore the body's generatedAt.
- **Verifier:** not run (low).

## PART11-15. [low] Run and seal records are immutable by application convention only; an unrecorded run stays listable and finalizable

- **Where:** `server/routes/report-os.ts:499`
- **Impact:** ADVISORY. The seal lives in a mutable JSON column of a snapshot row that is updated in place, and no trigger on report_runs or report_snapshots stops a later UPDATE or the cascade delete from the run. Nothing in application code does that today, so this is a hardening point, not a live defect. Separately, POST /runs writes the run, snapshot and dependencies before it writes the chain row; when that row fails the user gets 503 'run the report again' but the run remains in GET /runs and can later be finalized and exported without a run_created row ever existing (documented in the evidence as a design limit).
- **Evidence:** report-os.ts:499-502 `await client.query('UPDATE report_snapshots SET snapshot_metadata = $2::json WHERE id = $1', ...)`; migrations/0014_report_os_foundation.sql:123 `run_id integer NOT NULL REFERENCES report_runs(id) ON DELETE CASCADE`; no trigger on either table found in migrations; report-os.ts:1545-1606 writes precede :1608 `if (!(await recordRunCreated(req, res, run, computed))) return;`; finalize at :1857-1863 does not check that a run_created row exists.
- **Suggested fix:** Add a BEFORE UPDATE/DELETE trigger refusing changes to final runs and their snapshots; write the run and its chain row in one tenant-stamped transaction (as finalizeOnChain already does) so no unrecorded run exists.
- **Verifier:** not run (low).

## What the lens found clean

- Finalize is role-gated on the server, before any read: report-os.ts:1846 `requireRole('owner', 'admin', 'manager')`, not hiding alone; member and viewer are refused (D2 report-os/README review round 1 shows the real-database case).
- Finalize is atomic: status, seal and chained audit row commit together or not at all, under a row lock that refuses a second finalize (report-os.ts:514-557, 522-528, 551-555 -> 503 REPORT_FINALIZE_NOT_RECORDED); a truthfulness refusal (409) records nothing (report-os.ts:1872-1878).
- Run, run PDF export and bundle PDF export are recorded on the chain before anything is sent, with the SHA-256 and length of the exact bytes, and 503 with nothing sent when the row cannot be written (report-os.ts:436-462, 1708-1719, 2113-2124); the chain row carries userId, ip and user agent (report-os.ts:353-364).
- Compliance reports: role gate runs before the rate limit and before any read (audit-compliance-reports.ts:83-87, 228-229), the run is recorded before it is sent and refused with 503 REPORT_NOT_RECORDED otherwise (audit-compliance-reports.ts:146-189, audited-export.ts:79-123), one run at a time per organisation (239).
- Compliance reports UI scopes by role from the server's answer, not a client role list: the run form is hidden when canRun is false and the notice names who may run (ComplianceReports.tsx:168, 213); the server enforces the same set, so hiding is not the only control (audit-api-authority.ts:56-74).
- The compliance-report seal states what it is and is not, who ran the report, at what time and under which key: 'Sealed by the platform with ... It is not an electronic signature.' (ComplianceReportResult.tsx:109-131); dates are stated as UTC (ComplianceReports.tsx:247, ComplianceReportResult.tsx:45).
- History is append-only in both surfaces: no edit or delete affordance on any report, result row or manifest in ComplianceReports.tsx, ComplianceReportResult.tsx or Insights.tsx; audit bulk-delete answers 403 IMMUTABILITY_VIOLATION (audit-trail-routes.ts:809-820).
- Electronic signature register shows signer, time, meaning as stored (not defaulted), bound record, authentication method, revoked and superseded state (electronic-signatures.ts:22-57, 81-104); controlled document register shows only a standing signature with signer and meaning and counts the revoked ones (controlled-documents.ts:24-26, 46-58, 67-77).
- The canvas tells a gate refusal, an already-sealed run and a refused role apart, in the server's own words (Insights.tsx:810-820), and a failed portfolio read renders as an error with a path to the reports, not as an empty organisation (Insights.tsx:1057-1075).
- Tenant scope on the reviewed read and write paths is session-bound: report-os.ts requireSessionOrg (302-309) and authedOrgId on every run, export, bundle and finalize query; no client-supplied organizationId is trusted (the canvas still sends one at Insights.tsx:871, which the zod schema strips).

## What the lens did not cover

- Nothing was executed: no unit, route, dbtest or gate was run (read-only static review). The re-render regression, the prediction-sealed-final path and the viewer-write findings are from reading the code; each should be reproduced as a failing test before the fix.
- Tenant isolation, RLS and injection (security lens), and honest-state copy that does not bear on a governed act.
- The audit trail surface and ledger UI beyond how report_os.* and compliance.report_run rows are mapped (audit-trail-ledger.routes.ts:143-263).
- AnA tool handlers beyond confirming generate_report, list_report_types and get_prediction are class 'read' in tool-authorization.register.json; report definition writes (definition-service) were not read (registered residual in D6).
- The subscription sweep at runtime (Redis, Bull), CSV generation and the other four compliance report queries (access review, authentication events, administrative changes, retention) beyond the catalog and the two signature-bearing reports.
- docs/LAUNCH_DEFINITION_OF_DONE.md and the controlled validation documents; accessibility and layout; the full text of insights-canvas-routes.ts past line 120 (it exposes GET /overview only).

## Files read

- `.claude/skills/regulatory-compliance-ux/SKILL.md`
- `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/README.md`
- `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/report-os/README.md`
- `docs/evidence/D6/2026-09-30-compliance-reports/README.md`
- `client/src/concept2cure/v2/surfaces/Insights.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReportResult.tsx`
- `client/src/concept2cure/v2/surfaces/ComplianceReportsVerify.tsx`
- `client/src/concept2cure/v2/surfaces/complianceReportsModel.ts`
- `client/src/concept2cure/v2/toast.tsx`
- `server/routes/report-os.ts`
- `server/routes/report-os-insights.ts`
- `server/routes/insights-canvas-routes.ts`
- `server/routes/audit-compliance-reports.ts`
- `server/routes/audit-trail-routes.ts`
- `server/routes/audit-trail-ledger.routes.ts`
- `server/routes/regulatory-correspondence.ts`
- `server/routes/c2c/actions.ts`
- `server/bootstrap/register-inline-routes.ts`
- `server/services/audit/audited-export.ts`
- `server/services/audit/audit-api-authority.ts`
- `server/services/audit/compliance-reports/catalog.ts`
- `server/services/audit/compliance-reports/queries/electronic-signatures.ts`
- `server/services/audit/compliance-reports/queries/controlled-documents.ts`
- `server/services/auditService.ts`
- `server/services/report-os/sealing/seal.ts`
- `server/services/report-os/truthfulness.ts`
- `server/services/report-os/render/render.ts`
- `server/services/report-os/taxonomy.ts`
- `server/services/report-os/prediction/report-types.ts`
- `server/services/report-os/scheduling/subscription-service.ts`
- `server/services/report-os/scheduling/delivery.ts`
- `server/services/report-os/scheduling/worker-register.ts`
- `server/services/part11/signature-meanings.ts`
- `server/middleware/auth.ts`
- `server/middleware/orgMembership.ts`
- `shared/constants/permissions.ts`
- `shared/constants/launch-scope.ts`
- `shared/constants/ui-surface-registry.ui-v2.ts`
- `client/src/concept2cure/v2/surfaceViews.ts`
