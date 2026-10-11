# W3 / D4 — tenant export column decisions

Base: `0cc794720c3a0b38d10d95dcb7928347b91b11dd`; only `concept2cure-v2`.
This delivery implements the existing D6 founder decision that tenant returns
carry customer data and integrity evidence while withholding key material.

The historical native schema guard failed with four undecided columns, but its
artifact displays only `stab_exports.tokens (jsonb)` and truncates the other
three. Source inspection identifies four relevant tenant-keyed, text-like
columns missing from the decision lists. Their classification is grounded in
the actual DDL and available writers, not inferred from the truncated diff:

- `stab_exports.tokens`: recorded P.8 authoring fields, return as customer data.
- `audit_events.hmac_seal`: the stored integrity seal, not its secret key, return.
- `licenses.access_token`: access credential material, withhold visibly.
- `c2c_mailbox_connections.token_reference`: caller-supplied token/store reference,
  withhold consistently with existing gateway `secrets_ref` treatment.

Before changing production, extend the existing real `exportTenantFull` PGlite
tests with these tables, null values, normal metadata and another tenant.
Record credential leakage RED. Execute the unchanged native inventory assertion
against an explicitly isolated catalog containing these four typed columns;
record all four undecided names and rejection. Then add only the four decisions.
Test preservation of customer data and seals, markers for credentials, nulls,
tenant isolation, and guard refusal when each decision is removed. Keep the
fully migrated native guard, discovery, export formatting and purge rules intact.

Run related existing export/receipt tests, native isolation and scoped lint.
PGlite does not qualify a fully provisioned native PostgreSQL/RLS/HTTP deployment;
that and the full semantic compiler remain exact-source remote CI requirements.
No full local compiler on the 8-GiB host. Publish this bounded change after normal
commit checks and all unchanged pre-push gates before the compiler stage.
