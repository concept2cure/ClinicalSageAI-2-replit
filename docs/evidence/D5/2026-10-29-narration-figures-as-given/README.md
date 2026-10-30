# D5: AnA's narration tools say their figures and facts are as given (2026-10-29)

Session `…01E8btkB`, D5 CSR-path lane. CSR path review
(`docs/design/CSR_PATH_REVIEW_2026-10-29.md`), order of work item 2 (Rule 2):
"`narrate_statistical_result` and `draft_safety_narrative` narrate the figures
their call supplies, under a deterministic-sounding source label. Next: bind
them to a retained run's source, or say in their output that each figure is as
given." The CSR end-to-end lane leaves both tools to this lane (its evidence
READMEs `D2-CSR/2026-10-30-*`, "Boundary").

## What already exists

| Exists | Path | What it does | What it did not do |
|---|---|---|---|
| The statistical narrator | `server/services/ana/statistical-narrator.ts` `narrateStatisticalResult` | Deterministic, hedged ICH E3 wording from a structured result: significance from the interval, exploratory and multiplicity flags | — |
| The safety-narrative composer | `server/services/ana/safety-narrative.ts` `composeSafetyNarrative` | Deterministic ICH E3 patient narrative from case facts, with the missing fields listed | — |
| The two AnA tools | `AnaToolExecutor.ts` handlers, `evidence-literature-tool-defs.ts` definitions | Pass the model's arguments to the composers | Their output said `source: 'AnA Statistical Narrator'` / `'AnA Safety Narrative (ICH E3 §16)'` and nothing about where the figures came from |
| The sourced statistical path | `get_csr_section_evidence` (`csr-section-evidence-tool.ts`) | Reads a section's tables from the retained, release-verified run | — |
| The sourced narrative path | the CSR build's narrative job (`csr/csr-narrative-job.ts`, `narrative-compose.ts`, CSR slice 7 `3b576cab9`) | The same composer, run over the study's ADaM rows, every fact reconciled | Its control is on the CSR workflow board, which production does not serve (CSR end-to-end lane, handed on) |
| The binding before approval | `server/services/authoring/csr-scientific-review.ts` (`07857e3e3`) | Refuses to approve a CSR without a reviewer's map of its figures onto retained table cells, and checks each mapped figure against its cell | That every figure is mapped is the reviewer's attestation (`allQuantitativeResultsMapped`); the server does not find unmapped digits itself |
| The trust class | `tool-pedigree.ts` | Classes `narrate_`/`draft_` tools `model_assisted` (requires verification), by name | Not in the tool's own output |
| The two writing tools | `record_endpoint_result`, `log_study_ae` | Already need a person's yes before they write (register class `confirm`) | — |

So the binding exists where it governs (approval). What was missing is the
tools telling AnA, and through AnA the writer, that the figures are the
call's. No second binding was built.

## What changed

- **`narrate_statistical_result`** output:
  - `source: 'AnA Statistical Narrator (wording only)'`;
  - `figureSource: 'as-given'`;
  - `figureSourceNote`: "Every figure here is as given in this call. None was
    read from a retained analysis run. For a CSR, read each figure from the
    retained run with get_csr_section_evidence. Before a CSR can be approved,
    a reviewer maps each reported figure to its retained table cell in the
    scientific review, and the server checks every mapped figure against that
    cell."
- **`draft_safety_narrative`** output:
  - `source: 'AnA Safety Narrative (ICH E3 §16; wording only)'`;
  - `factSource: 'as-given'`;
  - `factSourceNote`: "Every fact here is as given in this call. None was read
    from the study's ADaM data. A CSR's patient narratives are composed from
    the ADaM data by the CSR build's narrative job, which sources every fact."
- **Both descriptions** say the same, so AnA knows it before it calls either
  tool. The two entries in `docs/ana-capability-manifest.json` carry the new
  descriptions. The manifest was not regenerated, which would have pulled in
  other lanes' drift.
- The composers are unchanged. The CSR narrative job uses
  `composeSafetyNarrative` too, and its sourced output is untouched.

## Evidence: seen failing first

| Check | Red (`red.txt`, the committed code) | Green (`green.txt`) |
|---|---|---|
| `narration-tools-figures-as-given.test.ts` (new): `narrate_statistical_result` says every figure is as given and names `get_csr_section_evidence` | fails: no `figureSource` | passes |
| `draft_safety_narrative` says every fact is as given and names the narrative job | fails: no `factSource` | passes |
| Both descriptions say so | fails | passes |
| A refusal is unchanged (control) | passes | passes |
| Every AnA suite (451 files) | — | 7,235 passed, 3 failed. All 3 fail identically on the committed code: the 16-heading CSR outline, the 1,024-character trim of `get_document_template`'s description, the notification category enum |
| Authoring, CSR and the tool-registry importers (125 files) | — | 2,065 passed, 1 failed (`cross-sector-builtin-authoring-templates`, red on the committed code) |

The two new descriptions are 626 and 614 characters, under the 1,024-character
trim that OpenAI-compatible providers apply.

## Not done

- Reconciling a narrated figure against a retained cell inside the tool. The
  scientific review does that before approval, for each figure the reviewer
  maps.
- A server-side check that every figure in a saved CSR is mapped (today that
  is the reviewer's attestation). This is the CSR end-to-end lane's slice 5,
  "a saved CSR gets a real number-to-source verdict".
- The narrative job's screen reach in production (the board), which belongs to
  the CSR end-to-end lane.

## Disclosed (files another lane changed in the last 24 hours)

- `server/services/ana/AnaToolExecutor.ts`: changed today by several lanes,
  among them `d965572b5`, `7f5a68c14`, `f09dc11dd`, `1e63f5a59` and
  `e2ac57f44`. Only the two handlers here changed: two constants and two
  return values.
- `server/services/ana/evidence-literature-tool-defs.ts`: CSR lane
  (`f09dc11dd`, `a2a91a87d`). Two descriptions, each extended by one or two
  sentences.
- `docs/ana-capability-manifest.json`: regenerated today (`6b70fd0a4`). The
  same two descriptions changed; nothing else.
