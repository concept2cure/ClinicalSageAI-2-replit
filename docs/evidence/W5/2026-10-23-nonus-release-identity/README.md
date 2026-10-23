# W5 / D7 — complete non-US release identity coverage

Status: claimed; implementation and verification pending.
Baseline `dd749f3e56f1d9055b19067e90680d70bf9a9fb9`. Contract `docs/design/NONUS_RELEASE_IDENTITY_COMPLETION_2026-10-23.md`.

## What already exists

- `shared/regulatory/region-identity.ts` is the canonical agency/region resolver.
  No new region table or support claim is needed.
- `server/services/ectd/package-identity.ts` already reads same-tenant program,
  sponsor and P-44 submission/market application numbers; its version-1 snapshot,
  equality check and program/sponsor share-lock helper are canonical. Snapshot
  projection currently carries FDA facts; it has no region projection or
  submission-number lock. DUNS/contact are FDA facts, not other agencies' IDs.
- `server/services/submission-service/market-application-number.ts`, the existing
  `/api/submissions/:id/application-number` routes and `ProjectMarkets.tsx` /
  `MarketApplicationNumber.tsx` already record the market number with reason,
  authority and chained audit. A changed existing number is refused after a
  sequence fixes it. That policy stays; no second editor or writer is needed.
- `server/services/part11/ectd-sequence-binding.ts` already captures FDA identity
  with the exact legacy sequence-content digest. Non-US signatures remain
  leaf-only. `signature-persistence.ts` stores the derived proof after caller
  metadata. `sequence-release-signature.ts` already distinguishes proven
  identity-only staleness from tamper, without rewriting historical rows.
- `run-package-identity.ts`, `submission-package-orchestrator.ts`,
  `signed-package-export.ts`, `signed-manifest-covers-sequence.ts` and
  `release-signature-status.ts` already capture, hash, export and compare signed
  package snapshots. Their identity requirement is currently US-only.
- `assemble-from-core.ts`, `package-from-core.ts`, `core-to-packager.ts` and
  `orchestrator-real-package.ts` already pass captured proofs and echo them.
  Scalar/proof consistency checks and export propagation are currently FDA-only.
- `submission-service.ts` already rechecks governed binding under locks, captures
  transmit identity, checks bytes at the pre-wire boundary, releases refused
  claims and permits independent re-signing of an explicitly unsent FDA dispatch.
  Non-US packageability still uses placeholder dry-run identity and transmit
  falls back to a mutable identity read.
- `SubmissionSeqWorkspaces.tsx` and `SubmissionCenter.tsx` already reach the
  server-owned renewal eligibility through the existing Part 11 sign-and-act
  chain. Text is generic; no new approval control is required.
- P-44 explicitly hands non-US application-number signature coverage to this
  identity lane (`docs/evidence/D2-ONE-ANA/2026-10-22/p44-market-application-number/README.md`).
  EMA slash handling and the unknown-region home-number heuristic are separate.
- Code searches covered application/market number, identity, captured snapshots,
  signature coverage, dispatch authorization, routes, services, UI and tests.
  `git log --all --diff-filter=D` over package identity, sequence binding,
  signature coverage and market-number names found no deleted replacement.

Human witnessing, real agency qualification and acceptance remain unexecuted.
