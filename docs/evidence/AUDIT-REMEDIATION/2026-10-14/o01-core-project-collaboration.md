# Core project and collaboration audit outcomes

This continuation advances governed-record and tenant-security evidence under the approved [continuation contract](continuation-contract.md) and [O01 contract](o01-contract.md). It repairs twelve discarded audit outcomes without changing the established distinction between an ordinary completed action and a critical signed transaction.

| Owned router | Outcomes repaired | Existing response contract |
| --- | ---: | --- |
| `server/routes/concept2cure.ts` | 7 | `meta.auditTrail`, mapped from the actual `logAuditEntry` result by `auditTrailFromEntry` |
| `server/routes/inline-annotations.ts` | 3 | Existing raw annotation/reply object; canonical `X-Audit-Row-Persisted` / `X-Audit-Row-Code` headers |
| `server/routes/cmc-changes.routes.ts` | 1 | Existing projected `data`, `id` and Module 3 result; additive `meta.auditTrail` |
| `server/routes/reg-change.routes.ts` | 1 | Existing projected `data` and `id`; additive `meta.auditTrail` |

The regulatory project writer still writes `regulatory_audit_logs`; its successful response correctly says `chained: false`. The other routes reuse `recordAuditRow` and preserve its actual chained/tamper-proof outcome. Failure does not fabricate a receipt or return a retryable mutation failure after the saved action. No audit store, signature policy, helper, baseline or dependency was added or replaced.

## Current authority and durable state

The seven project handlers now reuse current persisted organization membership and the existing operation-specific project policies. Creation and private template copying reuse `canCreateProgram`, which deliberately admits the platform’s open tenant role vocabulary and refuses viewer/readonly/read_only/guest roles; existing-record mutations retain the governed-write role set and `requireProjectAdmission`. Creation requires a currently active tenant, including when read-only offboarding recovery is allowed. A stale administrator claim cannot grant private-project access or revive revoked membership. Export uses read access; updating or archiving needs edit access; collaborator changes and a transfer intent additionally need the existing project-management permission. A viewer can export an accessible record but cannot create or copy a project. A member with read access can create a private template copy without changing its source.

Template copies retain the name/description/type, the existing workspace, reusable submission configuration and custom instructions. They start with the current caller as creator and owner, one private visibility record and one current owner grant. Source sharing, document inventories, clinical/programme/native identity pointers, approvals, reports, conversation state and pending transfers are not copied into new ownership. The existing duplication audit retains the source/copy relationship. Project creation, template creation and project/conversation archiving each commit their related business writes together; a rejected owner/visibility/child update rolls back the corresponding business action before the ordinary audit is attempted.

Annotation reply and decision routes require positive exact integer identifiers and compare the stored `documentId` with the URL document before mutation or audit. Tenant-scoped lookup remains mandatory. A vanished update returns an explicit conflict rather than inventing a saved reply or decision. Annotation error logs now carry a bounded database code rather than exception text.

## Reachability limits

These seven integer-project endpoints are mounted under `/api/concept2cure`. The launch Projects surface creates UUID regulatory programmes through the separate `/api/c2c/projects` router. Repository inspection found no direct current client caller for the seven repaired integer-project mutations. The similar path used by ConversationThread is an artifact-status route in another router. These repairs secure mounted APIs; they do not establish a new launch UI flow for them. A transfer response continues to mean a saved **pending intent**, not an executed ownership transfer.

The CMC list has current read consumers in `BiopharmaSpecialty.tsx` and `ChangeAssessment.tsx`; the regulatory-change list has `RegChange.tsx`. Those consumers use `dataConnect` and the shared `apiRequest` transport. No current client POST caller was found for these two proposal APIs, and no current client caller was found for `/api/inline-annotations`. Launch Vault annotations use the separate project-Vault implementation. Legacy annotation decisions have not been qualified as Part 11 document approvals or bound to a new guessed document namespace.

The shared transport and `GlobalMutationErrors` already support the canonical metadata and headers. New tests run that actual transport and renderer for all four response families: the completed response body remains readable, the missing-history notice appears, there is no false “change was not saved” banner, and a subsequent healthy response raises no notice. No shared client modification was needed.

## Verification

Initial mounted-route regressions recorded **10 failures in 11 project cases** and **9 failures in 12 collaboration cases**, including missing warnings and authority/target failures. The initial project positive-control run also exposed a fixture serial-sequence collision; that fixture was corrected, and the initial aggregate is retained with this limitation rather than counted as ten product defects. The initial project fixture used an arbitrary `/api/c2c` mount; final mounted tests use the actual `/api/concept2cure` prefix. The later added business-transaction tests reject a real owner grant, visibility insert and conversation archive, and verify rollback rather than a misleading partial save.

The final focused run includes actual PGlite/Drizzle project and feature writes, the real regulatory audit writer, the real canonical chained audit writer, actual database constraints rejecting audit inserts, successful audit recovery, positive persisted records/reloads, cross-tenant controls, revoked/private/read-versus-write controls, legacy API regressions and the real client warning consumer. The independent secondary tamper-proof backend is deliberately unavailable in the chained-writer fixture, so a successful audit result requires a real `audit_logs` insert. PGlite has no pgvector: the unused nullable feature-store embedding column is represented as text. This does not qualify vector, production RLS, agency transmission or a live provider.

The final run passed **80 tests in 10 files**. Bounded [red](o01-core-project-collaboration-red.txt), [green](o01-core-project-collaboration-green.txt), [lint](o01-core-project-collaboration-lint.txt) and [scanner](o01-core-project-collaboration-scanner.txt) summaries are recorded beside this document. Scope lint has zero errors and 23 remaining long-function/complexity and legacy destructuring warnings, all kept visible. The discarded-outcome scanner reports zero occurrences in each of the four owned source files; the control tower owns any evidence-backed baseline reduction and the repository-wide disposition.


## Browser continuation: creation policy correction

The subsequent complete browser run exposed a real regression in the first remedy: the golden journey’s seeded `author` membership received `403 PROJECT_WRITE_PERMISSION_DENIED` when directly calling the legacy project-create API. Its persisted role is intentionally `author`; changing it to a fixture administrator or member would have hidden the lockout. The initial 80-case scoped run used current `member` writers and had not covered the open role vocabulary on creation.

The implementation had incorrectly reused the existing-record `GOVERNED_WRITE_ROLES` gate for a create operation. The established `canCreateProgram` policy in `server/services/c2c/program-access.ts` explicitly supports tenant-defined role names while refusing named read-only roles. Creation and private-copy admission now reuse that exact predicate after resolving fresh current membership with the active-tenant `readCsrProjectActor` check. Source-project read/edit/management ACLs and all existing-record write gates remain intact. No test membership, shared role vocabulary or viewer policy was changed.

Two new mounted regression controls failed with the exact 403 body before the correction: persisted `author` and a custom tenant role. The focused final policy run passed **36 tests in three files**, including the expanded 24-case actual-SQL project suite, ten existing API controls and two existing collaborator controls. The ten additional cases cover both allowed role names, all four explicitly read-only aliases and four inactive/offboarding tenant states. These tests overlap the earlier 80-case scope; they must not be added as unique counts. The control tower reruns the complete browser journey and integrated inventory after this correction.

The production UI search remains distinct from this browser prerequisite: the golden test directly creates the legacy integer project through the real API, while the current Projects screen creates a UUID programme through the separate launch route. The test now exercises the supported author path without creating a new legacy project-management UI.

Bounded follow-up evidence is recorded in [o01-core-create-policy-checks.txt](o01-core-create-policy-checks.txt).
