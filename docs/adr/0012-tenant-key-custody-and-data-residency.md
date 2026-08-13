# ADR-0012: Tenant key custody (BYOK/CMK) and data residency

## Status

**Proposed**

- Date: 2026-08-13
- Supersedes nothing. Amends the scope of [ADR-0002](0002-multi-tenant-architecture.md).
- Closes the "architectural, needs a design not a patch" deferral recorded against
  R2 and R3 in `docs/security/TENANCY_GA_ASSESSMENT_2026-08-13.md`.

## Context

R2 (no per-tenant encryption keys) and R3 (no data-residency pinning) are the two
highest-severity items left on the tenancy residual register, and both have been
deferred three times with the same sentence: *"needs a design, not a patch."*
That is true and it is also how an item stays open forever. This ADR exists to
convert both from "deferred" into "scoped, costed and decided," so the next person
either implements them or declines them on the record.

Neither is a bug. Both are **absent capabilities** that appear in enterprise pharma
procurement questionnaires, and the honest answer today is "no." The purpose here
is to make that answer precise, and to say what changing it would cost.

### The measured baseline — encryption

Measured by reading the code, not the design documents:

| Secret class | Encrypted? | Key source | Call sites |
|---|---|---|---|
| MFA/TOTP secrets | Yes, AES-256-GCM | `MFA_ENCRYPTION_KEY` | 21 |
| Integration & connector credentials | Yes, AES-256-GCM | `CONNECTOR_ENCRYPTION_KEY` | 1 (the vault itself) |
| Audit-trail seal | HMAC | `AUDIT_HMAC_KEY` | 1 |
| **Customer regulatory content** (documents, submissions, CSRs, uploads) | **No application-layer encryption** | — | — |

Three findings worth stating plainly, because they change what R2 means:

1. **There is no key hierarchy at all.** Three independent platform-wide symmetric
   secrets arrive as environment variables and are stretched into AES keys in
   three slightly different ways (SHA-256 in two places, `scryptSync` with the
   literal salt `'salt'` in the third). There is no master key, no data key, no
   envelope, no rotation path, and no key identifier stored beside any ciphertext.
   Adding "a key per tenant" is therefore not an increment — the structure a
   per-tenant key would hang from does not exist.

2. **`server/services/security/field-encryption.ts` is dead code carrying a live
   compliance claim.** It is a well-built AES-256-GCM field encryptor with a
   versioned self-describing envelope (`enc:v1:…`) explicitly designed for
   mixed-plaintext column migration. It is imported by exactly one file: its own
   test. Its key variable `PII_ENCRYPTION_KEY` is not in `.env.example`, so a
   caller wired up today would throw at boot in production. Its header annotated
   `@compliance HIPAA 45 CFR 164.312(a)(2)(iv) (encryption at rest)` — a control
   claim on a module that, in production, encrypts nothing. This is the same class
   of defect as the `max_storage` column that nothing read (R6): the artefact
   exists, is good, and is not connected to anything.

   **This was already known.** `scripts/ci/check-compliance-claims.mjs`, added by
   the 2026-07 audit workstream, names this exact module in its docstring — the
   signup screen had been telling prospects that data was "encrypted at rest,"
   and that gate now blocks unsupported claims in *customer-facing copy*. It does
   not scan `@compliance` JSDoc in server source, which is why the annotation on
   the module itself survived. R2.0 below closes that remaining half; the finding
   is credited, not rediscovered.

3. **Disk-level encryption is a hosting property, not a platform one.** The
   managed Postgres this runs on encrypts at rest, which satisfies a checkbox
   version of the question. It does not satisfy BYOK, because the operator holds
   the key — which is the entire point a customer is asking about.

### The measured baseline — residency

The schema contains the word `region` in at least fifteen tables. **Every one of
them is a regulatory region** — FDA, EMA, PMDA, Health Canada, TGA — describing
which agency a filing targets. `shared/regulatory/region-identity.ts` is the
canonical bridge for that vocabulary and is load-bearing for submission routing
(see `docs/regulatory/WORKFLOW_COVERAGE_ASSESSMENT_2026-08-13.md`).

There is **zero** data-residency concept: no column, no config, no deployment
split, nothing that constrains where a tenant's bytes physically live.

