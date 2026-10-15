# g-document-outline-types — facts relied on (2026-10-05)

Step: one outline node type and one outline renderer (R13.0,
docs/design/ANA_REGULATORY_RECORD.md §5 "Types" and §11 R13).

## Regulatory facts

**None.** This step adds types and a renderer. It encodes no regulator heading,
number, title or requirement. Every regulatory statement the renderer outputs
comes from the `DocumentOutline` it is given, and each one is labelled through
`basisLabel` (shared/regulatory/regulatory-basis.ts). Recall and platform
convention are never shown as checked regulator text.

The test data is invented for the test and is not a regulatory record:

| Test datum | What it is | Basis |
|---|---|---|
| "Fixture Guideline FG-1 (2026)", `https://www.fda.gov/fixture-guideline` | An invented regulator-text basis. It has to be well formed so that `basisLabel` renders it as checked, which the test compares against. It points to no real document. | none: fixture |
| "Fixture Q&A FG-1 Q7" | An invented recall basis | none: fixture |
| Fixture headings 1, 2, 2.1, 2.2, 3 | Invented | none: fixture |
| `governing: [{ ref: 'ICH E3 (1995)', confidence: 'recall' }]` in the E3 round-trip test | Only a label, so that the existing E3 tree can be rendered through the generic renderer. It makes no claim beyond what csr-e3-basis.ts already makes. | recall, labelled as recall |
| `orphan_designation` | An existing `M1ConditionId` (shared/regulatory/regional-module1.ts), used as the condition of a fixture node | repository type |

## Code facts (read 2026-10-05, HEAD 46dd613f)

- `E3Section` (server/services/ind/ctd/types.ts) required `number: string`. Its
  consumers in csr-e3-guidance.ts (`BY_NUMBER`, `e3ParentNumber(s.number)`,
  `e3PlaceholderToken`) need it as a string. So
  `E3Section = OutlineNode<E3Applicability> & { number: string }`. That is the
  design's `OutlineNode<E3Applicability>`, with E3's numbering kept required. No
  E3 consumer sees a wider type.
- `E3Applicability` was the literal union `'always' | 'when-applicable' | 'authority-dependent'`.
  It is now `Exclude<Necessity, 'conditional'>`, which is the same set
  (`Necessity` is declared in shared/regulatory/regional-module1.ts).
- section-brief.ts must not import csr-e3-guidance.ts, because csr-e3-guidance
  imports `clip` from section-brief and the import would form a cycle
  (requirements-resolver.ts:31 records this). The new renderer imports only
  `basisLabel` and types.
- `EstarFamily` is new and is narrower than the existing
  `EstarTemplateFamily = 'nivd' | 'ivd' | 'prestar'`
  (server/services/pathway-engines/estar/estar-versions.ts:41). The two types
  have different jobs: one says which template family a version belongs to,
  the other is the namespace of a dossier ToC token. Neither replaces the
  other, so this is not a duplicate. The R14 device-ToC step decides whether
  to derive one from the other.
