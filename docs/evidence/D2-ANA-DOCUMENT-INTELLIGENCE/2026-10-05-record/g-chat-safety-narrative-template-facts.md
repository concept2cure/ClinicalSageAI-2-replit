# g-chat-safety-narrative-template: facts relied on

Step: the chat `safety_narrative` template (`server/services/ana-ri/document-templates.ts`)
follows ICH E3 §12.3.2 (follow-up F2). Checked 2026-10-05.

The template does not hold regulator text of its own. It renders the E3 §12.3.2
node of the E3 tree (`server/services/ind/ctd/csr-e3-sections-results.ts`) through
`renderE3Brief`, so the basis the prompt block shows is that node's basis. The node
carries no `basis` beyond its own E3 citation, so it renders as
"ICH E3 §12.3.2 — ICH E3 (1995) as recalled; verbatim check owed". This step does
not change that label, and no fact here is promoted to `regulator-text`.

| # | Fact | Basis | How checked |
|---|---|---|---|
| 1 | E3 §12.3.2 asks for a brief narrative of each death, each other serious adverse event, and each other significant adverse event judged of special interest. | **recall**, corroborated by search | WebSearch 2026-10-05. The result summary matched this wording. Regulator-hosted copies appeared in the result list (database.ich.org/sites/default/files/E3_Guideline.pdf, www.ema.europa.eu/en/documents/scientific-guideline/ich-e-3-structure-and-content-clinical-study-reports-step-5_en.pdf, www.fda.gov/media/71271/download), but the summary did not tie the wording to one of them, and the documents could not be fetched. So this is not a verbatim check. |
| 2 | Each narrative covers: the nature and intensity of the event; its clinical course, with timing relative to the test drug; relevant laboratory measurements; whether and when the drug was stopped; countermeasures; post-mortem findings; the investigator's opinion on causality; and the sponsor's opinion on causality, if appropriate. | **recall**, corroborated by search | Same search as row 1. This is the source for the elements the old template left out: post-mortem findings, countermeasures and the sponsor's causality opinion. |
| 3 | Each narrative also gives: patient identifier; age and sex; general clinical condition, if appropriate; the disease being treated, with the duration of the current episode (not needed if it is the same for all patients); relevant concomitant and previous illnesses and medications; and details of the test drug dose and duration. | **recall**, corroborated by search | WebSearch 2026-10-05, second query, same regulator copies in the result list. This is the source for "the disease being treated and its duration". |
| 4 | E3 §12.3.2 names no causality scale. "not related / unlikely / possibly / probably / definitely related" is a sponsor or protocol convention, not E3. | **recall**, by inference from rows 2–3 | The §12.3.2 text summarised in rows 1–3 asks for the investigator's and sponsor's *opinions* and names no categories. The causality section now says to state each assessment as recorded, in the categories the protocol defines. |
| 5 | Narratives may sit in the report text or in §14.3.3, depending on their number, and events clearly unrelated to the test drug may be omitted or described very briefly. | **recall**, corroborated by search | Same search as row 1. The node's `presentation` covers the §14.3.3 placement. The omission allowance is not encoded in the node (see below). |

## Differences between the node and the search wording (not changed here: the node is outside this step's files)

- Row 3: E3 qualifies "general clinical condition" with "if appropriate", and does not require the disease being treated when it is the same for all patients. The node states both without the qualifiers.
- Row 5: the node does not record that clearly unrelated events may be omitted or described very briefly.
- `csr-e3-basis.ts` `FDA_E3` cites www.fda.gov/media/84857/download. The search returned www.fda.gov/media/71271/download as FDA's "Structure and Content of Clinical Study Reports". Which URL is FDA's current copy has not been checked.