The collision matters more than the absence. `region` is already taken, and it
means something a European sponsor will assume is the other thing. A tenant
filing an EU MAA (`region = 'EU'`) whose data sits in `us-east-1` is a perfectly
consistent state in this schema, and the field name actively suggests otherwise.
Any residency work must therefore introduce a *distinct* term — this ADR uses
**`data_residency_zone`** — and must never overload `region`.

## Decision

**We will treat R2 and R3 as sequenced capability work with an explicit
prerequisite, and we will not accept either as "partially done."**

Specifically:

1. **We will fix the false compliance claim now, ahead of any BYOK work.**
   `field-encryption.ts` keeps its implementation and loses its unconditional
   compliance annotation, replaced by a statement of what is actually true: the
   primitive is available and unused. This is the only part of this ADR that is
   implemented immediately, because a dead module asserting HIPAA encryption at
   rest is a finding in a customer audit today, independent of whether BYOK is
   ever built.

2. **We will build the key hierarchy before we sell BYOK.** The prerequisite for
   R2 is envelope encryption with stored key identifiers — not per-tenant keys.
   Per-tenant keys are the second step and are cheap once the first exists;
   attempted first, they produce a system that cannot rotate, cannot re-key, and
   cannot decrypt its own history.

3. **We will scope residency as a deployment-topology decision, not a schema
   column.** Adding `data_residency_zone` to `organizations` would produce
   precisely the control this codebase keeps finding: a field that is written,
   never read, and quoted in a sales conversation. Residency is only real when
   the bytes cannot physically leave, which is a question about *where the
   database is*, not about *what a row says*.

4. **Until both are built, the answer in a security questionnaire is "no," not
   "roadmap."** Recorded here so nobody has to infer it.

### R2 — the sequence, and what "done" means

| Step | Deliverable | Done when |
|---|---|---|
| R2.0 | Correct the `field-encryption` compliance annotation | **Done in this change** |
| R2.1 | Envelope encryption: a master key wrapping per-record data keys, with a `key_id` column stored beside every ciphertext | A ciphertext written under key A is still readable after the platform moves to key B, proven by a test that rotates |
| R2.2 | Rotation and re-key procedure, including the audit events a Part 11 reviewer expects for key lifecycle | Rotation runs against a seeded database and the audit trail shows it |
| R2.3 | Per-tenant data keys, defaulting to platform-managed | Two tenants' records are shown to be undecryptable with each other's key |
| R2.4 | Customer-managed keys (external KMS), including the deliberate consequence: **the customer can render their own data permanently unreadable** | Revocation is exercised end-to-end, and the offboarding/export path (R4) is proven to still discharge the data-return obligation *before* revocation |

R2.4 carries a business consequence that must be decided by someone other than
whoever implements it: true CMK means a customer can lock us out of data we are
contractually and legally obliged to retain and produce — 21 CFR 312.62(c)
retention, and the GDPR Art. 20 export the purge gate depends on. Those two
obligations and true key revocation are in genuine tension, and the resolution is
a contract term, not a code change.

### R3 — the sequence, and what "done" means

| Step | Deliverable | Done when |
|---|---|---|
| R3.1 | Name the concept `data_residency_zone`, distinct from regulatory `region`, with a CI gate preventing the two vocabularies merging | A change that reuses `region` for residency fails a gate |
| R3.2 | Decide the topology: separate database per zone, or one database with enforced placement | Written down with its cost, in this ADR's revision history |
| R3.3 | Route a tenant to its zone at connection time, fail-closed on an unknown zone | A tenant pinned to EU cannot be served from a US instance even by an operator mistake |
| R3.4 | Prove that no cross-zone path leaks bytes — backups, logs, AI provider calls, exports, the search index | Each egress path enumerated and individually asserted |

R3.4 is the step that makes R3 expensive and it is the one that will be
underestimated. Residency is not a database property; it is a property of every
egress. This platform sends content to AI providers (`server/services/ai-gateway`),
writes audit archives, builds embeddings, and transmits to agency gateways. A
residency claim is only as strong as the weakest of those, and today several of
them call US-hosted third-party APIs unconditionally.

## Consequences

### Positive

- Both items stop being permanently deferred one-line register entries and become
  a sequence someone can start, cost, or decline.
- The false compliance annotation is corrected immediately, which is the only part
  that is an active liability today.
- The `region` / `data_residency_zone` distinction is settled before anyone writes
  the first column, which is the cheapest moment to settle it.
- The tension between customer key revocation and regulatory retention is surfaced
  now, rather than during a contract negotiation.

