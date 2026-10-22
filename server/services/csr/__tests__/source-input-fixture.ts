import type { CsrSourceEnvelope } from '../../../../shared/csr-source-input.js';

/** Synthetic observations for tests only, never a default source/example UI. */
export function sourceFixture(): CsrSourceEnvelope {
  return { format: 'concept2cure.csr-source.v1', dataCutDate: '2026-09-30',
    studyInfo: { title: 'Synthetic trial', protocolNumber: 'SYN-001', phase: '1', indication: 'Synthetic indication', sponsor: 'Synthetic sponsor',
      investigationalProduct: 'Synthetic product', studyDesign: 'Parallel randomized trial', primaryEndpoint: 'Recorded endpoint', sampleSize: 3 },
    completeDomains: { disposition: true, demographics: true, efficacy: true, adverseEvents: true },
    participants: [
      { subjectId: 'synthetic-a', armId: 'A', randomized: true, safety: true, itt: true, completed: true },
      { subjectId: 'synthetic-b', armId: 'A', randomized: true, safety: true, itt: true, completed: false },
      { subjectId: 'synthetic-c', armId: 'B', randomized: true, safety: true, itt: true, completed: true },
    ],
    studyData: { studyId: 'SYN-001', protocolNumber: 'SYN-001',
      treatmentArms: [{ armId: 'A', armName: 'Synthetic treatment', randomized: 2, populations: { safety: 2, itt: 2, completed: 1 } },
        { armId: 'B', armName: 'Synthetic comparator', randomized: 1, populations: { safety: 1, itt: 1, completed: 1 } }],
      disposition: [{ subjectId: 'synthetic-a', armId: 'A', status: 'completed' }, { subjectId: 'synthetic-b', armId: 'A', status: 'discontinued' },
        { subjectId: 'synthetic-c', armId: 'B', status: 'completed' }],
      demographics: [{ subjectId: 'synthetic-a', armId: 'A', age: 30, sex: 'F' }, { subjectId: 'synthetic-b', armId: 'A', age: 40, sex: 'Other' },
        { subjectId: 'synthetic-c', armId: 'B', age: 50, sex: 'M' }],
      efficacy: [{ endpointName: 'Recorded endpoint', endpointType: 'primary', armId: 'A', value: 2.5, display: '2.5 recorded units',
        comparatorArmId: 'B', pValue: 0.031, ci: { lower: 1.5, upper: 3.5, level: '95%' } }],
      adverseEvents: [{ subjectId: 'synthetic-a', armId: 'A', pt: 'Headache', soc: 'Nervous system disorders', severity: 'mild', serious: false, related: 'unknown' },
        { subjectId: 'synthetic-a', armId: 'A', pt: 'Headache', soc: 'Nervous system disorders', severity: 'mild', serious: false, related: 'unknown' }],
    } };
}
