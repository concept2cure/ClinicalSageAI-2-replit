/** Held-out source/anchor adversaries: expectations fixed before first execution. */
import { createHash } from 'node:crypto';
import type { CatalogFactAnchor, CatalogFactCandidate } from '@shared/ana/catalog-facts';
import { scientificSourceFactFixtures, type ScientificFixtureExpectation, type ScientificSourceFactFixture } from './scientific-source-facts';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
function derive(id: string, title: string, baseId: string, text: string | null, quote: string | null, expected: ScientificFixtureExpectation, rationale: string, change?: (candidate: CatalogFactCandidate, item: ScientificSourceFactFixture) => void): ScientificSourceFactFixture {
  const original = scientificSourceFactFixtures.find((f) => f.id === baseId);
  if (!original) throw new Error('Held-out control must exist.');
  const item = structuredClone(original);
  item.id = id; item.title = title; item.expected = expected; item.rationale = rationale;
  if (text !== null) {
    item.source.extractedText = text;
    item.source.contentHash = hash(`synthetic-source-bytes:${text}`);
    item.source.extractedTextSha256 = hash(text);
  }
  const candidate = item.candidate as CatalogFactCandidate;
  const exactQuote = quote ?? candidate.origin.valueAnchor.exactQuote;
  const start = (item.source.extractedText ?? '').indexOf(exactQuote);
  if (start < 0) throw new Error('Held-out quote must bind exactly.');
  const a: CatalogFactAnchor = {
    documentId: item.source.documentId, contentHash: item.source.contentHash, extractedTextSha256: item.source.extractedTextSha256,
    range: { start, end: start + exactQuote.length }, exactQuote,
  };
  candidate.origin.valueAnchor = a;
  candidate.origin.witnesses = candidate.origin.witnesses.map((w) => ({ ...w, anchor: structuredClone(a) }));
  change?.(candidate, item);
  return item;
}

const ivd = scientificSourceFactFixtures.find((f) => f.id === 'SF16')!;
const rowA = (ivd.candidate as CatalogFactCandidate).origin.valueAnchor.exactQuote;
const rowB = rowA.replace('Assay: Assay A', 'Assay: Assay B');
const device = scientificSourceFactFixtures.find((f) => f.id === 'SF11')!;
const deviceRow = (device.candidate as CatalogFactCandidate).origin.valueAnchor.exactQuote;
const range = scientificSourceFactFixtures.find((f) => f.id === 'SF30')!;
const rangeRow = (range.candidate as CatalogFactCandidate).origin.valueAnchor.exactQuote;
const analytic = scientificSourceFactFixtures.find((f) => f.id === 'SF26')!;
const analyticRow = (analytic.candidate as CatalogFactCandidate).origin.valueAnchor.exactQuote;
const limit = scientificSourceFactFixtures.find((f) => f.id === 'SF09')!;
const limitRow = (limit.candidate as CatalogFactCandidate).origin.valueAnchor.exactQuote;
const clinical = scientificSourceFactFixtures.find((f) => f.id === 'SF01')!;
const clinicalRow = (clinical.candidate as CatalogFactCandidate).origin.valueAnchor.exactQuote;

