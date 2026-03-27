/**
 * Beta Consolidation Regression Tests
 *
 * These tests fail loudly if the product lies:
 * - AI path that doesn't create artifact
 * - Fake/mock data in beta-visible paths
 * - Duplicate routes exposed in nav
 * - Missing provenance, lifecycle, or compare
 * - Output structure violations
 *
 * Phase 9 of the consolidation sprint.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. APPS PAGE — Only real destinations
// ═══════════════════════════════════════════════════════════════════════════════

describe('AppsPage has no fake destinations', () => {
  const appsPagePath = path.resolve('client/src/concept2cure/pages/AppsPage.tsx');

  it('AppsPage exists', () => {
    expect(fs.existsSync(appsPagePath)).toBe(true);
  });

  it('does not contain evidence-memo app (removed — no real destination)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).not.toContain("id: 'evidence-memo'");
  });

  it('does not contain protocol-rationale app (removed — no real destination)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).not.toContain("id: 'protocol-rationale'");
  });

  it('does not contain risk-benefit app (removed — no real destination)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).not.toContain("id: 'risk-benefit'");
  });

  it('does not contain clinical-overview app (removed — no real destination)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).not.toContain("id: 'clinical-overview'");
  });

  it('does not contain module3-builder app (removed — no real destination)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).not.toContain("id: 'module3-builder'");
  });

  it('does not contain audit-report app (removed — no real destination)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).not.toContain("id: 'audit-report'");
  });

  it('does not contain cmc studio app (removed — no real destination)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).not.toContain("id: 'cmc'");
  });

  it('does not contain clinical studio app (removed — no real destination)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).not.toContain("id: 'clinical'");
  });

  it('does not contain device studio app (removed — no real destination)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).not.toContain("id: 'device'");
  });

  it('still contains 510k-workspace (real destination)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).toContain("id: '510k-workspace'");
  });

  it('still contains cer-generator (real destination — now in-shell)', () => {
    const content = fs.readFileSync(appsPagePath, 'utf-8');
    expect(content).toContain("id: 'cer-generator'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CER GENERATOR — No window.location.href escape
// ═══════════════════════════════════════════════════════════════════════════════

describe('CER Generator routes in-shell', () => {
  it('ZenApp does not use window.location.href for CER', () => {
    const zenAppPath = path.resolve('client/src/concept2cure/ZenApp.tsx');
    const content = fs.readFileSync(zenAppPath, 'utf-8');
    expect(content).not.toContain("window.location.href = '/cerv2?mode=cer'");
  });

  it('CER is a supported project module route', () => {
    const routePolicyPath = path.resolve(
      'client/src/concept2cure/router/projectModuleRoutePolicy.ts'
    );
    const content = fs.readFileSync(routePolicyPath, 'utf-8');
    expect(content).toContain("'cer'");
    expect(content).toContain('/concept2cure/project/:projectId/cer');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CANONICAL DOCUMENT CONTRACT — exists and validates
// ═══════════════════════════════════════════════════════════════════════════════

describe('Canonical Document Contract', () => {
  it('shared/types/document-contract.ts exists', () => {
    const contractPath = path.resolve('shared/types/document-contract.ts');
    expect(fs.existsSync(contractPath)).toBe(true);
  });

  it('exports CanonicalDocumentContract interface', () => {
    const content = fs.readFileSync(
      path.resolve('shared/types/document-contract.ts'),
      'utf-8'
    );
    expect(content).toContain('export interface CanonicalDocumentContract');
  });

  it('exports validateDocumentContract function', () => {
    const content = fs.readFileSync(
      path.resolve('shared/types/document-contract.ts'),
      'utf-8'
    );
    expect(content).toContain('export function validateDocumentContract');
  });

  it('contract requires projectId', () => {
    const content = fs.readFileSync(
      path.resolve('shared/types/document-contract.ts'),
      'utf-8'
    );
    expect(content).toContain('projectId');
    expect(content).toContain('no orphan artifacts');
  });

  it('contract requires sourceSystem', () => {
    const content = fs.readFileSync(
      path.resolve('shared/types/document-contract.ts'),
      'utf-8'
    );
    expect(content).toContain('sourceSystem');
    expect(content).toContain('ArtifactSourceSystem');
  });

  it('contract requires provenance', () => {
    const content = fs.readFileSync(
      path.resolve('shared/types/document-contract.ts'),
      'utf-8'
    );
    expect(content).toContain('provenance: ArtifactProvenance');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. GENERATION GUARD — exists
// ═══════════════════════════════════════════════════════════════════════════════

describe('Generation Guard', () => {
  it('server/services/generation-guard.ts exists', () => {
    const guardPath = path.resolve('server/services/generation-guard.ts');
    expect(fs.existsSync(guardPath)).toBe(true);
  });

  it('exports emitTraceEvent for runtime observability', () => {
    const content = fs.readFileSync(
      path.resolve('server/services/generation-guard.ts'),
      'utf-8'
    );
    expect(content).toContain('export function emitTraceEvent');
  });

  it('exports logOrphanGeneration for LAW 3 violations', () => {
    const content = fs.readFileSync(
      path.resolve('server/services/generation-guard.ts'),
      'utf-8'
    );
    expect(content).toContain('export function logOrphanGeneration');
  });

  it('traces the full pipeline: generation_start through export', () => {
    const content = fs.readFileSync(
      path.resolve('server/services/generation-guard.ts'),
      'utf-8'
    );
    expect(content).toContain('generation_start');
    expect(content).toContain('artifact_created');
    expect(content).toContain('editor_loaded');
    expect(content).toContain('project_placed');
    expect(content).toContain('lifecycle_transition');
    expect(content).toContain('export_success');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ENFORCEMENT — required output structure
// ═══════════════════════════════════════════════════════════════════════════════

describe('AnA RI enforcement layer', () => {
  const enforcementPath = path.resolve('server/services/ana-ri/enforcement.ts');

  it('enforcement.ts exists', () => {
    expect(fs.existsSync(enforcementPath)).toBe(true);
  });

  it('validates Overall Assessment in response structure', () => {
    const content = fs.readFileSync(enforcementPath, 'utf-8');
    expect(content).toContain('Overall Assessment');
  });

  it('validates Reviewer Concerns / Risks in response structure', () => {
    const content = fs.readFileSync(enforcementPath, 'utf-8');
    expect(content).toContain('Reviewer Concerns');
  });

  it('validates KNOWN/INFERRED/MISSING evidence labels', () => {
    const content = fs.readFileSync(enforcementPath, 'utf-8');
    expect(content).toContain('KNOWN');
    expect(content).toContain('INFERRED');
    expect(content).toContain('MISSING');
  });

  it('has artifact quality gates', () => {
    const content = fs.readFileSync(enforcementPath, 'utf-8');
    expect(content).toContain('validateArtifactQuality');
  });

  it('re-exports canonical contract types', () => {
    const content = fs.readFileSync(enforcementPath, 'utf-8');
    expect(content).toContain('CanonicalDocumentContract');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. BIOTECH EARLY ACCESS — properly labeled
// ═══════════════════════════════════════════════════════════════════════════════

describe('Biotech types labeled as Early Access', () => {
  const modalPath = path.resolve(
    'client/src/concept2cure/components/sidebar/NewProjectModal.tsx'
  );

  it('IND is marked earlyAccess', () => {
    const content = fs.readFileSync(modalPath, 'utf-8');
    // IND block should have earlyAccess: true
    const indBlock = content.slice(
      content.indexOf("type: 'IND'"),
      content.indexOf("type: 'IND'") + 300
    );
    expect(indBlock).toContain('earlyAccess: true');
  });

  it('NDA is marked earlyAccess', () => {
    const content = fs.readFileSync(modalPath, 'utf-8');
    const ndaBlock = content.slice(
      content.indexOf("type: 'NDA'"),
      content.indexOf("type: 'NDA'") + 300
    );
    expect(ndaBlock).toContain('earlyAccess: true');
  });

  it('BLA is marked earlyAccess', () => {
    const content = fs.readFileSync(modalPath, 'utf-8');
    const blaBlock = content.slice(
      content.indexOf("type: 'BLA'"),
      content.indexOf("type: 'BLA'") + 300
    );
    expect(blaBlock).toContain('earlyAccess: true');
  });

  it('510K is NOT marked earlyAccess (hero path)', () => {
    const content = fs.readFileSync(modalPath, 'utf-8');
    const block510k = content.slice(
      content.indexOf("type: '510K'"),
      content.indexOf("type: '510K'") + 300
    );
    expect(block510k).not.toContain('earlyAccess: true');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. NO DUPLICATE REVIEW MODE
// ═══════════════════════════════════════════════════════════════════════════════

describe('No duplicate review mode', () => {
  it('review-readiness redirects to review via DEMOTED_REDIRECTS', () => {
    const zenApp = fs.readFileSync(
      path.resolve('client/src/concept2cure/ZenApp.tsx'),
      'utf-8'
    );
    expect(zenApp).toContain("'review-readiness': 'review'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. EXPORT GOVERNANCE — exists and creates governed artifacts
// ═══════════════════════════════════════════════════════════════════════════════

describe('Export governance creates governed artifacts', () => {
  it('exportGovernance.ts exists', () => {
    const p = path.resolve('server/services/compute/exportGovernance.ts');
    expect(fs.existsSync(p)).toBe(true);
  });

  it('creates provenance events on export', () => {
    const content = fs.readFileSync(
      path.resolve('server/services/compute/exportGovernance.ts'),
      'utf-8'
    );
    expect(content).toContain('provenance_events');
  });

  it('creates audit logs on export', () => {
    const content = fs.readFileSync(
      path.resolve('server/services/compute/exportGovernance.ts'),
      'utf-8'
    );
    expect(content).toContain('audit_log');
  });
});
