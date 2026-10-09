# URS-003 — User Requirements Specification: Authoring

| Field | Value |
|---|---|
| Document ID | URS-003 |
| Version | 0.2 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Verified by | OQ-003 (`tests/validation/oq/authoring/run.mjs`) |

**App:** Authoring

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | Drafted from `server/routes/authoring.router.ts` (docs, sections, revisions, freeze, e-sign, review, workflow, AI draft), `server/routes/review-board-routes.ts`, `server/routes/c2c/templates.ts` and the `DocumentAuthoring`, `Review`, `TemplateLibrary` surfaces. |
| 0.2 | 2026-09-23 | W3 | URS-AUTH-010 restated for the platform's one signing ceremony, which replaces the signing PIN (VSR-001 §13.3 item 3, decided under the owner's delegation): the account password, the enrolled second factor, and the account's lockout. The PIN route is removed. |

## 1. Intended use

Authoring is where governed regulatory text is written: a document (CTD module) with ordered sections, every edit recorded as a hash-chained revision with a reason for change, comments and review, a freeze into an immutable snapshot, and an electronic signature bound to that snapshot. AI drafting is a governed candidate that a human accepts; it must never produce content when no provider is configured.

## 2. Requirements

| URS id | Requirement | Part 11 | Risk | Source |
|---|---|---|---|---|
| URS-AUTH-001 | Authoring endpoints require an authenticated actor; identity for every write comes from the verified JWT, never from a header or the body. | §11.10(d) | high | `server/routes/authoring.router.ts` (`getActorId`, `getActorEmail`), `register-inline-routes.ts:317` |
| URS-AUTH-002 | A document is created with a title (required, 400 otherwise), a module and an optional program binding (`client_program_id`, validated as UUID); a template that cannot be honoured refuses before anything is written. | none | medium | `authoring.router.ts:1713-1760` |
| URS-AUTH-003 | Sections are created under a document with a CTD code and title and are read back in filing order; duplicate codes and order ties are reported as structure issues. | none | medium | `authoring.router.ts:2130-2189, 2192` |
| URS-AUTH-004 | Editing a section with a reason for change writes a revision carrying the content SHA-256 and the author; a save against a stale `expectedUpdatedAt` is refused with 409 and nothing is overwritten. | §11.10(e) | high | `authoring.router.ts:2337-2411, 2712` |
| URS-AUTH-005 | The revision ledger of a section is a hash chain that the server can recompute from stored content and report intact or broken. | §11.10(e) | high | `authoring.router.ts:2761-2779` |
| URS-AUTH-006 | A section can be reverted to a chosen prior revision; the content is restored and the revert is itself recorded as a revision. | §11.10(e) | medium | `authoring.router.ts:2781` |
| URS-AUTH-007 | A comment can be recorded on a section and listed under the document, attributed to the actor. | none | low | `authoring.router.ts:2932, 3278` |
| URS-AUTH-008 | The document's audit trail lists every operation with type, actor, timestamp, reason and before/after content hashes. | §11.10(e) | high | `authoring.router.ts:6803-6831` |
| URS-AUTH-009 | Freezing a document stores an immutable snapshot with a content hash and a version; a frozen record is retrievable and hash-verified; a second freeze is refused. | §11.70 | high | `authoring.router.ts:4438, 4848` |
| URS-AUTH-010 | An electronic signature re-verifies the signer at signing with the platform's one ceremony (`server/services/part11/reverify-signer.ts`): the account password, and the current code of the second factor when one is enrolled. It requires a meaning from {AUTHOR, REVIEWER, APPROVER} and an intent. A wrong password or code answers 401 and counts against the account's lockout; a missing code where a factor is enrolled answers 400 `MFA_TOKEN_REQUIRED`; an invalid meaning answers 400; nothing is stored on any refusal. A signing PIN signs nothing, and no route sets one (404). A valid signature stores signer, meaning, the method verified (`password` or `password+mfa`), digest and the covered freeze version/hash. | §11.50 §11.70 §11.200 §11.300 | high | `authoring.router.ts` (`reverifyAuthoringSigner`, `/docs/:docId/e-sign`, `/docs/:docId/sign`), `server/services/part11/reverify-signer.ts` |
| URS-AUTH-011 | Only a role with signing authority may apply a signature (403 `ESIGNATURE_NO_AUTHORITY` otherwise). | §11.10(g) | high | `authoring.router.ts:567-583` |
| URS-AUTH-012 | AI drafting runs only through the governed gateway; with no provider configured the request fails closed with an error and never returns draft text; with a PQ-passed provider it returns a candidate for human acceptance with provenance. | none | high | `authoring.router.ts:3523, 3911`, `server/services/ai-gateway/` |
| URS-AUTH-013 | A review can be requested from named reviewers and the document submitted into an approval workflow whose steps name their approver; the document moves to IN_REVIEW; a reviewer sees the pending review on the Review surface and records a decision with a meaning. | §11.10(e) | medium | `authoring.router.ts:3476, 6259, 6394`, `server/routes/review-board-routes.ts:852` |
| URS-AUTH-014 | Template stores (organisation templates and the global regulatory reference store) answer; an empty organisation store is reported honestly. | none | low | `server/routes/c2c/templates.ts`, `authoring.router.ts:1268` |
| URS-AUTH-015 | The Document Authoring and Review surfaces render the program's documents and the review board without runtime errors. | none | medium | `client/src/concept2cure/v2/surfaces/DocumentAuthoring.tsx`, `Review.tsx` |

## 3. Assumptions and constraints

- Signing authority resolution (URS-AUTH-011) is exercised only with the org-admin identity available locally; the negative case (a viewer refused) needs a second identity on staging.
- The PIN is a second authentication component (§11.200(a)(1)); whether PIN + session satisfies the customer's policy for non-biometric signatures is a system-owner decision recorded in the VSR.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
