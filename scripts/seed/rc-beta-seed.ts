/**
 * RC beta deterministic seed descriptor.
 *
 * This script emits a static seed contract used by RC proof docs and tests.
 */

type ArtifactStatus = 'draft' | 'review';

interface RcArtifact {
  id: string;
  projectId: string;
  title: string;
  status: ArtifactStatus;
  hasProvenanceAccess?: boolean;
}

interface RcSeedCatalog {
  generatedAt: string;
  projects: Array<{ id: string; name: string; type: 'biotech' | 'device' }>;
  artifacts: RcArtifact[];
  anaThreads: Array<{ id: string; projectId: string }>;
  references: Array<{ id: string; projectId: string; state: 'valid' }>;
}

const seed: RcSeedCatalog = {
  generatedAt: '2026-04-01T00:00:00.000Z',
  projects: [
    { id: 'RC-BIO-001', name: 'HelixNova IND Program', type: 'biotech' },
    { id: 'RC-DEV-001', name: 'OrthoFlux 510k Program', type: 'device' },
  ],
  artifacts: [
    {
      id: 'RC-BIO-ART-DR-01',
      projectId: 'RC-BIO-001',
      title: 'IND Executive Summary (Draft)',
      status: 'draft',
      hasProvenanceAccess: true,
    },
    {
      id: 'RC-BIO-ART-RV-01',
      projectId: 'RC-BIO-001',
      title: 'IND Risk Narrative (Review)',
      status: 'review',
    },
    {
      id: 'RC-DEV-ART-RV-01',
      projectId: 'RC-DEV-001',
      title: '510k Substantial Equivalence Narrative (Review)',
      status: 'review',
    },
  ],
  anaThreads: [{ id: 'RC-BIO-THREAD-01', projectId: 'RC-BIO-001' }],
  references: [{ id: 'RC-REF-SET-01', projectId: 'RC-BIO-001', state: 'valid' }],
};

process.stdout.write(`${JSON.stringify(seed, null, 2)}\n`);
