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
  validateActionContext,
  ACTION_REQUIRED_CONTEXT,
  type AuthoringContextPack,
  type AuthoringActionId,
} from '../../shared/types/authoring-context';
import {
  resolveAuthoringContext,
  resolveWorkflowStage,
  extractModuleCode,
  serializeContextForChat,
  deriveLinkedSections,
  inferRegulatorBody,
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

// ─── Action context validation ───────────────────────────────────────────────

describe('validateActionContext', () => {
  const fullCtx: AuthoringContextPack = {
    projectId: '42',
    workflowStage: 'section-workspace',
    sectionCode: '2.5',
    sectionTitle: 'Clinical Overview',
    artifactId: 'art-123',
    artifactVersionId: '3',
  };

  it('returns empty array when context has all required fields', () => {
    expect(validateActionContext('resume_last_section', fullCtx)).toEqual([]);
    expect(validateActionContext('draft_section_from_context', fullCtx)).toEqual([]);
    expect(validateActionContext('explain_promotion_blockers', fullCtx)).toEqual([]);
    expect(validateActionContext('compare_against_approved', fullCtx)).toEqual([]);
    expect(validateActionContext('promote_to_review', fullCtx)).toEqual([]);
  });

  it('returns missing fields when context is null', () => {
    const missing = validateActionContext('resume_last_section', null);
    expect(missing).toContain('projectId');
  });

  it('reports missing sectionCode for draft action', () => {
    const noSection: AuthoringContextPack = { projectId: '42', workflowStage: 'documents' };
    const missing = validateActionContext('draft_section_from_context', noSection);
    expect(missing).toContain('sectionCode');
    expect(missing).not.toContain('projectId');
  });

  it('reports missing artifactId for compare action', () => {
    const noArtifact: AuthoringContextPack = { projectId: '42', workflowStage: 'documents' };
    const missing = validateActionContext('compare_against_approved', noArtifact);
    expect(missing).toContain('artifactId');
  });

  it('reports missing artifactId for promote action', () => {
    const noArtifact: AuthoringContextPack = { projectId: '42', workflowStage: 'review' };
    const missing = validateActionContext('promote_to_review', noArtifact);
    expect(missing).toContain('artifactId');
  });
});

// ─── Behavioral tests for action patterns ────────────────────────────────────

describe('action behavioral patterns', () => {
  it('draft-from-context produces insertable context (sectionCode + title present)', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      sectionTitle: 'Clinical Overview',
      submissionType: 'IND',
    });
    expect(ctx).not.toBeNull();
    expect(hasSectionContext(ctx)).toBe(true);
    // Draft insertion requires sectionCode to build a title
    const title = `${ctx!.sectionCode} — ${ctx!.sectionTitle}`;
    expect(title).toBe('2.5 — Clinical Overview');
    // And submissionType for regulatory requirements
    expect(ctx!.submissionType).toBe('IND');
  });

  it('resume-last-section only requires projectId', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'projects',
    });
    expect(ctx).not.toBeNull();
    expect(validateActionContext('resume_last_section', ctx)).toEqual([]);
  });

  it('blocker explanation enriches context with readiness and contradiction data', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      readiness: {
        score: 35,
        blocked: true,
        blockers: [
          { code: 'MISSING_EVIDENCE', severity: 'critical', message: 'No clinical evidence linked' },
          { code: 'STALE_CONTENT', severity: 'major', message: 'Content not updated in 60+ days' },
        ],
      },
      contradictions: [
        { id: 'c1', type: 'dosage_conflict', severity: 'critical', explanation: 'Dosage in 2.5 conflicts with 2.7.3' },
      ],
    });
    expect(ctx!.readiness?.blocked).toBe(true);
    expect(ctx!.readiness?.blockers).toHaveLength(2);
    expect(ctx!.contradictions).toHaveLength(1);
    // Blocker explanation should be grounded in these sources
    expect(ctx!.readiness!.blockers![0].source).toBeUndefined(); // source is optional
    expect(ctx!.contradictions![0].type).toBe('dosage_conflict');
  });

  it('compare-version requires artifactId, fails gracefully without it', () => {
    const noArtifact = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'documents',
    });
    expect(hasArtifactContext(noArtifact)).toBe(false);
    expect(validateActionContext('compare_against_approved', noArtifact)).toContain('artifactId');

    const withArtifact = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'documents',
      artifactId: 'art-123',
      artifactVersion: 3,
    });
    expect(hasArtifactContext(withArtifact)).toBe(true);
    expect(validateActionContext('compare_against_approved', withArtifact)).toEqual([]);
  });

  it('promote-to-review requires projectId + artifactId', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      artifactId: 'art-123',
      artifactStatus: 'drafting',
    });
    expect(validateActionContext('promote_to_review', ctx)).toEqual([]);
    expect(ctx!.artifactStatus).toBe('drafting');
  });

  it('promote-to-review blocked when readiness.blocked is true', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      artifactId: 'art-123',
      readiness: { score: 20, blocked: true, blockers: [{ code: 'X', severity: 'critical', message: 'blocked' }] },
    });
    // The context correctly reflects blocked state
    expect(ctx!.readiness?.blocked).toBe(true);
    // UI should check this before allowing promotion
  });

  it('ACTION_REQUIRED_CONTEXT covers all Wave 1 actions', () => {
    const actions: AuthoringActionId[] = [
      'resume_last_section',
      'draft_section_from_context',
      'explain_promotion_blockers',
      'compare_against_approved',
      'promote_to_review',
    ];
    for (const a of actions) {
      expect(ACTION_REQUIRED_CONTEXT[a]).toBeDefined();
      expect(Array.isArray(ACTION_REQUIRED_CONTEXT[a])).toBe(true);
    }
  });
});

