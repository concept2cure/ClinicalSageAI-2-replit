# No seeded regulatory reference template can be corrected on an estate past its first boot

**Verified at the line, 2026-10-18.** Found while scoping the fix for the
510(k) template/outline code collision
(`../template-outline-code-collision/`). It is broader than that collision: it
is the reason a correction to *any* of the twenty seeded templates would not
reach a running customer database.

## The guard is a row count

`seedTemplatesIfMissing` (`server/services/intelligence/template-seeds.ts`):

```sql
SELECT count(*)::int AS n FROM intelligence.document_templates
 WHERE template_code = ANY($1) AND version = '1.0'
```
```ts
if (n >= codes.length) return { ran: false as const, present: n };
```

It counts **template rows**. It never inspects a section code, a title, an
ordering or a hash. So once twenty template rows exist at version `'1.0'`, the
seeder short-circuits on every subsequent boot, forever, and a corrected
`section_code` in source is never applied — not updated, not duplicated, simply
never read.

It runs on every boot (`server/startup/services.ts` →
`initializeEarlyServices()`, awaited unconditionally by `server/index.ts`),
under the system tenant scope, with failure as a non-blocking
`console.warn`. There is no flag, no production distinction and no operator
step — so the seed is not a deploy-time artefact with a version, it is a
first-boot side effect.

## The version lever is dead

`SEEDS_VERSION = '1.1.0'` is exported from that module and **referenced nowhere
else in the repository**, while both the probe and the INSERT hardcode `'1.0'`.
A constant that looks exactly like the mechanism for this, and is not wired to
anything.

## Why a new version row is not a drop-in either

`document_templates` carries `version TEXT NOT NULL DEFAULT '1.0'` and
`status TEXT NOT NULL DEFAULT 'active'`, and every consumer filters on
`status = 'active'` and **never on version**
(`authoring-template-sections.ts`, `authoring-template-guidance.ts`). So
minting a corrected version row without deprecating the old one in the same
transaction would leave two active rows per template — doubling the "Start
from" picker and making resolution ambiguous. The version-bump path is the
right idiom (RULE 1's own corollary: a transcription error in seeded reference
data is corrected by minting a new version row, not in place), but it has to
deprecate its predecessor.

## The one in-product lever, and what it is gated by

`POST /api/regulatory-intelligence/templates/seed`
(`server/routes/regulatory-intelligence.ts`) runs the full twenty-template
refresh — `DELETE FROM intelligence.template_sections` then re-INSERT, per
template — and its only gate is:

```ts
const guard = requireAuthedOrgId(req, res);
if (!guard.ok) return;
```

**Any authenticated user of any organisation** can trigger a rewrite of the
untenanted global reference store that every organisation reads. Stated
precisely, because the precision matters: the content written is the server's
own `SEED_TEMPLATES` constant, so a caller cannot inject anything — the surface
is a forced reset to source values, not arbitrary content, and it is attributed
in the log with the caller's org id. It is a cross-tenant **integrity** surface,
not a leak.

It becomes sharper once a correction ships. After the source codes are fixed,
this route is the only way to apply them — and any authenticated user could
apply them unknowingly, at which point existing documents' section codes stop
matching the template store they were seeded from.

## What this means for the collision fix

Re-coding `fda_510k_se` in source, alone, would be **actively worse than doing
nothing**: new and force-re-seeded databases would be correct, every existing
estate would stay silently wrong, and the two would be indistinguishable. And
`filingAgreesWithEditing` — shipped today — will never say a word about any of
it, because after a mis-keyed write the editing and filing copies *agree*.

So the correction needs, in this order:

1. **A content-aware re-seed path** (digest the seed set per template and
   re-seed on difference, or wire `SEEDS_VERSION` and deprecate the superseded
   row) — before any code changes, or the change is invisible where it matters.
2. **A decision about documents already created**, as a founder-visible call
   rather than a cleanup: re-key `authoring_sections.code` for affected
   documents through a migration in `C2C_MIGRATION_FILES` (amendable in place
   per RULE 1, row-count asserted); or refuse at read time when a section's
   `(template_id, code)` pair no longer exists in the template store, so the
   mis-filing surfaces; or at minimum report the affected filings to their
   owners.
3. **The re-code itself**, label-mapped by an RA judgment, not string
   similarity.
4. **A role gate on the reseed route**, and the guidance-snapshot hole the
   review's fourth dimension raised.

Nothing is changed in this round. The sequence above is what the change has to
be, and the first step is a prerequisite rather than a nicety.
