/**
 * Tests for AuthoringContextPack and authoring context resolver.
 *
 * Covers:
 * - AuthoringContextPack construction
 * - Missing-field fallback behavior
 * - Section-aware AnA invocation context
 * - Type guard behavior
 * - WorkflowStage resolution
 * - Context serialization for chat
 */

import { describe, it, expect } from 'vitest';
import {
  hasSectionContext,
  hasArtifactContext,
  hasVersionContext,
  type AuthoringContextPack,
} from '../../shared/types/authoring-context';
import {
  resolveAuthoringContext,
  resolveWorkflowStage,
  extractModuleCode,
  serializeContextForChat,
} from '../../client/src/concept2cure/services/authoring-context-resolver';

// ─── AuthoringContextPack construction ───────────────────────────────────────

describe('resolveAuthoringContext', () => {
  it('returns null when projectId is missing', () => {
    const result = resolveAuthoringContext({
      projectId: undefined,
      layoutMode: 'section-workspace',
    });
    expect(result).toBeNull();
  });

  it('builds minimal context with projectId + layoutMode', () => {
    const result = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'dossier-map',
    });
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('42');
    expect(result!.workflowStage).toBe('dossier');
  });

  it('includes section code and derives module code', () => {
    const result = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      sectionTitle: 'Clinical Overview',
    });
    expect(result!.sectionCode).toBe('2.5');
    expect(result!.sectionTitle).toBe('Clinical Overview');
    expect(result!.moduleCode).toBe('m2');
    expect(result!.workflowStage).toBe('section-workspace');
  });

  it('includes artifact context when provided', () => {
    const result = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'documents',
      artifactId: 'art-123',
      artifactVersion: 3,
      artifactStatus: 'drafting',
    });
    expect(result!.artifactId).toBe('art-123');
    expect(result!.artifactVersionId).toBe('3');
    expect(result!.artifactStatus).toBe('drafting');
  });

  it('includes readiness and contradiction data', () => {
    const result = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'review',
      readiness: { score: 65, blocked: true, blockers: [{ code: 'MISSING_EVIDENCE', severity: 'critical', message: 'No clinical evidence' }] },
      contradictions: [{ id: 'c1', type: 'dosage_conflict', severity: 'critical', explanation: 'Dosage mismatch' }],
    });
    expect(result!.readiness?.score).toBe(65);
    expect(result!.readiness?.blocked).toBe(true);
    expect(result!.readiness?.blockers).toHaveLength(1);
    expect(result!.contradictions).toHaveLength(1);
    expect(result!.contradictions![0].id).toBe('c1');
  });

  it('falls back to artifactCtdSection when sectionCode is missing', () => {
    const result = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'documents',
      artifactCtdSection: '3.2.S',
    });
    expect(result!.sectionCode).toBe('3.2.S');
    expect(result!.moduleCode).toBe('m3');
  });
});

// ─── WorkflowStage resolution ────────────────────────────────────────────────

describe('resolveWorkflowStage', () => {
  it('maps known layout modes to workflow stages', () => {
    expect(resolveWorkflowStage('project-home')).toBe('project-home');
    expect(resolveWorkflowStage('dossier-map')).toBe('dossier');
    expect(resolveWorkflowStage('documents')).toBe('documents');
    expect(resolveWorkflowStage('section-workspace')).toBe('section-workspace');
    expect(resolveWorkflowStage('review')).toBe('review');
    expect(resolveWorkflowStage('submissions')).toBe('submissions');
  });

  it('defaults unknown modes to project-home', () => {
    expect(resolveWorkflowStage('unknown-mode')).toBe('project-home');
    expect(resolveWorkflowStage('')).toBe('project-home');
  });

  it('maps workspace modes to project-home', () => {
    expect(resolveWorkflowStage('workspace')).toBe('project-home');
    expect(resolveWorkflowStage('regulatory-workspace')).toBe('project-home');
  });
});

// ─── Module code extraction ──────────────────────────────────────────────────