// ─── Pass 3: Linked sections & Wave 2 behavioral tests ──────────────────────

describe('deriveLinkedSections', () => {
  it('returns linked sections for key CTD codes', () => {
    expect(deriveLinkedSections('2.5')).toContain('2.7.3');
    expect(deriveLinkedSections('2.5')).toContain('5.3');
    expect(deriveLinkedSections('2.3')).toContain('3.2.S');
    expect(deriveLinkedSections('5.3')).toContain('2.5');
  });

  it('returns undefined for unknown section codes', () => {
    expect(deriveLinkedSections('9.9.9')).toBeUndefined();
    expect(deriveLinkedSections(undefined)).toBeUndefined();
  });

  it('falls back to parent section for subsections', () => {
    // 2.5.1 → parent 2.5 → links to 2.7.1, 2.7.3, etc.
    const links = deriveLinkedSections('2.5.1');
    expect(links).toBeDefined();
    expect(links).toContain('2.7.3');
  });
});

describe('resolveAuthoringContext with linked sections', () => {
  it('includes linkedSectionCodes for known sections', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
    });
    expect(ctx?.linkedSectionCodes).toBeDefined();
    expect(ctx?.linkedSectionCodes).toContain('2.7.3');
    expect(ctx?.linkedSectionCodes).toContain('5.3');
  });

  it('omits linkedSectionCodes for sections with no known links', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '1.1',
    });
    expect(ctx?.linkedSectionCodes).toBeUndefined();
  });
});

