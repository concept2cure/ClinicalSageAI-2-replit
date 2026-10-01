# Reporting & analytics review, 2026-10-01: Security and tenant isolation

Generated from workflow `wf_527b6067-e34`: the lens's own report, then the refuting verifier's verdict on every blocker, high and medium. Low findings were not independently verified. Paths are as the agents wrote them. Line numbers are at the head they read and may have moved since. The README in this directory records which findings were fixed afterwards, and by which commit.

## SECURITY-1. [high] IAM-20 (new, High): Report-OS and Insights write routes admit any member including a viewer and write no tenant-attributable audit row; correspondence/capture is an unaudited twin of the governed correspondence intake

- **Where:** `server/routes/report-os.ts:2271`
- **Impact:** Regulated customer: a signed-in member holding the read-only viewer role can, in production, create program groups and snapshots, create report runs, bundles and 'deliveries' that are stored with status 'sent' when nothing was sent (DP-50 second half, unchanged at HEAD), file a regulatory correspondence record against a submission (inbound 'deficiency letter' with blocker issue rows), write high-importance 'regulatory' entries into the project memory table that AnA's context code reads, create scheduled-report subscriptions with arbitrary recipients, and run predictions that persist rows. None of it leaves a chained, tenant-attributable audit row, so neither the audit trail nor the new compliance reports (administrative changes, full trail) can show it. Clauses: 21 CFR 11.10(d),(e),(g); HIPAA 164.312(a)(1) and (b); EU Annex 11 section 9 and 12. Regression: no. These prefixes were refused in production before the 2026-09-30 launch change opened them (see IAM-21); the route code is older. Why gates are green: no gate asks whether a mutating route in a launch-scoped router carries a role or an audit call; ci:tenant-isolation and ci:drizzle-tenant-scope are satisfied because every query has an organisation predicate.
- **Evidence:** Router control: report-os.ts:55 `router.use(authMiddleware);` is the only router-level control. `requireRole` appears once, on finalize: report-os.ts:1848 `router.post('/runs/:id/finalize', requireRole('owner', 'admin', 'manager'), async (req, res) => {`. Ungated writes: report-os.ts:1230 POST /program-groups; :1276 PATCH /program-groups/:id (membership DELETE at :1316-1319 then INSERT at :1320-1327, no transaction); :1365 POST /program-groups/:id/snapshots; :1421 POST /runs; :1994 POST /bundles; :2150 POST /deliveries; :2271 POST /correspondence/capture. report-os-insights.ts:62 `router.use(authMiddleware);` then :281 POST /predictions/run, :381 POST /subscriptions, :403 PATCH /subscriptions/:id. The repo's own read-only line exists and is not used here: orgMembership.ts:571 `export function requireEditorAccessForWrites` (doc at :484-486 'a viewer reads, everyone else in the organization can work'), applied by protocol-development.ts:73 and protocol-risks.ts:26. Audit: the only chain writers in report-os.ts are recordRunCreated (:398-429), sendRecordedPdf (:436-462) and finalizeOnChain (:514-557); none of the writes above calls writeReportEvent/writeChainedAuditRow. The only other record is the fire-and-forget request observer startup/audit-trail.ts:104-125 (`res.on('finish', ...) auditLog.log(...)`) to the global audit.tamper_proof_log with method, path, status, user id (no organisation or entity id; DP-28), which no tenant report reads. Second door: report-os.ts:2288-2325 calls persistCorrespondenceToPlatform (:956-1039, raw INSERT INTO c2c_correspondence and c2c_correspondence_issues with `blocker`, `human_review_status` 'pending') then captureLearningMemory (:666-689, `importanceLevel: 'high'`). The canonical intake regulatory-correspondence.ts:524 POST /correspondence/intake has the feature flag (:525-528), governance schema (:530), timeline event (:712-718) and `recordAuditRow({ action: 'correspondence.ingest', ...})` (:734). Deliveries: report-os.ts:2235 `status: payload.channel === 'platform_send' ? 'sent' : 'exported',` and persistDeliveryRecord (:908-924) returns early when no projectId, so a 201 'sent' can store nothing and send nothing. Bundle, delivery and learning records are rows of project_memory_entries (:849-866, :908-923, :676-688), the table AnA's context enrichment reads by project and category (ana-ri/context-enrichment.ts:327-340; I did not confirm 'regulatory' is among the requested categories).
- **Suggested fix:** Mount requireEditorAccessForWrites after authMiddleware on both routers (finalize keeps its stricter requireRole). Delete or stop claiming every route with no first-party caller (IAM-21). Delete /correspondence/capture and let callers use /api/regulatory-correspondence/correspondence/intake. Put each remaining write in inTenantTransaction (report-os.ts:336-350) with writeReportEvent (:353-364) and answer 503 when the row cannot be written, as finalizeOnChain does. Add a CI gate that fails a mutating route inside a launch-scoped router that has neither a role gate nor a chained audit call.
- **Verifier:** real = `True`, severity = `low`.

  > The finding was written against the tree before commit e14fa01d ("Reporting: a viewer can read reports and change none of them; one correspondence intake", 2026-10-01 07:10 UTC). At HEAD 9dbd9442, both of its High-severity claims are closed, and the deliveries part is already registered.
  > 
  > 1. Viewer writes: refuted at HEAD.
  >    - report-os.ts:64-69 is now `router.use(authMiddleware); ... router.use(requireEditorAccessForWrites);`.
  >    - report-os-insights.ts:63/69 has the same pair.
  >    - requireEditorAccessForWrites (orgMembership.ts:571-574) passes GET/HEAD/OPTIONS and sends every other method through requireEditorAccess. That function refuses `viewer`, the one org role it excludes (doc at :484-486).
  >    - Both routers are the production mounts: register-inline-routes.ts:213 for /api/report-os and :217 for /api/insights.
  >    - I ran server/routes/__tests__/report-os-viewer-writes.test.ts: 24/24 pass. All eleven write routes (program-groups POST/PATCH, snapshots, runs, bundles, deliveries, predictions, predictions/run, subscriptions POST/PATCH) refuse a viewer before any handler runs. A member gets through, and a viewer can still read.
  > 
  > 2. The second correspondence door: refuted at HEAD.
  >    - POST /correspondence/capture no longer exists. The route list in report-os.ts has no such path.
  >    - report-os.ts:2334-2340 records its removal and names the canonical intake, POST /api/regulatory-correspondence/correspondence/intake.
  > 
  > 3. Deliveries ("sent" with nothing sent, and no chain row): already registered, not new.
  >    - This is DP-50 second half, "Open — plan P1-44" (D6 README:89; SECURITY_AUDIT_2026-09-24.md:254).
  >    - P1-44 already says to write "the correspondence row, the delivery record and the chain row in one transaction". It is still open: report-os.ts:2259-2283 calls persistCorrespondenceToPlatform with no audit writer, and :2294 still has `status: payload.channel === 'platform_send' ? 'sent' : 'exported'`. That is a registered item, not this finding.
  > 
  > 4. What remains true and is not registered: some member-role reporting writes leave no chained, tenant-attributable audit row.
  >    - The only chain writers in the two routers are recordRunCreated (:1637), sendRecordedPdf (:1737, :2177) and finalizeOnChain (:1928), all through writeReportEvent/writeChainedAuditRow (:351-373).
  >    - These writes call none of them:
  >      - POST /program-groups (:1259-1303)
  >      - PATCH /program-groups/:id (:1305-1362). Its membership DELETE then INSERT (:1344-1358) also runs outside a transaction.
  >      - POST /program-groups/:id/snapshots (:1394-1447)
  >      - POST /bundles (:2056-2127, persistBundleRecord only)
  >      - In report-os-insights.ts: POST /predictions/run (:288). It reaches scoreSubmissionDraft, which INSERTs into intelligence.risk_predictions (regulatory-intelligence.ts:253-276).
  >      - In report-os-insights.ts: POST /subscriptions (:388) and PATCH /subscriptions/:id (:410).
  >    - The only other trace is the global fire-and-forget request observer (startup/audit-trail.ts:104-135), which writes method, path, status and user id with no organisation. The tenant's own audit trail and compliance reports never show these writes.
  >    - The D6 "Residuals" row only covers "report definitions written without an audit row", not these.
  > 
  > Why the residual is low:
  > - The actors are now members holding a writing role, not viewers.
  > - The objects are reporting configuration and packaging: project groupings, project-set snapshots, bundle manifests, schedule toggles, and model-calibration rows. They are not predicate-rule records.
  > - The governed acts (run creation, seal, PDF and bundle export) are already chained.
  > - The finding's "subscriptions with arbitrary recipients" impact is not real. The worker's generateAndDeliver (scheduling/worker-register.ts:53-80) computes a run and only logs it. Its header (:9-12) says external email transport is deliberately left out, so nothing is sent to the stored recipients.
  > - No tenant-isolation break: every one of these writes is bound to the session org (requireSessionOrg / authedOrgId with org predicates).

  Correction: Narrow the finding to: "Low: member-role Report-OS/Insights configuration writes write no tenant chain row."

