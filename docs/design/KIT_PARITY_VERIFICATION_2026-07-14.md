# Concept2Cure.RI UI kit → parity verification (2026-07-14)

Verification pass against the `ana-workspace-deliverable` kit handoff
(`START_HERE_CLAUDE_CODE.md`, `INSTALL_CLAUDE_CODE.md`, `CLAUDE_CODE_HANDOFF.md`).

**Finding: the kit is already substantially ported into `client/src/concept2cure/v2`.**
Every non-negotiable named in the handoff resolves in the current tree. This
document records the evidence, the two dormant ported surfaces that need an
operator decision, and the one environment-only gate failure — so no already-shipped
surface gets rebuilt into a parallel path (which the handoff explicitly forbids).

## Non-negotiables — verified

| Handoff requirement | Status | Evidence |
|---|---|---|
| Canonical tokens imported **once at app root** before component CSS | ✅ | `client/src/main.tsx:22` and `client/src/index.css:6` both `@import` `design-system/colors_and_type.css` |
| `--bg-000` resolves to `#faf9f5` | ✅ | `design-system/colors_and_type.css:67` |
| Brand accent resolves to `#d97757` | ✅ | `--accent-main-100: #d97757` at `design-system/colors_and_type.css:84` (dark: `:262`). Kit prose calls this `--accent-100`; the canonical token name is `--accent-main-100` |
| Three-zone shell — nav rail · AnA conversation first · work pane | ✅ | `client/src/concept2cure/v2/Shell.tsx` (`rail` nav + persistent `AnaRail` co-author + work pane; `SURFACE_VIEWS` `hideAna` flag protects editor surfaces that carry their own right pane) |
| Governed mutations — reason-for-change + e-sign, author≠approver | ✅ | `client/src/concept2cure/v2/surfaces/GovernedActionModal.tsx` + `ESignGate` in `Shell.tsx`; consumed by 10+ surfaces (Protocol, DeviceSubmission, ResearchAdmin, Licensing, Admin, …) |
| Groundedness accept-gate — below 0.85 → human review, not silent | ✅ | `server/services/ai-governance/groundedness` + `evaluateReviewRequirement` (`server/services/ai-governance/__tests__/review-policy.test.ts` asserts the 0.85 threshold and blocks low-groundedness accepts without an ack) |
| Slash / capability palette on the composer | ✅ | `slash`/CmdK palette wired in `client/src/concept2cure/v2/Shell.tsx` |
| Ship gate `ci:risk-codes` green | ✅ | `npm run ci:risk-codes` → `OK: Generated risk code types are up to date.` |

## Surface coverage

- `client/src/concept2cure/v2/surfaceViews.ts` wires **84 registered views** across
  67 surface component files (surfaces compose shared sub-modules — Editor\*, Rbm\*,
  `GovernedActionModal`, `C2CForm`).
- Every kit surface in `INSTALL_CLAUDE_CODE.md` has a corresponding registered view
  (hub, 510(k)/PMA/CER workbenches, Submission Center, Quality, Snow Globe→ShadowReview,
  Documents→Vault/Dossier/DocumentAuthoring, Precedent, Analytics→ReportEngine/Insights,
  Memory→AnaMemory, Admin, Template Library, CMC, Biostatistics, IND, Pharmacovigilance,
  Authoring Canvas→DocumentAuthoring, Comms→CommunicationCenter, Projects, HAQ, eCTD→EctdCoauthor).
- The only registry ids without a view fall back to the honest scaffold and are
  **infrastructure concepts, not user surfaces**: `auth-session`, `tenant-org`,
  `feature-flags`, `ana-rail`, `esign-modal`.

## Open items (operator decisions — surfaced, not silently changed)

1. **Two ported surfaces are dormant (unwired).** `client/src/concept2cure/v2/surfaces/DataEntry.tsx`
   and `Mdx.tsx` exist as ported components but are not imported into `surfaceViews.ts`
   nor composed by any surface, and no `data-entry` / `mdx-validation` id exists in the
   canonical `shared/constants/ui-surface-registry.ts`. Most likely **superseded**:
   MDx validation is served by `device-diagnostics` / `ivd-completeness` (`IvdCompleteness`),
   and structured data entry by the shared `C2CForm` / `document-authoring`. Decision
   needed: **delete the two dormant files** (the handoff's "delete the legacy surface in the
   same commit / no parallel old-new paths" rule), or wire them to fresh registry ids.
   Do not wire them without confirmation — doing so blindly would create the parallel
   path the handoff forbids.

2. **`ci:ectd-stubs` fails only on a fresh checkout without deps.** The failure is
   `ERR_MODULE_NOT_FOUND: 'ajv'`; `ajv@^8.17.1` is a declared dependency, so the gate
   passes once `node_modules` is installed. Not a code regression.

3. **`docs/design/UI_V2_INSTALL_LOG.md` is stale** — its tail reports "9 surfaces ported"
   while `surfaceViews.ts` now registers 84. The install log should be refreshed to the
   current state, or superseded by this verification.

## Branch note

Per the kit handoff, delivery targets `concept2cure-v2` directly. This verification was
produced on `claude/attached-instructions-09sa7y` (the assigned working branch) and is
offered as a draft PR; merge onward to `concept2cure-v2` at operator discretion.
