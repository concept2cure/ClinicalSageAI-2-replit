# Existing AnA review and shared draft transport

W1 / D2, canonical `concept2cure-v2`, initial source `eceb747d3`.
Local automated qualification with synthetic HTTP responses; no live provider call.

Individual section drafting and the assembly queue share
`editor/authoringDraftTransport.ts`. `AuthoringAiDraft` remains the one review
panel. Its existing public types/helpers remain available, and callers without
a controlled session keep local buffers. Controlled sessions retain candidate,
edited text, stated reason, refusal and acceptance uncertainty across section
changes. Generation never accepts or saves section content automatically.

Every request checks admission before POST, after the response and after body
decoding. The panel combines mount, exact target, canonical session revision,
signed-in actor/organization, shell project visit and attempt ownership.
Independent generation and acceptance cannot release a newer request's lane.
The coordinator supplies its retained-owner guard through `reviewSession`.

Unsaved editor content blocks acceptance in the rendered control and the action
handler. Text typed while acceptance is pending prevents host adoption/remount.
A successful response must affirm the exact requested section and, when given,
its parent document. Missing lineage summaries stay unknown. A confirmed saved
base conflict retains the candidate for comparison, blocks acceptance and allows
explicit regeneration. Existing expiry and lineage rollback behavior is retained.

Acceptance becomes held as soon as POST is admitted, so leaving the review
before confirmation cannot make the original candidate appear retryable.
Lost/malformed responses remain uncertain. An explicit recovery action performs
only GETs, validating project inventory membership when project identity is
provided and then the exact parent/section. Its exact saved text is available
in the existing read-only `AuthoredHtml` disclosure beside the retained
candidate, without refreshing or remounting the editor. It does not infer that
matching text came from this request, adopt it as an acceptance or repeat the
POST. The held candidate can be explicitly discarded after reconciliation. This client state
does not persist across reloads, remounts or tabs.

Receipts:

- [Initial RED](red.txt): 6 failures and 1 pass across 7 cases against the old
  panel, showing enabled dirty acceptance, ignored controlled review, late
  generation adoption and absent unknown-acceptance recovery.
- [First candidate](first-green-31.txt): 31/31 across the original 24 cases and
  the initial 7 additions.
- [Integration in progress](integration-in-progress.txt): the expanded 16-case
  direct suite passed; the original suite could not import Workbench while its
  new assembly component had not yet been written by the concurrent UI owner.
- [Notice timing intermediate](intermediate-notice-timing.txt): 15/16. A newly
  persisted pending-acceptance notice appeared before the request finished. The
  panel now shows its existing Saving state while pending and exposes that held
  notice after an interrupted review; the original outcome assertions remain.
- [Pre-inspection regression](green-40.txt): 40/40 in two files.
- [Final regression](green-41.txt): 41/41 in two files, including all 24 existing
  tests and 17 additions. The final addition checks the exact saved text beside
  the held candidate and confirms no repeated POST. This includes actual panel controls and the original
  Workbench reachability case, with synthetic transport only.
- [Strict lint](strict-lint.txt): all three new source/test files, zero errors
  and warnings. [Warning comparison](warning-comparison.json): the existing
  panel falls from five warnings to two; the existing test retains its two.

[Source pins and counts](summary.json) and [receipt storage hashes](receipt-storage.json)
describe these exact runs. Only trailing receipt line endings were normalized.
Server transaction, queue orchestration and browser qualification are separate
evidence packets. These receipts do not establish provider performance, human
review, native PostgreSQL behavior or regulatory readiness.
