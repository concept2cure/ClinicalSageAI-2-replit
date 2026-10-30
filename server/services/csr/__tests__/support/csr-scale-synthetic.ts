/**
 * SYNTHETIC scale fixture for CSR slice 8 (2026-10-29): a two-arm study of
 * `subjects` invented subjects, with invented adverse events and an invented
 * ADLB dataset large enough that the §16.2 listings run to thousands of pages.
 * EVERY VALUE IS INVENTED and deterministic (no randomness). Tests only.
 */
import { CsrSourceEnvelopeSchema, type CsrSourceEnvelope } from '../../../../../shared/csr-source-input';
import type { AdamDataset, AdamRow } from '../../adam-dataset-reader';

export const SCALE_LABEL = 'SYNTHETIC scale set — invented, not any study or patient';
const SOCS: Array<[string, string[]]> = [
  ['Gastrointestinal disorders', ['Nausea', 'Diarrhoea', 'Abdominal pain', 'Vomiting', 'Constipation']],
  ['Nervous system disorders', ['Headache', 'Dizziness', 'Somnolence']],
  ['General disorders and administration site conditions', ['Fatigue', 'Pyrexia', 'Oedema peripheral']],
  ['Infections and infestations', ['Nasopharyngitis', 'Urinary tract infection', 'Upper respiratory tract infection']],
  ['Skin and subcutaneous tissue disorders', ['Rash', 'Pruritus']],
];
const PARAMS = ['Alanine Aminotransferase (U/L)', 'Aspartate Aminotransferase (U/L)', 'Bilirubin (umol/L)', 'Creatinine (umol/L)',
  'Haemoglobin (g/L)', 'Leukocytes (10^9/L)', 'Platelets (10^9/L)', 'Sodium (mmol/L)', 'Potassium (mmol/L)', 'Glucose (mmol/L)',
  'Albumin (g/L)', 'Alkaline Phosphatase (U/L)'];
const VISITS = ['BASELINE', 'WEEK 2', 'WEEK 4', 'WEEK 8', 'WEEK 12', 'WEEK 16'];
const SEVERITY = ['mild', 'moderate', 'severe'] as const;

export function scaleEnvelope(subjects: number, aesPerSubject = 12): CsrSourceEnvelope {
  const ids = Array.from({ length: subjects }, (_, i) => `SYN-SCALE-${String(i + 1).padStart(5, '0')}`);
  const arm = (i: number) => (i % 2 ? 'PBO' : 'ACT');
  type Status = CsrSourceEnvelope['studyData']['disposition'][number]['status'];
  const status = (i: number): Status => (i % 23 === 0 ? 'discontinued' : i % 97 === 0 ? 'lost-to-followup' : i % 211 === 0 ? 'death' : 'completed');
  const count = (a: string, f: (i: number) => boolean) => ids.filter((_, i) => arm(i) === a && f(i)).length;
  const adverseEvents = ids.flatMap((subjectId, i) => Array.from({ length: aesPerSubject }, (_, k) => {
    const [soc, pts] = SOCS[(i + k) % SOCS.length];
    return { subjectId, armId: arm(i), soc, pt: pts[(i * 7 + k) % pts.length], severity: SEVERITY[(i + k) % 3], serious: (i + k) % 29 === 0,
      related: ((i + k) % 3 === 0 ? 'related' : 'unrelated') as 'related', outcome: (status(i) === 'death' && k === 0 ? 'fatal' : 'recovered') as 'recovered', ledToDiscontinuation: status(i) === 'discontinued' && k === 0 };
  }));
  const envelope = {
    format: 'concept2cure.csr-source.v1', dataCutDate: '2026-06-30',
    studyInfo: { title: SCALE_LABEL, protocolNumber: 'SYN-SCALE', phase: '2/3', indication: 'Synthetic indication', sponsor: 'SYNTHETIC sponsor',
      investigationalProduct: 'SYNTHETIC product', studyDesign: 'Randomized, parallel, placebo-controlled (synthetic)', primaryEndpoint: 'Synthetic endpoint', sampleSize: subjects },
    completeDomains: { disposition: true, demographics: true, efficacy: true, adverseEvents: true },
    participants: ids.map((subjectId, i) => ({ subjectId, armId: arm(i), randomized: true, safety: true, itt: i % 41 !== 0, completed: status(i) === 'completed' })),
    studyData: { studyId: 'SYN-SCALE', protocolNumber: 'SYN-SCALE',
      treatmentArms: ['ACT', 'PBO'].map(a => ({ armId: a, armName: a === 'ACT' ? 'Active (synthetic)' : 'Placebo (synthetic)', randomized: count(a, () => true),
        populations: { safety: count(a, () => true), itt: count(a, i => i % 41 !== 0), completed: count(a, i => status(i) === 'completed') } })),
      disposition: ids.map((subjectId, i) => ({ subjectId, armId: arm(i), status: status(i), ...(status(i) === 'completed' ? {} : { reason: 'SYNTHETIC reason' }) })),
      demographics: ids.map((subjectId, i) => ({ subjectId, armId: arm(i), age: 18 + (i * 13) % 60, sex: (i % 2 ? 'M' : 'F') as 'M', race: 'SYNTHETIC', weight: 50 + (i * 7) % 50 })),
      efficacy: [{ endpointName: 'Synthetic endpoint', endpointType: 'primary' as const, armId: 'ACT', value: 0.5, display: '0.5 (synthetic)' }],
      adverseEvents,
      dispositionCategories: ['completed', 'discontinued', 'lost-to-followup', 'death'] as Status[], dispositionBasis: 'end-of-study' as const },
  };
  return CsrSourceEnvelopeSchema.parse(envelope);
}

/** An ADLB dataset: every parameter at every visit for every subject. */
export function scaleAdlb(envelope: CsrSourceEnvelope): AdamDataset {
  const rows: AdamRow[] = [];
  envelope.participants.forEach((p, i) => {
    PARAMS.forEach((param, k) => VISITS.forEach((visit, v) => rows.push({
      STUDYID: 'SYN-SCALE', USUBJID: p.subjectId, PARAM: param, PARAMCD: `P${k}`, AVISIT: visit, ADT: `2026-0${1 + Math.floor(v / 2)}-${String(5 + (v % 2) * 14).padStart(2, '0')}`,
      ABLFL: v === 0 ? 'Y' : null, AVAL: 10 + ((i + k * 3 + v) % 40), ANRIND: (i + k + v) % 17 === 0 ? 'HIGH' : (i + k + v) % 19 === 0 ? 'LOW' : 'NORMAL',
    })));
  });
  return { name: 'ADLB', format: 'dataset-json', columns: ['STUDYID', 'USUBJID', 'PARAM', 'PARAMCD', 'AVISIT', 'ADT', 'ABLFL', 'AVAL', 'ANRIND'], rows };
}
