# Independent read-only parent access review

Reviewed the current tree against
`docs/design/PROJECT_VAULT_PARENT_ACCESS_2026-10-13.md`, the isolated
`parent-access.probe.ts` and its retained baseline log. No implementation,
test, database or browser fixture was changed for this review. The baseline's
two positive controls and seven unauthorized-content/setup failures remain
baseline evidence; the additional findings below are code inspection, not new
attack reproductions or claims that these fixes have shipped.

## Reusable authority and its current limits

- `programInOrganization` is the canonical UUID/organization/deleted-program
  check. It distinguishes an unavailable verification from a negative result.
  Keep it; it does not decide the caller's project permission.
- `readCsrProjectActor` has an executor-based branch reading the current
  organization membership, active user and active organization together. That
  branch supports ordinary viewer reads. Its Drizzle branch checks membership
  only, so the new reader should use the executor branch or narrowly factor
  the existing active-actor query rather than borrow the weaker branch.
- `canAccessReportProject` / `getAccessibleReportProjectIds` apply the existing
  sharing vocabulary: current normalized visibility, active explicit members,
  owner/creator, organization project-management roles and pending assigned
  reviewers. Preserve those decisions, including the intentional legacy
  visibility fallback. They do not themselves establish an active organization
  actor or exclude `projects.status = 'deleted'`.
- `readProgramAnchorRow(...requireUnique:true)` refuses ambiguity rather than
  selecting the lowest ID, but its current query counts every matching project
  row regardless of status. A live-only reader needs a caller-specific option
  or additional canonical query support; globally changing retained reporting,
  archived or legal-hold semantics would be an unrelated regression.
- Authoring admission already verifies a fresh role and holds membership/user/
  organization rows `FOR SHARE`. Its write-role allowlist is inappropriate for
  ordinary Project/Vault viewer reads. Reuse its transaction discipline, not
  its authoring write authorization.

## Existing route inventory

Every pattern below belongs to the existing mounted router; no replacement
library or new project API is proposed.

| Router and patterns | Present boundary | Required next boundary |
| --- | --- | --- |
| `projects.ts` GET `/` | Organization predicate, live/optional archived program filtering, limit+1/offset, then readiness for the returned page | Fresh actor; verified accessible program IDs in SQL before ordering and pagination; readiness only for that authorized page |
| GET `/:id`, `/:id/workstreams`, `/:id/drafts`, `/:id/team`, `/:id/evidence`, `/:id/activity`, `/:id/records` | Program organization check or direct organization-scoped read | Common current actor, exact unique readable anchor and sharing admission before metadata, roster, content, counts or audit history |
| GET `/:id/conversation-files`, `/:id/vault-structure`, `/:id/sources`, `/:id/source-changes` | Program organization check; conversation list additionally limits uploader and excludes associated checksums | Same parent admission; preserve uploader rule and source disposition; review unscoped-source and usage enrichment separately |
| POST `/:id/evidence`, DELETE `/:id/evidence/:evId`, POST `/:id/adopt` | Organization plus program mutation policy using request role/lead; adoption owns a transaction | Preserve mutation policy; feed it fresh verified role, recheck current target and source inside the existing transaction before bytes or durable effects |
| POST `/:id/archive`, POST `/:id/unarchive`, DELETE `/:id` | Locked program row, program mutation policy, lifecycle preconditions and recorded-hold refusal | Fresh actor and caller-specific parent admission within `transitionProgram`; retain locked preconditions, hold checks, audit and refusal behavior |
| Separately mounted `document-data-dispositions.ts`: GET `/:id/document-dispositions/preview`, POST `/:id/document-dispositions` | Preview checks program organization only; apply has editor middleware and program mutation policy | Cover this preceding router explicitly or mount shared admission before both routers; recheck fresh source/target/write permissions in the disposition service transaction and preserve its impact-lock/preview-token controls |
| Project POST `/` | Existing create-role/quota/intake/anchor transaction | Not a `:id` read; do not run target-parent admission before the new program/anchor exist |
| `project-vault.ts` GET `/search` | Organization-only full-text library count/page | Fresh actor; verified accessible programs shared by both SQL predicates |
| GET `/:id`, `/:id/search`, `/:id/documents/:documentId/versions`, `/compare`, `/history`, `/download` | Organization-scoped program/document/family checks | Common current parent admission before data, hash/address disclosure, history, byte retrieval or download audit; preserve current version/fixity/disposition controls |
| GET `/:id/documents/:documentId/catalog`, `/relationships`, `/annotations`, `/text` | Organization/program checks in delegated services | Same parent admission; also check related document parents where returned; retain text-read audit refusal |
| POST `/:id/file`, `/:id/data-room/file`, `/:id/file-batch`, `/:id/fixity`, `/:id/documents/:documentId/details` | Editor middleware plus existing governed service checks | Fresh current actor and parent admission in the actual service transaction, preserving role/signature/hash/placement/disposition rules |
| POST `/:id/documents/:documentId/catalog/confirm`, `/catalog/correct`, `/relationships`, `/annotations`; POST `/:id/relationships/:relationshipId/remove`; POST `/:id/annotations/:annotationId/replies`, `/resolve`, `/retract` | Editor middleware and delegated record policies | Same target admission plus related-parent admission; preserve reasons, current hashes/revisions, immutable record guards and audit |

