# g-requirements-resolver-extract — facts relied on

**Step:** R2 in [`docs/design/ANA_REGULATORY_RECORD.md`](../../../design/ANA_REGULATORY_RECORD.md) §7 and §10. It extracts the resolver from the tool and changes no behaviour. It moves launch row D2 (AnA document intelligence).

## Regulatory facts

**This step introduces, changes or relies on no regulator fact.**

- It moves routing code. Every requirements text it returns is rendered by the same functions as before, from the same records:
  - `renderSectionBrief` over `CTD_AUTHORING_GUIDANCE`;
  - `renderE3Brief` over `ICH_E3_GUIDANCE`;
  - `renderLifecycleBrief` over `LIFECYCLE_DOCUMENT_TYPES`.
- The regression snapshot proves that the tool's output for 621 inputs is byte-identical to its output at a425d1de.
- The `basis` field on an answer only exposes what the record already carries:
  - For an ICH E3 heading: `e3BasisFor(section)`.
  - For the E3 outline: the bases of `E3_REPORT_NOTES`.
  - Nothing new is asserted, and every confidence label is the record's own: `regulator-text` with URL and checked date, `recall`, or `platform-convention`.
- CTD sections and lifecycle types return `basis: []`. Their records carry no typed basis yet, so the resolver claims none and does not invent one. The `g-section-basis-default` step (R3) supplies the module default, and its coverage gate then requires a non-empty basis.

## Platform facts (from the code, not from a regulator)

| Fact | Where checked |
|---|---|
| The CSR aliases are platform vocabulary, not regulator text: `csr`, `clinical study report`, `clinical_study_report`, `e3`, `ich e3`. | `server/services/ana/regulatory-knowledge-tools.ts:67` at a425d1de |
| The routing order is: CSR alias, then CTD code (`normalizeCtdCode`), then lifecycle id, then not_indexed. | same file, lines 141-175 at a425d1de |
| `csr-e3-guidance.ts` imports `clip` from `section-brief.ts`. The resolver therefore lives in its own module, and neither renderer imports it. | `server/services/ind/ctd/csr-e3-guidance.ts`; pinned by the test's import-direction assertion |
| The only production caller of the dispatch was `documentSectionRequirements`. The drafting paths (findings 28 and 74) reach the resolver in later steps. | `grep -rn documentSectionRequirements server` |