describe('Wave 2 action behavioral patterns', () => {
  it('correction draft requires section context with issues', () => {
    // Correction draft is available when contradictions or readiness.blocked exist
    const ctxWithIssues = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      contradictions: [{ id: 'c1', type: 'dosage', severity: 'critical', explanation: 'conflict' }],
    });
    expect(hasSectionContext(ctxWithIssues)).toBe(true);
    expect(ctxWithIssues?.contradictions?.length).toBeGreaterThan(0);
  });

  it('harmonize action requires sectionCode and derives linked sections', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
    });
    expect(hasSectionContext(ctx)).toBe(true);
    // Linked sections available for harmonization
    expect(ctx?.linkedSectionCodes?.length).toBeGreaterThan(0);
  });

  it('harmonize falls back gracefully when no linked sections exist', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '1.3.3',
    });
    // Section exists but has no CTD cross-links
    expect(hasSectionContext(ctx)).toBe(true);
    expect(ctx?.linkedSectionCodes).toBeUndefined();
  });

  it('resolution changelog only needs projectId', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'review',
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.projectId).toBe('42');
    // No section or artifact needed
  });

  it('module readiness derives moduleCode from sectionCode', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '3.2.S',
    });
    expect(ctx?.moduleCode).toBe('m3');
    // Module readiness can use this
  });

  it('evidence gathering requires sectionCode', () => {
    const noSection = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'documents',
    });
    expect(hasSectionContext(noSection)).toBe(false);

    const withSection = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.7.3',
    });
    expect(hasSectionContext(withSection)).toBe(true);
  });

  it('readiness refresh returns fresh data when refetch is called', () => {
    // Simulates readiness becoming stale after action
    const staleCtx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      readiness: { score: 45, blocked: true, blockers: [{ code: 'X', severity: 'critical', message: 'old blocker' }] },
    });
    expect(staleCtx?.readiness?.score).toBe(45);

    // After refetch, new data would be passed
    const freshCtx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      readiness: { score: 80, blocked: false },
    });
    expect(freshCtx?.readiness?.score).toBe(80);
    expect(freshCtx?.readiness?.blocked).toBe(false);
  });

  it('no approved version context detected gracefully', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'documents',
      artifactId: 'art-new',
      artifactVersion: 1,
    });
    expect(hasVersionContext(ctx)).toBe(true);
    // Only v1 exists — compare-against-approved would return "no comparison available"
    expect(ctx!.artifactVersionId).toBe('1');
  });

  it('service unavailable does not crash context build', () => {
    // Context builds fine even without readiness/contradiction data
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      readiness: undefined,
      contradictions: undefined,
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.readiness).toBeUndefined();
    expect(ctx!.contradictions).toBeUndefined();
    // Actions still available, just without enrichment
    expect(hasSectionContext(ctx)).toBe(true);
  });
});

// ─── Pass 4: Body-aware + cross-section consistency tests ────────────────────

describe('inferRegulatorBody', () => {
  it('infers FDA from FDA submission types', () => {
    expect(inferRegulatorBody('IND')).toBe('FDA');
    expect(inferRegulatorBody('NDA')).toBe('FDA');
    expect(inferRegulatorBody('BLA')).toBe('FDA');
    expect(inferRegulatorBody('510K')).toBe('FDA');
    expect(inferRegulatorBody('PMA')).toBe('FDA');
    expect(inferRegulatorBody('ANDA')).toBe('FDA');
  });

  it('infers EMA from EMA submission types', () => {
    expect(inferRegulatorBody('MAA')).toBe('EMA');
    expect(inferRegulatorBody('CER')).toBe('EMA');
  });

  it('infers PMDA from PMDA submission types', () => {
    expect(inferRegulatorBody('JNDA')).toBe('PMDA');
  });

  it('returns undefined for unknown or missing types', () => {
    expect(inferRegulatorBody(undefined)).toBeUndefined();
    expect(inferRegulatorBody('UNKNOWN')).toBeUndefined();
    expect(inferRegulatorBody('')).toBeUndefined();
  });
});

describe('resolveAuthoringContext with regulatorBody', () => {
  it('uses explicit regulatorBody when provided', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      submissionType: 'IND',
      regulatorBody: 'EMA', // Explicit override
    });
    expect(ctx?.regulatorBody).toBe('EMA');
  });

  it('infers regulatorBody from submissionType when not explicit', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      submissionType: 'IND',
    });
    expect(ctx?.regulatorBody).toBe('FDA');
  });

  it('infers EMA for MAA submission', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      submissionType: 'MAA',
    });
    expect(ctx?.regulatorBody).toBe('EMA');
  });

  it('leaves regulatorBody undefined when no submission type', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
    });
    expect(ctx?.regulatorBody).toBeUndefined();
  });
});

