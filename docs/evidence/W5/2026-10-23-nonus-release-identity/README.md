# W5 / D7 — complete non-US release identity coverage

Status: implemented and scoped automated verification passed; normal canonical push gates pending.
Baseline `dd749f3e56f1d9055b19067e90680d70bf9a9fb9`. Contract `docs/design/NONUS_RELEASE_IDENTITY_COMPLETION_2026-10-23.md`.

## What already exists

- `shared/regulatory/region-identity.ts` is the canonical agency/region resolver.
  No new region table or support claim is needed.
- `server/services/ectd/package-identity.ts` already reads same-tenant program,
  sponsor and P-44 submission/market application numbers; its version-1 snapshot,
  equality check and program/sponsor share-lock helper are canonical. Snapshot
  projection currently carries FDA facts and has no region projection. The
  governed transition already locks submission before sequence, then program and
  sponsor; transmit and waiver/disposition currently start at sequence. DUNS and
  contact are FDA facts, not other agencies' IDs.
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
- `submission-orchestrator-continuation.ts` already verifies frozen digest,
  seal and signer envelope before the existing release ceremony; it does not
  ask the canonical package identity sign-refusal before signing an older run.
  `server/mcp/tools/catalog.ts` reaches the release resolver but omits the known
  sequence region. Both callers are completed in this same identity lane.
- The legacy identity-staleness branch of `sequence-release-signature.ts`
  compares unchanged content but omits the attribution-hash check already used
  by modern proof. It must prove the original manifest intact before renewal.
- P-44 explicitly hands non-US application-number signature coverage to this
  identity lane (`docs/evidence/D2-ONE-ANA/2026-10-22/p44-market-application-number/README.md`).
  EMA slash handling and the unknown-region home-number heuristic are separate.
- Code searches covered application/market number, identity, captured snapshots,
  signature coverage, dispatch authorization, routes, services, UI and tests.
  `git log --all --diff-filter=D` over package identity, sequence binding,
  signature coverage and market-number names found no deleted replacement.

Human witnessing, real agency qualification and acceptance remain unexecuted.


## Completed behavior

Recognized non-US sequences now bind the recorded market application number,
applicant name and sponsor pointer through the existing version-1 proof. FDA
DUNS/contact remain US-only. Current release coverage checks the sequence's real
parent and region. Older proof-free packages remain historically verifiable but
cannot establish current coverage or receive a fresh release signature without
reassembly. Missing/damaged legacy attribution hashes keep the invalid verdict.

The existing freeze, waiver/disposition and transmit paths capture facts under
organization → submission → sequence → program → sponsor locks, with freeze
requesting submission UPDATE directly. Claims assemble their captured proof and
compare it again before gateway entry. The typed number must also equal the
claim's captured number. Locks are released before network work. Existing
unsent renewal and its UI now reach recognized regions with independent signing,
full gates, spent-signature checks, audit and dispatch-state CAS intact.

The original inventory above describes the starting state, not a second
implementation. No schema, dependency, market-number writer policy, regional
vocabulary, approval engine, UI surface or enforcement default was added.

## Executed verification

Counts are separate scoped cohorts and overlap; they are not a full-suite total.
Exact commands, test inputs and red/intermediate outcomes are retained by each
folder. Root current-source hash verification is in `verification/`.

| Evidence | Executed result |
| --- | --- |
| `core/` | 189 passed, 1 pre-existing Vault supersession todo; capture/binding, 11 non-US ZIP projections, FDA compatibility, legacy hash/tamper, P-44/Vault regressions |
| `verification/regional-boundary.txt` | 223 passed across 9 files after the canonical validator export and continuation completion |
| `callers/verified-caller-cohort.txt` | 119 passed across 10 files; actual renewal/audit/rollback, captured transmit, typed-number race and claim-release safety |
| `callers/verified-compile-cohort.txt` | 49 passed across 4 files; actual HTTP compile projection/refusal and conversion capacity |
| `callers/ui/` | 38 passed; existing independent sign-to-dispatch continuation and refusal/uncertain receipt behavior |
| `review/` | 15 persisted-writer checks passed, including actual EU/JP binder and signature persistence without mocked proofs; five review findings resolved |
| `native/green-native-final.txt` | 6 passed on real PostgreSQL; identity row locks and existing leaf/freeze interleaving |
| `browser/` | 10 Chromium checks passed; actual market-number/dispatch components, synthetic intercepted API, observed callback only |
| `verification/build.txt` | Production build passed on Node 22.23.3; pre/post source hashes stable |

The first implementation push was refused for two added complexity warnings.
The same claim predicate and UI mock branch were extracted without changing
conditions or assertions. The followup passed 20 claim tests, 38 UI tests, the
unchanged warning ratchet over all 41 changed lintable files, and a fresh build
(`verification/build-final.txt`). Earlier source-bound cohort records retain
their original pins; `verification/current-input-verification.json` names the
limited changes and followup coverage. Scoped lint has zero errors and no added
warnings after this correction; existing warnings remain.
The native fixture container and browser server were stopped after verification.
Normal unchanged push/compiler gates must pass before canonical publication is
reported. No baseline, hook or failing agency gate was weakened.

## Limits and human handoff

[HUMAN_CHECK.md](HUMAN_CHECK.md) is unexecuted. This packet does not establish
agency qualification, protocol/pilot acceptance, production deployment or
witnessed human use. Agency DTD/vocabulary assets and real agency conformance
remain separate evidence. Optional non-US applicant identifiers retain their
existing request-owned contract; no authoritative regional-ID registry is
invented here. FDA rules, P-44 fixed-number immutability, EMA slash handling and
the existing unknown-region home-number reading heuristic remain separate.


## Full compiler correction

The normal zero-error TypeScript gate found one parameter mismatch after the
lint extraction (`verification/push-type-refusal.txt.gz`): the governed binder
returns `string | null`, while the extracted comparison declared `string`.
The predicate now accepts that actual nullable type. Its equality with the
required expected digest still refuses null; runtime conditions are unchanged.
The prior build and scoped cohort pins are retained as executed. The normal full
compiler must pass again before publication; no baseline or hook was changed.
