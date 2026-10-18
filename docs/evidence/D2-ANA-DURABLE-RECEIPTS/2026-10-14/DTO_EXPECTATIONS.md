# Frozen independent DTO expectations

14 October 2026. Scope: the approved D2 durable exact-source host-admission receipt contract, implemented by `shared/ana/source-admission-receipts.ts`. This corpus was specified before its execution. The reviewer owns only this file and `independent-dto.test.mts`; implementation, runner configuration, source-hash recording and execution remain with other owners.

The 17 held-out controls assert these independently chosen outcomes:

1. A complete descriptor with uppercase UUIDs/SHA256 and a padded uppercase role produces the exact literal canonical JSON reference: lowercase identities and role, bounded context preserved, sorted keys, no acceptance time or text.
2. Reversing insertion order and using a null-prototype descriptor produces the same canonical bytes and SHA256 as the literal reference.
3. Receipt ID and every other immutable identity, actor, range, payload and serving-context field affect the fingerprint; canonical-equivalent spellings do not.
4. Validation returns private, deeply frozen descriptor/range copies without freezing or retaining mutable caller objects.
5. A digest deliberately held pending captures canonical UTF-8 bytes before the first await. Caller mutations while that digest is pending cannot alter those bytes or the resulting fingerprint.
6. One range and eight separate sorted ranges, including adjacency and a late range, are valid. Adjacent ranges retain their individual offsets/digests; the descriptor does not manufacture joins.
7. Empty, nine-element, sparse, accessor-backed, subclassed or extra-property range arrays refuse, without evaluating a supplied getter.
8. Overlapping, unsorted, empty, negative, fractional, unsafe, string or out-of-bounds range coordinates refuse.
9. Root unknown/missing/symbol/accessor/non-enumerable/inherited/custom-prototype fields refuse. `accepted_at`, source text, filename and model output are unknown fields, rather than receipt data.
10. Unknown/symbol/accessor/non-enumerable/custom-prototype properties in a range refuse without getter execution.
11. Organization, actor and total character count are positive int32 values without numeric coercion. The int32 ceiling is valid; zero, negatives, fractions, booleans, strings, infinities and overflow refuse.
12. All three UUIDs and all source/extraction/payload/range hashes require their exact unpadded shape. Uppercase hexadecimal is canonicalized; invalid length, characters, whitespace and types refuse.
13. Only version 2 and `host_budget_admitted` are valid; string versions and alternative delivery/review checkpoints refuse.
14. Role spelling is trimmed/lowercased and bounded to 128 Unicode code points after canonicalization. Controls and isolated surrogates refuse; a valid custom role remains metadata and does not confer authority.
15. Tool/thread context is null or an unchanged nonblank string of at most 2,000 Unicode code points. Astral characters count once, surrounding spaces remain, and controls/isolated surrogates/overflow/invalid types refuse.
16. Source coordinates are UTF-16 code-unit offsets. Shape validation alone may accept a surrogate-splitting range and a well-shaped but wrong digest. Independent actual-slice hashing distinguishes a whole astral character from a split surrogate. This explicitly does **not** claim this DTO enforces code-point boundaries or verifies source bytes; the guarded writer owns actual source/slice verification.
17. Reflection/proxy exceptions and ordinary validation failures return only controlled diagnostics, without reflecting caller secret values or executing getters.

The canonical reference is an explicit JSON literal, and fingerprint expectations use Node's independent SHA256 implementation over those bytes. The pending-digest test replaces only the digest primitive for a bounded observation and restores it afterward. No provider, database, gateway or source admission is invoked. These controls do not qualify persisted roles, ledger append/idempotency, actor history, host delivery, scientific decisions or government acceptance.

Frozen expected count: **17 tests**. Execution and final implementation hashes must be recorded by the parent reviewer; this file does not report a passing run.
