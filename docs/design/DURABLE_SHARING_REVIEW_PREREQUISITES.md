# Bounded durable sharing and review prerequisites

Status: approved bounded durable prerequisite contract. Native SQL replay,
blank provisioning and golden qualification remain pending their coordinated
slots. Earlier sealed provisioning and golden proof remain earlier snapshots.

## Recommendation

Wire exactly the two existing sole creator files into C2C_MIGRATION_FILES in
the existing golden-prerequisite block, after the base/audit prerequisites
and before the unchanged final uuid/child/integer isolation tail:

- db/migrations/20260314_phase12_multi_user_review.sql
- db/migrations/20260401_project_sharing_visibility.sql

Do not rename, duplicate or load a blanket legacy manifest. Existing golden
paths can remain. The canonical applier resolves every entry with
path.join(repoRoot, file), already includes many db/migrations entries, and
detects a BEGIN-owning file before adding its own transaction. The review
file's BEGIN/COMMIT is supported; the sharing file receives the usual outer
transaction. Content hashes are journaled after successful application and
every listed file replays on every deploy; a journal does not skip replay.

The existing base prerequisites are projects, organizations, users and
concept2cure_artifacts, all declared in the current Drizzle base. These two
creators do not construct that entire base and must not make absence of a
required parent look like successful empty storage. Both files use INTEGER
organization_id NOT NULL in public, so the existing final sweep includes the
four created stores on the first deploy when these entries precede it.

## Exact required compatibility repair

The review creator omits the declared nullable review_decisions.updated_at.
Current artifacts.ts SELECT() and INSERT...RETURNING over the whole declared
review-decision model include this column, so a legacy-only table can fail with
42703 even when the reader never interprets an update timestamp. The actual
decision insert does not supply updatedAt.

Amend that existing creator in place with the column and this additive
existing-table convergence, before COMMIT:

```sql
ALTER TABLE concept2cure_review_decisions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
ALTER TABLE concept2cure_review_decisions
  ALTER COLUMN updated_at SET DEFAULT NOW();
```

The ADD has no default and no NOT NULL, so preexisting rows remain NULL. Only
subsequent inserts receive their actual insertion-time default; no historical
decision is stamped with deployment time. Preserve existing timestamps if the
column already exists. Do not backfill from created_at or introduce a NOW()
fallback while rendering old decisions. Current TypeScript declares nullable
updatedAt and can carry unknown historical update time as null. This column
does not assert a decision was modified or provide immutable audit provenance.
A real model/type mismatch requires explicit reconciliation; no ALTER TYPE or
historical-value conversion is proposed.

## Existing stronger contracts and differences

Sharing requires visibility private/org_public, member role owner/edit/use,
status active/revoked, one visibility per project and one member per
project/user. Review requires the existing assignment status and decision
CHECK sets; assignment identity and artifact/reviewer/round uniqueness,
decision identity, foreign keys and declared read indexes remain.

CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS replay without
duplicating existing objects. They do not prove a preexisting table already
has every CHECK or that an existing index of the same name has identical
columns. The legacy assignment unique index can correctly refuse preexisting
duplicate rounds; this proposal never deletes or repairs those rows.

The sharing creator's TIMESTAMPTZ columns differ from the declared timestamp
without time zone. Its required explicit role differs from the declared role
default use. Actual current sharing writers supply roles explicitly, so no
default is needed for this bounded admission path. Its composite indexes and
unique-constraint names also differ. In particular idx_project_members_user
has a legacy composite shape and a declared single-user-column shape under
the same name. These are not semantic/byte equivalence claims. Preserve them
in this narrow deployment repair; do not DROP/rebuild indexes, rewrite
timestamps, add implicit membership or weaken CHECKs to make files match.

Fresh creator CHECKs remain stronger than a pushed table without them;
CREATE IF NOT EXISTS does not retrofit those checks. First-deploy/replay proof
must report the actual physical path. No claim of universal constraint or
index-shape convergence is made by simply adding durable reachability.

Each creator verifies required current columns and integer NOT NULL
organization_id. It also checks the existing primary/unique identities by
semantic key set: unique, valid, ready, immediate, nonpartial and nonexpression.
Index names, key order and optional included columns do not substitute for or
invalidate the required identity. Missing or malformed stores refuse with a
reconciliation error instead of being rewritten. This metadata guard does not
claim every preexisting FK, CHECK, timestamp type or default matches fresh DDL.

## Required follow-up after root approves the contract

Pin the two old creators and migration-set base before edits. Preserve existing
golden assertions. Prove the unchanged journey reachability/creator-count,
DROP-safety and set-order guards against the new entries without baseline
growth or scanner changes. Apply the actual two creators to a bounded real
SQL fixture with declared parent prerequisites, then replay and compare
physical required columns, FKs, unique identities, checks and RLS sweep order.
Include a pre-column retained decision: created_at and all prior content stay
unchanged, updated_at stays NULL; a new decision receives its actual default.
Retain fixture/history and qualify failures rather than repairing duplicates.

Root owns any native slot, installer, compilation and publication. The
independent role-grant arbiter and regional native phases remain their own
proofs and must not be replaced by this deployment review.
