/* global structuredClone: readonly */
/** Held-out source/anchor adversaries: expectations fixed before first execution. */
import { createHash } from 'node:crypto';
import type { CatalogFactAnchor, CatalogFactCandidate } from '@shared/ana/catalog-facts';
import { scientificSourceFactFixtures, type ScientificFixtureExpectation, type ScientificSourceFactFixture } from './scientific-source-facts';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
interface HeldOutFixtureInput {
  id: string; title: string; baseId: string; text: string | null; quote: string | null;
  expected: ScientificFixtureExpectation; rationale: string;
  change?: (candidate: CatalogFactCandidate, item: ScientificSourceFactFixture) => void;
}
function derive({ id, title, baseId, text, quote, expected, rationale, change }: HeldOutFixtureInput): ScientificSourceFactFixture {
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
  derive({ id: 'SFH01', title: 'Repeated equal values still have different assays', baseId: 'SF16', text: `${rowA}\n${rowB}`, quote: rowB, expected: 'context_refused', rationale: 'Identical numeric results do not authorize swapping the assay relation.' }),
  derive({ id: 'SFH02', title: 'Repeated equal values still have different configurations', baseId: 'SF11', text: `${deviceRow}\n${deviceRow.replace('Configuration: Rev A', 'Configuration: Rev B')}`, quote: deviceRow.replace('Configuration: Rev A', 'Configuration: Rev B'), expected: 'context_refused', rationale: 'Configuration substitution is forbidden even when results coincide.' }),
  derive({ id: 'SFH03', title: 'Source software qualifier cannot be silently omitted', baseId: 'SF11', text: null, quote: null, expected: 'not_established', rationale: 'The source records software identity; omitting that material field cannot establish full context.', change: (c) => {
    if (c.meaning.kind !== 'device_test') throw new Error('Wrong held-out control family.');
    delete c.meaning.softwareVersionAsWritten;
    c.origin.witnesses = c.origin.witnesses.filter((w) => w.path !== 'meaning.softwareVersionAsWritten');
  } }),
  derive({ id: 'SFH04', title: 'Restricted population cannot inherit its broader label', baseId: 'SF16', text: rowA.replace('Population: symptomatic adults', 'Population: symptomatic adults after prior antibiotics'), quote: rowA.replace('Population: symptomatic adults', 'Population: symptomatic adults after prior antibiotics'), expected: 'context_refused', rationale: 'Additional population restriction cannot be ignored because the shorter string appears.' }),
  derive({ id: 'SFH05', title: 'Duplicate assay labels remain ambiguous', baseId: 'SF16', text: rowA.replace('Assay: Assay A;', 'Assay: Assay A; Assay: Assay B;'), quote: rowA.replace('Assay: Assay A;', 'Assay: Assay A; Assay: Assay B;'), expected: 'not_established', rationale: 'Duplicate subject fields make the row relationship ambiguous.' }),
  derive({ id: 'SFH06', title: 'Clipped value anchor cannot borrow remote context', baseId: 'SF16', text: rowA, quote: 'Sensitivity: 95.0 %', expected: 'not_established', rationale: 'Witnesses outside the local value anchor cannot manufacture a supported relation.', change: (c, item) => {
    const a: CatalogFactAnchor = { ...c.origin.valueAnchor, range: { start: 0, end: rowA.length }, exactQuote: rowA };
    c.origin.witnesses = c.origin.witnesses.map((w) => ({ ...w, anchor: structuredClone(a) }));
    if (item.source.extractedText !== rowA) throw new Error('Wrong held-out full source.');
  } }),
  derive({ id: 'SFH07', title: 'An extra source qualifier cannot be discarded', baseId: 'SF16', text: `${rowA}; Note: results attributed to Assay B`, quote: `${rowA}; Note: results attributed to Assay B`, expected: 'not_established', rationale: 'Unadmitted source qualifiers must remain visible instead of being ignored.' }),
  derive({ id: 'SFH08', title: 'A negative value cannot supply a positive scalar', baseId: 'SF11', text: deviceRow.replace('0.8 mL/min', '-2.0 mL/min'), quote: deviceRow.replace('0.8 mL/min', '-2.0 mL/min'), expected: 'transcription_refused', rationale: 'The sign is part of the written value.', change: (c) => { c.value.asWritten = '2.0'; } }),
  derive({ id: 'SFH09', title: 'A scientific exponent cannot be clipped', baseId: 'SF26', text: analyticRow.replace('0.2 ng/mL', '2.0e-1 ng/mL'), quote: analyticRow.replace('0.2 ng/mL', '2.0e-1 ng/mL'), expected: 'transcription_refused', rationale: '2.0 cannot be copied from 2.0e-1 as an independent result.', change: (c) => { c.value.asWritten = '2.0'; } }),
  derive({ id: 'SFH10', title: 'Upper range endpoint cannot supply a scalar', baseId: 'SF30', text: null, quote: rangeRow, expected: 'transcription_refused', rationale: 'The upper endpoint is no more an exact result than the lower endpoint.', change: (c) => { c.value = { kind: 'scalar', asWritten: '20', unitAsWritten: 'um' }; } }),
  derive({ id: 'SFH11', title: 'Decimal digits cannot bind an integer result', baseId: 'SF16', text: rowA.replace('95.0 %', '950 %'), quote: rowA.replace('95.0 %', '950 %'), expected: 'transcription_refused', rationale: '95.0 is absent from the exact source result; no numeric repair is inferred.' }),
  derive({ id: 'SFH12', title: 'Clipping a bound marker cannot establish a scalar', baseId: 'SF09', text: limitRow, quote: '0.10 %', expected: 'transcription_refused', rationale: 'The original source bound marker adjoins this clipped value anchor; source clipping cannot remove it.', change: (c) => { c.value = { kind: 'scalar', asWritten: '0.10', unitAsWritten: '%' }; c.origin.witnesses = []; } }),
  derive({ id: 'SFH13', title: 'Clipping a unit cannot establish unit binding', baseId: 'SF05', text: null, quote: '99.20', expected: 'transcription_refused', rationale: 'A candidate cannot borrow a unit outside its exact value anchor.' }),
  derive({ id: 'SFH14', title: 'A witness with a different byte hash refuses', baseId: 'SF16', text: null, quote: null, expected: 'transcription_refused', rationale: 'Every witness binds the exact source, not only the value anchor.', change: (c) => { c.origin.witnesses[0].anchor.contentHash = 'f'.repeat(64); } }),
  derive({ id: 'SFH15', title: 'Server source object must bind its actual text hash', baseId: 'SF16', text: null, quote: null, expected: 'transcription_refused', rationale: 'An inconsistent source hash cannot mint an exact extraction binding.', change: (_c, item) => { item.source.extractedText = `${item.source.extractedText}\nAdditional source text`; } }),
  derive({ id: 'SFH16', title: 'Unsupported semantic witness paths refuse', baseId: 'SF16', text: null, quote: null, expected: 'schema_refused', rationale: 'Prototype or arbitrary paths are not scientific fields.', change: (c) => { c.origin.witnesses[0].path = 'meaning.__proto__.assayRef'; } }),
  derive({ id: 'SFH17', title: 'Earlier scalar occurrence cannot erase the named result bound', baseId: 'SF16', text: rowA.replace('Cutoff: 0.4', 'Cutoff: 0.1').replace('Sensitivity: 95.0 %', 'Sensitivity: <=0.1 %'), quote: rowA.replace('Cutoff: 0.4', 'Cutoff: 0.1').replace('Sensitivity: 95.0 %', 'Sensitivity: <=0.1 %'), expected: 'transcription_refused', rationale: 'An unbounded cutoff occurrence cannot supply the scalar form of the separately bounded named result.', change: (c) => {
    if (c.meaning.kind !== 'ivd_diagnostic') throw new Error('Wrong held-out control family.');
    c.meaning.cutoffAsWritten = '0.1'; c.value = { kind: 'scalar', asWritten: '0.1', unitAsWritten: '%' };
  } }),
  derive({ id: 'SFH18', title: 'Source instrument cannot be omitted', baseId: 'SF16', text: `${rowA}; Instrument: Reader 2`, quote: `${rowA}; Instrument: Reader 2`, expected: 'not_established', rationale: 'A recorded diagnostic instrument restricts the source result and cannot disappear from its context.' }),
  derive({ id: 'SFH19', title: 'Source reagent version cannot be omitted', baseId: 'SF16', text: `${rowA}; Reagent version: R3`, quote: `${rowA}; Reagent version: R3`, expected: 'not_established', rationale: 'A recorded diagnostic reagent version cannot disappear from its context.' }),
  derive({ id: 'SFH20', title: 'Source analytical lot cannot be omitted', baseId: 'SF26', text: null, quote: null, expected: 'not_established', rationale: 'A recorded analytical lot cannot disappear from its context.', change: (c) => {
    if (c.meaning.kind !== 'ivd_analytical') throw new Error('Wrong held-out control family.');
    delete c.meaning.lotAsWritten; c.origin.witnesses = c.origin.witnesses.filter((w) => w.path !== 'meaning.lotAsWritten');
  } }),
  derive({ id: 'SFH21', title: 'Source device test condition cannot be omitted', baseId: 'SF11', text: `${deviceRow}; Test condition: 37 C`, quote: `${deviceRow}; Test condition: 37 C`, expected: 'not_established', rationale: 'A recorded device test condition cannot disappear from its context.' }),
  derive({ id: 'SFH22', title: 'Remote clinical frame with equal count cannot supply local study', baseId: 'SF01', text: `${clinicalRow}\n${clinicalRow.replace('DPL-301', 'DPL-302')}`, quote: clinicalRow.replace('DPL-301', 'DPL-302'), expected: 'context_refused', rationale: 'The full document has the candidate frame elsewhere, but the exact anchor names another study.' }),
  derive({ id: 'SFH23', title: 'An earlier cutoff bound cannot erase an exact named result', baseId: 'SF16', text: rowA.replace('Cutoff: 0.4', 'Cutoff: <=0.1').replace('Sensitivity: 95.0 %', 'Sensitivity: 0.1 %'), quote: rowA.replace('Cutoff: 0.4', 'Cutoff: <=0.1').replace('Sensitivity: 95.0 %', 'Sensitivity: 0.1 %'), expected: 'pass', rationale: 'The named sensitivity result is exact; an unrelated bound in the contextual cutoff is not its written kind.', change: (c) => {
    if (c.meaning.kind !== 'ivd_diagnostic') throw new Error('Wrong held-out control family.');
    c.meaning.cutoffAsWritten = '<=0.1'; c.value = { kind: 'scalar', asWritten: '0.1', unitAsWritten: '%' };
  } }),
];