Covers POST/PATCH /api/report-os/program-groups (report-os.ts:1259, :1305; the PATCH's membership DELETE+INSERT at :1344-1358 runs outside a transaction), POST /program-groups/:id/snapshots (:1394), POST /bundles (:2056), and POST /api/insights/predictions/run, POST /subscriptions and PATCH /subscriptions/:id (report-os-insights.ts:288, :388, :410). None calls writeReportEvent/writeChainedAuditRow (report-os.ts:351-373).

Drop from the finding:
- The viewer-access and /correspondence/capture claims. Both were fixed by e14fa01d: requireEditorAccessForWrites at report-os.ts:69 and report-os-insights.ts:69; the capture route was removed (comment at report-os.ts:2334-2340); report-os-viewer-writes.test.ts passes 24/24.
- The deliveries "sent" and no-chain-row claim. It is still open but already registered as DP-50 second half / P1-44.
- The "arbitrary recipients" impact. The subscription worker sends nothing (worker-register.ts:53-80).

Fix: wrap each of these writes in inTenantTransaction plus writeReportEvent (report_os.program_group_created/updated, snapshot_created, bundle_created, subscription_created/toggled), returning 503 when the row cannot be written. Put the program-group membership rewrite in the same transaction.

## SECURITY-2. [medium] DP-18 (re-opened, second door): POST /api/part11/audit-trail lets any member write regulatory_significant audit_events rows of any event_type, the capability P1-20 removed from /api/audit/events

- **Where:** `server/routes/part11-compliance.ts:673`
- **Impact:** Any signed-in member, viewer included, can append audit_events rows flagged regulatory_significant and gxp_relevant with an event_type of their choosing (for example 'scim.user.deprovisioned'). Those rows are read by the signed full-audit-trail export and by the new 'Administrative and privileged changes' compliance report, whose SCIM branch selects every audit_events row whose event_type starts with 'scim.user.', so an inspector-facing sealed report can carry an entry no SCIM provisioner wrote. Attribution stays the forger's (user id and e-mail come from the session), so this is pollution of sealed regulator-facing output, not impersonation. No first-party caller (client uses only GET .../chain-integrity, Part11Console.tsx:183). The baseline marks DP-18 closed by P1-20; the closure covered /api/audit/events, /events/batch and /signatures only, so it is an incomplete closure, not a later regression. Clauses: 21 CFR 11.10(e) and 11.10(d); EU Annex 11 section 9; GDPR Art. 5(1)(f) and 32.
- **Evidence:** part11-compliance.ts:673 `router.post('/audit-trail', async (req: Request, res: Response) => {`; no role check anywhere in the handler (:673-804) or the file (grep: no requireAuditRecorder, clientEventRefusal or AUDIT_EVENT_TYPES; `createPolicyGuard` at :1125 guards one other route). Body-supplied type: :696-703 `const { entityType, entityId, action, previousValue, newValue, changeReason, } = req.body;`. Write path: :735-746 `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, user_role, ip_address, session_id, timestamp, reason, metadata, regulatory_significant, gxp_relevant) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, true, true)` with `$2` = `action` from the body. Mount: register-advanced-platform-routes.ts:192 `app.use('/api/part11', authenticateToken, part11Routes.default);` (authentication only; /api/part11 is in NEVER_GATED, api-prefix-map.ts:30, so launch scope never refuses it). The closed door for comparison: audit-trail-routes.ts:304 `if (!requireAuditRecorder(req, res)) return;` and :321 `const refusal = clientEventRefusal(body);`, vocabulary at audit-api-authority.ts:29-38. Readers of the forged rows: compliance-reports/queries/administrative-changes.ts:93 `AND e.event_type LIKE 'scim.user.%'`; signedAuditExport.ts:443-448 (all audit_events for the organisation).
- **Suggested fix:** Apply requireAuditRecorder and clientEventRefusal to this route exactly as audit-trail-routes.ts:304 and :321 do, or delete it (no client calls it). Add a test that every INSERT INTO audit_events reachable from an HTTP handler is behind the recorder gate or a server-side writer.
- **Verifier:** real = `True`, severity = `medium`.

  > I read the code at HEAD (9dbd9442, concept2cure-v2) and could not refute the finding. Every step of the mechanism holds.
  > 
  > 1. **No role check on the route.** `server/routes/part11-compliance.ts:673` reads `router.post('/audit-trail', async (req: Request, res: Response) => {`. The router has no `router.use`, and the handler (:673-804) checks only the org (`requestOrgId(req)`, :689-692) and that the fields are present (:705-707). The only policy guard in the file is `createPolicyGuard` at :1125, on a different route. The file never mentions `requireAuditRecorder`, `clientEventRefusal` or `AUDIT_EVENT_TYPES`.
  > 
  > 2. **The event type comes from the request body.** :696-703 destructures `action` from `req.body`, and the INSERT at :735-740 binds it as `$2` = `event_type`, with `regulatory_significant` and `gxp_relevant` hard-coded to `true, true`.
  > 
  > 3. **Any signed-in member can reach it.** `server/bootstrap/register-advanced-platform-routes.ts:192` mounts it as `app.use('/api/part11', authenticateToken, part11Routes.default);`, which checks sign-in only. `/api/part11` is in `NEVER_GATED` (`server/services/entitlements/api-prefix-map.ts:30`), so the launch-scope gate never refuses it. I checked the global middleware for something that would stop it:
  >    - `server/startup/middleware.ts` (betaRouteFence, authBoundary, validateTenantContext) blocks nothing here.
  >    - CSRF (`enterprise-security.ts:954-990`) lets Bearer and same-origin requests through.
  >    - Nothing applies a global read-only rule to viewers. `auth.ts:383` only withholds `regulatory-author` from them.
  >    - The database does not restrict content either: `audit_events.event_type` is `varchar(100)` with no CHECK (`migrations/0000_sweet_joseph.sql:142`). RLS scopes by org, and the org comes from the session.
  > 
  > 4. **The comparison route is now closed.** `audit-trail-routes.ts:304` calls `requireAuditRecorder` and :321 calls `clientEventRefusal`. DP-38's `/audit/signatures` route is also gated at HEAD (:481). That leaves this route as the last ungated, free-type writer of DP-18's shape.
  > 
  > 5. **The forged rows reach regulator-facing output.** `compliance-reports/queries/administrative-changes.ts:93` (`AND e.event_type LIKE 'scim.user.%'`) shows them in the Compliance Reports launch surface. `signedAuditExport.ts:443-449` selects every `audit_events` row in the org for the signed full-trail export.
  > 
  > 6. **Not previously registered.** The D6 2026-09-30 register, the D2 README and `reviews/2026-09-26/security.md` (DP-38) do not cover this route. `docs/security/SECURITY_AUDIT_2026-09-24.md:156` cites only the `audit-trail-routes` and ledger lines for DP-18, so the closure was incomplete. This is not a later regression.
  > 
  > **Severity: medium is correct.** The registered DP-18 was Medium and this is the same flaw (free event type, metadata with no size bound, any member). It is not higher because a forged row is attributed to the forger and can be told apart from a real one. A genuine SCIM row is written with `user_id NULL`, `user_name 'SCIM Provisioning'` and `regulatory_significant false` (`scim.ts:303`). A forged row carries the forger's `user_id` and e-mail, and `part11_source: 'compliance_engine'` in its metadata. So this is pollution of sealed reports and the immutable trail, not impersonation or a forged signature.
  > 
  > The impact is somewhat broader than the original report says:
  > - The metadata fields `previousValue` and `newValue` have no size bound beyond the 2 MB `express.json` limit. The gated route caps metadata at 8 KB (`AUDIT_METADATA_MAX_BYTES`, `audit-api-authority.ts:43`), and DP-18 explicitly counted a 1 MB metadata payload as part of the defect.
  > - Because `audit_events` has no-update/no-delete triggers, the forged rows cannot be removed.

  Correction: The finding is confirmed at medium; a few details need tightening.

1. **The closure history is slightly misstated.** P1-20 closed `/api/audit/events` and `/events/batch`. `/api/audit/signatures` was a separate later finding (DP-38) and is now gated too (`audit-trail-routes.ts:481`). That makes `POST /api/part11/audit-trail` the only remaining ungated writer of a free-form event type into `audit_events`.

2. **Add the second reopened part of DP-18.** The `previousValue` and `newValue` fields have no size bound beyond the 2 MB `express.json` limit (`server/startup/middleware.ts:182`). The gated route caps metadata at `AUDIT_METADATA_MAX_BYTES` = 8 KB (`audit-api-authority.ts:43`). Because of the `audit_events` no-update/no-delete triggers, rows written this way can never be removed.

3. **The impact should say how a forged row differs from a real one.** In the "Administrative and privileged changes" report it shows the forger as Actor, by id and e-mail, with `part11_source: compliance_engine` under "Recorded values". A genuine SCIM row has `user_id NULL`, `user_name 'SCIM Provisioning'` and `regulatory_significant false` (`scim.ts:303`). It is therefore misleading, attributed and permanent; it is not undetectable.

4. **Fix.** Gate the route with `requireAuditRecorder` and `clientEventRefusal` at the top of the handler, as `audit-trail-routes.ts:304/321` do. Alternatively, retire it with a 410 response: no first-party client calls it, only `server/routes/__tests__/part11-audit-actor-identity.test.ts` does. Show the change failing first: a test that a viewer posting `action: 'scim.user.deprovisioned'` gets a 403 and a member posting an unknown type gets a 400, seen red on the current handler.

## SECURITY-3. [medium] DP-58 (new, Medium): Report-OS finalize marks a report 'final' and 'sealed' with no signing ceremony, an unkeyed hash nothing ever re-checks, no database immutability, and the module's own e-signature rule for external delivery is enforced nowhere

- **Where:** `server/routes/report-os.ts:1848`
- **Impact:** A manager (or any admin) can turn a regulatory readiness report into a final, sealed report with no electronic signature, no signing meaning and no reason; the 'seal' is a plain SHA-256 that anyone able to write the database can recompute, stored beside the content it covers, and no route or job ever re-verifies it, so an inspector shown a 'final, sealed' report has no signature to inspect and no check that the stored content is unchanged. The delivery rule the module itself defines ('External send of a sealed/final report requires an e-signature', and non-final exports are watermarked) is enforced by no HTTP route: POST /deliveries and GET /runs/:id/export.pdf accept final and draft runs alike, and the PDF carries no draft watermark. DP-47 (role gate, atomic status+seal+chain row) is verified closed; this is what DP-47 did not cover. Clauses: 21 CFR 11.50, 11.70, 11.200(a); EU Annex 11 section 14 and 9. Regression: no; ci:sign-ceremony cannot see it because finalize writes no electronic_signatures row.
- **Evidence:** report-os.ts:1848-1900 finalize: `requireRole('owner', 'admin', 'manager')` is the only authority check; then `const seal = buildSealedRecord(rendered); const outcome = await finalizeOnChain(req, run, seal);` (:1880-1881 area); no reverifySigner, no isSigningAuthorized, no meaning or reason (compare esignature.ts:193-199 which has isSigningAuthorized). writeFinalize :483-504 `UPDATE report_runs SET status = 'final' ...` and `UPDATE report_snapshots SET snapshot_metadata = $2::json` merging `{ seal, finalizedAt }`. Seal: sealing/seal.ts:132-142 `algorithm: 'sha256', canonVersion: CANON_VERSION_CURRENT, contentHash: computeContentHash(report)`; verifySeal at seal.ts:150 has no production caller (grep over server/ finds only the definition and the unrelated audit-hmac-seal verifySeal). The chain row carries `sealHash: seal.contentHash` (report-os.ts:539) but nothing recomputes and compares. Immutability: migrations/0014_report_os_foundation.sql contains no TRIGGER on report_runs or report_snapshots; 'already final' is application-only (`refuseAlreadyFinal`, report-os.ts:465-471 and the status re-read at :526-528). Delivery gate: scheduling/delivery.ts:22-28 `if (channel === 'external') { if (isFinal) { return { allowed: true, requiresESignature: true, ...` and :31-36 'Non-final export ... is watermarked as draft'; the only caller is scheduling/worker-register.ts:67 `const decision = decideDelivery(...)`, which only logs (:71-79). POST /deliveries (report-os.ts:2150-2267) and export.pdf (:1652-1723) never call it; createRunPdf (:713-772) prints 'Status: ...' and no watermark.
- **Suggested fix:** Route finalize through the one ceremony (reverifySigner plus signing authority, a meaning from the closed vocabulary, a reason) and write the electronic_signatures row in the same transaction as the status and chain row (signature-persistence.ts). Key the seal (or bind it to the signature), add a BEFORE UPDATE trigger on report_runs/report_snapshots that refuses changes once status is final, and add a verify route or sweep that recomputes the seal against the chain row's sealHash. Call decideDelivery in POST /deliveries and export.pdf and watermark non-final PDFs.
- **Verifier:** real = `True`, severity = `medium`.

  > The finding holds at committed HEAD (9dbd9442, concept2cure-v2), it can be reached from the launch canvas, and the DP-45..DP-57 register does not cover it. Medium is the right severity.
  > 
  > Two things to know before reading the evidence:
  > - **The working tree is not HEAD.** It has uncommitted edits to server/routes/report-os.ts and an untracked server/services/part11/governed-signature-ceremony.ts. In that working copy, finalize goes through signGovernedAct (reason, meaning, re-auth, an electronic_signatures row). None of that is committed, so I verified against `git show HEAD:server/routes/report-os.ts`. The finding's line numbers are a mix of HEAD and the working copy. Its quoted code matches HEAD.
  > - **Even the working-tree fix leaves the rest open.** It adds no seal re-verification, no database trigger and no delivery gate or watermark.
  > 
  > **1. Finalize has no signing ceremony (confirmed at HEAD)**
  > - HEAD report-os.ts:1838: `router.post('/runs/:id/finalize', requireRole('owner', 'admin', 'manager'), async ...`. The role check is the only authority check. There is no reason, no meaning and no re-authentication.
  > - :1872-1873: `const seal = buildSealedRecord(rendered); const outcome = await finalizeOnChain(req, run, seal);`
  > - finalizeOnChain (:504-547) only writes `writeFinalize` (`UPDATE report_runs SET status = 'final'` at :476; the seal merged into snapshot_metadata at :488-489) and one chained `report_os.run_finalized` row (:519-533). It writes no electronic_signatures row.
  > - **Reachable from the canvas:** client/src/concept2cure/v2/surfaces/Insights.tsx:1021 `await apiRequest('POST', `/api/report-os/runs/${runId}/finalize`);` with no body, as a side effect of "Export report". Then :1036 `sealNote = `Sealed · ... · run locked final``. This client file is unchanged in the working tree.
  > - So a manager clicking Export irreversibly marks the report final. `refuseAlreadyFinal` at :455 means it is never re-sealed. The record carries no signature manifestation (who signed, when, with what meaning; 21 CFR 11.50 and 11.70), and nobody re-authenticated (11.200(a)).
  > - **Mitigation that exists:** the chained audit row records userId, IP and time, so the actor is attributable. It is still not a signature.
  > - **Why ci:sign-ceremony does not catch it:** that gate only scans for `sign` ledger writes (scripts/ci/check-sign-ceremony.mjs header), and finalize writes none.
  > 
  > **2. The seal is never re-checked (confirmed)**
  > - sealing/seal.ts:132-142 builds an unkeyed `algorithm: 'sha256'` hash.
  > - `verifySeal` (seal.ts:150) has no production caller. Every other `verifySeal` under server/ is the unrelated one in audit-hmac-seal.ts.
  > - **Correction to the finding:** "anyone with write access can recompute it" overstates it. The seal hash is also written into the hash-chained audit row (HEAD :526 `sealHash: seal.contentHash`), so tampering would be detectable in principle. The real defect is that nothing ever compares the two.
  > 
  > **3. "Already final" is enforced only in the application (confirmed)**
  > - migrations/0014_report_os_foundation.sql defines report_runs (:79) and report_snapshots (:121) with no TRIGGER or FUNCTION, and no other migration adds one.
  > - No HTTP route mutates a final run (finalize is the only writer of report_runs status), so this is a defence-in-depth gap, not something a user can do through the API.
  > 
  > **4. The module's own delivery and watermark rule is dead code (confirmed, low on its own)**
  > - scheduling/delivery.ts:22-36 states the e-signature and watermark rule.
  > - `decideDelivery`'s only caller is scheduling/worker-register.ts:67, which just logs the decision (:71-79), even though its comment claims "external sends are watermarked as draft".
  > - POST /deliveries (HEAD :2140-2261) and GET /runs/:id/export.pdf (:1642-1714) never call it.
  > - createRunPdf (:703-768) prints only `Status: ${...run.status}`: no watermark, no seal hash, no signer.
  > - **Weaker than worded:** POST /deliveries transmits nothing off-platform. `external_pdf_export` only records status 'exported'; `platform_send` records an outbound correspondence. No client calls POST /deliveries. The "sent" honesty issue there is already registered as DP-50's second half.
  > 
  > **Register check:** DP-47 (fixed) covered the role gate, overwrite and atomicity. DP-55 is about /api/esignature/sign accepting no meaning. Nothing in docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30 or D6/2026-09-30-compliance-reports registers the unsigned finalize, the never-verified seal or the unenforced delivery rule.
  > 
  > **Severity:** medium, not high. This is an analytics/readiness report rather than a submission record, and the audit chain does attribute the actor. It is above low because a launch-surface button irreversibly declares a report "final, sealed, locked" with no signature, meaning or re-authentication, and the integrity claim is never re-verifiable.

  Correction: Keep it Medium, with these corrections to the wording:
1. **Cite HEAD line numbers.** Finalize is at report-os.ts:1838, finalizeOnChain at :504-547, writeFinalize at :473-494, export.pdf at :1642-1714, createRunPdf at :703-768, POST /deliveries at :2140-2261.
2. **Lead with the canvas path.** The way a real user hits this is Insights.tsx:1021: the Export button calls finalize with no body and irreversibly marks the run final.
3. **Soften the seal claim.** The seal hash is copied into the hash-chained audit row, so tampering is detectable in principle. The defect is that verifySeal has no caller and nothing compares the stored seal with that row. It is not that anyone with database write access can forge the seal undetected.
4. **Demote the delivery claim to a sub-point.** POST /deliveries transmits nothing off-platform and has no client caller. The real point is that decideDelivery is dead code and createRunPdf prints `Status:` with no watermark, seal or signer.
5. **Note the uncommitted fix.** The working tree has an unfinished, uncommitted change routing finalize through signGovernedAct. It closes only the ceremony half, and only once committed. The client still posts finalize with no reason, meaning or re-auth, so after that change the canvas Export button's seal step would be refused with 400 REASON_REQUIRED. Seal re-verification, the database trigger and the delivery/watermark rule stay open either way.

## SECURITY-4. [medium] DP-18 (re-opened, second door): GET /api/mdx/audit and GET /api/mdx/search?type=audit read the organisation's audit_logs with no role gate; only the launch-scope packaging flag stops a viewer in production

- **Where:** `server/routes/mdx-audit.ts:204`
- **Impact:** Any member of an organisation, viewer included, can read up to 1000 rows of the whole organisation's audit_logs with actor names, user ids, roles, reasons and chain hashes, filtered by any actor id or by free text over new_values, and can text-search it through the global search. DP-18 (every member could read all users' names and IPs) was closed for /api/audit/* only. In production the door is shut by LAUNCH_SCOPE_ENFORCE, a packaging flag (launch-scope-api.ts header: 'That is not packaging' is the gate's own caveat), which is also the only thing standing between members and every other out-of-scope router; if the flag is off or the unattributed mode is 'report' (INF-17 new flags below), the route answers. Clauses: 21 CFR 11.10(d); GDPR Art. 5(1)(f) and 32; HIPAA 164.312(a)(1). Not a regression; the main door's gate (audit-api-authority.ts:56-74) was never applied here.
- **Evidence:** mdx-audit.ts:204-224 `router.get('/audit', async (req, res) => { const orgId = getOrgId(req); if (orgId === null) return orgRequired(res); ... const payload = await readAuditEvents(orgId, { ...rest, limit });` with no role check; readAuditEvents :95-130 `FROM audit_logs al LEFT JOIN LATERAL public.actor_name(al.user_id) u ON TRUE WHERE al.tenant_id = $1${extraFilters} ... LIMIT`, limit up to 1000 (:41), `actor` filter :107, `program` ILIKE over `al.new_values::text` :111-114, response fields actorName/role/reason/sha :132-160. Mount: register-inline-routes.ts:1228 `app.use('/api/mdx', mdxAuditRoutes);` (`requireTenantContext` is mounted only on /api/mdx/ana-drafts and /api/mdx/vault, :1200-1201). Search twin: mdx-search.ts:135-147 `if (wants('audit')) { ... FROM audit_logs WHERE tenant_id = $1 AND (action ILIKE $2 OR table_name ILIKE $2 OR record_id::text ILIKE $2)`, type list at :36-39. Executed at HEAD with the repo's own matcher (launchScopeApiVerdict over buildPrefixMap): `/api/mdx/audit out-of-scope`, `/api/mdx/search out-of-scope`, i.e. refused only by moduleEntitlementGate.ts refusedByLaunchScope. The artifact-scoped sibling /api/mdx/vault/:artifactId/audit (mdx-vault.ts:411-440, verdict 'launch') uses the same reader but is limited to one org-owned artifact and 50 rows; noted, not reported as a finding.
- **Suggested fix:** Put requireAuditReader (audit-api-authority.ts:67) on GET /api/mdx/audit and drop the audit type from /api/mdx/search for non-readers; keep the artifact trail open to vault members. Do not rely on launch scope for authorisation.
- **Verifier:** real = `True`, severity = `low`.

  > The mechanism is real at HEAD (9dbd9442), but in the production default configuration no one can reach it. It is a latent gap that would become live if the routes were opened, not a reopened DP-18.
  > 
  > What I confirmed:
  > - server/routes/mdx-audit.ts:204-212: `router.get('/audit', ...)` checks only `getOrgId(req)` and then calls `readAuditEvents(orgId, { ...rest, limit })`. There is no requireAuditReader or any other role check.
  > - The limit can be up to 1000 (:41). The handler filters on `actor` (`al.user_id::text`) and on `program` (an ILIKE over `new_values::text`). The response returns actorName, the u-<userId> actor id, role, reason and sha.
  > - No router-level middleware is stacked on /api/mdx. requireTenantContext is mounted only on /api/mdx/ana-drafts and /api/mdx/vault (server/bootstrap/register-inline-routes.ts:1200-1201). The mount is at :1228.
  > - The global /api auth gate (register-platform-routes.ts:245) authenticates the request and sets req.user.organizationId. RLS on audit_logs filters by tenant only, so it gives no role gate.
  > - So any authenticated member, viewer included, gets the whole organisation's trail wherever the route is served.
  > 
  > Why it is not medium:
  > 1. Production refuses it for everyone by default. Running the repo's own matcher at HEAD (launchScopeApiVerdict over buildPrefixMap):
  >    - /api/mdx/audit: out-of-scope. Claimed only by device-* and labeling surfaces.
  >    - /api/mdx/search: out-of-scope.
  >    - /api/mdx/vault/1/audit: launch.
  > 
  >    readLaunchScopeMode (launch-scope.ts:28) returns 'on' when NODE_ENV=production and the variable is unset. moduleEntitlementGate.ts:113-116 then returns 403 LAUNCH_SCOPE on any out-of-scope path, before any handler runs.
  > 
  >    The finding says the route also answers when the unattributed mode is 'report'. That is wrong: the unattributed mode applies only to 'unmapped' paths (:117-131), and an out-of-scope path is refused whatever that mode is. The only way to open the route in production is an explicit LAUNCH_SCOPE_ENFORCE=off. That setting opens every hidden surface at once, which is a deployment decision, not this route's defect. Outside production the flag is off by default, so the route answers there.
  > 2. The finding misreads its own quote. "That is not packaging" (moduleEntitlementGate.ts:145) says the opposite of what the finding claims. It states that launch scope is not commercial packaging but "what ships". D2 defines that flag as the control for code outside the catalog.
  > 3. Nothing in the launch app reaches it:
  >    - Neither Insights.tsx nor ComplianceReports.tsx calls /api/mdx/audit or /api/mdx/search.
  >    - The only client caller is programTabsService.ts:223, through useProgramTabs and usePathwayTabsData into the MDX pathway panes, all of which are out-of-scope.
  >    - The Vault was deliberately moved off it: useVault.ts:291 and VaultSurface.tsx:168 say "production refuses /api/mdx/audit".
  > 4. The search route exposes far less than the finding implies. mdx-search.ts:135-147 selects only id, action, table_name, record_id and created_at. It returns no names, user ids, roles or IPs, so the GDPR personal-data impact does not apply to it.
  > 5. This is not DP-18 reopened. DP-18 and P1-20 were registered against /api/audit/* and the ledger (SECURITY_AUDIT_2026-09-24.md:156). This is a separate, never-gated reader on unshipped code. It is not in the D6 compliance-reports register (DP-45..DP-57) or the D2 reporting evidence.
  > 
  > Why it is still worth filing: the handler holds no authorisation of its own, and it relies on the release boundary in place of a role check. It becomes medium the moment either of these happens:
  > - a launch surface claims /api/mdx (or this prefix), which the CI gate check-launch-scope-api would require as soon as a launch screen called it;
  > - a deployment sets LAUNCH_SCOPE_ENFORCE=off.

  Correction: Downgrade from medium to low and retitle it as a latent role-gate gap on an out-of-scope route, not "DP-18 re-opened".

Corrections to the finding:
- Delete the claim that the 'report' unattributed mode opens the route. That mode affects only unmapped paths. /api/mdx/audit and /api/mdx/search are out-of-scope and return 403 LAUNCH_SCOPE in production whatever LAUNCH_SCOPE_API_UNATTRIBUTED is set to (moduleEntitlementGate.ts:113-116).
- In production the route is reachable only if someone explicitly sets LAUNCH_SCOPE_ENFORCE=off. Outside production it is off by default.
- Correct the misreading: "That is not packaging" (moduleEntitlementGate.ts:145) says launch scope is the release boundary, not that it is a weak packaging flag.
- Narrow the search impact. mdx-search.ts:136-139 returns only action, table_name, record_id and created_at, with no actor names, user ids, roles or reasons.
- The Reporting & analytics surfaces (Insights, ComplianceReports) do not call either route.

The suggested fix still stands as defence in depth:
- add `if (!requireAuditReader(req, res)) return;` at mdx-audit.ts:205;
- gate the `audit` type in mdx-search.ts on canReadAuditTrail(req);
- keep /api/mdx/vault/:artifactId/audit unchanged.

## SECURITY-5. [medium] IAM-21 (new, Medium): the launch change claimed whole prefixes /api/report-os and /api/insights, exposing 17 of 22 report-os routes and all 6 insights routes that no first-party screen calls

- **Where:** `shared/constants/ui-surface-registry.ui-v2.ts:847`
- **Impact:** Before 2026-09-30 these prefixes were claimed only by a hidden surface, so production answered 403 LAUNCH_SCOPE. The canvas needs five report-os routes and /api/insights-canvas. Claiming the prefixes made every route under them reachable in production by every member of every tenant, including the write routes in IAM-20, a prediction endpoint that renders caller-supplied probabilities into a platform-looking report with the mandatory disclosure block (POST /api/insights/predictions), a prediction run that persists rows and reads the innovation twin (DP-64), subscriptions, and an unauthenticated-looking counts endpoint. This is new attack surface with no user benefit and conflicts with CLAUDE.md Rule 2 (no new capability outside the launch catalog). ci:launch-scope-api is green because it checks that client-named paths are not refused, not that unused routes stay refused.
- **Evidence:** ui-surface-registry.ui-v2.ts:847 `apiPrefixes: ['/api/report-os', '/api/insights', '/api/insights-canvas'],`. First-party callers (grep of client/src): Insights.tsx:835 GET /api/insights-canvas/overview; :875 POST /api/report-os/runs; :896 GET /runs/:id/rendered; :996 POST /runs/:id/finalize; :1032 GET /runs/:id/export.pdf; AnaCommand.tsx:382 and Orchestration.tsx:120 GET /api/report-os/portfolio/org. No client file calls /api/insights/* (only the -canvas path). Uncalled report-os routes (report-os.ts): /scopes :1041, /taxonomy :1057, /portfolio :1133, /program-groups :1165, :1230, :1276, /program-groups/:id/snapshots :1336, :1365, /runs :1902, /runs/:id/dependencies :1623, /bundles :1994, :2068, /bundles/:id/export.pdf :2086, /deliveries :2132, :2150, /correspondence/capture :2271, /health :2341 (17). Insights (report-os-insights.ts): /quality :206, /predictions :243, /predictions/run :281, /subscriptions :368, :381, :403 (6). Executed at HEAD with launchScopeApiVerdict: `/api/report-os/correspondence/capture launch`, `/api/report-os/deliveries launch`, `/api/insights/predictions/run launch`, `/api/insights/subscriptions launch`; with a registry that claims only /api/report-os/runs, /api/report-os/portfolio/org and /api/insights-canvas the same seven paths are `unmapped`, which production refuses by default (launch-scope.ts:62). Mounts: register-inline-routes.ts:213 and :217.
- **Suggested fix:** Claim only the routes the canvas calls (/api/report-os/runs, /api/report-os/portfolio/org, /api/insights-canvas), not the prefixes; keep the rest unmapped (refused in production) until a screen needs them and each has a role gate and an audit row (IAM-20). Extend ci:launch-scope-api to list routes reachable under a launch prefix that no launch client names.
- **Verifier:** real = `True`, severity = `low`.

  > The finding is real, but it overstates the impact. I'd rate it low, not medium.
  > 
  > **What I confirmed by running the code at HEAD**
  > - I ran `launchScopeApiVerdict` with `buildPrefixMap()`, first with today's `LAUNCH_SURFACE_IDS` and then with `insights` and `compliance-reports` removed (the state before the change).
  > - These paths change from `out-of-scope` (403 `LAUNCH_SCOPE` in production) to `launch`:
  >   - `/api/report-os`: `/scopes`, `/taxonomy`, `/program-groups`, `/program-groups/:id/snapshots`, `/runs`, `/runs/:id/dependencies`, `/bundles`, `/bundles/:id/export.pdf`, `/deliveries`, `/health`
  >   - `/api/insights`: `/quality`, `/predictions`, `/predictions/run`, `/subscriptions`
  > - A grep of client, server and shared code (tests excluded) finds no caller for any of them. The only first-party callers are `Insights.tsx`, which calls `POST /runs`, `/runs/:id/rendered`, `/finalize` and `/export.pdf`, plus `GET /portfolio/org`.
  > - `ci:launch-scope-api` only checks that paths named by client code are not refused (`check-launch-scope-api.ts` header). That part of the finding is accurate.
  > 
  > **Where the finding is wrong**
  > 1. **Cause.** The launch change did not claim the prefixes. `apiPrefixes: ['/api/report-os', '/api/insights']` has been on the `insights` surface since 94036a27 (2026-09-26). The launch change, beea5f91 plus the registry edit, added `insights` to `LAUNCH_APPS` (`launch-scope.ts:123,130`) and added only `/api/insights-canvas`. The evidence README already records the intent: "Its API was refused. /api/report-os and /api/insights were claimed only by that surface."
  > 2. **Counts.**
  >    - At HEAD, `report-os.ts` has 21 routes, not 22. `/correspondence/capture` was removed in e14fa01d.
  >    - `/api/report-os/portfolio` was already `launch` before the change, through `ana-command`'s `/api/report-os/portfolio` (`ui-surface-registry.ui-v2.ts:37`). My pre-launch run returns `launch` for it.
  >    - So 15 uncalled report-os routes are newly reachable (counting each method separately), not 17, plus the 6 insights routes.
  > 3. **Who can call them.** "Every member … including the write routes" is not true at HEAD.
  >    - Both routers mount auth, then `requireEditorAccessForWrites`: `report-os.ts:56` `router.use(authMiddleware);`, `report-os.ts:61` `router.use(requireEditorAccessForWrites);`, and `report-os-insights.ts:63` and `:69`.
  >    - Finalize requires owner, admin or manager (`report-os.ts:1838`).
  >    - `/quality` is admin-only (`isAdmin`, `report-os-insights.ts:213-221`).
  >    - `/predictions/run` is gated by plan (`requireReportEntitlement`, `report-os-insights.ts:301`).
  >    - Every handler takes the organisation from the session (`requireSessionOrg` / `authedOrgId`), not from the request body.
  >    - So nothing here crosses tenants or escalates privilege.
  > 4. **The counts endpoint is not unauthenticated.** `/health` sits behind `authMiddleware`. Its counts carry no organisation filter (`report-os.ts:2269-2306`), so with RLS off they are platform-wide totals. That is a minor aggregate leak.
  > 5. **Caller-supplied probabilities.** `POST /predictions` sends the caller's own numbers back to that caller only and saves nothing, so it cannot mislead anyone else.
  > 6. **The Rule 2 conflict does not hold.** Reporting & analytics has been in the launch catalog since the founder's decision of 2026-09-26. Making an existing app's routes reachable adds no capability outside that catalog.
  > 7. **Prefix matching is the gate's documented design**, not a defect of this change. The gate decides scope per surface (row D2: surfaces outside the catalog are behind a flag), and every launch surface's prefixes expose their routes the same way.
  > 
  > **Already registered elsewhere**
  > - The one exposed route that does concrete harm is `POST /deliveries`. Its `platform_send` channel writes outbound correspondence rows marked "sent", with no audit row. That is DP-50, still open, plan P1-44.
  > - DP-47 (finalize newly reachable) is fixed.
  > - Missing audit rows on the other unused write routes belong to IAM-20.
  > 
  > **What remains**
  > Authenticated, tenant-scoped surface that no screen calls: about 21 routes, with writes gated to editors. It is a least-functionality and hardening issue: narrow the claims to the routes the canvas calls, and add a gate that lists reachable routes no client names.

  Correction: Rename it to: "Making Reporting & analytics a launch app made 21 report-os and insights routes that no screen calls reachable in production (low)". Before the change the existing `insights` surface claimed `/api/report-os` and `/api/insights` (94036a27); the change added that surface to `LAUNCH_APPS` (`launch-scope.ts:130`). At HEAD the newly reachable uncalled routes are 15 in `report-os.ts` (`/correspondence/capture` was removed in e14fa01d; `/portfolio` was already launch through `ana-command`, `ui-surface-registry.ui-v2.ts:37`) and 6 in `report-os-insights.ts`. All are authenticated and take the organisation from the session. Writes require an editor (`report-os.ts:61`, `report-os-insights.ts:69`), `/quality` is admin-only and `/predictions/run` is plan-gated. The residual issues are reachable surface no screen uses, and `/health` returning counts with no organisation filter. Drop the Rule 2 conflict and the "unauthenticated" wording, and cite DP-50 (open) for the deliveries harm instead of counting it again. The suggested fix still applies: claim `/api/report-os/runs` and `/api/insights-canvas` (portfolio is already claimed by `ana-command`), and extend `ci:launch-scope-api` to list reachable routes under launch prefixes that no client names.

## SECURITY-6. [medium] INF-17 (extended, Medium): LAUNCH_SCOPE_ENFORCE=off and LAUNCH_SCOPE_API_UNATTRIBUTED=report are honoured in production and the deploy preflight does not reject them, yet launch scope is the only control on the second doors

- **Where:** `server/services/entitlements/launch-scope.ts:26`
- **Impact:** An explicit LAUNCH_SCOPE_ENFORCE=off in a production task definition silently re-opens every out-of-scope router, including the ungated audit_logs read (DP-18, mdx/audit) and the Report-OS routes that are not claimed; LAUNCH_SCOPE_API_UNATTRIBUTED=report serves every unclaimed API path with only a boot log line. Terraform sets neither (default on/enforce), so nothing in the repository's own deploy would do it, but nothing refuses it either. Same class as INF-17 (accepted-risk flags honoured in production). Clauses: NIST CM-6/CM-7; Annex 11 section 12. Not verified against a live deployment.
- **Evidence:** launch-scope.ts:26-28 `const raw = (env.LAUNCH_SCOPE_ENFORCE ?? '').trim().toLowerCase(); const production = env.NODE_ENV === 'production'; if (raw === '') return production ? 'on' : 'off'; if (raw === 'on' || raw === 'off') return raw;` (explicit 'off' returned in production, no warning). :62-67 `if (raw === '') return production ? 'enforce' : 'report'; if (raw === 'report' && production) { logger.warn('[launch-scope] LAUNCH_SCOPE_API_UNATTRIBUTED=report in production: API paths no surface claims are served and recorded, not refused'); } if (raw === 'report' || raw === 'enforce') return raw;`. grep for LAUNCH_SCOPE in .github/workflows/deploy-aws.yml and terraform/: no matches (the only workflow hit is a comment in ci.yml:323).
- **Suggested fix:** Refuse to boot in production on LAUNCH_SCOPE_ENFORCE=off and LAUNCH_SCOPE_API_UNATTRIBUTED=report, and add both to the deploy preflight's forbidden list beside AUDIT_SEAL_ACCEPT_UNSEALED and the other INF-17 flags.
- **Verifier:** real = `True`, severity = `low`.

  > The mechanism is real at HEAD (9dbd9442). The impact is overstated, and two of the supporting claims are wrong.
  > 
  > What the code does:
  > - server/services/entitlements/launch-scope.ts:28-29 `if (raw === '') return production ? 'on' : 'off'; if (raw === 'on' || raw === 'off') return raw;`. An explicit `off` is returned in production with no log line. Only an unparseable value throws (:30-35).
  > - :62-68 serves `report` in production and logs only a warn at boot.
  > - The only boot-time reader is moduleEntitlementGate.ts:169-170. Nothing else at startup asserts the mode.
  > - The deploy preflight (.github/workflows/deploy-aws.yml:366-470) checks RLS_ENFORCE, NODE_ENV, AI_SENSITIVE_DATA_POLICY_MODE, STORAGE_PROVIDER, the AUDIT_* flags, every *_ACCEPT_* flag and AI_GATEWAY_DETERMINISTIC. It has no LAUNCH_SCOPE_* check.
  > - Terraform sets neither flag. Grep of terraform/ and deploy-aws.yml finds no LAUNCH_SCOPE_* match.
  > 
  > Launch scope is the only thing between an authenticated member and a large ungated surface:
  > - docs/evidence/D2-API-SCOPE/2026-09-25/README.md:196-201 counts 186 unclaimed namespaces with no client caller (/api/stability, /api/qc, legacy /api/concept2cure, /api/qms, and others). Production refuses them only through this gate.
  > - PEN_TEST_SCOPE_2026-09-26.md:148-155 leaves the non-catalog mounts out of the pen test because they "answer 403 LAUNCH_SCOPE". Turning the flag off therefore exposes code that was never tested.
  > - GET /api/mdx/audit (server/routes/mdx-audit.ts:204-209) checks only `getOrgId`, with no role gate. With the flag off, any org member, a viewer included, can read the org's audit_logs: actor names, actions, reasons.
  > 
  > Why the severity drops from Medium to Low:
  > 1. **Not reachable by a user or an attacker.** Someone has to write a non-default value into the production ECS task definition. That takes AWS or Terraform write access, which already permits anything else. The repository's own deploy sets neither flag, so the defaults (on / enforce) hold.
  > 2. **Both behaviours are deliberate.** server/services/entitlements/__tests__/launch-scope.test.ts:37-38 pins "explicit values win in either environment" with `{NODE_ENV:'production', LAUNCH_SCOPE_ENFORCE:'off'} → 'off'`. D2-API-SCOPE README:208-213 records the owner decision of 2026-09-26: "`report` in production is an explicit deployment value, logged at boot." The UNATTRIBUTED half is a documented, accepted choice with a boot log line, not a defect. Refusing it at boot would reverse a founder decision.
  > 3. **Partial mitigation exists.** scripts/validation/run-iq.mjs:228-238 (IQ-11) fails qualification unless /api/module-subscriptions/navigation reports `launchScope.enforced === true`. That catches `LAUNCH_SCOPE_ENFORCE=off` at install qualification, though not later drift, and it does not cover UNATTRIBUTED.
  > 4. **The other boot-time controls still hold:** the default-deny auth boundary and RLS on the tenant tables. The exposure is in-tenant to authenticated users, not cross-tenant or unauthenticated.
  > 
  > Inaccuracies in the report:
  > - **DP-18 is the wrong reference.** DP-18 covered the /api/audit and /api/audit-trail routes and was closed by P1-20. /api/mdx/audit is a different router.
  > - **"Report-OS routes that are not claimed" is false at HEAD.** shared/constants/ui-surface-registry.ui-v2.ts:847 has the insights surface claiming `['/api/report-os', '/api/insights', '/api/insights-canvas']`.
  > - **"Same class as INF-17" holds only loosely.** INF-17's *_ACCEPT_* flags were documented as local/compose-only overrides. LAUNCH_SCOPE_ENFORCE=off is a test-pinned production mode.
  > 
  > What genuinely remains: an explicit `off` in production is silent at boot (not even the warn that `report` gets), and the deploy preflight does not catch it. That is a configuration-hardening gap (NIST CM-6/CM-7), not an exploitable defect.

  Correction: Severity drops from Medium to Low, and the finding is narrowed to LAUNCH_SCOPE_ENFORCE=off:

- **Real:** an explicit LAUNCH_SCOPE_ENFORCE=off in production is honoured silently (launch-scope.ts:28-29 has no warn). The deploy preflight (deploy-aws.yml:366-470) does not check it, although the same preflight pins RLS_ENFORCE, AI_SENSITIVE_DATA_POLICY_MODE and the AUDIT_* flags by value. With the flag off, the 186 unclaimed legacy namespaces and the role-ungated GET /api/mdx/audit (mdx-audit.ts:204-209) are reachable by any authenticated member of the tenant.
- **Not a defect:** LAUNCH_SCOPE_API_UNATTRIBUTED=report in production. The owner decided on 2026-09-26 that it is a permitted explicit value (D2-API-SCOPE README:208-213), and it is logged at boot.
- **Factual fixes:** /api/mdx/audit is not DP-18, which was closed by P1-20. /api/report-os is claimed by the insights surface (ui-surface-registry.ui-v2.ts:847).
- **Mitigations to note:** IQ-11 (run-iq.mjs:228-238) fails qualification when launch scope is off. The auth boundary and RLS still apply.
- **Fix:** in the preflight, refuse LAUNCH_SCOPE_ENFORCE set to anything but `on`, and make readLaunchScopeMode warn (or refuse, if the founder agrees) on an explicit `off` in production. Whether the preflight should also flag UNATTRIBUTED=report is the founder's call, not a defect fix.

## SECURITY-7. [low] DP-59 (new, Low): L184 was not carried to the insights router: POST /api/insights/subscriptions takes the creating user from the body, and the body's workspace id is stored unverified on three Report-OS writes

- **Where:** `server/routes/report-os-insights.ts:195`
- **Impact:** A member can attribute a scheduled-report subscription to any user id and attach any client workspace id, including another organisation's (a foreign-key success or failure then confirms whether that workspace id exists). The sweep delivers nothing today (worker-register.ts:54-80 only logs), so the effect is attribution and record integrity, not delivery. Clauses: 21 CFR 11.10(e) (attributable records); GDPR Art. 5(1)(d). report-os.ts removed createdBy/requestedBy from its schemas for the same reason (comment at :57-65); IAM-15's P1-7b rule says a workspace id is a claim verified by FeatureToggleService.workspaceInOrganization.
- **Evidence:** report-os-insights.ts:195 `createdBy: z.number().int().positive().nullable().optional(),`; :185 `clientWorkspaceId: z.number().int().positive().nullable().optional(),`; :393-396 `const row = await createSubscription({ ...parsed.data, organizationId, });`; scheduling/subscription-service.ts:73 `clientWorkspaceId: input.clientWorkspaceId ?? null,` and :84 `createdBy: input.createdBy ?? null,`. Unverified workspace ids also at report-os.ts:67 (program group), :80 (run), stored at :1251 and :1549. The verifier exists: featureToggleService.ts:72 `static async workspaceInOrganization(clientWorkspaceId, organizationId)`. check:security-patterns reports 0 violations because its workspace-trust-header rule reads headers, not body fields.
- **Suggested fix:** Drop createdBy from createSubscriptionSchema and set it from getUserId(req); verify clientWorkspaceId with FeatureToggleService.workspaceInOrganization (403 on a foreign workspace) on all four writes, or drop the field.
- **Verifier:** not run (low).

## SECURITY-8. [low] DP-60 (DP-44/DP-45 closure incomplete, Low): the audit ledger and record-history still return the raw chain break (another organisation's row id and hashes) and ok:true over zero rows

- **Where:** `server/routes/audit-trail-ledger.routes.ts:562`
- **Impact:** When the walked set contains a break, GET /api/audit-trail/ledger (audit readers) and the document history behind GET /api/c2c/project-vault (any vault member) return a break object that can name another organisation's row by id and tenant number with its stored and expected hashes; the exports redact this (DP-44) and the new reports state zero rows as 'not verified' (DP-45), but these two readers do neither, so an organisation with no chained rows is told ok:true. The walk loads other tenants' legacy rows as context, so the condition is any break among them. Clauses: GDPR Art. 32; 21 CFR 11.10(e); Annex 11 section 9.
- **Evidence:** audit-trail-ledger.routes.ts:562-570 `const v = await verifyTenantChain(orgId); const chain: AuditLedgerChainVerdict = { store: 'audit_logs', ok: v.ok, rowsChecked: v.rowsChecked, legacyRows: v.legacyRows, sequencedRows: v.sequencedRows, ...(v.brokenAt ? { brokenAt: v.brokenAt } : {}), };` and the same at :631-642 (readRecordAuditHistory), consumed at c2c/project-vault.ts:1038-1061 (`return { entries, chain: history.meta.chain };`). The default verifier is tenant-chain-verdict.ts:19-25 (raw verifyAuditChain result). ChainBreak shape: chain.ts:396-410 (id, expected, stored, tenantId, commitsTo { id, tenantId }). The redaction and zero-row rule live only in audited-export.ts:41-48 (breakForTenant) and :64-67 (walkTenantChain), used by exports and reports. Vault.tsx:312-315 renders 'Audit chain verified' for ok:true.
- **Suggested fix:** Have readAuditLedger and readRecordAuditHistory use walkTenantChain (or call breakForTenant and the zero-row rule) so one function states the verdict for every reader.
- **Verifier:** not run (low).

## SECURITY-9. [low] DP-61 (new, Low, latent): the older audit export routes accept an organisation id of 0 and the audit_events export drops its organisation predicate when the id is falsy

- **Where:** `server/services/audit/signedAuditExport.ts:412`
- **Impact:** If a session ever resolved to organisation 0 (not mintable today: server/auth.ts:238-261 requires a membership row), GET /api/audit/export and /export/signed would stamp tenant '0' on the transaction and export audit_events with no organisation filter, that is every tenant's events. The new compliance routes already closed this with usableOrgId (review round 1 item 9); the older routes were not given the same guard. Defence in depth only. Clauses: GDPR Art. 32; 21 CFR 11.10(d).
- **Evidence:** signedAuditExport.ts:412-415 `if (req.organizationId) { conditions.push(`organization_id = $${idx++}`); params.push(req.organizationId); }` (queryAuditLogs at :369 is unconditional `a.tenant_id = $1`). audit-trail-routes.ts:616 and :670 `const orgGuard = requireAuthedOrgId(req, res);` and exportForTenant :200-217 `await setTenantContextTx(client, orgId);`; authedOrgId.ts:39-47 accepts any finite number and the file's own note (:51-60) says organization_id = 0 is a global carve-out; governed-tenant-context.ts:23-26 stamps String(orgId) without refusing 0. Contrast audit-compliance-reports.ts:76-80 `usableOrgId(authedOrgId(req))`.
- **Suggested fix:** Use usableOrgId in the audit-trail routes and make the audit_events predicate unconditional (throw when organizationId is not a positive integer).
- **Verifier:** not run (low).

## SECURITY-10. [low] DP-62 (new, Low): POST /api/report-os/runs commits the run through three separate inserts and only then attempts its chain row; a 503 leaves a listed, bundlable, finalizable run that was never recorded

- **Where:** `server/routes/report-os.ts:1545`
- **Impact:** When the audit chain is unavailable the caller is told the run 'was created but could not be recorded' (503), yet the run and snapshot rows stay: GET /runs lists it, it can be bundled, exported (which then records the export) and finalized, and a retry creates a duplicate. A record exists without its audit row, which 11.10(e) says should not happen; the finalize and export paths were made atomic or record-before-send, the create path was not. The behaviour is disclosed in code comments, so this is a design gap, not a hidden one. Clauses: 21 CFR 11.10(e); Annex 11 section 9.
- **Evidence:** report-os.ts:1545 `const [run] = await db.insert(reportRuns)...`, :1572 `const [snapshot] = await db.insert(reportSnapshots)...`, :1592 `await db.insert(reportRunDependencies)...`, then :1608 `if (!(await recordRunCreated(req, res, run, computed))) return;`; recordRunCreated :398-429 answers `REPORT_RUN_NOT_RECORDED` 503 with the comment at :392-397 ('The run's writes share no transaction the row could join'). Compare finalizeOnChain :514-557 and inTenantTransaction :336-350.
- **Suggested fix:** Write the three inserts and writeReportEvent inside one inTenantTransaction and roll back when the chain row fails, as finalizeOnChain does.
- **Verifier:** not run (low).

## SECURITY-11. [low] DP-63 (new, Low): a failed batch audit-event insert returns the database error text to the caller; ci:server-error-leaks does not see it

- **Where:** `server/routes/audit-trail-routes.ts:424`
- **Impact:** An owner, admin or manager posting to /api/audit/events/batch receives Postgres error messages (constraint, column and table names) in skippedDetails with a 207. Low because the route is role-gated, but the leak gate reports 95 baselined sites and none for this file, so its detector misses text placed in an array element. Clauses: GDPR Art. 32; OWASP information exposure.
- **Evidence:** audit-trail-routes.ts:422-427 `skipped.push({ index: i, reason: 'insert_failed: ' + (err instanceof Error ? err.message : String(err)), });` returned in :431-440 `skippedDetails: skipped`. scripts/ci/server-error-leaks-baseline.json has no entry for audit-trail-routes.
- **Suggested fix:** Log the detail and return a static reason ('insert_failed'); teach check-server-error-leaks.mjs to follow values pushed into response arrays.
- **Verifier:** not run (low).

## SECURITY-12. [low] DP-64 (new, Low): POST /api/insights/predictions/run passes a body program id to the innovation readiness twin with no organisation predicate, persists rows with body-supplied project and submission ids, and makes the 'unmounted innovation services' premise of ci:session-scoped-rls-bypass false

- **Where:** `server/routes/report-os-insights.ts:312`
- **Impact:** Isolation of this path rests entirely on database RLS through core.programs in a schema the deploy migration set does not create (db/migrations/072_gcc_innovation_platform_core.sql is applied only by a CI loop; scripts/db/migration-set.mjs never mentions 'innovation'), and the service's constructor runs request-time DDL (CREATE SCHEMA/TABLE innovation.readiness_*, program_id TEXT, no organisation column, no policy) that fails for the non-owner runtime role in production (app_service has no CREATE on the database, provision-app-role.mjs:366-405) but would create tenantless tables on any environment where it succeeds. In production the likely result is a 500; I could not verify against a deployed database. The risk_predictions insert stores body-supplied project and submission ids under the caller's organisation without an ownership check. The ci:session-scoped-rls-bypass baseline lists this service file (4 occurrences) as unreachable ('service constructors have zero callers'); that no longer holds, although the SET app.bypass_rls statements (twin service :483-484, :640-641) are in the assessment methods, not on the dashboard/trend path I traced.
- **Evidence:** report-os-insights.ts:312-316 `input = await readinessTwinToTrajectoryInput({ programId: body.scopeId, submissionType: body.submissionType, agency: body.agency ?? 'FDA', });` (no organizationId); prediction/model-adapters.ts:27 imports SubmissionReadinessTwinService and :55-62 `const twin = new SubmissionReadinessTwinService(pool); const dashboard = await twin.getDashboard(params.programId, ...)`; the constructor calls `this.ensureTables()` (submission-readiness-twin-service.ts:148-157, DDL at :160-253); getDashboard SQL :1136-1141 `SELECT * FROM innovation.readiness_twin_assessments WHERE program_id = $1 AND submission_type = $2 AND target_agency = $3`. Persisting: intelligence/regulatory-intelligence.ts:255-262 `INSERT INTO intelligence.risk_predictions (organization_id, project_id, submission_id, ...) VALUES ($1, $2, $3, ...)` with `input.projectId ?? null` from report-os-insights.ts:326-337. Gate premise: scripts/ci/check-session-scoped-rls-bypass.mjs header ('whose router is deliberately NOT mounted ... and whose service constructors have zero callers') and BASELINE entry for submission-readiness-twin-service.ts (4).
- **Suggested fix:** Do not claim /api/insights (IAM-21). If the forecast is kept: pass organizationId, verify the program belongs to it before the twin is built, remove DDL from the constructor (the migration set owns schema), verify projectId/submissionId ownership before persisting, and re-baseline ci:session-scoped-rls-bypass once the twin is reachable.
- **Verifier:** not run (low).

## What the lens found clean

- AUDITED COMMIT: HEAD was 07df7407 at the start and moved to 08ed96a9 during the audit (six commits by concurrent sessions: Reporting honesty changes in report-os.ts, render.ts, truthfulness.ts, fetch.ts, insights-canvas-routes.ts, plus Terraform/deploy-aws.yml for ANTHROPIC_API_KEY). I diffed those files; none changes a finding. All gates were re-run at 08ed96a9. Line numbers cited are at 08ed96a9.
- GATE ci:committed-secrets: OK, no baseline.
- GATE ci:no-dev-auth-in-prod: OK, no baseline.
- GATE ci:unauthenticated-fetch: OK, 70 raw fetch calls scanned, 0 baselined.
- GATE ci:path-containment: OK, 3 files match the shape, 3 baselined (shrink-only).
- GATE ci:org-path-param-guards: OK, 43 of 43 org path params guarded, baseline 0.
- GATE ci:jwt-verify-pinned: OK, no baseline.
- GATE ci:client-ip-single-source: OK (exit 0; no forwarding-header reads or stray trust proxy in server/ or shared/).
- GATE ci:server-error-leaks: OK, 95 baselined sites in 61 files (audit 146; compliance-reports README 96): direction DOWN. Blind spot: DP-63 (error text pushed into an array).
- GATE ci:discarded-audit-write: OK, 118 baselined in 52 files (audit 133): DOWN; 1 file is below its count and the baseline is not yet shrunk.
- GATE ci:sign-ceremony: OK, 24 baselined sites in 22 files (audit 23 in 21): UP by one. The baseline file's first appearance in git is 98ec6274 (2026-09-29), so I cannot date the growth. The gate is blind to Report-OS finalize (DP-58) because it writes no signature row.
- GATE ci:regulated-delete-audit: OK, no baseline.
- GATE ci:gateway-bypass: OK, 8 baselined sites tolerated.
- GATE ci:dead-audit-catch: OK, 0 baselined (red at the audit; closed).
- GATE ci:session-scoped-rls-bypass: OK, 34 baselined occurrences in 7 'unmounted' innovation services (audit 34): unchanged, but its unmounted premise is false for submission-readiness-twin-service.ts (DP-64).
- GATE ci:drizzle-tenant-scope: OK, 123 sites, all baselined, 28 fixed and not yet banked (audit 151): DOWN. The baseline file still lists 10 report-os.ts sites.
- GATE ci:tenant-entry-points: OK, 14 entry points, 9 not considering entitlement, baseline 9.
- GATE ci:tenant-isolation:no-regression: OK, 8 current vs baseline 8 (audit 9): DOWN; none in reporting files (module-access-requests, advancedRAGPipeline, deep-research-orchestrator, kernel-*).
- GATE check:security-patterns: OK, 0 violations across 2955 files. GATE check:compliance-claims: OK, 963 customer-facing files scanned.
- BASELINE IDS RE-VERIFIED STILL CLOSED (closing code found at HEAD): IAM-10, role is the membership row's on every request (server/auth.ts:238-262,278-292; server/middleware/auth.ts:305-311); IAM-04(a)/IAM-06 for the authenticators every reporting route rides on (server/auth.ts:168-179,212,226; server/middleware/auth.ts:161,196-221: token class, revocation, account standing, password-change, inactivity), call sites read, not executed; IAM-15, no x-org-uuid, x-client-id or req.headers read in any reporting file (only user-agent at report-os.ts:362 and audit-compliance-reports.ts:168); the body-workspace residue is DP-59; IAM-18(1), report and compliance routes answer through serverError (audit-compliance-reports.ts:213); DP-38 (audit-trail-routes.ts:481 recorder gate; :765 and :795 platform-admin gate on chain-monitor); DP-45 at the source for exports and reports (audited-export.ts:64-67, signedAuditExport.ts:501-503, audit-trail-integrity.ts:72-74; ledger residue is DP-60); DP-46 (audit-compliance-reports.ts:83-87,228-245; run-limits.ts:28-65, in-process guard, limiter memory-backed); DP-47 (report-os.ts:1848 role gate; finalizeOnChain :514-557 row-locked, one transaction, 409 on already-final; signing gap is DP-58); DP-48, DP-51, DP-52 (signed-report.ts:61-70; access-review.ts:79-90,110-115; csv.ts:46-62); DP-56 (insights-canvas-routes.ts:263-278 answers 503 PORTFOLIO_UNAVAILABLE); DP-50 bundle half (report-os.ts:2086-2128: entitlement via bundleExportRefusal, then sendRecordedPdf records before sending); DP-11 key-id half (boot refuses without AUDIT_EXPORT_SIGNING_KEY: server/config/__tests__/environment-audit-export-key.test.ts; Terraform terraform/stack/main.tf:228); DP-37 and DP-24 (gates green).
- BASELINE IDS RE-VERIFIED STILL OPEN, state unchanged: DP-49 (server/routes/tenant-users.ts has no audit call); DP-57 (server/routes/tenant-config.ts has no audit call); DP-55 (esignature.ts:205,371,418,455 `signatureMeaning ?? null`); DP-53 (ana-ri/command-rbac.ts:417 `'audit.explain': { effect: 'read', object: 'audit_row' }` with no minRole; mdx-explain-audit-row.ts:90-97 selects ip_address and user_agent; latent because audit_logs.id is a UUID and the handler does Number(auditRowId)); DP-50 deliveries half (report-os.ts:2235); DP-05 (terraform/stack/main.tf:43-46 owner DATABASE_URL in the API task; :221-228 DATABASE_URL, AUDIT_HMAC_KEY, AUDIT_HMAC_SECRET, AUDIT_EXPORT_SIGNING_KEY all in the API task), so the new 'Audit trail integrity attestation' is verified by the same process that holds the keys and the owner credential; DP-11 symmetric seal (an inspector verifies only through the organisation); DP-02 baseline up by one (above).
- TENANT KEY PROVENANCE, reporting paths: every handler takes the organisation from the session (report-os.ts:302-309 requireSessionOrg with usableOrgId; insights-canvas-routes.ts:235; report-os-insights.ts authedOrgId; audit-compliance-reports.ts:76-80). Zod strips a body organizationId (report-os.ts:57-65). No path param or header is a tenant key.
- OBJECT-LEVEL AUTHORIZATION, report-os ids: every run, dependency, snapshot, group, bundle, delivery, project and submission lookup carries the session organisation (report-os.ts:1310,1381,1395,1457,1487,1641,1669,1699,1814,1862,1919,2020,2043,2100,2166,2173,2183,2192,2199,2281,2286; submissionInProject :602-614; projectsInOrg :592-599). Program memberships are joined to projects on organisation (fetch.ts:81-107).
- COMPLIANCE REPORT SQL: every statement of all seven reports carries an organisation or tenant predicate (access-review.ts:57,69; authentication-events.ts:57,68; administrative-changes.ts:71,92; electronic-signatures.ts:53-54; retention-legal-holds.ts:41-43,65,90; controlled-documents.ts:53,70,88,121,128; audit-trail-integrity.ts:54,66), on one READ ONLY REPEATABLE READ snapshot stamped with the organisation (generate.ts:40-57). The vault read binds the organisation UUID and refuses a UUID that is not this organisation's (retention-legal-holds.ts:102-114). actor_name() is organisation-keyed by app.current_tenant_id (migrations/20260929_actor_names.sql). No string-built SQL beyond fixed fragments and constant LIMIT (section.ts:14-18).
- COMPLIANCE REPORT CONTROLS: role gate before anything is read (audit-compliance-reports.ts:83-87,228; audit-api-authority.ts:26,56-61); period strictly parsed YYYY-MM-DD, 366-day cap, refused rather than coerced (period.ts:18-31,67-79), so the filename cannot carry input (signed-report.ts:98-103); signing key resolved before any query (audit-compliance-reports.ts:107-123); record-before-send with 503 and nothing sent (audited-export.ts:95-129; audit-compliance-reports.ts:146-189); CSV cells neutralised by sanitizeCsvValue (signedAuditExport.ts:523-530; csv.ts:65-69); the seal-check admin scope is used only to verify and returns valid, a count and an index (integrity-checks.ts:31-50), the same pattern as tenant-chain-verdict.ts.
- PDF AND EXPORT INPUTS: filenames are `report-run-${runId}.pdf` (number) and a UUID prefix (report-os.ts:1718,2123); every drawn string passes sanitizePdfText (:276-278,713-819); each PDF export is recorded before it is sent (:436-462) and the bundle export is entitlement-gated (:566-583). No outbound fetch, child process, model call, sql.raw, multer or dangerouslySetInnerHTML in server/services/report-os, compliance-reports, the four reporting routers, Insights.tsx or the compliance-report client files (grep); no AI egress exists on the reporting paths.
- SECOND DOORS CHECKED AND CLEAN: socket.io has only the /ana namespace (ana-realtime.ts:210), no reporting or audit events; /api/v1 public API has no audit or report route (public-api.ts); SIEM feed gated and organisation-bound (admin/audit-siem.ts:42,109-146); platform admin consoles gated (admin/master-admin.ts:87-88); /api/audit-trail/ledger gated (audit-trail-ledger.routes.ts:674); legacy /api/audit-logs gated (audit-trail-routes.ts:244-248); /audit/signatures and the chain monitor gated (:481,:765,:795); the subscription sweep delivers nothing, scans in system scope and computes in each subscription's own tenant scope (scheduling/worker.ts:119-143; worker-register.ts:54-80); the seven AnA reporting tools are organisation-scoped and classified (AnaToolExecutor.ts:20833-21060 region; register: save_report_definition 'confirm', the others 'read'); canvas definitions are reachable only through those tools (definition-service.ts, no router imports it).
- PRODUCTION POSTURE as read: Terraform sets RLS_ENFORCE=on, AUDIT_TRAIL_ENABLED and AUDIT_REQUIRE_ENFORCE (terraform/stack/main.tf:181-189) and provisions the three audit keys (:226-228); the deploy preflight lists them (deploy-aws.yml:379-384). Not verified against a live deploy.

## What the lens did not cover

- Nothing was executed against a running server, database, KMS or AWS account. I ran no test suite or dbtest; the evidence folders' green results (for example 16 of 16 compliance-reports dbtest as app_service with RLS_ENFORCE=on) are not re-verified. Whether sendAuditedExport's un-stamped pool.connect() writes under RLS in production relies on the pool wrapper (poolInstrumentation.ts wrapClientForScope) reading, which I did not execute.
- Whether the innovation and intelligence schemas exist in a deployed database, and whether any RLS policy distinguishes a viewer's writes, could not be verified by reading (DP-64, IAM-20). Whether the deployed task sets LAUNCH_SCOPE_* is unknown (INF-17 extension).
- Not read in full: signedAuditExport.ts (only the query, export, verify and CSV parts), chain.ts (only the break shape and the seal verifier; I did not trace readChainRows' cross-tenant reads or verifyChainSeals), lineage-dossier.ts (three loaders), establishRequestTenantScope, enforceOrgMembership, withTenantConnection, the intelligence risk model and its cross-tenant 'network prior', and the client surfaces beyond grep.
- Check items covered only where they touch reporting: immutability triggers on every audit store and the runtime role's DELETE grants (item 5); retention, legal hold and purge coverage of report_runs, report_snapshots and the bundle/delivery memory rows (item 9: no retention policy for them was found, and I did not trace tenant-export or offboarding); CI and Terraform honesty (item 10) beyond the launch-scope and audit-key flags; whether every jwt.verify caller outside the reporting authenticators applies requireAccessTokenReason (ci:jwt-verify-pinned only proves the algorithm is pinned).
- The audit_events hash-chain trigger is described in part11-compliance.ts:796-798 as possibly absent from the deploy set; I did not check it, so whether the chain-integrity linkage check in the attestation has anything to verify in a deployed database is unconfirmed.

## Files read

- `docs/security/SECURITY_AUDIT_2026-09-24.md`
- `docs/evidence/D2-REPORTING-LAUNCH-APP/2026-09-30/README.md`
- `docs/evidence/D6/2026-09-30-compliance-reports/README.md`
- `docs/evidence/D6/2026-09-30-compliance-reports/server/README.md`
- `shared/constants/launch-scope.ts`
- `shared/constants/ui-surface-registry.ui-v2.ts`
- `server/bootstrap/register-inline-routes.ts`
- `server/bootstrap/register-clinical-intel-routes.ts`
- `server/bootstrap/register-platform-routes.ts`
- `server/bootstrap/register-advanced-platform-routes.ts`
- `server/routes/report-os.ts`
- `server/routes/report-os-insights.ts`
- `server/routes/insights-canvas-routes.ts`
- `server/routes/audit-compliance-reports.ts`
- `server/routes/audit-trail-routes.ts`
- `server/routes/audit-trail-ledger.routes.ts`
- `server/routes/mdx-audit.ts`
- `server/routes/mdx-search.ts`
- `server/routes/mdx-vault.ts`
- `server/routes/part11-compliance.ts`
- `server/routes/admin/audit-siem.ts`
- `server/routes/regulatory-correspondence.ts`
- `server/routes/esignature.ts`
- `server/routes/c2c/project-vault.ts`
- `server/services/audit/audit-api-authority.ts`
- `server/services/audit/audited-export.ts`
- `server/services/audit/tenant-chain-verdict.ts`
- `server/services/audit/signedAuditExport.ts`
- `server/services/audit/chain.ts`
- `server/services/audit/compliance-reports/generate.ts`
- `server/services/audit/compliance-reports/catalog.ts`
- `server/services/audit/compliance-reports/csv.ts`
- `server/services/audit/compliance-reports/period.ts`
- `server/services/audit/compliance-reports/run-limits.ts`
- `server/services/audit/compliance-reports/signed-report.ts`
- `server/services/audit/compliance-reports/integrity-checks.ts`
- `server/services/audit/compliance-reports/queries/section.ts`
- `server/services/audit/compliance-reports/queries/access-review.ts`
- `server/services/audit/compliance-reports/queries/authentication-events.ts`
- `server/services/audit/compliance-reports/queries/administrative-changes.ts`
- `server/services/audit/compliance-reports/queries/electronic-signatures.ts`
- `server/services/audit/compliance-reports/queries/retention-legal-holds.ts`
- `server/services/audit/compliance-reports/queries/controlled-documents.ts`
- `server/services/audit/compliance-reports/queries/audit-trail-integrity.ts`
- `server/services/report-os/orchestrator.ts`
- `server/services/report-os/providers/db-providers.ts`
- `server/services/report-os/portfolio/fetch.ts`
- `server/services/report-os/scope-model.ts`
- `server/services/report-os/canvas/render-report.ts`
- `server/services/report-os/canvas/definition-service.ts`
- `server/services/report-os/sealing/seal.ts`
- `server/services/report-os/scheduling/subscription-service.ts`
- `server/services/report-os/scheduling/worker.ts`
- `server/services/report-os/scheduling/worker-register.ts`
- `server/services/report-os/scheduling/delivery.ts`
- `server/services/report-os/prediction/model-adapters.ts`
- `server/services/innovation/submission-readiness-twin-service.ts`
- `server/services/ana/AnaToolExecutor.ts`
- `server/services/ana/tool-authorization.register.json`
- `server/services/ana/ana-launch-scope.inventory.json`
- `server/services/ana-ri/mdx-explain-audit-row.ts`
- `server/auth.ts`
- `server/middleware/auth.ts`
- `server/middleware/orgMembership.ts`
- `server/utils/authedOrgId.ts`
- `server/services/entitlements/launch-scope.ts`
- `server/services/entitlements/launch-scope-api.ts`
- `server/services/entitlements/api-prefix-map.ts`
- `server/middleware/moduleEntitlementGate.ts`
- `server/db/runtime.ts`
- `server/db/poolInstrumentation.ts`
- `server/services/tenant/governed-tenant-context.ts`
- `server/startup/audit-trail.ts`
- `migrations/20260929_actor_names.sql`
- `db/migrations/072_gcc_innovation_platform_core.sql`
- `scripts/ci/check-session-scoped-rls-bypass.mjs`
- `terraform/stack/main.tf`
- `client/src/concept2cure/v2/surfaces/Insights.tsx (grep only)`
- `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx and siblings (grep only)`