A router `param('id', ...)` or equivalent common guard can prevent omissions,
but authorization at request entry is insufficient for a later writer that
acquires another connection/transaction. Recheck there on its actual executor.
The static `/search` and project creation route must not accidentally resolve
as program IDs. Malformed and foreign identifiers retain non-disclosing 404s;
failed access verification is a typed unavailable response, never an empty
result, pending store or ordinary not-found assertion.

The disposition router is registered **before** `projects.ts` at the same
`/api/c2c/projects` prefix in `register-inline-routes.ts`. A guard inside the
latter cannot protect a response already served by the former. Its preview
reads potentially private complete source-impact metadata; authorizing the
prefix requires explicit coverage of both existing routers.

## Mutation downgrade is independent of source read access

Code inspection and a read-only execution of `canMutateProgram` confirm that
the matching program lead remains allowed with `viewer`, `readonly`,
`read_only` or `guest`. This is the helper's current role-independent lead
branch, not a consequence of the proposed new reader. Existing unit tests
assert viewer refusal only when the viewer is **not** the lead, so they do not
settle the downgraded-lead case. The Project router is mounted behind
authentication, with no enclosing `requireEditorAccess`/write-only role gate;
its evidence, adoption and lifecycle routes use that helper directly.

Passing a fresh viewer role to the existing mutation helper therefore does
not revoke a former lead's write access. The implementation needs independent
current governed-write eligibility **and** the existing action-specific
management/lead policy, repeated on the real transaction executor. Reuse the
canonical organization write-role decision rather than inventing a new role
list, and document any deliberate handling of custom organization roles.
Preserve legitimate lead/member and manager actions; no read/sharing grant
itself grants a write. Public viewers and permitted private owners still read.

Vault mutations carry per-route `requireEditorAccess`, but that middleware
reads request role fields. It must receive the verified current role rather
than retain stale admin/member claims, and current eligibility must be checked
again in the writer transaction. Source upload admission is a read permission
and cannot substitute for this write eligibility. Disposition apply carries
the same middleware plus the helper, so its transaction has the same stale
role concern.

## Organization list and reconciliation decision

Return only programs whose exact recorded relationship is a single non-deleted
project anchor admitted by the evaluated sharing policy. Archived anchors and
archived programs remain readable where existing query options permit them.
Count uniqueness against **all** eligible anchors, not only the ones the actor
can access: a public second anchor cannot authorize an ambiguously linked
private program.