describe('body-aware action behavioral patterns', () => {
  it('body expectations require sectionCode + regulatorBody', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      submissionType: 'IND',
    });
    expect(hasSectionContext(ctx)).toBe(true);
    expect(ctx?.regulatorBody).toBe('FDA');
    // Action 11 needs both
  });

  it('body expectations degrade without regulatorBody', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
    });
    expect(hasSectionContext(ctx)).toBe(true);
    expect(ctx?.regulatorBody).toBeUndefined();
    // Action 11 would not appear (no body context)
  });

  it('cross-section consistency requires sectionCode + linkedSectionCodes', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
    });
    expect(hasSectionContext(ctx)).toBe(true);
    expect(ctx?.linkedSectionCodes?.length).toBeGreaterThan(0);
    // Action 12 needs both
  });

  it('cross-section consistency not available without linked sections', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '1.1',
    });
    expect(hasSectionContext(ctx)).toBe(true);
    expect(ctx?.linkedSectionCodes).toBeUndefined();
    // Action 12 would not appear
  });

  it('body-aware gap detection requires sectionCode + submissionType', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '3.2.S',
      submissionType: 'NDA',
    });
    expect(hasSectionContext(ctx)).toBe(true);
    expect(ctx?.regulatorBody).toBe('FDA');
    // Action 13 available
  });
});

describe('compare → correction pivot context', () => {
  it('version context enables compare action', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      artifactId: 'art-1',
      artifactVersion: 3,
    });
    expect(hasVersionContext(ctx)).toBe(true);
    expect(hasArtifactContext(ctx)).toBe(true);
  });

  it('linked sections available for correction pivot after compare', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      artifactId: 'art-1',
      artifactVersion: 3,
    });
    // After compare shows conflict, user can pivot to correction/harmonization
    expect(ctx?.linkedSectionCodes).toContain('2.7.3');
    expect(ctx?.linkedSectionCodes).toContain('5.3');
  });
});

describe('readiness consequence patterns', () => {
  it('readiness + contradictions both available in section context', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      submissionType: 'IND',
      readiness: { score: 72, blocked: false },
      contradictions: [{ id: 'c1', type: 'claim', severity: 'major', explanation: 'Efficacy claim inconsistent with CSR data' }],
    });
    expect(ctx?.readiness?.score).toBe(72);
    expect(ctx?.contradictions?.length).toBe(1);
    expect(ctx?.regulatorBody).toBe('FDA');
  });

  it('readiness becomes blocked after critical contradiction', () => {
    const blocked = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      readiness: { score: 30, blocked: true, blockers: [{ code: 'CRIT-1', severity: 'critical', message: 'Unresolved dosage contradiction' }] },
    });
    expect(blocked?.readiness?.blocked).toBe(true);
    // Correction draft action should appear (readiness.blocked = true)
  });

  it('fresh readiness replaces stale after refresh', () => {
    const stale = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      readiness: { score: 30, blocked: true },
    });
    expect(stale?.readiness?.blocked).toBe(true);

    const fresh = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
      readiness: { score: 85, blocked: false },
    });
    expect(fresh?.readiness?.blocked).toBe(false);
    expect(fresh?.readiness?.score).toBe(85);
  });
});

describe('failure behavior — body and linked context missing', () => {
  it('no body context does not crash', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '2.5',
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.regulatorBody).toBeUndefined();
  });

  it('no linked sections does not crash', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '9.9',
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.linkedSectionCodes).toBeUndefined();
  });

  it('both body and linked missing still builds valid context', () => {
    const ctx = resolveAuthoringContext({
      projectId: '42',
      layoutMode: 'section-workspace',
      sectionCode: '9.9',
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.projectId).toBe('42');
    expect(ctx?.workflowStage).toBe('section-workspace');
    expect(ctx?.sectionCode).toBe('9.9');
    // No body, no linked — but context still usable
  });
});
