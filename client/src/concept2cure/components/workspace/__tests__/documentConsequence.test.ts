import { describe, expect, it } from 'vitest';
import { buildDocumentConsequenceRows } from '../documentConsequence';

describe('buildDocumentConsequenceRows', () => {
  it('surfaces compute/proposal/generated rows with governed metadata', () => {
    const rows = buildDocumentConsequenceRows({
      artifacts: [
        {
          id: 'artifact_manual_1',
          title: 'Generated Draft A',
          version: 2,
          status: 'draft',
          ctdSection: 'm2.5',
          templateId: 'template_510k_summary',
          metadata: { provenancePresent: true, auditPresent: true },
        },
      ],
      computeJobs: [
        {
          artifact_id: 'artifact_compute_1',
          artifact_title: 'Compute Memo',
          artifact_version: 1,
          artifact_status: 'draft',
          artifact_ctd_section: 'm3',
          placement_state: 'placed',
          provenance_ref: 'prov_123',
          audit_ref: 'audit_123',
          created_at: new Date().toISOString(),
        },
      ],
      proposals: [
        {
          id: 'proposal_1',
          status: 'accepted',
          governanceState: 'ACCEPTED_GOVERNED',
          artifactId: 'artifact_prop_1',
          artifactVersion: 4,
          artifactStatus: 'review',
          placementState: 'm5',
          provenanceRef: 'prov_222',
          auditRef: 'audit_222',
        },
      ],
      canOpenArtifact: () => true,
    });

    expect(rows.map(r => r.sourceType)).toEqual(
      expect.arrayContaining(['compute', 'proposal_accept', 'generated_draft'])
    );

    const computeRow = rows.find(r => r.artifactId === 'artifact_compute_1');
    expect(computeRow?.provenancePresent).toBe(true);
    expect(computeRow?.auditPresent).toBe(true);

    const proposalRow = rows.find(r => r.artifactId === 'artifact_prop_1');
    expect(proposalRow?.status).toBe('review');
    expect(proposalRow?.openable).toBe(true);
  });

  it('deduplicates rows by artifact id and keeps first occurrence', () => {
    const rows = buildDocumentConsequenceRows({
      artifacts: [{ id: 'artifact_1', title: 'Manual', status: 'draft' }],
      computeJobs: [{ artifact_id: 'artifact_1', created_at: new Date().toISOString() }],
      proposals: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].sourceType).toBe('compute');
  });

  it('does not mislabel manual artifacts as generated consequences', () => {
    const rows = buildDocumentConsequenceRows({
      artifacts: [{ id: 'artifact_manual_only', title: 'Manual Note', status: 'draft' }],
      computeJobs: [],
      proposals: [],
    });

    expect(rows).toHaveLength(0);
  });
});
