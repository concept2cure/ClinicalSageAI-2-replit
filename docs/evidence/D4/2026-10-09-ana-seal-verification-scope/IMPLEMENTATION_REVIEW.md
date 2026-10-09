# Independent review: seal verification scope

**Approved for partial 1d: scope consistency only.** Reviewed against release
base `b9a87ab1704b5a59e1293070748b3e99c940d5c1` on `concept2cure-v2`.
This patch rejects explicitly limited or malformed verification qualifiers. It
does not authenticate a verification verdict, qualify its sources or close all
sealing/target-binding gaps. The reviewer read source, tests and evidence and
did not edit production/test source or run tests.

## Frozen identities

| File | Independently recomputed Git blob |
| --- | --- |
| `server/routes/ana-ri/seal-verified.ts` | `fbcac5b6e236e63daaac6f5d3aaec791d91739b1` |
| `server/services/ana/verifiedSealService.ts` | `82ecebfda7cb518562c69e6c811846895226e334` |
| `server/services/ana/__tests__/verified-seal-scope.test.ts` | `13e1d5d0deb297b47bf54e0b7a27c059e37bb5df` |
| `server/routes/ana-ri/__tests__/seal-verified-scope.test.ts` | `8799f9d42f6718fc764426cd546e8efdf133cb97` |

## Contract reviewed

The HTTP builder now carries raw optional `scope`, `artifactVerified`,
`sourceVerified` and `sourceDiffPerformed` values to the real service. It does
not silently discard malformed qualifiers. The service still requires strict
`ok === true`, then rejects any non-undefined scope because this path supports
no authoritative scoped producer. Each supplied flag must be exactly `true`;
false, null, strings and numeric stand-ins cannot qualify the receipt. Positive
flags are explicitly documented as unauthenticated claims, not new evidence.

Absent/undefined qualifiers retain the existing unscoped legacy behavior. The
new rejection uses `VERIFICATION_SCOPE_INSUFFICIENT` without weakening the
existing not-verified, sample, manifestation, signer or transaction behavior.
Default seal-pool acquisition now occurs after the service's rejection gates.
No client, SQL, persistence schema, model, dependency or capability was added.

**Service versus HTTP database boundary:** direct service rejection occurs
before default pool acquisition, connection and seal writes. The HTTP route
still checks signing authority and reauthenticates the signer first; those real
authentication services may access the database. Route tests fixture these
services and prove ordering plus rejection before the *seal service* pool, not
that an entire real HTTP request performs no database work.

## Evidence reviewed

The natural test-first baseline recorded **27 failed, 9 passed** of 36 cases in
3.712 seconds before production edits. The frozen candidate recorded **36
passed, 0 failed** in 3.635 seconds. Forced lint recorded zero errors, the same
two route and two service warnings, and zero new-test warnings. Commands, source
pins and raw results are in `focused-red.json`, `focused-red-report.json`,
`focused-green.json`, `focused-green-report.json`, `focused-eslint.json` and
`focused-eslint-report.json`.

The tests exercise the actual handler and actual central service, including
plan-only receipts with forged positive flags, another claimed scope, malformed
scope/flags, false source-diff results, strict not-verified refusal, pre-pool
service rejection, and unchanged HTTP feature/context/content/authority/
reauthentication gates. The unscoped compatibility cases deliberately stop at
an injected connection error: they prove an attempt to enter the old transaction
path, **not successful persistence or a valid seal**. Existing persistence and
lineage regressions are broader qualification owned by the parent delivery.

## Explicit remaining findings

1. **Unscoped client forgery remains open.** A client can omit scope/flags or
   assert positive flags while retaining `ok: true`. This patch adds no server-
   owned verification receipt, immutable source identity or content-bound
   verification lookup. Signer authority and reauthentication authenticate the
   person, not the truth of that verdict.
2. **Source qualification remains separate.** `verify_docx_against_source`
   reads a tenant-workspace file but compares it to caller/model-supplied text
   or required strings; it does not persist an authoritative seal receipt. Its
   `sourceDiffPerformed: false` string-only result is now rejected if supplied
   to this endpoint. The existing client `mapVerificationResult` drops that
   field; no current client caller of this seal endpoint was found. Missing
   legacy fields therefore cannot be treated as evidence of source comparison.
3. **Target/content/tenant binding gaps remain open.** The service hashes
   `input.content`, rather than retrieving and matching persisted version
   content/hash. Supplied `existingVersionId` is trusted, and providing both
   artifact PK and external ID bypasses the existing resolution branches.
   This batch does not establish their consistency, full tenant/project
   association, or binding of any verification to the version being sealed.
4. **Existing primitives are not adopted here.** Governed-command content
   bindings and source/author lineage can record useful identities and verified
   quote spans. This seal path's author-lineage pass can instead attribute
   remaining content to the signer; lineage coverage is not independent study
   or source qualification. A future server-owned verification contract must
   preserve that distinction.

These are separate follow-ups, not claims solved by this rejection check. The
current verdict is approval of the bounded consistency correction only.
