# Document Identity Contract — proposal awaiting approval

**Status:** PROPOSAL. Nothing here is implemented. `RECONCILE.md` §6 records that a
previous identity/alias/placement registry was **reverted in full** and set readiness
to 0/100 "pending an approved interface contract". This document is that contract,
written to be approved, amended, or rejected — not to be assumed.

**Decision owners:** DB owner + product. **Author:** GA remediation workstream, 2026-08-13.

---

## 1. The problem, in five facts

| Fact | Evidence |
|---|---|
| `regulatory_programs.id` is **uuid** — the program spine every v2 surface uses | `shared/schema/programs.ts` |
| `projects.id` is **integer** — the legacy PM spine | `shared/schema.ts` (`projects`) |
| `concept2cure_artifacts.project_id` is **integer**, FK → `projects.id` | `shared/schema.ts:794` |
| `submission_leaves.document_id` is **integer**, polymorphic over four document tables | `shared/schema/submissions.ts:150-151` |
| The document stores disagree: `coauthor_documents.id` **serial**, `authoring_documents.id` **uuid**, `vault_documents` **uuid** ("not addressable from an integer" — the resolver says so itself) | `shared/schema.ts:11538`, `db/migrations/20260725_authoring_document_loop_tables.sql:36`, `server/services/ectd/leaf-source-resolver.ts:12-13` |

There is no bridge between the uuid spine and the integer spine. Every consequence
below follows from that one absence.

## 2. What it has already cost (all observed, not hypothetical)

1. **The Vault surface 500'd for every program.** `mdx-vault.ts` filtered on
   `projects.regulatory_program_id` — a column **no migration creates** — while its own
   comment asserted "was added by the MDX migration". A second site selected the same
   phantom column unconditionally, so artifact-version reads 500'd on *every* call.
   *(Fixed 2026-08-13 to refuse honestly; the filter itself needs this contract.)*
2. **Governed exports land audited-but-unplaced.** 510(k) and CER exports for uuid
   programs cannot be written to the artifact registry (its FK needs an integer
   project), so they are delivered and audit-logged with a SHA-256 and an explicit
   "registry placement pending" — honest, but the governed artifact registry is
   incomplete by construction.
3. **Filing requires a snapshot copy.** "Place into filing" cannot point a leaf at the
   authored document (uuid) because leaves take integers, so it snapshots content into
   `coauthor_documents` and states the derivation in the dialog. Correct, but it means
   the filed artifact is a *copy* whose lineage is prose, not a key.
4. **Editor deep-links match by convention.** Workbench rows and authoring sections
   share no key, so the editor resolves a clicked section by code-then-title. A renamed
   section is an honest miss — by design, because there is nothing better to match on.
5. **Module-1 form blockers cannot clear.** FDA forms save into
   `concept2cure_artifacts` (integer projects lineage) while IND readiness counts
   `coauthor_documents` — the user is told to close a blocker the product cannot close.

## 3. Options considered

**A. Widen the integer keys to uuid.** One identity space, no bridges. Rejected for now:
it rewrites `submission_leaves` (what actually gets packaged into a filing) and
`concept2cure_artifacts` (the governed registry with Part 11 history) — the two tables
where a migration error is least recoverable, for a benefit that Option C delivers
additively.

**B. A document registry owning identity + metadata + placement.** This is what was
built and reverted: it duplicated `unified_documents`/`module_documents`/the submission
core. Rejected — the failure mode is inherent, not incidental. A registry that owns
attributes competes with the stores that own them.

**C. A narrow, attribute-free alias map + a program↔project anchor.** Recommended.
Two small additive pieces, each mirroring a pattern already proven in this codebase.

**D. Do nothing; keep the degradations honest.** Zero risk, and today's state. The cost
is that items 2–5 above are permanent, and each new seam adds another honest-but-broken
edge.

## 4. Recommendation — Option C

### C1. Program anchor (fixes consequences 1, 2, 5)

Add `projects.regulatory_program_id uuid NULL` + index — **the column live code already
assumes exists.** Ensure a `projects` row per drug/device program at intake, in the same
transaction that creates the program, exactly as intake was just changed to create the
canonical `submissions` row (`server/routes/c2c/projects.ts`). Backfill by identity match
for existing programs; leave unmatched rows null rather than guessing.

*Unblocks:* artifact-registry placement for governed exports (they stop being
"unplaced"), program-scoped Vault filtering, and a single lineage for FDA forms and
readiness to agree on.

### C2. Document alias map (fixes consequences 3, 4)

```
c2c_document_aliases(
  canonical_id  uuid    NOT NULL,     -- the document's identity across stores
  store         text    NOT NULL,     -- 'authoring_documents' | 'coauthor_documents' | …
  native_id     text    NOT NULL,     -- that store's key, as text
  organization_id integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store, native_id),
  UNIQUE (canonical_id, store)
)
```

**The invariant that makes this survive where the reverted design did not: the table
holds no attributes.** No title, no status, no content, no placement. Titles stay in the
stores; placement stays in `submission_leaves`. If a column is ever proposed here that
is not an identity, the proposal is wrong. Recommend enforcing this with a CI gate in
the style the repo already uses (`scripts/ci/check-*.mjs`) that fails on any column
added beyond the fixed set.

*Unblocks:* filing a snapshot **with** recorded lineage to its source instead of prose;
editor deep-links resolving by identity with code/title as fallback rather than as the
only mechanism.

### What stays unchanged
`submission_leaves` keeps integer `document_id` (the packager, its qualification
harness, and the whole eCTD path are correct and just consolidated — they do not move).
The alias map is how a uuid-native document *finds* its integer-addressable
representation; it does not replace it.

## 5. Verification if approved

- Contract test in the `tests/schema-contract/` PGlite idiom: alias uniqueness, the
  attribute-free invariant, backfill idempotence, and that a program created through
  intake gets exactly one anchored project row (with rollback on failure).
- Regression: the governed-export suites must flip from `governed:false, audited:true`
  to registry-placed for uuid programs, with the audited path retained for genuinely
  unanchorable cases.
- The `ci:duplicate-table-ddl` and `unbacked-tables` gates must stay at or below
  baseline; one migration, on the durable deploy path (`scripts/db/migration-set.mjs`).

## 6. If rejected

Say so and the degradations stay as they are — all five are currently honest and
labeled in-product. The one thing that should not stand either way is a comment
claiming a migration that does not exist; that has been corrected.
