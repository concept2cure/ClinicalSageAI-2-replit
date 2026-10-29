# D7 (W5): the bytes sent to an agency are kept (2026-10-29)

Session `…01E8btkB`. Found in the CSR path review for the LMN-201 / RePreve
prospect (`docs/design/CSR_PATH_REVIEW_2026-10-29.md`, stage 7, "Archive"). A
CSR filed to an IND is one sequence among many, and the sponsor must be able to
produce, years later, exactly what FDA received.

## What already exists

Searched `sent package`, `sentPackage`, `archive` with `bundle|package|zip`,
`transmitted bytes`, `submission_archive`, `bundle_path`, `putBundle`,
`getBundle`, `cleanup()` and every `.transmit(` call in `server/`, `shared/`,
`client/src`, `migrations/` and `scripts/`.

| Exists | Path | What it does | What it did not do |
|---|---|---|---|
| The guarded transmit | `getGateway().transmit` in `server/services/submission-gateways/index.ts` | Every production send goes through it: authorization, dispatch binding, pre-transmit checks, leaf security, gateway account. A refusal there is marked `refusedBeforeWire`, so the caller releases its transmit claim | Kept nothing |
| The integrity gate | `readVerifiedBundle` in `bundle-integrity.ts` | Every gateway reads the package through it: confined to the bundle root, and its SHA-256 and size must equal the signed descriptor | — |
| The transmittal row | `submission_transmittals`, written by `fda-esg.ts`, `ema-cesp.ts` and `rest-gateway-helpers.ts` | Records `bundle_sha256`, `bundle_path` and `metadata` (the request's metadata, spread first) | `bundle_path` names a staged file. On the sequence spine (`transmitSequence`, `submission-service.ts`) the `finally` after the send runs `assembled.cleanup()`, which deletes it. A re-assembly gives a different zip and digest |
| The package-model durable copy | `submission-bundle-storage.ts` (`putBundle`/`getBundle`), called by the assemble route in `submission-ops.ts`; read back by `ensureBundleLocal` in `governed-transmit.ts` | Puts the assembled zip in S3 when `SUBMISSION_BUNDLE_S3_BUCKET` is set, so a recycled container can still transmit | Assembly time, not send time, and only that one path. Off unless a separate bucket is set, and a failed put falls back to local disk silently. The sequence spine never uses it |
| The platform storage provider | `server/services/storage/` (`getStorageProvider`, `getStorageProviderFor`) | Org-scoped object storage with a SHA-256 integrity check on read. Production refuses to boot without durable storage (`storage-posture.ts`) | Not used for sent packages |

## What changed

- **`sent-package-archive.ts` (new).** `archiveSentPackage(req, region,
  gateway)`:
  - reads the package through `readVerifiedBundle`, so the copy and the bytes
    sent both hash to the signed descriptor;
  - stores it under the storage namespace `sent-packages`, with
    `kind: 'sent-package'`, region, gateway, environment, program, package and
    digest;
  - checks that the stored copy's own SHA-256 and size are the descriptor's.

  Any failure throws `SentPackageNotArchivedError` (`SENT_PACKAGE_NOT_ARCHIVED`):
  "Nothing was sent: a copy of the package's exact bytes could not be kept …".
- **The guard.** It calls the archive as its last pre-wire step, after
  authorization, the package checks, leaf security and the account. So:
  - a package refused for any of those reasons is not stored;
  - an archive failure is marked refused-before-wire, and the claim is
    released.

  It stamps `metadata.sentPackage` after the caller's metadata, as it stamps
  `gatewayAccount`, so all three row writers record it and a caller cannot
  supply it. It returns `sentPackage` on the result.
- **The records.**
  - The sequence spine's `ECTD_TRANSMITTED` row carries `sentPackage`.
  - The governed transmit's sign ledger payload and the electronic-signature
    manifest carry it.
  - In each, `null` means the guard kept none.
- **The refusals.**
  - The governed HTTP route answers 503 with `{ code:
    'SENT_PACKAGE_NOT_ARCHIVED', transmitted: false }`. It answered 500
    "Something went wrong" before.
  - The sequence route maps the code to 503.
  - AnA's transmit command answers `SENT_PACKAGE_NOT_ARCHIVED`. It answered
    `EXECUTION_FAILED` before.
- **Tests that drive the guard to the wire.** Six gateway suites and the AnA
  AS2 suite now stub the store with `sent-package-storage-stub.ts`, held in
  memory. Unstubbed, each
  run wrote the package under `storage/vault/` in the working tree.

## Evidence: seen failing first

| Check | Red (`red.txt`) | Green (`green.txt`) |
|---|---|---|
| `sent-package-kept.test.ts` (new): stored before the wire, recorded, unforgeable, refuses on a failed or mismatched copy, stores nothing for a refused transmit | 4 of 6 fail with the archive call removed | 6/6 |
| `mdx-esg-transmit-sent-package.test.ts` (new): the real AnA handler, governed transmit, guard and archive; only the FDA gateway's send is replaced, by one that reads the package through `readVerifiedBundle` as the AS2 send does. The copy kept is byte-identical to what the gateway sends; the request and sign ledger name it; a failed store sends nothing | 2 of 2 fail with the archive removed; 1 fails with AnA's mapping removed (`EXECUTION_FAILED`) | 2/2. The full AS2 suite (`mdx-esg-transmit-gateway.test.ts`, wire included) stubs the store and stays 18/18 |
| `governed-transmit-pretransmit-record.test.ts`: sign ledger and manifest | 1 fails without the record | 4/4 |
| `transmit-recorded-identity.test.ts`: `ECTD_TRANSMITTED` | 1 fails without the record | 21/21 |
| `gateway-route-response-shapes.test.ts`: 503, not 500 | 1 fails without the branch (500 "Something went wrong") | 8/8 |
| All 12 touched suites | — | 116/116, and nothing written under `storage/vault/` |
| Every suite under `submission-gateways` and `submission-service` | — | `baseline.txt`: 75 of 86 files pass. The 10 that fail (67 tests) fail identically at the base commit `35283b804` without this change. Among them is `transmit-guard-refusal-releases-claim`, red at base on this path and handed on. A wider run including `server/routes/__tests__` hit its 20-minute limit with no summary, so nothing is claimed for it |

## Not done

- **Retrieval.** The kept copy is named on the transmittal row
  (`metadata.sentPackage.storageVersionId`, read back with
  `getStorageProviderFor(provider).get(id, orgId)`). There is no download route
  for it yet. The transmittal routes in `mdx-submission-gateway.ts` (`/status`,
  `/ack`) are where it belongs, as a recorded download.
- **Transmits before this change** kept nothing, and nothing can recover their
  bytes.
- **Retention.** Nothing calls the storage provider's `delete` on this
  namespace. The tenant purge (`tenant-offboarding.ts`) deletes only the
  objects the Vault records. It keeps transmittal records by design ("each
  transmittal record, which is not purged here"), so a purged tenant's sent
  packages stay with them. Whether either should outlive the tenant is the
  existing purge policy's decision; this change does not make it. No retention
  schedule names the namespace yet.

## Disclosed

`server/routes/submissions.ts` is inside the 24-hour window of `c1d3a1589` and
`3cb38d54f`. This change adds one entry to its `CODE_STATUS` table.
