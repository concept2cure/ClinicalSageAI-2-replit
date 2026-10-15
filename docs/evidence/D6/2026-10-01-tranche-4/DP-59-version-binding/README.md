# DP-59 — a signature binds a version of the document it names (§11.70)

**Found** 2026-10-01 by the adversarial review of P1-42.

**What was wrong.** `POST /api/esignature/sign` resolved the signed version by `(versionId, organisation)` and
ignored `documentId`. A body naming document B with a version id of document A (same organisation) was signed:
the `electronic_signatures` row and the manifest recorded document B, while the §11.70 binding digest was taken
over document A's content. The record said one thing and bound another.

**What is true now.** The lookup also requires `dv.document_id = documentId`; a mismatch is refused with
`422 ESIGNATURE_VERSION_NOT_FOUND` before anything is written, and the digest is built from the document the
row records.

| Check | Red | Green |
|---|---|---|
| `server/routes/__tests__/esignature-sign.test.ts`, "refuses a version of another document" (the SQL stub honours a document predicate when one is sent) | 201 (`red/esignature-sign.txt`) | 422, no INSERT; the matching case still 201; 42/42 with the round-trip contract and concept2cure suites (`green/esignature-sign.txt`) |
