# O01 API-key lifecycle audit contract

The active issuer must commit a new key's hash/prefix and canonical chained
audit row in one tenant-scoped transaction, with the existing writer's HMAC
seal when configured. Audit/chain write failure
rolls back both and returns no raw key. The raw key is returned only after a
successful commit and remains only in the mounted one-time browser view.
Authenticated organization, actor, reason, scopes, prefix and request provenance
belong in the audit; plaintext key and arbitrary client metadata do not.

Revocation and its successful security event follow the same atomic contract.
An unknown/already revoked/foreign key produces no effective mutation. The
canonical authenticated administrator gate remains authoritative; no request
body organization or actor can replace it. Expiration must never silently
discard an audit outcome; the expired credential always refuses access even
when its transition/audit store is temporarily unavailable.

The existing transaction-aware `writeChainedAuditRow` and governed tenant
context helper are the stores/authority. No second audit table or role policy
will be introduced. A failed issuance leaves the entered form available for a
new explicit retry, never claims success or redisplays an old secret. A lost
HTTP response remains an uncertain handover requiring checking the key list;
the server cannot retrieve plaintext or guess whether the caller received it.
