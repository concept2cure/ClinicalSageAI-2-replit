# g-device-chat-cer-per-projection — facts relied on

Checked 2026-10-05.

## No regulatory content is restated by this step

The CER and PER outlines in AnA's chat prompt and in
`GET /api/ind-generation/device-status/{CER,IVDR}/:projectId` are now
projections of the canonical records:

| Projection | Source record | What is projected |
|---|---|---|
| `getDeviceSections('CER')` | `server/services/market-specs/cer-structure.ts` `CER_SECTIONS` | id → code `CER.<id>`, title, required, purpose → guidance, `equivalenceOnly` → "only when equivalence is claimed" |
| `getDeviceSections('IVDR')` | `server/services/market-specs/per-structure.ts` `PER_SECTIONS` | id → code `PER.<id>`, title, required, purpose → guidance |

These records give each section a structure and purpose. They do not give a
basis per section. Basis and applicability per section belong to the later
step g-cer-class-rules. The old `SECTIONS_CER` attached citations to each
section (e.g. "MEDDEV 2.7/1 Rev 4", "EU MDR Annex XIV Part B"). Those citations
were recall and carried no label saying so. They are deleted with the list,
and no citation replaces them here.

## Statements this step authors

1. **The CER is one document of the MDR technical documentation, not the
   whole of it. The PER is one document of the IVDR technical documentation,
   not the whole of it.** The chat block says this so that a 12-section CER
   outline is not presented as "the submission".
   - Basis: **recall** (MDR Annex II §6.1(c); IVDR Annex II §6.2).
   - A WebSearch restricted to eur-lex.europa.eu / health.ec.europa.eu
     returned https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng. Its snippet
     says Annex II §6.1 includes the clinical evaluation documentation.
   - I did not read the regulator text itself (WebFetch to regulator sites is
     blocked), so this stays labelled recall.
2. **The equivalence section applies only when equivalence is claimed.** This
   is the record's own `equivalenceOnly: true` flag on CER_SECTIONS id
   `equivalence` (title "Equivalence (where claimed)"). It is not a new claim.

## Non-regulatory facts

- The retired numeric codes `CER.1`–`CER.8` named different sections from the
  canonical numbering:
  - `CER.4` was "Literature Review"; in CER_SECTIONS, number 4 is "Device
    Under Evaluation".
  - `CER.8` was "PMCF Plan"; in CER_SECTIONS, number 8 is "Analysis of the
    Clinical Data".
- Before this change, the chat prompt advertised those codes. The project
  artifact store (`POST /api/concept2cure/projects/:id/artifacts`) accepts
  whatever `ctdSection` string its caller sends, so artifacts may exist under
  them. I did not check whether any do: this session has no database access.
- `/device-status` matches artifacts by `ctdSection === code`. Projected codes
  are keyed on the record id, so an artifact saved under an old code is not
  read as a drafted section of the new outline. The test pins this.
- `detectSubmissionType` (server/services/ana-ri/orchestrator.ts:168) maps a
  message that mentions "IVDR" to `cer`. An IVDR message with no
  `context.productType` therefore still gets the CER outline. That file is
  outside this step; see needs_elsewhere.
