# part11-ux lens — weekly launch-catalog review, 2026-10-08

Head reviewed: `373c9af51`. Auditor run read-only. Every blocker, high and medium finding that is new or still open went to a separate verifier told to refute it; its verdict follows each finding. Low findings were not independently verified.

## Coverage, as the auditor reported it

Part11-ux lens at HEAD. Charge 1: re-verified all three findings open on 2026-09-28 (Q-0928-1, -2, -3) and found all three fixed. I also spot-checked the 2026-09-28 "still fixed" items only through the QMS and transmit paths I opened. I did not re-read Q1 to Q6 line by line. Charge 2: sweep of Reporting & analytics. I read report-os finalize and deliveries, the Insights.tsx finalize dialog, and the intelligent-reports seal, supersede and revoke routes with the ReportGovernance surface. Finalize is correctly governed: role gate, signing authority, re-authentication, reason, a meaning chosen in the shared e-signature dialog, and the signer, meaning and time shown back on the sealed run. Deliveries now require a role (DP-61). One new finding came out of it (P11-1). NOT covered: I did not read the git log or diff since aff7eae16 in full, so I may have missed regressions in Authoring review/approval, Vault approval and versions, or Submission Center beyond transmit. I did not trace report-os bundles, program-groups, snapshots or insights subscriptions for audit coverage. They look like non-signing writes and I did not judge them regulated. I did not check the server-side separation-of-duties rules in finalize. I did not re-trace EctdCoauthor or ProtocolDev, which the 2026-09-28 report also left untraced. I ran no gates, tests or builds.

## Findings

### Q-0928-1 — AnA retire_qms_document no longer retires without a signature

- **Status:** fixed-since-2026-09-28 · **Severity (auditor):** n/a · **App:** QMS controlled documents
- **Where:** `server/services/ana/AnaToolExecutor.ts:14339-14345`
- **What:** The handler is now `refuseSignatureInChat(...)`, which points to the Quality register Retire action (password and second factor), the same pattern as approve_qms_document. The cannot-sign test now lists the tool (ana-cannot-sign.test.ts:59, :110). The tool-authorization test also classes it `refuse` (tool-authorization.test.ts:70). I did not run the tests.
- **Fix:** None.

### Q-0928-2 — AnA revise_qms_document now checks the caller's org role

- **Status:** fixed-since-2026-09-28 · **Severity (auditor):** n/a · **App:** QMS controlled documents
- **Where:** `server/services/ana/AnaToolExecutor.ts:14276-14283`
- **What:** The handler calls `editorRoleRefusal(...)` before any write. It reads the role from organization_users for the verified principal and checks it against GOVERNED_WRITE_ROLES, the set requireEditorAccess uses. The reason now goes through `gatedReason`. The write is in one transaction with recordGovernedAction. I did not trace `editorRoleRefusal` itself, and the 2026-09-28 note that every confirm-class tool in runConfirmedTool lacks an org-role check was not re-checked beyond these two tools.
- **Fix:** None.

### Q-0928-3 — Gateway Transmittals now shows the signature meaning

- **Status:** fixed-since-2026-09-28 · **Severity (auditor):** n/a · **App:** Submission Center
- **Where:** `client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx:486-493,857-861; server/services/submission-gateways/governed-transmit.ts:834`
- **What:** The success and rejection toasts now say 'Signed by X, meaning: Y'. The transmittal log row shows the meaning. The server writes `metadata.signature {meaning, signatureId}` on the transmittal row, so the display is per transmittal and does not join by the shared `submission:<packageId>` target. A row with no recorded meaning shows nothing. The log row shows the meaning but not the signing time or the signer (only the submitted_at and submitted_by columns).
- **Fix:** None required. Optionally show signedAt in the log row.

### P11-1 — Report Governance seal, revoke and supersede take no role gate, no re-authentication, no ledger record, and accept any non-empty justification

