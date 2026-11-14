# Trial design visibility from a project

F1 / W1 / D2, baseline `4b82ba809`. The founder reports no visible Trial Design UI.

## What already exists

`shared/regulatory/app-registry.ts` maps the combined Study & Protocol Design identity to existing `protocol-dev`. `ProjectCoreWork.tsx` supplies its project work-area door, and `ProjectRecords.tsx` its Protocol evidence door. `Shell.tsx` deliberately gives that work no separate rail entry. The protocol workspace (`ProtocolDev.tsx`, `ProtocolDevSelection.tsx`, `ProtocolDevWorkspace.tsx`) exposes its Study design tab only after a protocol is selected; `ProtocolDevDesign.tsx` and `ProtocolDevCreateDesign.tsx` already contain the design binding/creation controls. The existing study-design/protocol-development services, routes and persisted records remain the one implementation.

The shared canvas/editor/generator, current availability and governed write checks remain authoritative. Accepted placement is documented in `docs/design/STUDY_PROTOCOL_PROJECT_INITIATION.md` and `.design/client-journey/INFORMATION_ARCHITECTURE.md`. Full code/alias/deleted-history searches found current owners and superseded legacy batches, not a missing engine to rebuild. The detailed pre-edit inventory is `.design/claude-convergence/F1-TRIAL-DESIGN-REACHABILITY-2026-11-14.md`.

## Verification contract

Reproduce the ordinary project-to-design UI, identify the actual missing/hidden entry, and complete the existing flow without a new screen, app, rail entry, editor, store, API or entitlement bypass. Verify project/account scope, dirty-work guards, honest loading/empty/error states and a real browser journey. Provider/clinical qualification is not implied by UI/manual/deterministic checks. Record concrete source ownership before edits; held D3/S12 regions stay untouched unless explicitly coordinated.

Source review reproduces two concrete gaps: the real palette cannot match Trial design or Study design against the existing protocol registry row, and the empty workspace hides all design controls behind protocol creation without naming that combined start. The bounded repair aligns only existing discovery metadata and makes the confirmed clinical-protocol creation continue into its existing Study design tab. Exact ownership and one-time intent safeguards are recorded in the design before implementation. Project/Shell layout, native APIs, protocol form/store and shared editor are preserved.

## Reproduction and repair

The recovered local Codespaces-image runtime at `4b82ba809` has setup accounts but no projects. Exactly one explicitly synthetic medicinal US IND project is created through the ordinary intake: `d91a5a21-1ed5-4c1d-8f06-e881483774be`, Trial design UI rehearsal — SYNTHETIC (TD-UI-001). The existing project Work areas door is visible and retains this project, but its empty destination contains only Start a protocol and Ask AnA, with no Study design tab. Actual CmdK queries Trial design/Study design do not offer the protocol destination. Baseline JSON/screenshots are retained under `browser/`.

The local persona named Ana Author has the seeded demo organization-admin session in organization 2; this is not narrow-member-role acceptance. Startup reuses the existing app-role environment without owner provisioning, broad demo reseeding, new accounts/grants or provider requests. These are local synthetic UI observations, not access to the founder's hosted Codespace. This project has the medicinal track's Work areas door; the current device/diagnostic track exclusion is not changed or claimed as verified here.

The existing registry row now uses the canonical Study & Protocol Design label and searchable trial/study-design terms, retaining its old protocol terms and all admission checks. Empty entry explicitly names clinical trial design and its combined start. A confirmed newly created clinical protocol opens its existing Study design tab once, only for the exact returned id/project and current session/project visit. Successful form close does not cancel that read-back continuation. Accepted manual selection/scope/handoff, stale session/project visits and malformed/missing receipts cannot replay it; existing protocols and nonclinical kinds retain Document default. No effect subsequently switches the person's tab.

This guards creation callbacks and the one-time continuation. It does not claim a general retrofit of session ownership into every existing protocol read. The current form, governed API, design/store bindings, shared editor and native signatures remain unchanged.

## Source verification

- Real palette baseline: two failures/seven controls; repaired nine/nine. Final discovery/registry/entitlement run: 139/139 across six suites.
- Exact flow baseline: nine failures/nine controls across 18 cases. Repaired focused run: 22/22, including four additional deferred-read lifetime controls. Final flow/picker/navigation/write run: 96/96 across seven suites.
- The final two suite sets are disjoint: **235 passing checks across 13 suites**. Focused/red/adjacent counts overlap and are not added again. `unit-verification.json` lists the exact files and hashes.
- Scoped lint has zero errors and no warning growth. Two preexisting warnings remain in the registry/registry-model fixture; inverse baseline hashes match canonical Git bytes. Flow's six files have zero errors/warnings. The two obsolete label assertions are reconciled without weakening behavior.
- Independent final review has no blocker and verifies all nine source/test hashes. Initial failed observer URL/selector assumptions are retained separately as harness corrections, not product failures. Real repaired search retains shell project identity and actual program-scoped API reads even when the URL does not repeat `program=`.

The final committed-source protocol/design persistence rehearsal and compiler/publication receipts follow separately; no model generation, signing, approval or filing is implied.
