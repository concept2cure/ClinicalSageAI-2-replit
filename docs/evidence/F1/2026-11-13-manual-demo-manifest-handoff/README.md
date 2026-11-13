# Keep manual Codespace demo receipts outside historical evidence

Plan: F1. Complete the existing manual portfolio command in the [Codespaces handoff](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md). No runtime, seed behavior, route, schema, dependency or approval control changes.

## What already exists

- `scripts/demo/launch-demo/lib.mjs` already accepts `DEMO_MANIFEST_ROOT`. When omitted, its step runner writes to `docs/evidence/DEMO/<pack>/manifest.json` in the checkout.
- `.devcontainer/post-create.sh`'s existing `c2c_seed_portfolio_org` supplies the private Codespace state's `demo-manifests` directory. `.devcontainer/post-start.sh` runs that helper separately after the general seed succeeds.
- `docs/evidence/DEMO/portfolio/manifest.json` is tracked historical evidence. The handoff's manual portfolio example omitted the existing manifest-root setting and could overwrite that file with a new Codespace's runtime IDs.
- The portfolio generation sources, Lumen kit data, canonical renderer, exported acceptance ZIP and receipts are tracked. A fresh Codespace creates its own database/Vault identities through the product APIs; it does not reuse the historical manifest's IDs.
- Searches covered current startup, seeder configuration, tracked manifests, demo roles/projects/folders and presenter instructions. Deleted-history search over the existing Codespace, handoff and launch-demo owners found no retired alternative to restore.

## Completion contract

Set the manual example's `DEMO_MANIFEST_ROOT` to the same private state location automatic startup uses, honoring an explicit `C2C_CODESPACE_STATE`. State where the current runtime receipt is written and that fresh identities are regenerated. Preserve the existing API command, demo identity, canonical-branch update instructions and governance boundaries. Do not reseed or alter any runtime state for this documentation change.

## Verification

- The extracted manual command passes `bash -n`; its existing pack, API address and identity arguments remain intact.
- Parameter expansion selects the same private manifest directory as the existing bootstrap helper, both by default and with an explicit state path containing spaces. Only expansion was executed; the seed was not run.
- All 35 relative file-link targets across the handoff and this evidence resolve. Whitespace checks pass.
- No seed, server, full suite, compiler or build was run, and no runtime or credential state was changed.