An actor/sharing/anchor query that cannot execute is 503 and emits no page.
An actual missing, duplicate or deleted relationship is an evaluated unusable
relationship, not a database outage. Exclude that relationship from portfolio,
full-text and semantic lists without blocking unrelated valid rows. Label the
returned scope `verified-accessible-programs`; totals are totals in that scope.
An empty UI says that no projects/documents are available with verified access,
not that the organization has no records. A static scope explanation can state
that unresolved relationships are excluded without disclosing their existence,
identities or count.

If an ambiguity contains a positively accessible recorded anchor, a generic
reconciliation-required flag may accompany usable results, with no hidden
program name, identifier or count. Do not derive this flag or access from
program `lead_user_id` alone. Missing anchors provide no project-policy grant
and must not be manufactured into one. An explicit program read independently
returns the named reconciliation 409; an inaccessible program returns the
non-disclosing denial contract. This distinguishes a verified scoped list from
failed verification and prevents one malformed private legacy row from making
every usable portfolio fail.

Archive/unarchive/delete may need to reach a retained program solely to return
the existing locked deleted-state refusal or inspect its holds. Keep such
`includeDeleted`/lifecycle handling explicit to that caller; it grants no
ordinary document read. `vault-legal-holds.ts` is an existing separate
administrative retained-record path, not a reason to forbid retained archived
content globally or pass a deletion exception into normal Vault reads.

## Reachable secondary paths that a two-router-only patch misses

1. **Both assistant search arms.** `vault-assistant-search.ts` calls the shared
   full-text search and then `document-catalog-search.ts`. Semantic searchable/
   unsearchable counts and ranked hits currently use organization/program
   predicates only and use the global pool. Propagate verified scope and the
   caller executor through both arms, before counts/ranking/limit and before
   embedding work. Filtered keyword hits must not be recombined with private
   semantic summaries, key data or program names.
2. **Actual search callers.** AnA `document-catalog-tools.ts` has the actor in
   `ToolContext.userId`; MCP `tools/vault.ts` has
   `ctx.principal.userId`. Both currently drop actor identity when calling
   `searchVaultForAssistant`. `catalog-scope.ts` preserves open-project versus
   organization scope but checks program ownership, not current sharing. Keep
   its cross-project refusal while adding current actor admission; no project
   open means the accessible library, never every tenant program.
3. **Catalog browse counts.** `document-catalog.service.ts:listProjectDocuments`
   is called by AnA and MCP `c2c_list_vault_documents`. Its window counts,
   unfiled/extraction/not-studied facets and newest-first limit currently span
   all tenant programs. Apply the same verified ID set before these windows,
   including when no project is open. Search-only fixes leave this reader open.
4. **The other document's parent.** `vault-relationships.ts:listRelationships`
   returns the linked document's title/version and program name under tenant
   ownership only. Authorizing `:id=A` does not authorize linked private B.
   Writes lock the other document without requiring it to be in A; preserve
   legitimate cross-project links only when both current parents are admitted.
   Do not turn a recorded relationship into a sharing grant.
5. **Where-used enrichment.** The versions route calls `vault-where-used.ts`
   for submission, eSTAR and CMC uses. These readers are organization-scoped.
   Some writers already constrain a use to the source's program, but retained
   legacy records and genuinely cross-project references need their current
   related-parent admission before identities/titles/sections are returned.
   Preserve immutable audit records; any redaction/filtering belongs in the
   reader projection, never destructive audit rewrites.
6. **Unscoped sources.** `projects.ts GET /:id/sources?includeUnscoped=true`
   exposes tenant unscoped CRE identities through `listClientDocuments`.
   `visibleOrgClause` currently treats every NULL organization as visible.
   NULL scope alone must not be promoted to public: retain genuinely recorded
   `organization_id IS NULL AND visibility_class='global_public'` references,
   and keep private conversation attachments under their original creator
   boundary. Tenant-level governed source records need an explicit existing
   organization-wide authority; do not conflate them with conversation uploads.
