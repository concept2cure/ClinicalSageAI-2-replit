# g-cross-reference-extractor-migrations: facts relied on

Step: HARMONIZE reference integrity and claim/evidence alignment now run on the one
in-text reference detector, `server/services/ana/in-text-references.ts`. Checked 2026-10-05.

This step adds no regulator fact of its own. Every resolution decision is made by
`classifyInTextReferences`, which walks the platform's canonical ICH E3 tree and its CTD
authoring registry. The basis for those trees, including which rows are recall and which are
regulator text, is recorded in `g-in-text-reference-resolution-facts.md` in this directory and
is not repeated here. The facts this step's tests depend on are listed below, each pointing to
that record.

| # | Fact | Where it is used | Basis |
|---|------|------------------|-------|
| 1 | ICH E3 §14 has 14.1, 14.2 and 14.3, and nothing at 14.9. | Test: `Table 14.9.99` in a section typed `csr` is reported as an unresolved HARMONIZE error. `Table 14.3.1.2` resolves. | g-in-text-reference-resolution-facts.md row 1. Regulator text was seen only in search-result text; the E3 tree itself is recall. |
| 2 | ICH E3 §12.2.2 exists. | Test: `Section 12.2.2` in a CSR raises nothing. | The canonical tree (`csr-e3-guidance.ts`). The per-heading basis is **recall**. |
| 3 | CTD 2.7 has 2.7.1–2.7.6 under ICH M4E, so there is no 2.7.9. | Test: `Module 2.7.9` is unresolved in HARMONIZE even with no document type. | g-in-text-reference-resolution-facts.md row 5. **recall** of ICH M4E(R2). |
| 4 | Protocol section numbering belongs to the sponsor. | Test: `protocol Section 9.12` gets an info notice, never an error. | g-in-text-reference-resolution-facts.md row 6b. Industry-practice **recall**. |

## Platform facts (code, not regulator)

- **What HARMONIZE did before.** At HEAD 76e7528c, `checkReferences` (harmonize-engine.ts:308-360) emitted the same warning, "Cross-reference to Section X — verify target exists in final submission", for every dotted number that was not a section key. This covered `Table 14.9.99` (which it labelled "Section"), `Module 2.7.9`, `protocol Section 9.12`, and also `per 1.5 kg`, which its `per <number>` alternative matched. The red evidence shows each of these: `g-cross-reference-extractor-migrations-red.txt`, 7 failed and 1 passed.
- **Who consumes HARMONIZE issues.**
  - `server/routes/harmonize.ts` (`POST /api/harmonize/check`).
  - `server/routes/authoring-actions.ts`, at `/harmonize-sections` and `/cross-section-consistency`.
  - `server/services/contradiction-engine-service.ts` `detectCrossArtifactContentConflict`. This one turns `error` and `critical` issues into contradiction findings, so an unresolved reference now becomes a `factual_contradiction` finding there. Previously no reference issue was ever above `warning`.
- **Score effect.** An info notice deducts nothing from `consistencyScore`. Previously each unchecked reference deducted 3 points as a warning, whether or not the reference existed.

## What the step asked for and I did not do, and why

- **Callers do not yet pass `documentTypes`.** This leaves E3 resolution inside HARMONIZE unused in production, although CTD Module-code resolution is live without it. `HarmonizeInput.documentTypes` is optional, and none of the three callers passes it today:
  - `routes/harmonize.ts`: its zod schema strips the key.
  - `authoring-actions.ts`.
  - `contradiction-engine-service.ts`.

  Inferring "CSR" from a CTD key such as 5.3.5.1 would be wrong. `submission-chain.ts` records that 5.3.5.1 also holds SAPs and protocols. These callers are outside this step's files, so they are listed in needs_elsewhere.
- **Unqualified `Section 2.7.9` in a non-CSR section is a notice, not a finding.** The detector routes a Section number to the CTD tree only when it is written `Module`. A rule special to HARMONIZE, treating Section as Module in CTD context, would be a second routing rule outside the canonical module. If that is wanted, it belongs in `in-text-references.ts` as a context option.
- **Bare numbers after "see", "per", "refer to" or "as described in" are no longer references.** These were the old `crossRefPattern` alternatives. They produced false warnings ("per 1.5 kg"). Real references carry their keyword, and the canonical detector requires one.
