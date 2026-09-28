# Coverage-gap sweep, 2026-09-28: the areas the weekly review did not reach

The weekly review (`../README.md`) filed, per lens, what it did not cover. This sweep covers those gaps:
- the Authoring editor core (`DocumentWorkbench.tsx`, `RichSectionEditor.tsx`, `editor/*`);
- protocol development and the eCTD co-author sign-off chain end to end;
- the Authoring sub-surfaces;
- the server services behind Projects, Vault and QMS;
- the security items the lens did not re-open (legal hold, the DP-02 writers, SAML/SCIM, and the confirmed-write role gate added that day);
- the untouched microcopy;
- a static accessibility read;
- a real-browser keyboard pass.

- **Head swept:** `232ecae9c`. Nine auditors ran, read-only.
- **Verification:** every finding went to three independent agents, each told to refute it through one lens:
  - **reachability:** is the code reachable in the production configuration, and does nothing else stop it;
  - **reproduction:** can the failure be demonstrated;
  - **intent:** is it a defect, or a documented design decision.

  A finding is confirmed when at least two of the three could not refute it. Low findings had one reproduction verifier.
- **Scale:** 73 agents. The first run hit a session limit, and the resumed run replayed the two finished sweeps from cache.
- **Rows informed:** D2, D5, D6.

## Verdicts and disposition

| Finding | Severity | Verdict | Disposition |
|---|---|---|---|
| GE-P-1 Revert's audit record written after COMMIT, on the pool | blocker | confirmed 3/3 | **Fixed** `59b0d8f9a`: written on the transaction client before COMMIT; a failed write rolls the revert back (red 2 → green) |
| GE-P-2 Frozen notice promises "create a new version", which nothing provides | high | 3/3 | **Fixed** `59b0d8f9a`: names the remedy that exists (a new document); no capability added (RULE 2) |
| GE-P-3 Freeze / E-sign / Assign review / File to vault offered to users the server refuses | medium | 3/3 | fix in progress (this session) |
| GE-H-1 Failed data-room read shown as "add documents first" | high | 3/3 | **Fixed** `59b0d8f9a`: says it could not be read, with a retry |
| GE-H-2 Failed program read shown as "Reading the program…" forever | medium | 3/3 | **Fixed** `59b0d8f9a`: the declared-but-unused `error` state is now returned and shown |
| GP-P-1 Protocol-development writes had no role check | blocker | 3/3 | **Already closed** by P11-C-1 (`10ad41a2a`, another session) before the sweep's snapshot reached it. `9d2134b52` adds the no-role case on every write route (66 fail without the gate) |
| GP-P-2 `/api/ana-ri/governed-action` hard-codes the §11.50 meaning to "approval" | blocker | 3/3 | **Fixed.** The route reads the signer's declared meaning from the posted body (never from a held run's model-written params), maps AUTHOR/REVIEWER/APPROVER onto the canonical `authorship`/`review`/`approval` (`GOVERNED_ACTION_DECLARED_MEANINGS`, `part11-governance.ts`), refuses a missing or unknown one with 400 before re-verification and before the audit row, and carries it into `signoff.signaturePurpose` and the pre-execution audit row. `governedActionConfirmTier.test.ts` (13 new; red 11 on the unfixed route) and `mdx-esg-transmit-gateway.test.ts` (2 new, shown failing by reverting the handler) prove the ESG transmit signature row records the declared meaning. Residuals: (a) `placeInDossier`, `createSubmissionPackage`, `revertToVersion` and `erasePersonalData` still persist no signature record of their own — each needs a transaction, a ledger row, a §11.70 binding decision and `authenticationMethod`/`secondFactorVerified` on `Part11Signoff`; founder decision. (b) the k510 transmit handler hard-codes `secondFactorVerified:false` and answers `success:true` when its post-transmit ledger write fails. (c) `sign_document` defaults its PIN prompt's meaning to `APPROVER` from params (nothing is persisted from it). |
| GP-P-3 Deviation close labelled as an e-signature | medium | refuted 0/3 | — |
| GP-H-1 ConsentTab "NaN% complete" | medium | refuted 0/3 | — |
| GS-H-1 Project roll-up drops grandchildren | high | confirmed 2/3 | **Latent, recorded.** Only paths written by the move route break it, and that route is wired to nothing. The real creators write the format `getTree` expects (the reachability verifier reproduced this on the reference DB). Needs fixing before hierarchy moves are exposed. |
| GS-H-2 `/api/qms/summary` `healthy:true` over nothing assessed | high | confirmed 2/3 | **Not reachable.** No client or server caller; the repository's orphan report lists the endpoint. Belongs to DP-34 (the duplicate `/api/qms` family). |
| GS-S-1 MCP governed tool bypasses the role gate | high | confirmed 2/3 | **Fixed** `9d2134b52`, as a precondition. MCP is off in production (`MCP_ENABLED` is set nowhere). Governed MCP tools now need an editor role from `organization_users`, through one shared decision (`server/services/part11/editor-role.ts`) also used by AnA (red 3 → green) |
| GS-S-2 DP-02 writers | medium | refuted 0/3 | — (accurately accounted for in the register) |
| GS-S-3 connector bearer verification | low | refuted | — (IAM-02 residual already on the register) |
| GA-1 Reason-for-change requirement on save has no accessible indication | blocker | 3/3 | fix in progress (this session) |
| GA-2 Protocol tab strip has no ARIA tab semantics | high | 3/3 | fix in progress (this session) |
| GA-3 `aria-pressed` on one-shot ribbon commands | high | 3/3 | fix in progress (this session) |
| GA-4 Escape and close controls on the editor's right rail | medium | 2/3 | fix in progress (this session) |
| GA-5 Ledger-integrity verdict not announced | medium | 3/3 | fix in progress (this session) |
| GA-6 Section rename does not return focus | medium | 3/3 | fix in progress (this session) |
| GA-7 Disabled "Record disposition" reason only in a `title` | medium | 3/3 | fix in progress (this session) |
| GB Boot-time auth-schema repair omits `email_otp_resends` | blocker (as reported) | refuted 0/3 | **Not a product defect.** The column deliberately has one creator, the migration, which deploy runs before the image serves (`migrations/20260923_users_mfa_totp_last_step.sql`, 2026-09-26 amendment). The local reference DB was behind, so **the real-browser pass did not run**. It is owed once that DB is current. |

## Also closed this session, outside the sweep

- **IAM-19 / P1-33** (`494b4fc14`): the `/ana` socket re-checks its session on a timer. The check is shared with the main namespace (`server/socket/sessionRecheck.ts`). Evidence: `docs/evidence/D6/2026-09-25-p1/P1-33/`.
- **Collaboration socket (Hocuspocus):** it has the same once-only authentication and no re-check. It is off by default and not enabled by any deployment. It needs the re-check before `ENABLE_COLLAB_CRDT` is turned on.

Microcopy: no new finding in the surfaces swept.
