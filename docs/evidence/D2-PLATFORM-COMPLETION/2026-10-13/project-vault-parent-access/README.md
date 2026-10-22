# Read-only project and Vault privacy preparation

This is baseline evidence and an implementation proposal for
[the parent-access design](../../../../../docs/design/PROJECT_VAULT_PARENT_ACCESS_2026-10-13.md).
It does **not** claim that these API privacy fixes have shipped. No production
file was changed during this preparation.

The focused run started at 2026-10-13 21:18:20 UTC. Repository HEAD when the
run completed was `e198f24a5758accf206fb2bf5f784fb5636b328c`; the inspected
project/Vault production paths were unchanged by the workflow bridge. The
fixture contains invented programs, users, titles and document text only.

## Actual HTTP and SQL baseline

[The reproduction](parent-access.probe.ts) mounts the actual Express project
and Vault routers. Their shared pool is backed by PGlite, and the production
full-text migration is applied. It executes the canonical sharing helper
against the same persisted owner, normalized visibility, explicit membership
and pending review assignments. These controls pass: the unassigned member
can access only the public project, while owner/member/reviewer grants work;
the public project detail and document search are usable.

[The final isolated log](baseline-red.txt) records **2 passing controls and
7 intended failing privacy assertions**:

| Boundary | Intended outcome | Baseline outcome |
| --- | --- | --- |
| Private project detail, unassigned same-org member | Refusal before metadata | 200 with private study title and metadata |
| Private project Vault search | Refusal before document identity or content | 200 with private title and body snippet |
| Portfolio, public project behind newest private project, limit 1 | Public row and truthful `hasMore` | Private row occupies the returned slot |
| Organization library search, limit 1 | Count 1 and the accessible public document | Count 2 and private document occupies the returned slot |
| Public project read after organization membership removal | Current membership refusal | 200 using organization context alone |
| Program without a project anchor | Named reconciliation refusal | 200 |
| Program with two live project anchors | Named reconciliation refusal | 200 |

404 is the proposed non-disclosing private-resource read response; the
evidence establishes unauthorized 200/content regardless of the precise safe
refusal contract chosen for implementation. Native runtime-role/RLS checks
and exact binary download tests have **not** been run for this next increment.

The `.probe.ts` fixture is outside the canonical Vitest include and has an
explicit isolated config. It adds no intentionally failing normal `.test.ts`
or `.spec.ts` suite. Reproduce from the repository root with Node 22:

```sh
npx vitest run --config docs/evidence/D2-PLATFORM-COMPLETION/2026-10-13/project-vault-parent-access/vitest.probe.config.ts
```

Exit status 1 is expected on this baseline. The config **replaces** the normal
test include; it does not concatenate it.

## Proposed shared admission contract

Add `server/services/c2c/program-project-reader.ts`, taking the caller's
`RequestSqlClient` rather than opening another connection:

```ts
requireProgramProjectRead(q, {
  organizationId, userId, programId
}): Promise<{ organizationId, programId, projectId, actor }>

listAccessibleProgramIds(q, {
  organizationId, userId
}): Promise<{ programIds: string[], actor }>
```

The reader should use the existing active user/organization/current membership
query, `programInOrganization`, the unique recorded anchor and
`canAccessReportProject`/`getAccessibleReportProjectIds`. No new membership
store, role allow-list or client confirmation is needed. The existing
`readCsrProjectActor` query branch already supplies fresh active membership on
an executor; the existing signer role helper presently uses global Drizzle and
does not accept a caller executor. Reuse or narrowly factor the current actor
reader rather than trusting the request token's role. Ordinary viewer reads
must remain supported; authoring write-role admission is not a substitute.

Missing/duplicate/non-live anchors are reconciliation errors, distinct from
foreign/malformed/missing programs and private denial. Access-read failure is
a safe unavailable response, never an empty portfolio or `pendingStore`.
Archive retention should preserve existing program behavior; a deleted project
anchor cannot authorize a live program. If list reconciliation needs a visible
status, it must not reveal the name or count of inaccessible private projects.

Both routers can apply one common `:id` admission before any existing read or
mutation handler, with transaction-level rechecking where current operations
already acquire their own client. Their existing mutation policies, editor
permissions, signature/disposition/hash checks, audit and lock ordering stay
in place. The fresh role must also reach the existing mutation policy, rather
than leaving a downgraded actor authorized by stale `req.userRole`.

`projects.ts` portfolio SQL must include authorized program IDs before its
`ORDER BY`, `LIMIT limit+1` and `OFFSET`. `vault-search.ts` needs an explicit
verified `allowedProgramIds` input shared by both its count and ranked-page
predicates. An evaluated empty array is empty; omission must not silently mean
every program for interactive library callers. Preserve one existing search,
current-version/disposition rules and full-text ranking.

## Source-to-target footdoors requiring verification

`projects.ts:1526–1543` verifies an upload's organization/checksum, then
`POST /:id/adopt` passes `loadUploadedFile(fileUploadId, orgId)` without an
actor. This path does not restrict `file_uploads.user_id` or prove that an
existing source association is accessible before reading bytes. Its companion
conversation-files list correctly restricts the uploader and excludes hashes
already associated with a program/workspace. A permitted target is insufficient
admission for the attachment selected by an arbitrary ID. The next increment
should retain the conversation-only capture rule, check current source access
on the transaction executor before the loader, and recheck the locked identity.

`vault-file-upload-to-vault.ts:68–75` similarly uses the tenant-only loader.
`vault-data-room-filing.ts:189–199` correctly requires the captured source's
program to equal the target program; preserve that invariant and add canonical
parent/source admission before bytes. The existing AnA `assertAnaUploadAccess`
already evaluates exact recorded source associations and creator boundaries;
reuse its established admission or narrowly factor it, without introducing a
second policy. Do not strip a source program/project merely to make it fit an
accessible target. The adoption/file-into-Vault findings are code inspection,
not successful end-to-end attack reproductions in this evidence.

## Verification to add after publication unfreezes source

- Move these privacy assertions into canonical route/helper tests as the fixes
  land, with actual SQL owner/member/reviewer/public positives, revocation,
  role changes, missing/duplicate/deleted anchors and failed verification.
- Exercise every existing project/Vault route family before protected reads,
  including version/history/catalog/relationships/annotations/text and exact
  binary downloads. Refused reads must not emit a download audit or read bytes.
- Prove portfolio and search pagination/counts with several private records
  ahead of public records, including offset and current/superseded versions.
- Prove adoption refuses a colleague's unbound conversation upload and a
  private source selected into a public target, without new source/audit rows.
  Keep a legitimate creator adoption and same-project Data Room filing green.
- Run native PostgreSQL under the application's runtime role with both RLS-on
  and explicit tenant predicates exercised; use live canonical anchors and
  sharing tables, not superuser-only or pool-mocked permission assertions.
- Preserve current intake/create-anchor, archive/legal-hold, workstream,
  Data Room, Vault filing, disposition, signature, fixity and download-integrity
  regression suites. Keep the existing UI and program anchor contract.
