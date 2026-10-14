# Native report packet chain-order correction

Published `baffbeac2` run 38535578465 recorded one failed packet contention assertion in the real-database artifact. The fixture sorted exports by random UUID `id`, which cannot identify their retained chain order. Its selected hosted file result and complete artifact digest are preserved separately from this current local run.

The helper now orders by actual `chain_seq`. The contention assertion also checks that exactly two exports exist and their recorded chain positions increase. Every prior status, verified seal, blocking reservation, access withdrawal, exact-byte audit and missing/private/foreign constituent assertion remains. Production source is unchanged by this correction.

The actual restricted PostgreSQL replay passed **8/8**, zero skips, 37.07 seconds. The runtime role was app_service without superuser or RLS bypass, with forced tenant isolation. The positive PDF contains 29 pages: a retained completed report followed by a verified final report. The native observer saw the finalizer blocked while actual PDF work held the export reservation. Both real late access withdrawals refused before sending bytes.

Scoped ESLint has zero errors and zero warnings. All invented QA rows and audit/signature history remain; no trigger or policy was disabled and no history was deleted. The log is retained losslessly as a gzip/base64 archive, with its original digest. This phase qualifies the packet file only: the published complete native artifact still contains 112 failed, 1567 passed and 128 pending cases. No whole-suite, production deployment, clinical validation, agency acceptance or PDF/A conclusion is claimed.
