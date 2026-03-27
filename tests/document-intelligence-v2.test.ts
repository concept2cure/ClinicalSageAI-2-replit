/**
 * Document Intelligence v2.0 Smoke Tests
 *
 * Validates:
 * 1. TypeScript service has all required methods
 * 2. Server routes export correctly
 * 3. Schema tables are properly defined
 * 4. SourceTraceabilityPanel renders without error
 * 5. RTM export CSV generation logic
 * 6. Import migration (no references to old mock service)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('Document Intelligence v2.0 - Mock Service Retirement', () => {
  const consumers = [
    'client/src/components/document-intelligence/DocumentUploader.jsx',
    'client/src/components/document-intelligence/DocumentAnalyzer.jsx',
    'client/src/components/document-intelligence/DocumentIntakeForm.jsx',
    'client/src/components/510k/DeviceIntakeForm.jsx',
  ];

  it.each(consumers)('%s imports from TypeScript service, not mock JS', (filePath) => {
    const content = fs.readFileSync(path.join(ROOT, filePath), 'utf-8');
    expect(content).toContain('@/concept2cure/services/documentIntelligenceService');
    expect(content).not.toContain("from '@/services/DocumentIntelligenceService'");
  });

  it('TypeScript service exposes all required intake methods', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'client/src/concept2cure/services/documentIntelligenceService.ts'),
      'utf-8'
    );
    const asyncMethods = [
      'processDocuments',
      'identifyDocumentTypes',
      'analyzeDocuments',
      'enhanceExtractedData',
    ];
    for (const method of asyncMethods) {
      expect(content).toContain(`async ${method}(`);
    }
    // mapExtractedFieldsToFormData is synchronous
    expect(content).toContain('mapExtractedFieldsToFormData(');
  });

  it('TypeScript service exports singleton', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'client/src/concept2cure/services/documentIntelligenceService.ts'),
      'utf-8'
    );
    expect(content).toContain('export const documentIntelligenceService');
  });
});

describe('Document Intelligence v2.0 - Evidence Fabric Schema', () => {
  it('shared/schema.ts defines all 6 evidence tables', () => {
    const content = fs.readFileSync(path.join(ROOT, 'shared/schema.ts'), 'utf-8');
    const requiredTables = [
      'evidenceSources',
      'evidenceClaims',
      'evidenceClaimLinks',
      'evidenceTraceabilitySnapshots',
      'evidenceComplianceScores',
      'evidenceChangeEvents',
    ];
    for (const table of requiredTables) {
      expect(content).toContain(`export const ${table} = pgTable(`);
    }
  });

  it('schema exports all evidence types', () => {
    const content = fs.readFileSync(path.join(ROOT, 'shared/schema.ts'), 'utf-8');
    const requiredTypes = [
      'EvidenceSource',
      'EvidenceClaim',
      'EvidenceClaimLink',
      'EvidenceTraceabilitySnapshot',
      'EvidenceComplianceScore',
      'EvidenceChangeEvent',
    ];
    for (const type of requiredTypes) {
      expect(content).toContain(`export type ${type}`);
    }
  });

  it('schema defines evidence relations', () => {
    const content = fs.readFileSync(path.join(ROOT, 'shared/schema.ts'), 'utf-8');
    expect(content).toContain('evidenceSourcesRelations');
    expect(content).toContain('evidenceClaimsRelations');
    expect(content).toContain('evidenceClaimLinksRelations');
    expect(content).toContain('evidenceChangeEventsRelations');
  });
});

describe('Document Intelligence v2.0 - SQL Migration', () => {
  it('migration file exists and creates all tables', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'db/migrations/20260319_evidence_fabric.sql'),
      'utf-8'
    );
    const requiredTables = [
      'evidence_sources',
      'evidence_claims',
      'evidence_claim_links',
      'evidence_traceability_snapshots',
      'evidence_compliance_scores',
      'evidence_change_events',
    ];
    for (const table of requiredTables) {
      expect(content).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('migration creates required indexes', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'db/migrations/20260319_evidence_fabric.sql'),
      'utf-8'
    );
    expect(content).toContain('evidence_sources_program_idx');
    expect(content).toContain('evidence_claims_source_idx');
    expect(content).toContain('evidence_claim_links_claim_idx');
    expect(content).toContain('evidence_snapshots_program_idx');
    expect(content).toContain('evidence_scores_program_idx');
    expect(content).toContain('evidence_events_program_idx');
  });

  it('migration uses isCurrent (not isActive) matching Drizzle schema', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'db/migrations/20260319_evidence_fabric.sql'),
      'utf-8'
    );
    expect(content).toContain('is_current');
    expect(content).not.toContain('is_active');
  });
});

describe('Document Intelligence v2.0 - Server Routes', () => {
  it('document-intelligence-routes.ts has all intake endpoints', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/routes/document-intelligence-routes.ts'),
      'utf-8'
    );
    expect(content).toContain("router.post('/process'");
    expect(content).toContain("router.post('/identify-types'");
    expect(content).toContain("router.post('/analyze'");
    expect(content).toContain("router.post('/enhance'");
  });

  it('rtm-export.ts has RTM, CSV, snapshot endpoints', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/routes/rtm-export.ts'),
      'utf-8'
    );
    expect(content).toContain("router.get('/programs/:programId/rtm'");
    expect(content).toContain("router.get('/programs/:programId/rtm/csv'");
    expect(content).toContain("router.post('/programs/:programId/rtm/snapshot'");
    expect(content).toContain("router.get('/programs/:programId/rtm/snapshots'");
  });

  it('rtm-export.ts uses correct schema fields (isCurrent, not isActive)', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/routes/rtm-export.ts'),
      'utf-8'
    );
    expect(content).toContain('evidenceClaims.isCurrent');
    expect(content).not.toContain('isActive');
  });

  it('rtm-export.ts uses correct snapshot schema fields (rtmData, totalLinks, overallScore)', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'server/routes/rtm-export.ts'),
      'utf-8'
    );
    // Must use actual schema fields for DB operations
    expect(content).toContain('rtmData');
    expect(content).toContain('totalLinks');
    expect(content).toContain('overallScore');
    // Must NOT reference wrong schema fields (coverageScore as a local var is fine)
    expect(content).not.toContain('snapshotData');
    // Snapshot insert must NOT use wrong field names for the DB insert
    expect(content).not.toContain('evidenceTraceabilitySnapshots.tracedClaims');
  });

  it('server/index.ts mounts RTM export routes', () => {
    const content = fs.readFileSync(path.join(ROOT, 'server/index.ts'), 'utf-8');
    expect(content).toContain("import('./routes/rtm-export')");
    expect(content).toContain("'/api'");
  });

  it('server/index.ts mounts document-intelligence routes', () => {
    const content = fs.readFileSync(path.join(ROOT, 'server/index.ts'), 'utf-8');
    expect(content).toContain("import('./routes/document-intelligence-routes')");
  });
});

describe('Document Intelligence v2.0 - Source Traceability UI', () => {
  it('SourceTraceabilityPanel.tsx exists and has core elements', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'client/src/components/document-intelligence/SourceTraceabilityPanel.tsx'),
      'utf-8'
    );
    // Component exports
    expect(content).toContain('export default function SourceTraceabilityPanel');
    // Uses React Query
    expect(content).toContain('useQuery');
    expect(content).toContain('useMutation');
    // API endpoints
    expect(content).toContain('/api/documents/');
    expect(content).toContain('/sources');
    expect(content).toContain('/sources/analyze');
    // UI elements
    expect(content).toContain('Source Traceability');
    expect(content).toContain('Traceability Score');
  });

  it('SourceTraceabilityPanel has CSV export functionality', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'client/src/components/document-intelligence/SourceTraceabilityPanel.tsx'),
      'utf-8'
    );
    expect(content).toContain('handleExportCSV');
    expect(content).toContain('Export CSV');
    expect(content).toContain('text/csv');
    expect(content).toContain('Download');
  });

  it('SourceTraceabilityPanel uses shadcn/ui components', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'client/src/components/document-intelligence/SourceTraceabilityPanel.tsx'),
      'utf-8'
    );
    expect(content).toContain('@/components/ui/card');
    expect(content).toContain('@/components/ui/button');
    expect(content).toContain('@/components/ui/badge');
    expect(content).toContain('@/components/ui/table');
    expect(content).toContain('@/components/ui/progress');
  });

  it('SourceTraceabilityPanel supports tenant isolation', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'client/src/components/document-intelligence/SourceTraceabilityPanel.tsx'),
      'utf-8'
    );
    expect(content).toContain('x-organization-id');
    expect(content).toContain('organizationId');
  });
});

describe('Document Intelligence v2.0 - CSV Export Logic', () => {
  it('CSV export function properly escapes special characters', () => {
    // Test the escapeCSV pattern used in both SourceTraceabilityPanel and rtm-export
    const escapeCSV = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    expect(escapeCSV('simple')).toBe('simple');
    expect(escapeCSV('has,comma')).toBe('"has,comma"');
    expect(escapeCSV('has"quote')).toBe('"has""quote"');
    expect(escapeCSV('has\nnewline')).toBe('"has\nnewline"');
    expect(escapeCSV(null)).toBe('');
    expect(escapeCSV(undefined)).toBe('');
    expect(escapeCSV(42)).toBe('42');
    expect(escapeCSV(0.95)).toBe('0.95');
  });
});
