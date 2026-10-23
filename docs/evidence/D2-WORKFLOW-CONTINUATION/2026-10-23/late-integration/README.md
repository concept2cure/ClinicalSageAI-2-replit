# Context-refusal and Vault-derivation integration, 23 October 2026

W1 / D2 bounded reconciliation of local `944735c72` with canonical `b66c6108d`, retaining the context-refusal delivery through `264560f40` and Vault-derivation delivery through `0ac543068`. The final additional canonical commit changes documentation only. The merge is on `concept2cure-v2`; no alternate branch, force-push or gate bypass is part of this work.

## What already exists

- `server/services/ai-gateway/gateway-error-map.ts` already classifies typed context refusals. The incoming optional carry flag adds the fixed warning that earlier work may exist; the default classification stays unchanged. `server/routes/chat/send-message.ts` retains current-turn read-only controls and gives the existing tool-budget 422 priority over context 413, preserving ordinary provider failures as 503.
- `server/routes/ana-ri/stream.ts` and `client/src/concept2cure/components/ana/useAnaChat.ts` already carry streamed replies, authoritative stops and turn records. The incoming context handling preserves partial text and sanitized recovery guidance, retains the actual record outcome and does not turn a stopped record into a successful answer.
- `server/services/authoring/authoring-file-to-vault.ts` already writes filing receipts. It now retains the source version and section digest. `authoring-vault-filing-receipt.ts` reads those retained facts against the verified Vault bytes, organization, program, payload, chain and seal; missing, ambiguous, malformed and unread records remain distinct. A `no-key` seal is recorded as such, not claimed as HMAC authenticity.
- `server/services/ectd/leaf-source-resolver.ts`, `core-to-packager.ts` and `assemble-from-core.ts` already materialize and package governed source bytes. Derivation is separate from alias identity, approval and shipped PDF/A hashes. The retained-input hash does not claim to describe normalized shipped bytes; the existing lifecycle approval gate remains.
- `server/services/vault/vault-version-checkin.ts` already identifies check-in heads. A version hint now requires one live scoped head instead of choosing an ambiguous candidate by creation date. Current-read and snapshot authority are not widened by these changes.

## Verification

One bounded invocation passes **10 suites and 147 tests**, with **one existing TODO** (148 total), zero failures and zero skipped tests, in **57.54 seconds**. It covers the four new context-carrier suites, existing JSON read-only controls, retained Vault filing receipts, placement parity, unique check-in heads, Vault-UUID assembly and the founder service lineage. `command.json` records the exact invocation; `target-pins.json` contains 20 target source/test hashes verified unchanged after the run.

`tests-green.txt.gz` preserves the exact output, including fixture warnings. `result.json` records the result and deterministic archive hashes. The earlier 362-case backend packet retains its original source phase; the counts are not summed or relabeled as this run.

The TODO remains open: re-filing an edited authoring document must supersede the Vault version a live leaf pins, while file-to-vault still does not pass `supersedesDocumentId`. Verified derivation does not close that gap. The parity suite's expected refusal for an unavailable full PDF engine also does not establish a live successful PDF workflow.

These are PGlite and explicit-seam results, not native RLS, live approved-model, Codespace, agency or commercial qualification. Final build/compiler gates, normal publication and actual published-SHA CI are root-owned. Prior remote CI failures remain recorded separately in `../backend-current-integration/CI-prior-state.md`. Nothing was staged, committed or pushed by this reviewer.
