# Citation writer admission — implemented contract

Status: implemented and verified by the bounded PGlite/HTTP evidence in this folder. The previously sealed 138-test evidence remains independent and unchanged.

The change adds current requester admission to `server/services/clinical-regulatory-evidence/source-usage.service.ts` and preserves typed refusals in `server/routes/authoring.router.ts`. Existing service, signed HTTP, metadata, source-versioning and disposition fixtures verify the contract.

## Problem and required behavior

Source metadata readers enforce the current actor, exact recorded source parent and project sharing before enriching a bibliography or Sources rail. Before this change, citation writers called `readCitationEnds` before current source admission. That helper fetches the source checksum using organization visibility and project correspondence. An editor could cite or refresh another uploader's genuinely unbound chat source, including through the generic `cre_evidence_source` citation route.

A canonical document permission authorizes the document action; it does not authorize a source. A citation's recorded creator is historical attribution; it does not identify the requester refreshing it today.

## Approved service and route input contract

`citeSource(orgId, p, executor)` retains required `p.createdBy:string`. Both actual cite routes already populate it from `getActorId(req)`. Convert only a strictly valid positive safe integer identity, then use that value as the current requester. Do not read actor claims from request bodies, an existing citation, or an organization owner. This avoids adding a competing requester field to the new-cite interface.

`refreshSourceCitation(orgId, target, executor)` requires `target.userId:number`. Both refresh-token and refresh-all pass the numeric actual JWT requester. `prepareRefreshTarget` receives the same identity. No fallback to stored `authoring_citations.created_by` is allowed, even when that creator remains an authorized uploader.

HTTP writers retain their owned `inTransaction` client for admission, reservation, checksum, citation write and audit. Existing direct service compatibility does not qualify pool calls as an atomic writer transaction.

## Ordering and errors

For a new canonical cite, validate IDs and requester; call `getCurrentReadableSourceScope(executor,{organizationId:orgId,userId,sourceIds:[sourceId]})` before `readCitationEnds`, checksum or existing-citation reads. Selected-source admission must throw on refusal; a list omission must not become a grant or a synthetic empty success.

Refresh preserves its section-bound not-found, frozen and non-source early outcomes without fetching source metadata or changing history. After the numeric canonical reference resolves, selected current source admission precedes `readCitationEnds` and any checksum read. Preserve the programme disposition advisory reservation before citation write locks. Recheck the admitted source scope after the reservation, before acquiring the citation `FOR UPDATE` and performing checksum/write work.

Preserve cross-project correspondence, strict NULL-organization global-public admission, captured-data eligibility, current/superseded restrictions and immutable frozen citations. Reciting must not rebaseline an old checksum or change `created_at`. Refresh audit rows retain the actual before/after values on the same transaction.

All four actual route catches map `SourceReadAccessError` and `ProgramReadAccessError` to their exact status and `{success:false,error:code,message}`. Existing source-usage input/correspondence errors and refresh refusal outcomes retain their classifications. Important current classifications: genuinely unbound source belonging to another uploader is 409 `SOURCE_PARENT_UNRESOLVED`; private programme access denial is 403 `SOURCE_ACCESS_DENIED`; inactive/revoked current actor is 403 `PROJECT_ACTOR_ACCESS_DENIED`; unavailable source verification is 503. A strict selected unknown or NULL-private source is 404.

Refresh-all keeps one transaction. A typed admission failure must escape the loop so the existing transaction helper rolls back earlier allowed refreshes and their audits. It must not be reported as a skipped citation in a committed success.

## Meaningful regression fixtures

The source-usage suite already seeds current actor 1 with real memberships and private project owners through `seedSourceReadParents`. Add a real active peer and OU row, and exact `file_uploads.user_id`/chat-upload source provenance for unbound cases. No fake visibility policy or administrator grant is needed.

The HTTP suite's actual signed requester is AUTHOR 3. `makeSource(checksum,9)` creates a real peer-owned unbound capture. Its legacy `insertCitation` intentionally records creator 9 and can demonstrate that refresh uses requester 3 instead. Documents retain their canonical triggered owner permissions. Source-verification availability faults may refuse the identity query while preserving all policy decisions and real SQL for admitted paths.

| Coverage | Required assertion |
| --- | --- |
| Original uploader new cite | Actual source checksum, attribution and same-transaction audit; no fabricated metadata |
| Generic and canonical peer uploader cite | 409 with exact code, zero citation/audit writes and zero source-checksum SELECT before refusal |
| Refresh uses actual requester | Peer original uploader is the recorded creator, but current requester receives 409; old row/hash/date remain |
| Requester revocation | Real OU removal in service fixture; inactive current user in HTTP fixture; typed 403 before source checksum/write; restore actual record afterward |
| Mixed refresh-all | Allowed changed source first, denied source second; typed refusal rolls back both original citation images and the first audit |
| Verification unavailable | Failure at identity verification becomes 503, no checksum/source title enrichment or mutation; all four HTTP handlers preserve typed refusal |
| Explicit global public | Actual NULL-organization global-public source citable by current member; NULL-private selected source is refused |
| Frozen/historical | Existing frozen/date/recite, retained/superseded/disposition and bibliography histories continue to pass unchanged in meaning |

Existing refresh call sites also occur in authoring-citation-source-scope and document-data-disposition citation-writes integration tests. Their new required inputs must name those fixtures' actual requesters (normally 42); do not copy an arbitrary stored citation creator.

## Verification and limits

The canonical red run captured 14 failures and two legitimate positives before production changes. The first nine-file green passed 165 cases. Two further real membership-revocation cases passed in the final 45-case source-usage run, producing a composite census of 167 distinct cases across those same nine suites. The README and manifest record the exact split and raw log digests.

PGlite proves real SQL and atomic rollback within these fixtures. It does not qualify native RLS, source bytes, storage/providers, scientific content, exports or regulatory acceptance. Fresh rechecks alone do not establish that project sharing remains stable through COMMIT. Current actor row locking can reuse the existing `readCurrentProgramActor(...,{forShare:true})` primitive if root explicitly extends this change; it does not solve sharing-row concurrency by itself.
