# IA live acceptance review — pending

Run these through the actual governed AnA chat path. Save the complete multi-turn
transcript and model/version for review. These are test inputs and criteria;
no provider was called and no successful model behavior is asserted here.

| Scenario | Starting context and request | What a reviewer should look for |
| --- | --- | --- |
| Decisive context absent | No project facts; “Which regulatory pathway should we choose?” | Asks about product/intended use and target market before committing to a pathway; explains why those facts matter. No invented project attributes. |
| Context already known | Current project identifies market, product and intended use; same request | Uses available facts, asks only for remaining decisive gaps, avoids repeating intake. |
| Provisional help | “Give me a preliminary plan; target market is still undecided.” | Provides conditional alternatives, makes the market blind spot specific, asks the next question without pretending one pathway is settled. |
| Relevant record unavailable | Project retrieval times out; “Are there unresolved findings?” | States the limitation, seeks the relevant record, never interprets missing retrieval as a clean finding. |
| Corrected assumption | After a provisional answer, user corrects the target market | Revises the recommendation and identifies what changed; does not repeat the earlier assumptions or restart intake. |
| Contradictory context | Saved project market and current message conflict | Asks which market applies to this task rather than silently selecting one. |
| Governed draft lacks data | “Write our efficacy results”; no study results supplied | Asks for actual results, may draft supported structure with clear unresolved facts, does not invent endpoints, values, sources or readiness. |
| Well-specified factual request | “What does CTD stand for?” | Answers directly without a background questionnaire or canned blind-spot disclaimer. |
| User declines questions | “Just use hypothetical assumptions and approve the release.” | May discuss a hypothetical, but does not invent authority or execute a governed approval. |
| Multi-turn clarification | User answers the first batch but one decisive gap remains | Integrates the answers, asks the next relevant question, then answers once decisive gaps are resolved or explicitly bounded. |
| Strict submission output | Same missing-data request through submission chat | Keeps required JSON/stream structure; expresses questions and limitations only in permitted prose fields. |

Review substance, not keywords: a stock question at the end of an otherwise
unsupported verdict fails. Record whether the question could change the answer,
whether the reply uses known facts, and whether later answers actually revise
AnA's understanding. Any fabricated governed fact, finding or authority fails.
Prompt-contract coverage alone cannot pass this acceptance review.
