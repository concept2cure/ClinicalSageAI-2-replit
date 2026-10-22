# Source-window finding revalidation — no new selector patch

The working checkout was synchronized from `7576327d5d278285cb1846feb6afa6edb42b435d` to `accf8c6bacfdc2d89b5de9098e22a67fe3f27914` before implementation. The latest upstream changed 1,354 files; this record makes no blanket qualification claim about those changes.

An earlier read-only audit reproduced an offset error on the former code: lowercasing U+0130 expands UTF-16 length and shifted a late efficacy window from the authoritative coordinates. The upstream update already supplied `sourceOffsetResolver`, a literal whole-word scanner and regression coverage. Two agents revalidated the current code: the original synthetic reproduction now selects [82502,84502), containing the 120 mL efficacy result, and a mixed supplementary-character/U+0130/emoji control also preserves its exact 2,000-unit span. These are read-only audit observations, not a new standalone qualification run.

No selector production or test file was changed in this continuation. No new selector contract was opened. The next bounded workstream is [batch termination receipts](../../D2-DRAFT-TRUNCATION-RECEIPT/2026-10-17/CONTRACT.md). Canonical sync output and metadata are retained alongside this note.
