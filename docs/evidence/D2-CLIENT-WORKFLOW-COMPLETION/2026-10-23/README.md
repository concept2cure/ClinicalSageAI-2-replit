# W1 / D2 — official eSTAR Vault attachment completion

Status: discovery complete; implementation and qualification pending.
Product branch: `concept2cure-v2`.
Design: `docs/design/ESTAR_VAULT_ATTACHMENT_COMPLETION_2026-10-23.md`.

## What already exists

- `OfficialEstarPanel.tsx` / `useEstarExport.ts`: the existing official export
  UI and delivery hook; neither exposes the existing attachment request/report.
- `server/routes/510k-estar-routes.ts`: existing governed official export and
  attachment input; no read-only template slot catalog for the human UI.
- `estar-attachment-slots.ts`, `estar-template-registry.ts`: template-derived
  slots and pinned-byte integrity; extend/reach these, no copied registry.
- `estar-attachment-plan.ts`, `estar-fill.ts`: existing verified Vault source
  reader, mechanical refusals, manifest/embedding and UUID/slot/hash report.
  Its missing actor/current-version/approval/disposition gates must be composed
  from existing canonical services before this UI is enabled.
- `VaultLibraryResults.tsx` / `project-vault.ts`: existing authorized, paginated
  exact-version picker/search with recorded hashes; reuse rather than rebuild.
  Tighten its program response guard: missing current-version metadata must
  not become an affirmative current-version claim.
- `submission-service.ts`, Builder and `package-from-core.ts`: separate draft
  placement and later eCTD lifecycle mechanisms already exist. No new lifecycle
  or placement engine is needed for eSTAR.
- Vault immutability and retained hashes intentionally refuse legacy/all-retired
  recovery; those policies are unchanged. Deleted-history searches found old
  MDX editor/fixture cleanup, not a second usable official export UI.

Full discovery paths, boundaries and test contract are in the design above.
No human acceptance, native Acrobat, live-provider or agency qualification is
claimed. Evidence will distinguish fixtures from real template bytes and mark
manual scenarios **Not run**.