export const heldOutScientificSourceFactFixtures: readonly ScientificSourceFactFixture[] = [
  derive('SFH01', 'Repeated equal values still have different assays', 'SF16', `${rowA}\n${rowB}`, rowB, 'context_refused', 'Identical numeric results do not authorize swapping the assay relation.'),
  derive('SFH02', 'Repeated equal values still have different configurations', 'SF11', `${deviceRow}\n${deviceRow.replace('Configuration: Rev A', 'Configuration: Rev B')}`, deviceRow.replace('Configuration: Rev A', 'Configuration: Rev B'), 'context_refused', 'Configuration substitution is forbidden even when results coincide.'),
  derive('SFH03', 'Source software qualifier cannot be silently omitted', 'SF11', null, null, 'not_established', 'The source records software identity; omitting that material field cannot establish full context.', (c) => {
    if (c.meaning.kind !== 'device_test') throw new Error('Wrong held-out control family.');
    delete c.meaning.softwareVersionAsWritten;
    c.origin.witnesses = c.origin.witnesses.filter((w) => w.path !== 'meaning.softwareVersionAsWritten');
  }),
  derive('SFH04', 'Restricted population cannot inherit its broader label', 'SF16', rowA.replace('Population: symptomatic adults', 'Population: symptomatic adults after prior antibiotics'), rowA.replace('Population: symptomatic adults', 'Population: symptomatic adults after prior antibiotics'), 'context_refused', 'Additional population restriction cannot be ignored because the shorter string appears.'),
  derive('SFH05', 'Duplicate assay labels remain ambiguous', 'SF16', rowA.replace('Assay: Assay A;', 'Assay: Assay A; Assay: Assay B;'), rowA.replace('Assay: Assay A;', 'Assay: Assay A; Assay: Assay B;'), 'not_established', 'Duplicate subject fields make the row relationship ambiguous.'),
  derive('SFH06', 'Clipped value anchor cannot borrow remote context', 'SF16', rowA, 'Sensitivity: 95.0 %', 'not_established', 'Witnesses outside the local value anchor cannot manufacture a supported relation.', (c, item) => {
    const a: CatalogFactAnchor = { ...c.origin.valueAnchor, range: { start: 0, end: rowA.length }, exactQuote: rowA };
    c.origin.witnesses = c.origin.witnesses.map((w) => ({ ...w, anchor: structuredClone(a) }));
    if (item.source.extractedText !== rowA) throw new Error('Wrong held-out full source.');
  }),
  derive('SFH07', 'An extra source qualifier cannot be discarded', 'SF16', `${rowA}; Note: results attributed to Assay B`, `${rowA}; Note: results attributed to Assay B`, 'not_established', 'Unadmitted source qualifiers must remain visible instead of being ignored.'),
  derive('SFH08', 'A negative value cannot supply a positive scalar', 'SF11', deviceRow.replace('0.8 mL/min', '-2.0 mL/min'), deviceRow.replace('0.8 mL/min', '-2.0 mL/min'), 'transcription_refused', 'The sign is part of the written value.', (c) => { c.value.asWritten = '2.0'; }),
  derive('SFH09', 'A scientific exponent cannot be clipped', 'SF26', analyticRow.replace('0.2 ng/mL', '2.0e-1 ng/mL'), analyticRow.replace('0.2 ng/mL', '2.0e-1 ng/mL'), 'transcription_refused', '2.0 cannot be copied from 2.0e-1 as an independent result.', (c) => { c.value.asWritten = '2.0'; }),
  derive('SFH10', 'Upper range endpoint cannot supply a scalar', 'SF30', null, rangeRow, 'transcription_refused', 'The upper endpoint is no more an exact result than the lower endpoint.', (c) => { c.value = { kind: 'scalar', asWritten: '20', unitAsWritten: 'um' }; }),
  derive('SFH11', 'Decimal digits cannot bind an integer result', 'SF16', rowA.replace('95.0 %', '950 %'), rowA.replace('95.0 %', '950 %'), 'transcription_refused', '95.0 is absent from the exact source result; no numeric repair is inferred.'),
  derive('SFH12', 'Clipping a bound marker cannot establish a scalar', 'SF09', limitRow, '0.10 %', 'transcription_refused', 'The original source bound marker adjoins this clipped value anchor; source clipping cannot remove it.', (c) => { c.value = { kind: 'scalar', asWritten: '0.10', unitAsWritten: '%' }; c.origin.witnesses = []; }),
  derive('SFH13', 'Clipping a unit cannot establish unit binding', 'SF05', null, '99.20', 'transcription_refused', 'A candidate cannot borrow a unit outside its exact value anchor.'),
  derive('SFH14', 'A witness with a different byte hash refuses', 'SF16', null, null, 'transcription_refused', 'Every witness binds the exact source, not only the value anchor.', (c) => { c.origin.witnesses[0].anchor.contentHash = 'f'.repeat(64); }),
  derive('SFH15', 'Server source object must bind its actual text hash', 'SF16', null, null, 'transcription_refused', 'An inconsistent source hash cannot mint an exact extraction binding.', (_c, item) => { item.source.extractedText = `${item.source.extractedText}\nAdditional source text`; }),
  derive('SFH16', 'Unsupported semantic witness paths refuse', 'SF16', null, null, 'schema_refused', 'Prototype or arbitrary paths are not scientific fields.', (c) => { c.origin.witnesses[0].path = 'meaning.__proto__.assayRef'; }),
  derive('SFH17', 'Earlier scalar occurrence cannot erase the named result bound', 'SF16', rowA.replace('Cutoff: 0.4', 'Cutoff: 0.1').replace('Sensitivity: 95.0 %', 'Sensitivity: <=0.1 %'), rowA.replace('Cutoff: 0.4', 'Cutoff: 0.1').replace('Sensitivity: 95.0 %', 'Sensitivity: <=0.1 %'), 'transcription_refused', 'An unbounded cutoff occurrence cannot supply the scalar form of the separately bounded named result.', (c) => {
    if (c.meaning.kind !== 'ivd_diagnostic') throw new Error('Wrong held-out control family.');
    c.meaning.cutoffAsWritten = '0.1'; c.value = { kind: 'scalar', asWritten: '0.1', unitAsWritten: '%' };
  }),
  derive('SFH18', 'Source instrument cannot be omitted', 'SF16', `${rowA}; Instrument: Reader 2`, `${rowA}; Instrument: Reader 2`, 'not_established', 'A recorded diagnostic instrument restricts the source result and cannot disappear from its context.'),
  derive('SFH19', 'Source reagent version cannot be omitted', 'SF16', `${rowA}; Reagent version: R3`, `${rowA}; Reagent version: R3`, 'not_established', 'A recorded diagnostic reagent version cannot disappear from its context.'),
  derive('SFH20', 'Source analytical lot cannot be omitted', 'SF26', null, null, 'not_established', 'A recorded analytical lot cannot disappear from its context.', (c) => {
    if (c.meaning.kind !== 'ivd_analytical') throw new Error('Wrong held-out control family.');
    delete c.meaning.lotAsWritten; c.origin.witnesses = c.origin.witnesses.filter((w) => w.path !== 'meaning.lotAsWritten');
  }),
  derive('SFH21', 'Source device test condition cannot be omitted', 'SF11', `${deviceRow}; Test condition: 37 C`, `${deviceRow}; Test condition: 37 C`, 'not_established', 'A recorded device test condition cannot disappear from its context.'),
  derive('SFH22', 'Remote clinical frame with equal count cannot supply local study', 'SF01', `${clinicalRow}\n${clinicalRow.replace('DPL-301', 'DPL-302')}`, clinicalRow.replace('DPL-301', 'DPL-302'), 'context_refused', 'The full document has the candidate frame elsewhere, but the exact anchor names another study.'),
  derive('SFH23', 'An earlier cutoff bound cannot erase an exact named result', 'SF16', rowA.replace('Cutoff: 0.4', 'Cutoff: <=0.1').replace('Sensitivity: 95.0 %', 'Sensitivity: 0.1 %'), rowA.replace('Cutoff: 0.4', 'Cutoff: <=0.1').replace('Sensitivity: 95.0 %', 'Sensitivity: 0.1 %'), 'pass', 'The named sensitivity result is exact; an unrelated bound in the contextual cutoff is not its written kind.', (c) => {
    if (c.meaning.kind !== 'ivd_diagnostic') throw new Error('Wrong held-out control family.');
    c.meaning.cutoffAsWritten = '<=0.1'; c.value = { kind: 'scalar', asWritten: '0.1', unitAsWritten: '%' };
  }),
];
