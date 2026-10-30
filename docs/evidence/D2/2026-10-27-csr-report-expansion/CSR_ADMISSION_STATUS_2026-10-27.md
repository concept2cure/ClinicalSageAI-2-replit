# CSR admission truth — source, rights and deployed availability

Workstream W1/D2. Verified against `concept2cure-v2` manifest, public reader and seed compiler.

## What already exists

- `server/data/public-csr-reference/manifest.json` contains 22 admitted-release originals (not sponsor CSRs) and 56 catalog-only records.
- The catalog already identifies **34 originals retained outside the application**, including the 1,940-page GSK104106 final report and 477-page GSK114312 report. Do not count them as new acquisitions or duplicate source records.
- `server/services/clinical-regulatory-evidence/public-reference-sources.ts` is the only permitted page-read gate; it requires `permittedUse.retrieval === 'allowed'`, original checksum, page map integrity, and global-public source identity.
- `scripts/cre/prepare-public-reference-seed.mjs` compiles the versioned manifest into existing CRE migration and rejects catalog-only records marked allowed. The existing 78-record release remains unchanged.

## Verified finding

Two retained GSK originals were recently extracted into rights-restricted derivatives. The existing catalog explicitly records sponsor terms limiting commercial use. Their extraction **does not authorize** production AnA retrieval, embedding, redistribution or model training. The correct behavior is to keep them catalog-only and preserve originals.

The 11 NIH/BPCA report bodies have page-linked derivatives staged in the user's retained Library, but have not undergone the document-level rights, source-image/table, and extraction coverage qualification required for production admission. Eight source item records were described as public domain and three conditional; this is not yet individual-page commercial qualification. They are not new source records in the canonical CRE manifest.

## Remaining release checks

1. Perform per-report and per-page rights/attribution review, especially third-party images and tables.
2. Verify OCR and numerical/table semantics against original pages. Flag unreadable or unverified material.
3. For each eligible NIH original, create a **new versioned** manifest/release and use the existing seed compiler; never mutate prior evidence or silently change existing 78 records.
4. Verify source rows in deployed Postgres, original bytes in deployed artifact paths, and AnA's actual source search/page-read calls.
5. Run held-out CSR section drafting evaluations with medical-writer and biostatistician scoring, including denominator, statistical method, safety, traceability and unsupported-claim challenges.
6. Record real CI, migration and deployed read receipts. No completed training, production admission or CSR authoring qualification is claimed.

All evidence remains retained; source materials never become client results by retrieval.
