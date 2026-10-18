# QMS current signing and released training admission

The QMS approval, retirement and change-approval services now check current
active signing authority after reserving their actual target, using the same
request-owned transaction. When the existing governance flag is enabled, they
also apply the canonical strict `sign` permission for `qms-document` or
`qms-change` on that client. Existing precredential verification, contributor/
proposer separation of duties, domain signatures and atomic audit writes stay
in their canonical services; no parallel writer or role policy was introduced.

New personal training requires the exact retained approval signature for the
document's recorded approving actor and instant. The reader verifies target,
tenant, signature type, version/document number, manifest hash/attribution,
binding basis, current content digest and canonical withdrawal fields. It holds
that signature `FOR SHARE` through a new receipt's transaction. Current GET and
roster eligibility use the same admission; failed signature reads are held/
unavailable, distinct from a proven withdrawn approval. New receipts and their
audit carry the actual approval signature ID. Historical receipts, approval
metadata, signatures and source text are retained.

Contract: [QMS_CURRENT_SIGNING_AND_TRAINING_ADMISSION.md](../../../../design/QMS_CURRENT_SIGNING_AND_TRAINING_ADMISSION.md).
[source-records.json](source-records.json) records the final owned source bytes
against working-tree base `269d2c18c94ff13fc402bb985e71ab81fbd381a7` on
`concept2cure-v2`. This work did not commit or push.

## Actual native red and green

The new fixture is
`tests/db/qms-current-signing-and-training-admission.dbtest.ts`. It uses real
authenticated HTTP, bcrypt reauthentication, canonical QMS signature/audit
writers and native PostgreSQL through the restricted runtime role under forced
RLS. It does not mock authority, permission grants, signatures or the database.
No provider calls, privilege grants, trigger disabling or history deletion occur.
Every run creates a uniquely named synthetic QA organization and deactivates
that organization afterward while retaining its records.

[Native red](native-red.metadata.json) ran before production edits: **3 genuine
positive controls passed and 6 meaningful negatives failed**, zero skipped,
14.92 seconds. It proved runtime/RLS, genuine independent approval plus a
personal receipt, and authorized signing through the actual target wait.

| Original defect | Actual red result | Final green result |
| --- | --- | --- |
| New acknowledgement after actual approval withdrawal | 201 instead of 409 | Refused; old receipt and signature history retained |
| Approve, retire or change-approve after signer demotion during the parent wait | 200 instead of 403, all three targets | Refused before domain/audit/signature writes |
| Actor disabled during the parent wait | 200 instead of 403 | Refused before writes |
| Strict resource denial added during the parent wait | 200 instead of 403 | Refused before writes |

The fixture holds the authoritative row on a separate connection and observes
the actual request's lock wait with `pg_stat_activity`/`pg_blocking_pids` before
changing authority. Its positive wait uses the identical real reservation.
There were no missing-schema or privilege setup errors in the red run.

[Final native green](native-green.metadata.json): **9/9 passed**, zero skipped,
5.30 seconds, after the final production helper extraction. The released
training proof calls the canonical revocation writer, including real authority
and credential verification, on the runtime transaction: the generic HTTP
action router does not currently resolve the QMS target prefix. The approval
and training calls themselves are actual authenticated HTTP.

## Focused regressions and source checks

[Focused green](focused-green.metadata.json): **226 tests across 15 files
passed**, zero skipped, 65.12 seconds. It includes QMS services/routes, existing
canonical post-reservation authority/resource permission checks and the AnA
personal-attestation refusal/atomicity contracts. Tests cover held signature
reads, exact manifest integrity, ambiguous approval identities, withdrawal,
retained history, current roster credit, audit rollback and safe request-owned
transport.

That run preceded the final complexity-only helper extraction and the fixed
public 503 recovery sentence. [The affected-path recheck](affected-green.metadata.json)
then passed **80 tests across 3 affected files**, zero skipped, 34.95 seconds;
the final native 9 were also rechecked afterward. The 80 overlap the 226 and
must not be counted as additional distinct cases.

[Scoped lint](lint.txt): zero errors, no new warnings. The two existing
`mdx-qms.ts` warnings remain (file length and an unrelated supplier-handler
complexity). [Server-error leak gate](server-error-leaks.txt): no baseline
increase. Whitespace checks pass. No compiler, full-suite, Docker or build
runner was performed by this workstream.

## Exact retained red-row comparison

The original red QA organization is 71, `qms-current-a2f97d68`, now inactive.
It retains 7 documents, 1 change, 3 receipts, 9 signatures, 9 actions and
12 audit rows. The adverse red acts were not removed or relabelled.

[Before final verification](retained-red-rows-before-final.json) and
[after final verification](retained-red-rows-after-final.json) contain only
record IDs, tuple versions and SHA-256 over canonicalized complete row JSON.
[The comparison](retention-comparison.json) verifies **all 41 exact row hashes
and PostgreSQL tuple versions unchanged**, with unchanged counts.

The first row inventory was captured **after the initial native green**.
This demonstrates retention through the subsequent checks; it is not a
retroactive claim that pre-first-green hashes were recorded. The red/green
fixtures use different QA organizations and never mutate an earlier run's
history.

The proof uses invented QA text and development/test signing configuration;
it is not a production credentialed OQ or regulatory qualification claim.
The canonical permission reader checks current grants after the parent wait;
it does not serialize independent grant writers through signing COMMIT.
