# Existing upload fixture parity review

D2 / W2, canonical receipt convergence. Independent test-only review; no tests, compiler or Git mutations were run by this worker.

## What already exists

The five existing suites below already exercise the upload owner, real Vault staging/version/navigation flows, manifest fields, authentication and progress. `origin/concept2cure-v2` at `1ce6adc681c984f1669715d37fda774f11203059` has already converted positive replies onto the explicit `_ingest-xhr-fake.ts::ingestReceipt(form, overrides)` helper. That helper supplies the actual request's project and document code, a real-shaped identity, assigned version and filing metadata; it is called only when a test explicitly declares a receipt, and does not repair arbitrary bodies. Local unpushed `f76b0d4a1` uses separate hand-built receipt fixtures. The saved `overlap-source-diff.txt` and direct comparisons establish exactly which assertions differ.

## Comparison and retained behavior

- `useVaultUpload.test.tsx`: canonical form-derived positive receipts preserve all auth/header/body/credentials, per-row fields, filing, progress, refusal and ordered identity assertions. The two copy regexes intentionally preserve canonical truthful `nothing changed` wording for unchanged=true. The prior candidate's blanket neutral wording is obsolete because canonical updated/recordUpdated flags distinguish actual repairs. Both versions already assert that missing identity is unknown and excluded from succeeded/recorded.
- `vaultCheckInVersion.test.tsx`: all original version, supersedesDocumentId, absent documentCode/version, title, conflict offer, search, history and refusal assertions are unchanged. Canonical receipts correctly retain a document code for check-in and use generated distinct UUIDs. No competing hand-built fixtures are retained.
- `vaultOpensUploadedDocument.test.tsx`: all positive open/current-row/version/folder/missing-target assertions survive. The canonical missing-identity case already retains unknown, no recorded-status, no guessed target, unchanged open detail and absence of the uploaded row. A stronger explicit no-refresh assertion is added below.
- `vaultUploadManifestPanel.test.tsx`: only receipt construction differs; all manifest/row/multipart assertions remain. Canonical helper UUIDs are valid and per-response distinct.
- `vaultUploadStaging.test.tsx`: only positive receipt construction and explicit callback typing differ; all staging, per-row fields, partial refusal/retry queue, OCR, byte progress and current failure assertions remain. No copy or assertion is weakened.

## Bounded test edits

Two existing named missing-ID cases were overly malformed in canonical: one omitted all document/filing fields and the other omitted project/code/title/filing. Those could remain unknown for the wrong reason. Both now explicitly create a complete synthetic producer receipt and override only `document.id` to undefined, so real transport serialization omits only the ID. This restores the local candidate's focused missing-ID intent while preserving canonical request-code binding and the shared helper.

The actual Vault navigation case also asserts exactly one GET of `/api/c2c/project-vault/${PID}` after the malformed reply. The stub deliberately makes the uploaded document available after any 2xx, so a false success refresh would expose it; one read proves no refresh, alongside the retained no-open/no-guess assertions.

No production files, helper behavior, test names, test counts, parser acceptance rules, native evidence, dependency or baselines change. The three other suites remain byte-identical to canonical. Root owns all fail-first/regression qualification and publication.

## Source pins (SHA-256)

| Path | Local candidate f76 | Canonical origin 1ce6 | Reviewed working file |
| --- | --- | --- | --- |
| `client/src/concept2cure/v2/__tests__/useVaultUpload.test.tsx` | `00721e030f8578712c404b21ede3f882e86952abe61066e0a7199b2a2d82c018` | `e9e0dd364d86208d264042d1e2e359311a2af41635f3c9558eddcd34e48e42c2` | `7128cb3f4070490b0ed0479a6d3cf6355c13635fac0b7d5778dd8a30b8993573` |
| `client/src/concept2cure/v2/__tests__/vaultCheckInVersion.test.tsx` | `7589aabb5ab0733f2532888826ad929658973e651cc67e77557e40e07c799eda` | `a965fc36895c33e80315e6b2049c03c9fea0f7df9a887a6f00c80888fc6f2afa` | `a965fc36895c33e80315e6b2049c03c9fea0f7df9a887a6f00c80888fc6f2afa` |
| `client/src/concept2cure/v2/__tests__/vaultOpensUploadedDocument.test.tsx` | `99e7c36925fa2c486622cb795c4367048579c8a5501950659f1da03c680b61c8` | `3af89424aefca5135285fc9b0a80116e13837b5da1269a31307986c913a52b7f` | `30b1065e72a28096372bb98fce6b05abbf4d1bfe1b35c0b1b0713977e880fe73` |
| `client/src/concept2cure/v2/__tests__/vaultUploadManifestPanel.test.tsx` | `ad3f6ad264f2faf3f82f42dd2d1314a80a7836fff9eb3d3c97ec52e5e997988b` | `22bbb0640baa4856af9ccf6ed186a57750c3cd996f4485d8c9343b825977739d` | `22bbb0640baa4856af9ccf6ed186a57750c3cd996f4485d8c9343b825977739d` |
| `client/src/concept2cure/v2/__tests__/vaultUploadStaging.test.tsx` | `20199c711974c5346d2e1b2185fd4e78d45b823575881581aadd8371f80567ca` | `532d3c9339d732b160ce64bc8f7766ab267bfd8070894d6f1009d776eb14b49f` | `532d3c9339d732b160ce64bc8f7766ab267bfd8070894d6f1009d776eb14b49f` |