describe('extractModuleCode', () => {
  it('extracts module code from section codes', () => {
    expect(extractModuleCode('1.2.3')).toBe('m1');
    expect(extractModuleCode('2.5')).toBe('m2');
    expect(extractModuleCode('3.2.S')).toBe('m3');
    expect(extractModuleCode('4.2.1')).toBe('m4');
    expect(extractModuleCode('5.3')).toBe('m5');
  });

  it('returns undefined for missing input', () => {
    expect(extractModuleCode(undefined)).toBeUndefined();
    expect(extractModuleCode('')).toBeUndefined();
  });
});

// ─── Type guards ─────────────────────────────────────────────────────────────

describe('type guards', () => {
  const minimal: AuthoringContextPack = {
    projectId: '42',
    workflowStage: 'project-home',
  };

  const withSection: AuthoringContextPack = {
    ...minimal,
    sectionCode: '2.5',
  };

  const withArtifact: AuthoringContextPack = {
    ...minimal,
    artifactId: 'art-123',
  };

  const withVersion: AuthoringContextPack = {
    ...minimal,
    artifactId: 'art-123',
    artifactVersionId: '3',
  };

  describe('hasSectionContext', () => {
    it('returns false for null/undefined', () => {
      expect(hasSectionContext(null)).toBe(false);
      expect(hasSectionContext(undefined)).toBe(false);
    });

    it('returns false when sectionCode is missing', () => {
      expect(hasSectionContext(minimal)).toBe(false);
    });

    it('returns true when sectionCode is present', () => {
      expect(hasSectionContext(withSection)).toBe(true);
    });
  });

  describe('hasArtifactContext', () => {
    it('returns false when artifactId is missing', () => {
      expect(hasArtifactContext(minimal)).toBe(false);
    });

    it('returns true when artifactId is present', () => {
      expect(hasArtifactContext(withArtifact)).toBe(true);
    });
  });

  describe('hasVersionContext', () => {
    it('returns false without both artifactId and artifactVersionId', () => {
      expect(hasVersionContext(minimal)).toBe(false);
      expect(hasVersionContext(withArtifact)).toBe(false);
    });

    it('returns true when both are present', () => {
      expect(hasVersionContext(withVersion)).toBe(true);
    });
  });
});

// ─── Context serialization ───────────────────────────────────────────────────

describe('serializeContextForChat', () => {
  it('strips undefined fields', () => {
    const ctx: AuthoringContextPack = {
      projectId: '42',
      workflowStage: 'section-workspace',
      sectionCode: '2.5',
      artifactId: undefined,
    };
    const serialized = serializeContextForChat(ctx);
    expect(serialized).toHaveProperty('projectId', '42');
    expect(serialized).toHaveProperty('workflowStage', 'section-workspace');
    expect(serialized).toHaveProperty('sectionCode', '2.5');
    expect(serialized).not.toHaveProperty('artifactId');
  });

  it('preserves nested objects', () => {
    const ctx: AuthoringContextPack = {
      projectId: '42',
      workflowStage: 'review',
      readiness: { score: 80, blocked: false, blockers: [] },
    };
    const serialized = serializeContextForChat(ctx);
    expect(serialized).toHaveProperty('readiness');
    expect((serialized.readiness as any).score).toBe(80);
  });
});

// ─── Failure behavior tests ──────────────────────────────────────────────────

describe('failure behavior', () => {
  it('handles missing sectionCode gracefully in context build', () => {
    const result = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: null,
    });
    expect(result).not.toBeNull();
    expect(result!.sectionCode).toBeUndefined();
    expect(result!.moduleCode).toBeUndefined();
  });

  it('handles missing artifactVersionId gracefully', () => {
    const result = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'documents',
      artifactId: 'art-123',
      artifactVersion: undefined,
    });
    expect(result!.artifactId).toBe('art-123');
    expect(result!.artifactVersionId).toBeUndefined();
    expect(hasVersionContext(result)).toBe(false);
  });

  it('handles empty contradictions array', () => {
    const result = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'review',
      contradictions: [],
    });
    expect(result!.contradictions).toEqual([]);
  });

  it('handles readiness without blockers', () => {
    const result = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'review',
      readiness: { score: 100, blocked: false },
    });
    expect(result!.readiness?.score).toBe(100);
    expect(result!.readiness?.blocked).toBe(false);
    expect(result!.readiness?.blockers).toBeUndefined();
  });
});
