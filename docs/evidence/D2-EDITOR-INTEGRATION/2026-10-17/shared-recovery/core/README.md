# Shared authoring recovery core evidence

W1 / D2. Initial source `bfec9be6b`, canonical `concept2cure-v2`. This is local
automated qualification of the existing editor and specialist handoff.

The existing native ref-backed ledger is now the shared attempt primitive.
Native creation keeps its public API, document/section receipt rules, current
and visible semantics, actor behavior and scoped recovery behavior. Specialist
Save, Open and Attach share one mounted-owner lane per account/organization and
project. Synchronous overlap returns a blocked outcome; callers do not share a
success promise. Original payloads remain held after partial or uncertain saves.

Explicit recovery checks use the existing scoped all-status document inventory.
Known document IDs additionally require current inventory membership, exact
parent detail and correctly owned section rows. A check never writes. An absent
section code permits a separate section-only continuation using the original
payload, with another read at that explicit action. Existing section text is
preserved, including a section introduced between Check and Continue. A conflict
requires another check. Empty confirmed documents open without a fictitious
section target. Generic working-document navigation clears a previous exact
editor target.

A later deliberate primary action for the same confirmed payload verifies the
current parent and section before reuse. It preserves edited text and reports
an existing working document; deleted, missing or unverified records remain
held. Returned effect guards combine writer context, current ledger generation
and token ownership. A newer attempt invalidates earlier completion effects.
Canonical shell/auth subscriptions update visible scope without unrelated
renders; returning to an old project uncertainty permits a fresh current check.

The [summary](summary.json) contains source hashes and exact run counts:

- Baseline [RED](red.txt): 7/7 failed. Four failures demonstrated duplicate or
  repeated writes; three demonstrated unavailable recovery actions. This is not
  seven separate production incidents.
- The first candidate passed 38/40. Two fixtures omitted the newly required
  fresh reads on reuse and continuation. They were updated while retaining the
  exact original-payload and no-extra-document assertions.
- The next candidate passed 59/59.
- The seven-file regression passed 191/191: native creation/host/refresh 130 and
  specialist core/receipt/scope 61. Existing jsdom navigation and React act
  notices remain visible in the receipt; no failing assertions were hidden.
- After the final held-title/section-code message change, the three-file
  specialist core repeated 61/61 on final source. Strict lint passed all five
  owned source/test files with zero errors and warnings.

[Receipt storage metadata](receipt-storage.json) preserves original captured
hashes and repository-copy hashes. Only trailing line endings were normalized
to one LF; successful empty lint output remains empty.

The exported low-level `saveToAuthoring` writer still describes one execution.
Production specialist consumers use `useAuthoringHandoff` and its shared lane;
this does not turn the writer or server into an idempotent operation. The
component-owned ledger does not survive remounts, reloads or another tab. A
successful no-ID inventory check cannot identify an interrupted request or
prove nothing committed. GET retains existing read policy; POST checks current
write permission. No provider, human-review, deployment or regulatory readiness
claim follows from these automated receipts.
