# O01 Veeva sync outcome contract

The existing service has no production consumer or UI wiring. This work supplies offline service evidence; it does not enable a connector or establish live Vault qualification.

Successful push and pull results retain existing fields and add top-level `auditTrail: AuditRowOutcome` and `localLink: 'linked'`. Pull `meta` remains the mapped document metadata. The injected sink returns the canonical `AuditWriteResult`; the canonical converter preserves lost and tamper-proof-only outcomes. A thrown ancillary writer produces the bounded missing-outcome contract after completed upload/download and link persistence.

An upload cannot be rolled back by failing its subsequent local link write. A link failure after confirmed remote upload/download therefore produces `VaultLinkUnconfirmedError`, code `VEEVA_LINK_UNCONFIRMED`, with direction, actual remote identity/version, exchanged content hash, local reference, actual ancillary audit outcome and explicit reconciliation instructions. Its fixed message contains no raw provider/database error or document bytes. Recovery forbids automatic upload retries. Link uniqueness and SQL remain unchanged. No new store, dependency, route or provider activation is introduced.

The audit attempt also records an exchanged document when its local link is unconfirmed, with that state explicitly in the event details. Losing that ancillary audit does not erase the confirmed remote receipt. A remote upload/download failure before link persistence performs no local write and emits no successful sync audit.

`content-wave-3/veeva-tests.txt` records 21 passing offline tests. The actual canonical `20260610_veeva_vault_links.sql` migration is applied in PGlite. A fault suppresses the result only after a real autocommitted link INSERT, then the test reconciles that exact receipt through the existing exported local link primitive with one remote upload total. It proves the unchanged uniqueness refusal and separate organisation keys. This is service-level reconciliation evidence, not a shipped recovery UI, runtime RLS qualification, live credentials, provider UAT, or atomic remote/local transactions.

Lost, thrown, tamper-proof-only and absent injected audit outcomes remain distinguishable in push/pull results without overwriting pulled metadata or hiding downloaded bytes. Scoped lint and diff whitespace checks pass with zero errors or warnings. The two discarded injected audit outcomes are consumed through the canonical converter. The control tower owns the baseline and integration checks.
