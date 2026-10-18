# Independent held-out expectations

Frozen before executing the new implementation, 14 October 2026. These cases use synthetic identities and source text. They test source admission and existing receipt behavior, not deployed RLS, provider delivery, scientific qualification or validation/PQ. No production file belongs to this reviewer.

The corpus is bounded: 12 authority controls, 10 discovery/source controls, 10 receipt/host controls and up to 12 actual PostgreSQL controls. Overlapping PostgreSQL controls establish real database/locking evidence rather than adding a new capability claim.

Review implementation note: the reviewer corpus executes 39 cases: the 32 expected family controls above, three static serving-call checks and four retrieval-specific controls applying S01/S10/unknown-ledger expectations. The lead's separately owned serving-handoff cases may be run by the same evidence config; their attribution and count are disclosed separately. The PostgreSQL corpus remains 12 cases, with selected cases combining related source/discovery controls. The positive viewer read uses the actual source-facade projection, not identical body/metadata mocks.

| ID | Fixture | Expected result |
| --- | --- | --- |
| A01 | Active viewer, organization-visible project | Read scope granted; persisted viewer role returned; no write authority added. |
| A02 | Custom role, active explicit project share | Read scope granted by canonical sharing policy. |
| A03 | Private project owner without an explicit share | Read scope granted by canonical ownership policy. |
| A04 | Private project with pending artifact review assignment | Read scope granted by canonical review policy. |
| A05 | Active member denied private project | Named denial, no source query/content/metadata. |
| A06 | Stale request member role, persisted viewer | Reads follow persisted role; role escalation is impossible. |
| A07 | Inactive or absent actor | Named refusal, no organization-wide fallback. |
| A08 | Explicit project ID and program reference disagree | Invalid scope, no organization-wide fallback. |
| A09 | Same program has one accessible and one private anchor | Ambiguous program excluded from organization-wide scope; explicit request refused. |
| A10 | Valid program has no project anchor | Excluded from discovery; explicit request refused. |
| A11 | Canonical policy query fails | Unavailable, not authenticated empty. |
| A12 | Active actor has an evaluated empty project set | Real actor-filtered empty scope. |
| S01 | Org-wide visible document plus newer/private documents above top-N | Visible document found; counts/ranking/LIMIT use allowed programs in SQL. |
| S02 | Open project; actor can also access another project | Other-project by-ID/read/search refused or excluded. |
| S03 | Private filename, failure reason, source ID and count | None enter catalog, passage, capture or recall output. |
| S04 | Stored source organization differs from admitted organization | Refused rather than trusting query/body metadata. |
| S05 | Source moves to another program or becomes superseded/withdrawn | No new current-source evidence returned. |
| S06 | keep_data disposition with eligible extracted text | Text readable with original unavailable disclosure; no binary reopening. |
| S07 | Historical predecessor explicitly selected | Historical/current-use disclosure; no new current-source receipt. |
| S08 | Bound chat capture recorded program/workspace disagree | Excluded/refused without metadata or count. |
| S09 | Unbound upload belongs to another creator | Excluded/refused, even when organization matches. |
| S10 | Actor access changes while optional retrieval awaits | Re-admission refuses stale source results and counts. |
| R01 | Exact unchanged current-source payload, active viewer | Snapshot verifies and legacy receipt inserts once. |
| R02 | Same-length extraction changes after deferral | SHA mismatch refuses; zero receipts. |
| R03 | Bytes, program, organization or currentness changes | Refused; zero receipts. |
| R04 | Private share or active membership revoked after deferral | Refused; zero receipts. |
| R05 | Caller mutates span/source/payload object after deferral | Private snapshot preserves original identity; no mutated admission. |
| R06 | Negative/fractional/unsafe/out-of-range span or altered payload | Refused; zero receipts. |
| R07 | Host budget replaces a whole result | No receipt; deferred round is cleared. |
| R08 | Request cancellation before model request/handoff | Source context withheld, zero receipts. |
| R09 | Receipt INSERT fails or affects zero rows | Accepted count is zero, no provider-served claim. |
| R10 | Prospective coverage and aggregate history returned | Explicit prospective/legacy host-admission wording; no current actor/extraction/provider durability claim. |

Registered tool checks call actual handlers. Serving checks inspect both actual chat entrypoints and, where feasible, exercise their shared host helper. Exact PostgreSQL identities and blocking barriers are recorded. Final source hashes must be unchanged during each qualification run. Fixture cleanup remains the lead's responsibility.
