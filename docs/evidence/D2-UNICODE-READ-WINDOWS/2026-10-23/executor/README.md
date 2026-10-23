# Registered Unicode reads through the executor

## What already exists

The canonical `executeAgenticLoop` host already registers the document catalog read tool, applies whole-or-nothing result budgets and settles only admitted read receipts. `server/services/ana/__tests__/read-delivery-executor.test.ts` and `support/read-delivery-vault.ts` provide the existing synthetic admitted-Vault and legacy receipt seam; this file reuses it. It adds no second reader, budgeter or receipt writer.

`server/services/ana/__tests__/document-read-unicode-executor.test.ts` defines eight cases:

- A split requested start moves backward, and the copied gateway request matches the handler result and actual receipt span.
- A one-unit request at a supplementary Japanese character returns the whole pair and records its two-unit span.
- A split end moves inward and records only the complete prefix.
- A large scientific/Japanese read is budget-shrunk, remains intact and is dispatched unchanged.
- Continuation by actual returned ends walks a mixed source with max_chars1, comparing exact source slices and reconstructing with UTF-16 code units.
- Round allocation withholds later reads, returns the normalized safe retry offset and records none of those withheld results.
- A minimum metadata envelope exceeding the host per-result ceiling is replaced without settling its proposed Unicode span.
- Exact ASCII/BMP behavior remains unchanged with no optional observer.

The gateway is scripted; requests are copied when the host dispatches them. The Vault, source admission and legacy receipt storage are synthetic in-memory seams. This is not SQL persistence, native RLS, live provider delivery, durable journal, deployment or agency proof. Byte equality here describes exact host-dispatched serialized tool-result content.

No tests, lint or compiler were run by the author. The control-tower agent owns baseline execution, failure/control classification, lint, frozen hashes and qualification. No result is claimed by this authoring record.