### Negative

- Nothing about BYOK or residency actually ships in this change. The register
  entries become better-specified, not closed, and this ADR should not be read as
  progress against them.
- Sequencing R2 behind a key hierarchy makes it visibly more expensive than
  "add a key column," which may be an unwelcome answer commercially. It is the
  true answer.
- R3.4 may reveal that residency is not achievable without changing AI provider
  arrangements, which is outside this codebase.

### Neutral

- Disk-level encryption from the managed database provider continues to satisfy
  the checkbox form of "encrypted at rest." Nothing here changes that, and nothing
  here should be read as claiming more than it.
- `field-encryption.ts` stays in the tree, unused. It is the natural foundation
  for R2.1 and deleting it would cost more than keeping it.

## Alternatives Considered

### Option A: Add `data_residency_zone` to `organizations` now

**Description:** Ship the column and the admin UI, defer enforcement.

**Pros:**

- Immediately answerable in a questionnaire.
- Cheap.

**Cons:**

- The column would be written and never read — the exact defect pattern this
  codebase has now found three times (`organizations.status` before the lifecycle
  guard, `max_storage` before R6, `field-encryption.ts` above).
- It converts an honest "no" into a misleading "yes," which is materially worse
  than the absence, because a customer would rely on it.

**Why not chosen:** A residency field that does not constrain placement is not a
residency control; it is a claim. This platform's failure mode is not missing
features, it is features that report success while doing nothing.

### Option B: Per-tenant keys first, key hierarchy later

**Description:** Give each organization its own symmetric key derived from the
platform secret plus the org id; add envelope encryption afterwards.

**Pros:**

- Demonstrably "per-tenant keys" much sooner.
- Small change.

**Cons:**

- A key derived from a platform secret is not customer-managed and not separately
  revocable, so it answers the procurement question dishonestly.
- Without a stored `key_id`, rotation is impossible: nothing records which key any
  given ciphertext was written under, so the first rotation makes history
  unreadable.

**Why not chosen:** It produces the appearance of R2 while making the real R2
harder, because the derived-key ciphertexts would themselves need migrating.

### Option C: Declare both out of scope for GA

**Description:** Record that the platform does not offer BYOK or residency, and
remove them from the register.

**Pros:**

- Honest, and viable for a US-only, non-CMK customer base.

**Cons:**

- Both appear in enterprise pharma procurement routinely, and EU sponsors ask
  about residency specifically. Removing them from the register loses the record
  of *why* they are absent, which is the thing a security reviewer actually asks.

**Why not chosen:** Partially adopted — the "no" is recorded (decision 4) but the
items stay on the register with their scope attached, which is strictly more
useful than deleting them.

## Implementation Notes

Only R2.0 is implemented by this ADR. The corrected annotation states the true
position:

```ts
 * @compliance Implements the AES-256-GCM primitive required by HIPAA 45 CFR
 *             164.312(a)(2)(iv) and 21 CFR Part 11. NOTE: this module has NO
 *             production call sites — no customer field is encrypted with it
 *             today. Do not cite it as evidence of encryption at rest.
```

The shape R2.1 needs, recorded so the next implementer does not re-derive it —
note the `key_id`, which is the whole point:

```
enc:v2:<key_id>:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
```

`enc:v1` must remain decryptable indefinitely; the existing format is already
versioned, which is why it is worth keeping.

## Related Decisions

- [ADR-0002](0002-multi-tenant-architecture.md) — the isolation model these
  capabilities sit on top of. Isolation answers "can tenant A read tenant B's
  data"; key custody answers "can the *operator* read tenant A's data," which is
  a different question with a different buyer.
- [ADR-0003](0003-21-cfr-part-11-compliance-strategy.md) — the retention and audit
  obligations that constrain R2.4.

## References

- `docs/security/TENANCY_GA_ASSESSMENT_2026-08-13.md` §3 — the residual register
- `server/services/security/field-encryption.ts` — the unused primitive
- `server/services/integrations/credentialVault.ts`, `server/services/mfaService.ts` —
  the two working encryption paths and their key handling
- `shared/regulatory/region-identity.ts` — the *regulatory* region vocabulary that
  `data_residency_zone` must not collide with

---

## Revision History

| Date       | Author | Description   |
| ---------- | ------ | ------------- |
| 2026-08-13 | Tenancy GA workstream | Initial draft — scopes R2/R3, implements R2.0 |