7. **Source-usage counts.** `summarizeSourceUsage` enriches a permitted source
   from tenant-wide authoring citations. Review its cross-program counts and
   source-changes sibling so inaccessible related documents do not contribute
   private usage metadata. Do not infer permission from checksum similarity.

These secondary services should consume the same canonical admission/scoping
result. No second membership store, list implementation or semantic search is
needed. An omitted interactive allowed-program list must not mean tenant-wide
access; distinguish an evaluated empty set from unverified/absent scope.

## Adoption and filing

`verifiedAdoptionUpload` verifies tenant/checksum/availability and retains a
final `FOR SHARE` identity check, but calls the loader without the actor.
`fileUploadIntoVault` does the same. Use the existing exact upload/source
admission before storage I/O and repeat it on the current writer executor.
`assertAnaUploadAccess` already requires a fresh actor, all recorded CRE/artifact
parents and creator-only genuinely unbound uploads, including original figure
document permissions. Target access cannot authorize a private source.

The adoption route claims **conversation-only, from no project**, while its
implementation only deduplicates the target's checksum. Source admission is
necessary but not sufficient to preserve that claim: an actor who can read a
bound source should not silently reclassify it as a conversation upload in
another program. Preserve same-target idempotence after current source/target
admission; otherwise refuse a bound source through this conversation-only
door. Check the same recorded associations that the conversation-file list
excludes, including checksum association, so selecting an omitted attachment
by ID does not bypass the list's rule. A deliberate cross-project copy would
need its own honest existing governed operation and retained origin, not a
forged `adoptedFrom:'conversation'` receipt.

`vault-data-room-filing.ts` correctly requires the captured source's program to
equal the target program and checks capture checksum/current identity. Keep
that invariant, its batch item outcomes and the existing check-in target rules.
Fresh source/parent admission adds to them. Preserve disposition advisory-lock
and impact-table ordering; do not introduce a new global lock or trust an
unlocked preview/old JWT after revocation.

## Bounded implementation and evidence proposal

1. One reader/actor/anchor owner implements the canonical executor-based current
   read result and caller-specific live-anchor option. The Project router owner
   applies it to all routes in the inventory, portfolio SQL and its existing
   adoption/lifecycle transactions. Keep `projects.ts` under one owner.
2. One Vault router/related-record owner applies that result to every existing
   route and current writer transaction, and closes relationships/where-used/
   unscoped enrichment with the same policy. Keep `project-vault.ts` under one
   owner; do not have the search worker edit it concurrently.
3. One search owner threads the verified set through existing full-text,
   semantic and browse queries plus AnA/MCP caller identity. Preserve current
   ranking, disposition/version rules, semantic-unavailable messages and real
   global public reference policy. One filing owner updates existing upload
   source admission, coordinated with the Project router's adoption owner.
4. Move the seven red probe cases into canonical HTTP/SQL tests, preserving
   public/owner/member/reviewer/viewer positives. Add revoked membership, user/
   organization suspension, role downgrade, deleted/archived/duplicate anchors,
   unavailable verification, exact binary no-I/O refusal, linked private B,
   keyword plus semantic/browse counts, hidden-first pagination and offset,
   caller's own conversation adoption, colleague/private/bound-source refusal,
   concurrent revocation and same-target idempotence. Include legitimate
   same-project Data Room filing and lifecycle/hold regression suites.
5. Independently prove runtime app_service/NOSUPERUSER/NOBYPASSRLS/FORCE RLS
   and explicit tenant predicates on native PostgreSQL. These per-project
   permissions are application policy within a tenant; organization RLS alone
   does not prove them. No live embedding provider is needed for deterministic
   SQL/access evidence; do not mint fake semantic matches or qualification.

This closes the named Project/Vault surfaces and their actual search/adoption
readers. It is not a claim that every platform router, administrative export,
legal-hold reader or historical object grant has been assessed or repaired.
