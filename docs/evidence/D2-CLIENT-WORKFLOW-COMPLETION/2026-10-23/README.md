# W1 / D2 — official eSTAR Vault attachment completion

Status: implementation complete; combined automated qualification running.
Product branch: `concept2cure-v2`.
Design: `docs/design/ESTAR_VAULT_ATTACHMENT_COMPLETION_2026-10-23.md`.

## What already exists

- `OfficialEstarPanel.tsx` / `useEstarExport.ts`: the existing official export
  UI and delivery hook; neither exposes the existing attachment request/report.
  The variant helper also misses canonical `cdx`; reuse the existing
  `shared/constants/domain/product-types.ts` IVD family predicate for the
  correct diagnostic template and attachment destinations.
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
  Existing `client/src/concept2cure/v2/styles/vault-picker.css` supplies its
  layout; complete its measured 28–38px controls to the existing 44px touch
  target standard.
- `submission-service.ts`, Builder and `package-from-core.ts`: separate draft
  placement and later eCTD lifecycle mechanisms already exist. No new lifecycle
  or placement engine is needed for eSTAR.
- Vault immutability and retained hashes intentionally refuse legacy/all-retired
  recovery; those policies are unchanged. Deleted-history searches found old
  MDX editor/fixture cleanup, not a second usable official export UI.
- Builder's existing `mutationUnconfirmed` policy is extracted unchanged into
  `client/src/concept2cure/v2/mutationOutcome.ts` and re-exported for existing
  callers. Existing server manifest seeds/chapter format are shared through
  `shared/regulatory/estar-attachment-manifest.ts` with server re-exports.

Full discovery paths, boundaries and test contract are in the design above.
No human acceptance, native Acrobat, live-provider or agency qualification is
claimed. Evidence will distinguish fixtures from real template bytes and mark
manual scenarios **Not run**.

## Implemented behavior

The existing official eSTAR panel now reaches the existing program-scoped
Vault version picker and the template-derived destination catalog. People
explicitly choose each UUID/hash/destination; incomplete, duplicate or
over-limit selections cannot generate. CDx uses the canonical IVD family
predicate and therefore the IVD template. PreSTAR keeps its administrative
preparation boundary.

The existing attachment resolver composes current actor/project access,
write authority, original-byte disposition, current-version and byte-bound
approval checks, including company legal applicability to FDA/US/the actual
submission type. Checks run around storage reads and at producer/persistence/
delivery checkpoints. Source or permission changes withhold delivery; changes
after persistence starts return an explicitly uncertain outcome.

Attachment-bearing production uses checksum-verified template bytes. Before
download, the existing export hook confirms the official/PDF envelope and an
exact UUID/slot/hash receipt with a coherent routing manifest. It retains
server refusal reasons and retires stale session/context results and downloads.
Returned filenames, chapters, UUIDs, byte counts and hashes are visible.

## Evidence scope and remaining human work

RED records cover the previously unreachable UI/catalog, missing source gates,
incorrect CDx template, malformed delivery/receipts, uncertain HTTP outcomes
and undersized touch controls. Separate GREEN records retain focused backend,
UI, transport and picker qualification. Combined results and exact source pins
are recorded separately so focused epochs are not added together as one run.

Backend fixtures execute canonical access, approval and disposition SQL in
PGlite; byte retrieval, producer and retention seams are explicit where used.
Real vendored FDA template bytes are used by catalog/planner/fill regressions.
Transport fixtures prove delivery control, not Acrobat behavior. Serialized
mounted DOM browser checks qualify component layout only.

Human guide cases **76–83** cover the completed workflow. All manual cases
remain **Not run**. No live deployment, native PostgreSQL concurrency,
Acrobat/FDA validation, agency transmission or general client-readiness
certification is claimed. No legacy recovery policy, new persistent store,
schema migration or production dependency was introduced.