- **Status:** new · **Severity (auditor):** medium · **App:** Reporting & analytics
- **Where:** `server/routes/intelligent-reports.ts:287-314,339-393,399-426; server/services/intelligent-report-engine.ts:1131-1206,1409-1457; client/src/concept2cure/v2/surfaces/ReportGovernance.tsx:99,185-189,220`
- **What:** The surface sits in the 'Review & govern' nav group (registryModel.ts:639,667), and the server mount at register-inline-routes.ts:204 has no role middleware. 'report-governance' is not in the launch catalog surfaces (launch-scope.ts:134 lists insights and compliance-reports), so this is a reachable surface outside the catalog. On the server, seal and revoke require only a truthy justification and any authenticated org member. Compare report-os finalize, which has a role gate, signing authority, password re-authentication, an 8-character reason and a declared meaning. There is no password check, no meaning, no length floor and no signing-authority check. Neither engine method calls recordGovernedAction or writes audit_logs or c2c_ana_actions. The only trace is a row in report_seal_events plus columns on the report. A viewer-tier member can seal, which makes the record immutable, or revoke, which is irrecoverable. userName falls back to the literal 'System' when the session has no name (intelligent-reports.ts:300). The client shows Seal and Revoke to every viewer, so the user learns of a rejection only server-side, and the server never rejects. The surface's own ANA note says these acts are 'never through screen controls' (ReportGovernance.tsx:159), which contradicts the buttons. Part 11 clauses: 11.10(d) access limits, 11.10(e) audit trail, 11.200 re-authentication, 11.50 for seal and revoke if they are intended as signatures. Moves D3/D5.
- **Fix:** Either remove the surface from the nav and routes, or make it a launch-grade governed act. Add requireRole with REPORT_FINALIZE_ROLES and hasSigningAuthority. Add re-authentication, a declared meaning and an 8-character reason floor, through the finalizeOnChain / GovernedSignatureRefusal path. Call recordGovernedAction in the same transaction. Hide or disable the buttons by role with a stated reason. Refuse when the name is missing instead of defaulting to 'System'.
- **Verifier:** partly-confirmed, severity low. The code defects are real. The reachability claim is wrong for production.

What holds:
- In server/routes/intelligent-reports.ts, seal (287-314), supersede (339-393) and revoke (399-426) check only orgScope, loadOwnedReport and a truthy `justification`. There is no router.use, no requireRole, no password, no meaning and no length floor. userName falls back to `|| 'System'` (lines 300, 352, 412).
- In server/services/intelligent-report-engine.ts, sealReport (1131-1206) and revokeReport (1409-1457) write only immutable_report_records and report_seal_events. Neither calls recordGovernedAction or writes audit_logs or c2c_ana_actions. revokeReport's chainHash does not include contentHash or previousEventHash.
- No migration adds a trigger on these tables; migrations/0014 only references the table through an FK.
- The global auditLog middleware (enterprise-security.ts:678-724) only console.logs request metadata, so it is not a Part 11 trail.
- The client shows Seal and Revoke without any role check (ReportGovernance.tsx:185-189). The ANA note at :159 says these acts happen 'never through screen controls', which contradicts the buttons.

What is refuted or overstated:
- 'Reachable surface outside the catalog' is not true in production. moduleEntitlementGate is mounted app-wide before the feature routes (startup/routes.ts:108, register-entitlement-gate.ts:34).
- readLaunchScopeMode (services/entitlements/launch-scope.ts:42-45) defaults to 'on' when NODE_ENV=production.
- /api/intelligent-reports is claimed only by the 'report-governance' surface (ui-surface-registry.ts:960). That surface is not in LAUNCH_SURFACE_IDS, so launchScopeApiVerdict (launch-scope-api.ts:88-102) returns 'out-of-scope' and every seal, revoke and supersede gets 403 LAUNCH_SCOPE.
- The client LaunchScopeGate locks the deep link, and the nav verdict is entitled:false with source 'launch-scope'. The recorded evidence shows this in docs/evidence/W3/2026-09-23b/.../OQ-PROJ-13.api-1.json.
- The AnA generate_report path is classified hiddenApp in production (ana-launch-scope.inventory.json).

So a viewer can seal or revoke only in dev or staging, or where an operator sets LAUNCH_SCOPE_ENFORCE=off, which is logged. The finding is a latent defect in an out-of-scope legacy store that duplicates Insights finalize in report-os. It is not a live Part 11 exposure on a shipping surface.

I rate it low. The useful fix is to drop report-governance from the registryModel nav groups (639, 667) and fold revoke and supersede into Insights. Hardening the legacy routes in place is the less useful option.
