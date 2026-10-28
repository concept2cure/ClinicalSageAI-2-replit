# CSR document evidence manifest

The new pure validator checks every expected saved CSR section against its bound content hash, AnA run, claim list, and qualified source facts. It rejects missing, duplicate, unexpected, empty, or altered sections. A reconciled outcome still requires human review.

The complete section manifest must come from the authorized saved document. Source facts and receipts must be read from the same tenant-scoped snapshot. This change adds no new editor or evidence store.

Test command:
node_modules/.bin/vitest run server/services/ana/__tests__/csr-document-evidence-gate.test.ts

Not yet verified: test execution, production integration, source-fact persistence, editor approval enforcement, and live CSR generation.
