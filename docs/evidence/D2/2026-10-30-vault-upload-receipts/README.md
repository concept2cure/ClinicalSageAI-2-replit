# Complete Vault upload receipt validation (W1 / D2, 2026-10-30)

## What already exists

Searches covered receipt/ingest/upload/success/documentId/reupload in client surfaces, shared contracts, routes, services and tests. Deleted-history search: `git log --all --diff-filter=D -- '*vault*receipt*' '*Vault*Upload*' '*vaultIngest*'`; no retained replacement receipt validator was found.

- `client/src/concept2cure/v2/useVaultUpload.ts` owns all Vault ingest orchestration, outcomes and batch copy. The current success branch casts arbitrary JSON, counts any 2xx as recorded, and can emit a stored status without a document ID. The existing unknown-result path already avoids claiming success after a lost reply.
- `client/src/concept2cure/v2/vaultIngestTransport.ts` owns the existing XHR and exposes actual status plus parsed JSON; no additional transport is needed.
- `server/routes/vault-ingest.ts` returns HTTP201 for a created version and HTTP200 for same-bytes reupload, with literal success, document, filing and optional reupload metadata. `server/services/vault/vault-ingest.service.ts` constructs those fields after commit; this is the contract to validate.
- `server/services/vault/vault-reupload.ts` defines actual reupload differences. Its fields already drive the hook's detail/filing advice.
- `VaultUploadStaging.tsx`, `Vault.tsx`, MDX pathway attachments and `VaultVersions.tsx` already consume shared outcomes. They must receive no invented receipt or false confirmed state.
- `_ingest-xhr-fake.ts` and six existing client upload suites simulate the actual transport. Several positive fixtures deliberately omit the document ID or use placeholder IDs; these must be corrected where they represent confirmed writes, with malformed replies tested explicitly as unknown.
- Existing Zod dependency is already used by the ingest route and retained client contracts. No new production dependency, route, schema or surface is needed.

## Design

Complete validation inside the one upload owner. Treat body parsing as unknown input, validate the actual ingest receipt and expected project before any success status/outcome/copy. Keep malformed or contradictory successful replies unconfirmed using the existing unknown-result state and explicit reload/check guidance; never retry a write automatically. Preserve known HTTP refusals and valid new/reupload/check-in outcomes. Validate all response fields used for user-facing claims, while permitting unrelated extra fields for forward compatibility. A small adjacent parser may be extracted to keep the hook within its existing size limit; it remains the sole receipt parser for this transport.

Exact required response fields and reupload semantics are being reconciled against the current server constructor before implementation. Verification will show meaningful malformed-reply controls failing first, positive real-shaped controls, caller regression checks, build, TypeScript and normal publication gates.

## Reconciled contract

Use the existing Zod dependency for a local receipt parser. Accept only the route's HTTP200/reupload and HTTP201/no-reupload envelopes with literal success, a document UUID, matching program UUID, the document code, nullable persisted title, nonempty assigned version, typed optional extraction status, and typed filing metadata. Bind a normal upload's code to the submitted filename-derived code. A check-in may retain the old code, but cannot return its superseded document ID. Validate the actual reupload difference/change rows and the unchanged/changes consistency before making user-facing claims. Unrelated extra response fields remain allowed.

Compatibility findings from the actual service are preserved: nullable legacy titles are valid; Unfiled may retain a stale folder ID, which must not turn into an auto-filed claim; suggested placements report needsReview=false; reupload.unchanged=false is valid when missing legacy storage/retention/lineage fields were repaired. The latter gets explicit record-updated copy, not the existing nothing-changed claim. No new request or retry is introduced.

## Actual API contract proof

`tests/db/vault-reupload.dbtest.ts` already drives the real upload route, storage and PostgreSQL as app_service with enforced RLS, under its own synthetic tenant. Extend that owner with client-shaped requests and feed their actual JSON replies into the pure receipt parser. This verifies the client schema against real created/reupload/check-in responses without changing the server or inventing another fixture store. The existing disposable database and fixture admission safeguards are retained.

Independent review added equal/duplicate reupload-row controls, since the service emits only unique unequal changes/differences. These malformed rows cannot justify a record-updated claim or advice that an ask was not applied. A null persisted title remains null in the shared outcome; copy names the uploaded file without inventing an "as" title. The existing server OUTCOME_UNKNOWN refusal code is also preserved as unknown rather than prefixed with a false no-recording claim.

## Native legacy-fixture boundary

The first native attempt passed the client-shaped create/reupload/check-in contract case, but an additional fixture setup tried to turn its own newly created record into a legacy record with null title/storage and a retained Unfiled folder. The real `vault.documents_record_guard` refused that direct update with PostgreSQL `P0001`. The unsupported setup case was removed; no guard, trigger or permission was bypassed, and no alternate write was used to evade it. The failed attempt is retained in qualification logs. Native positive proof covers actual created, unchanged-reupload and check-in replies. Legacy nullable-title, retained-Unfiled-folder and repaired-record compatibility is supported by focused unit vectors and review of the actual response constructor; native legacy-repair execution is not claimed.

## Verification

- `01-red.txt` and compressed logs show the controls failing before each fix: initially 44 failures/2 positive passes; the explicit uncertain-commit case and five review corrections were independently observed failing.
- `02-focused-green.txt`: 104 focused checks/7 files pass. `03-qualification.txt`: 2,672 regression checks/257 files pass; these cohorts overlap.
- The separate native suite passes 5 checks, including actual API create/reupload/check-in receipt compatibility with enforced RLS. Native legacy setup was refused and is documented above.
- `browser-check.json` and eight screenshots show 32 actual hook/XHR/parser/staging flows in desktop/mobile light/dark themes. Invalid JSON is raw HTML over the real XHR seam; no hosted authentication is claimed.
- Production build and full-program TypeScript pass; zero compiler errors and no added lint warnings. No baseline or production dependency is widened.

The client validates identity, request context, rendered metadata and internal receipt coherence. Authority and persisted bytes continue to come from the existing governed server admission. Invalid successful replies and explicit server `OUTCOME_UNKNOWN` results remain unconfirmed; no write is retried automatically.
