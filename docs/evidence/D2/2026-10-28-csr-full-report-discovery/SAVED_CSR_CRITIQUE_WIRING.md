# Saved CSR critique — actual persisted AnA tool integration

The existing `critique_document` tool reads tenant-scoped saved sections, approved accepted text, citations and source visibility in a repeatable-read transaction. It calls the existing `critiqueDocument` precision checker.

This increment exposes the new `csrEvidence` status in that saved-document response when the caller specifies `documentType: 'csr'`. Without qualified structured claim receipts, `csrEvidence.status = 'not_assessed'`, `checkedClaims = 0` and the precision verdict is `revise`. The response explicitly warns that source citations and text quality do not establish scientific reconciliation. The PGlite saved-document regression test now checks this behavior through the existing read tool, not just the pure helper.

**Boundary:** The saved-document tool does not yet fetch approved TLF source facts or stored per-claim receipts. It must never infer them from citation text or external CSR exemplars. This patch does not insert fabricated evidence, bypass tenant access, create a second editor, or assert regulatory approval. A live approval endpoint must be integrated only after source/version-bound facts and review receipts are persisted through the existing governed evidence architecture. The saved critique remains read-only.

Required tests:
```sh
npx vitest run server/services/ana/__tests__/saved-document-critique.pglite.test.ts server/services/ana/__tests__/writing-gate-csr-evidence.test.ts server/services/ana/__tests__/csr-claim-reconciliation.test.ts
```
Run full TypeScript, CI, security and browser checks before release. Tests were committed, not verified passing in this session. Production data, model runs and export are not claimed complete.
