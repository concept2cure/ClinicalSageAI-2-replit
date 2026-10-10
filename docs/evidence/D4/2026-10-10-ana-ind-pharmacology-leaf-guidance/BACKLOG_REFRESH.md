# Current IND catalogue backlog refresh

Captured 2026-10-10 UTC from the local canonical `concept2cure-v2` working tree.
This is local catalogue/resolver evidence, not a post-push verification receipt.
The exact source hashes, capture time, local HEAD and Node version are retained in
[`structure-only-terminal-backlog.json`](structure-only-terminal-backlog.json).

Seven former structure-only pharmacology summary leaves, `2.6.2.1`–`2.6.2.7`,
now have exact advisory authoring records. The corresponding seven structural
records were removed from the other half of the single catalogue. Each of these
seven leaves resolves through the actual `resolveSectionBriefSource` as `exact`;
none is counted twice. This closes their encoded exact-content gap only.
Primary-source review and existing gateway drafting-path wiring do not establish
sponsor scientific-source qualification, product/phase applicability, model
performance, initial IND completeness or overall release clearance.

| Catalogue boundary | Historical 2026-10-09 snapshot | Current snapshot |
|---|---:|---:|
| Exact content records | 127 | 134 |
| Structural records | 122 | 115 |
| Unique combined codes | 249 | 249 |
| Combined terminal codes | 203 | 203 |
| Exact content terminal codes | 103 | 110 |
| Structure-only terminal codes | 100 | 93 |
| Open rows by Module 2 / 3 / 4 / 5 | 67 / 2 / 17 / 14 | 60 / 2 / 17 / 14 |
| Open rows with an inherited exact-content ancestor | 96 | 89 |
| Open rows not indexed by the requirements brief | 4 | 4 |

The generator retains the prior row schema and recorded heading bases. All 93
remaining row payloads equal the historical audit after removing exactly the
seven A rows; no remaining row's applicability or basis was upgraded. Every open
row retains `initial_ind_applicability: undetermined`. The historical
[`100-row audit`](../2026-10-09-ana-ind-cmc-leaf-guidance/structure-only-terminal-backlog.json)
and other prior evidence remain unchanged.

The refreshed [current backlog](../../../design/ANA_IND_REQUIREMENTS_BACKLOG.md)
lists all 93 rows once and partitions them into batches B–P without overlap.
Batch A is recorded as delivered for bounded advisory content only. Batch B,
the ten pharmacokinetics written-summary leaves `2.6.4.1`–`2.6.4.10`, is next.
Scientific review/seal admission, owned product and phase context, regulatory
currency, repeatable instances, lifecycle context and governed qualification
remain separate open needs in the existing coverage plan.

Validation used the embedded read-only reproduction command in the current
backlog document under installed Node 22/tsx. It regenerated the canonical
rows, verified 89 ancestor and four unavailable answers through the actual pure
resolver, checked all seven new exact answers, enforced the disjoint 134/115
catalogue and 203/110/93 terminal partition, recomputed all five source file
pins, and compared the result with the stored JSON. The 93 Markdown inventory
rows also matched the JSON code/heading/ancestor/batch tuples exactly. The
historical audit has no Git diff. No live model, database, governance action or
external mutation was invoked by this inventory check.

Current JSON SHA-256:
`729edbe2b212d5d5abce5c12bf18527329c813e01dfbc926ed884a714c101fc4`.
