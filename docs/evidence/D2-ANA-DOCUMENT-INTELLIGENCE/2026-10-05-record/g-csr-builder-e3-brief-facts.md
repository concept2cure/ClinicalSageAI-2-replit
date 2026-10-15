# g-csr-builder-e3-brief: regulatory facts relied on (2026-10-05)

This change adds no regulatory content. The E3 text each CSR draft now gets is
rendered by the existing record: `server/services/ind/ctd/requirements-resolver.ts`
→ `renderE3Brief` in `csr-e3-guidance.ts`. That record already labels each
heading's basis, mostly "ICH E3 (1995) as recalled; verbatim check owed". The
facts below decided **routing** only: which E3 heading briefs which builder
section.

| # | Fact | Basis | Source / checked | Used for |
|---|---|---|---|---|
| 1 | ICH E3 governs the structure and content of a clinical study report. | Regulator-hosted URL. The content comes from a search summary; the PDF was not read in full because regulator hosts are blocked for WebFetch. | ICH, *Structure and Content of Clinical Study Reports E3*: https://database.ich.org/sites/default/files/E3_Guideline.pdf. EMA Step 5 copy: https://www.ema.europa.eu/en/documents/scientific-guideline/ich-e-3-structure-and-content-clinical-study-reports-step-5_en.pdf. Checked 2026-10-05. | Every CSR section is briefed from the platform's E3 record, not from the model's memory. |
| 2 | E3 §2 is a brief synopsis, usually no more than 3 pages. Annex I gives an example format for it. E3 does not number sub-headings under §2. | The first part is from a search summary of the regulator-hosted E3 text (row 1) and the ICH E3 Q&A (R1) (https://database.ich.org/sites/default/files/E3_Q&As_R1_Q&As.pdf), checked 2026-10-05. "Does not number sub-headings" is recall; the PDF was not read. It agrees with the record, which has no §2.x entry (`resolveRequirements({document:'csr', section:'2.1'})` returns not_indexed). | Rows 1–2 | The builder's §2.1–§2.10 are its own decomposition. They are briefed with E3 §2 and told that E3 does not number them. |
| 3 | E3 §8 (Study Objectives) has no numbered sub-headings. | Recall. It agrees with the record, which has no §8.x entry. The builder's own comment says the same (`csr-builder.ts` above `ICH_E3_STRUCTURE`). | — | The builder's §8.1 and §8.2 are briefed with E3 §8. |
| 4 | E3 is a guideline, not a rigid template (E3 Q&A (R1)). | Regulator-hosted URL, from a search summary, as in row 2. | Same as row 2. | No effect on the code. It is why a parent brief is sent with the instruction "draft only the part this section's title and description cover", not as a list of headings the section must reproduce. |

## Not done here (owed elsewhere)

- Verbatim checks of each E3 heading's content against the ICH PDF are owed to the E3 record (`csr-e3-basis.ts`), not to this step.
- The other drafting paths of finding 74 are not in this step:
  - `AnaDocumentDraftingService` (g-batch-draft-canonical);
  - `ana-ri/artifact-generator.ts`.
