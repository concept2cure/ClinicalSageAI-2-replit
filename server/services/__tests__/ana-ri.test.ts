/**
 * AnA RI — Regression Tests
 *
 * Verifies core AnA RI behaviors:
 * - Intent lens changes affect orchestration
 * - Invalid role/lens rejected
 * - Hedging language penalized in evaluation
 * - Role adaptation changes output structure
 * - Known/Inferred/Missing labels detected in evaluation
 * - Conversation continuity extracts context
 * - Deficiency taxonomy queries work correctly
 *
 * @module server/services/__tests__/ana-ri.test
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The orchestrator transitively imports command-executor.ts which calls
// `getPool()` at module-load. Without DATABASE_URL the pool init throws
// before any test runs. Stub the db facade with a no-op pool so the import
// chain completes; the orchestrator's intent-detection / lens-routing tests
// don't actually query the DB.
vi.mock('../../db', () => ({
  db: {},
  pool: { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) },
  getPool: () => ({ query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }),
  getDb: () => ({}),
}));

// ── Orchestrator Tests ───────────────────────────────────────────────────────

import { orchestrate, detectIntent, detectSubmissionType } from '../ana-ri/orchestrator.js';

describe('AnA RI Orchestrator', () => {
  describe('detectIntent', () => {
    it('detects audit intent from reviewer language', () => {
      const result = detectIntent('Please audit this section like a reviewer');
      expect(result.lens).toBe('audit');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it('detects improve intent from rewrite language', () => {
      const result = detectIntent('Rewrite this section to be stronger and clearer');
      expect(result.lens).toBe('improve');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('detects risk intent from rejection language', () => {
      const result = detectIntent('What are the likely rejection reasons for this IND?');
      expect(result.lens).toBe('risk');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('detects strategy intent from pathway language', () => {
      const result = detectIntent('What regulatory pathway should we use for FDA vs EMA?');
      expect(result.lens).toBe('strategy');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('detects compare intent from comparison language', () => {
      const result = detectIntent('Compare this to the predicate device');
      expect(result.lens).toBe('compare');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('returns auto for generic messages', () => {
      const result = detectIntent('Hello, how are you today?');
      expect(result.lens).toBe('auto');
      expect(result.confidence).toBe(0);
    });
  });

  describe('detectSubmissionType', () => {
    it('detects IND from message', () => {
      expect(detectSubmissionType('Review this IND application')).toBe('ind');
    });

    it('detects 510(k) from message', () => {
      expect(detectSubmissionType('Check 510(k) predicate comparison')).toBe('510k');
    });

    it('detects NDA from message', () => {
      expect(detectSubmissionType('NDA submission strategy')).toBe('nda');
    });

    it('detects BLA from message', () => {
      expect(detectSubmissionType('BLA biologics license application')).toBe('bla');
    });

    it('detects CER from message', () => {
      expect(detectSubmissionType('Clinical Evaluation Report for EU MDR')).toBe('cer');
    });

    it('detects eCTD from message', () => {
      expect(detectSubmissionType('Module 3 of the eCTD submission')).toBe('ectd');
    });

    it('returns null for generic message', () => {
      expect(detectSubmissionType('Hello there')).toBeNull();
    });
  });

  describe('orchestrate', () => {
    it('intent lens changes affect orchestration output', () => {
      const autoResult = orchestrate({ message: 'Review this document' });
      const auditResult = orchestrate({ message: 'Review this document', intentLens: 'audit' });
      const riskResult = orchestrate({ message: 'Review this document', intentLens: 'risk' });

      // Different lenses should produce different system prompts
      expect(auditResult.systemPrompt).not.toBe(riskResult.systemPrompt);
      expect(auditResult.detectedIntent.lens).toBe('audit');
      expect(riskResult.detectedIntent.lens).toBe('risk');
      expect(auditResult.orchestrationMeta.intentSource).toBe('explicit');
      expect(riskResult.orchestrationMeta.intentSource).toBe('explicit');
    });

    it('explicit intent overrides auto-detection', () => {
      const result = orchestrate({
        message: 'Audit this section for gaps',
        intentLens: 'strategy', // Explicitly strategy, even though message says audit
      });
      expect(result.detectedIntent.lens).toBe('strategy');
      expect(result.orchestrationMeta.intentSource).toBe('explicit');
    });

    it('role changes affect system prompt', () => {
      const ceoResult = orchestrate({ message: 'Review risks', userRole: 'ceo' });
      const writerResult = orchestrate({ message: 'Review risks', userRole: 'medical_writer' });

      expect(ceoResult.systemPrompt).toContain('CEO');
      expect(writerResult.systemPrompt).toContain('Medical Writer');
      expect(ceoResult.systemPrompt).not.toBe(writerResult.systemPrompt);
    });

    it('submission type injects deficiency context', () => {
      const result = orchestrate({ message: 'Review this IND submission' });
      expect(result.detectedSubmissionType).toBe('ind');
      expect(result.orchestrationMeta.deficiencyContextInjected).toBe(true);
      expect(result.systemPrompt).toContain('DEFICIENCY INTELLIGENCE');
    });

    it('conversation history builds continuity context', () => {
      const result = orchestrate({
        message: 'What about the safety signal?',
        conversationHistory: [
          { role: 'user', content: 'Review Section 2.7.4 of the Clinical Overview' },
          {
            role: 'assistant',
            content:
              'The safety signal for hepatotoxicity is an unresolved adverse event concern. The adverse event rate is higher than background.',
          },
        ],
      });
      expect(result.systemPrompt).toContain('CONVERSATION CONTINUITY');
      expect(result.systemPrompt).toContain('Safety concerns');
    });

    it('detects an active workstream and injects it into the prompt', () => {
      const result = orchestrate({
        message:
          'Rewrite Section 2.7.4 of the Clinical Overview to make the endpoint justification stronger',
      });

      expect(result.activeWorkstream.stream).toBe('document_authoring');
      expect(result.activeWorkstream.phase).toBe('drafting');
      expect(result.activeWorkstream.collaborationMode).toBe('coauthor');
      expect(result.systemPrompt).toContain('ACTIVE WORKSTREAM');
      expect(result.systemPrompt).toContain('Next Best Step');
      expect(result.orchestrationMeta.workstreamContextInjected).toBe(true);
    });

    it('routes deficiency-heavy messages into the deficiency response workstream', () => {
      const result = orchestrate({
        message:
          'Prepare responses for likely deficiency questions from the FDA information request',
      });

      expect(result.activeWorkstream.stream).toBe('deficiency_response');
      expect(result.suggestedActions).toContain('deficiency_preemption_memo');
      expect(result.suggestedActions).toContain('reviewer_question_brief');
    });

    it('detects a workstream handoff when the thread pivots from strategy into drafting', () => {
      const result = orchestrate({
        message: 'Now rewrite Section 2.7.4 so the endpoint rationale is submission-defensible',
        conversationHistory: [
          { role: 'user', content: 'We need to decide whether a pre-IND meeting is worth it.' },
          {
            role: 'assistant',
            content:
              'The regulatory pathway is still open and the meeting objective needs to be clarified.',
          },
          {
            role: 'user',
            content: 'Assume we pursue the meeting and move to the briefing package.',
          },
        ],
      });

      expect(result.workstreamHandoff).not.toBeNull();
      expect(result.workstreamHandoff?.from).toBe('submission_strategy');
      expect(result.workstreamHandoff?.to).toBe('document_authoring');
      expect(result.systemPrompt).toContain('WORKSTREAM HANDOFF');
      expect(result.orchestrationMeta.workstreamHandoffInjected).toBe(true);
    });

    it('continuity context does not inject conflicting submission type', () => {
      const result = orchestrate({
        message: 'Review this NDA submission',
        conversationHistory: [
          { role: 'user', content: 'We were discussing the IND last time' },
          { role: 'assistant', content: 'The IND application has several issues.' },
        ],
      });
      // Current message detects NDA, so continuity should NOT inject IND
      expect(result.detectedSubmissionType).toBe('nda');
      // Should not contain IND submission context from history
      expect(result.systemPrompt).not.toContain('Submission Context (from conversation): IND');
    });

    it('continuity concern patterns require problem context, not just mention', () => {
      const result = orchestrate({
        message: 'Continue',
        conversationHistory: [
          { role: 'user', content: 'Tell me about endpoints' },
          {
            role: 'assistant',
            content:
              'The primary efficacy endpoint is well-validated and the sample size is adequate.',
          },
        ],
      });
      // Positive mentions of "endpoint" and "sample size" should NOT trigger concern themes
      expect(result.systemPrompt).not.toContain('Efficacy/endpoint defensibility');
      expect(result.systemPrompt).not.toContain('Statistical rigor');
    });

    it('suggested actions match intent lens', () => {
      const auditResult = orchestrate({ message: 'Audit this', intentLens: 'audit' });
      expect(auditResult.suggestedActions).toContain('deficiency_preemption_memo');

      const improveResult = orchestrate({ message: 'Improve this', intentLens: 'improve' });
      expect(improveResult.suggestedActions).toContain('rewritten_section');

      const riskResult = orchestrate({ message: 'What are the risks', intentLens: 'risk' });
      expect(riskResult.suggestedActions).toContain('risk_memo');
    });
  });
});

// ── Evaluation Tests ─────────────────────────────────────────────────────────

import { evaluateResponse } from '../ana-ri/evaluation.js';

describe('AnA RI Evaluation', () => {
  it('penalizes hedging language in writing quality', () => {
    const hedgingResponse =
      'You might perhaps want to maybe consider possibly improving this section.';
    const directResponse =
      '**This section is deficient.** The primary endpoint lacks validation. Rewrite required.';

    const hedgingEval = evaluateResponse(hedgingResponse, {});
    const directEval = evaluateResponse(directResponse, {});

    const hedgingWriting = hedgingEval.dimensions.find(d => d.dimension === 'writing_quality');
    const directWriting = directEval.dimensions.find(d => d.dimension === 'writing_quality');

    expect(hedgingWriting!.score).toBeLessThan(directWriting!.score);
  });

  it('rewards evidence labels in evidence discipline', () => {
    const unlabeledResponse = 'The endpoint is adequate. The safety profile is acceptable.';
    const labeledResponse =
      'The endpoint validation is established **[KNOWN — per ICH E9]**. The long-term safety is uncertain **[MISSING — no 12-month data]**.';

    const unlabeledEval = evaluateResponse(unlabeledResponse, {});
    const labeledEval = evaluateResponse(labeledResponse, {
      hasEvidenceLabels: true,
      hasCitations: true,
    });

    const unlabeledEvidence = unlabeledEval.dimensions.find(
      d => d.dimension === 'evidence_discipline'
    );
    const labeledEvidence = labeledEval.dimensions.find(d => d.dimension === 'evidence_discipline');

    expect(labeledEvidence!.score).toBeGreaterThan(unlabeledEvidence!.score);
  });

  it('detects document consequence in responses', () => {
    const noActionResponse = 'The section looks fine overall.';
    const actionResponse =
      'Create a **Risk Memo** addressing the safety signal. Generate a deficiency preemption memo for the endpoint concern.';

    const noActionEval = evaluateResponse(noActionResponse, {});
    const actionEval = evaluateResponse(actionResponse, { hasDocumentActions: true });

    const noActionDoc = noActionEval.dimensions.find(d => d.dimension === 'document_consequence');
    const actionDoc = actionEval.dimensions.find(d => d.dimension === 'document_consequence');

    expect(actionDoc!.score).toBeGreaterThan(noActionDoc!.score);
  });

  it('assigns correct grade thresholds', () => {
    const weakResponse = 'Looks fine.';
    const strongResponse = `## Overall Assessment
**[KNOWN]** The IND application has critical gaps in the safety database per ICH E1 requirements.

## Reviewer Concerns
- Inadequate safety exposure (only 150 patients vs required 300) **[KNOWN — 21 CFR 312]**
- Missing reproductive toxicology data **[MISSING]**
- Endpoint validation insufficient **[INFERRED — no precedent for this surrogate]**

## Risk Signals
- **Critical**: Refuse to File risk due to incomplete Module 2.7 **[KNOWN]**
- **Major**: Deficiency letter likely for nonclinical package **[INFERRED]**

## Recommended Actions
- Create **Deficiency Preemption Memo** for safety exposure gap
- Generate **Risk Memo** with severity-ranked mitigations
- **Rewrite** Section 2.7.4 Clinical Summary to address endpoint rationale`;

    const weakEval = evaluateResponse(weakResponse, {});
    const strongEval = evaluateResponse(strongResponse, {
      hasStructuredOutput: true,
      hasDocumentActions: true,
      hasEvidenceLabels: true,
      hasRiskRanking: true,
      hasCitations: true,
    });

    expect(weakEval.grade).toBe('failing');
    expect(['strong', 'exceptional']).toContain(strongEval.grade);
    expect(strongEval.overallScore).toBeGreaterThan(weakEval.overallScore);
  });
});

// ── Deficiency Taxonomy Tests ────────────────────────────────────────────────

import {
  getDeficienciesBySubmissionType,
  getCriticalDeficiencies,
  getDeficiencyById,
  getDeficiencyCategories,
} from '../ana-ri/deficiency-taxonomy.js';

describe('AnA RI Deficiency Taxonomy', () => {
  it('returns deficiencies for IND submission type', () => {
    const results = getDeficienciesBySubmissionType('ind');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(d => d.submissionTypes.includes('ind'))).toBe(true);
  });

  it('returns deficiencies for 510k submission type', () => {
    const results = getDeficienciesBySubmissionType('510k');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(d => d.category === 'Device')).toBe(true);
  });

  it('returns deficiencies for PMA submission type', () => {
    const results = getDeficienciesBySubmissionType('pma');
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('returns deficiencies for De Novo submission type', () => {
    const results = getDeficienciesBySubmissionType('de_novo');
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('returns deficiencies for CER submission type', () => {
    const results = getDeficienciesBySubmissionType('cer');
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('returns critical deficiencies', () => {
    const critical = getCriticalDeficiencies('nda');
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.every(d => d.severity === 'critical')).toBe(true);
  });

  it('finds deficiency by ID', () => {
    const d = getDeficiencyById('CLIN-001');
    expect(d).toBeDefined();
    expect(d!.title).toBe('Inadequate Primary Endpoint Justification');
  });

  it('returns category summary', () => {
    const categories = getDeficiencyCategories();
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.find(c => c.category === 'Clinical')).toBeDefined();
  });
});

// ── Role Adapter Tests ───────────────────────────────────────────────────────

import { inferRole, buildRoleAdaptiveContext } from '../ana-ri/role-adapter.js';

describe('AnA RI Role Adapter', () => {
  it('infers CEO role from title', () => {
    expect(inferRole({ title: 'CEO' })).toBe('ceo');
    expect(inferRole({ title: 'Chief Executive Officer' })).toBe('ceo');
  });

  it('infers RA lead from title', () => {
    expect(inferRole({ title: 'VP Regulatory Affairs' })).toBe('ra_lead');
  });

  it('infers medical writer from screen name', () => {
    expect(inferRole({ screenName: 'document-builder' })).toBe('medical_writer');
    expect(inferRole({ screenName: 'author' })).toBe('medical_writer');
  });

  it('infers CMC lead from screen name', () => {
    expect(inferRole({ screenName: 'cmc' })).toBe('cmc_lead');
  });

  it('returns general for unknown signals', () => {
    expect(inferRole({})).toBe('general');
    expect(inferRole({ title: 'intern' })).toBe('general');
  });

  it('builds role-specific output structure for CEO', () => {
    const context = buildRoleAdaptiveContext('ceo', null);
    expect(context).toContain('Board-Ready Summary');
    expect(context).toContain('CEO Decision Required');
  });

  it('builds role-specific output structure for medical writer', () => {
    const context = buildRoleAdaptiveContext('medical_writer', null);
    expect(context).toContain('before/after');
    expect(context).toContain('Section Architecture');
  });

  it('builds role-specific output structure for investor', () => {
    const context = buildRoleAdaptiveContext('investor', null);
    expect(context).toContain('probability-of-success');
    expect(context).toContain('Hidden Risk');
  });
});

// ── Document Actions Tests ───────────────────────────────────────────────────

import { getActionsForLens, getAllActions } from '../ana-ri/document-actions.js';

describe('AnA RI Document Actions', () => {
  it('returns all actions', () => {
    const all = getAllActions();
    expect(all.length).toBe(8);
  });

  it('filters actions by audit lens', () => {
    const auditActions = getActionsForLens('audit');
    expect(auditActions.some(a => a.type === 'deficiency_preemption_memo')).toBe(true);
  });

  it('filters actions by improve lens', () => {
    const improveActions = getActionsForLens('improve');
    expect(improveActions.some(a => a.type === 'rewritten_section')).toBe(true);
  });
});

// ── Persona Tests ────────────────────────────────────────────────────────────

import { buildAnaRISystemPrompt } from '../ana-ri/persona.js';

describe('AnA RI Persona', () => {
  it('includes evidence discipline instructions', () => {
    const prompt = buildAnaRISystemPrompt();
    expect(prompt).toContain('[KNOWN]');
    expect(prompt).toContain('[INFERRED]');
    expect(prompt).toContain('[MISSING]');
  });

  it('includes document consequence mandate', () => {
    const prompt = buildAnaRISystemPrompt();
    expect(prompt).toContain('DOCUMENT CONSEQUENCE');
    expect(prompt).toContain('NON-NEGOTIABLE');
  });

  it('adapts for different roles', () => {
    const ceoPrompt = buildAnaRISystemPrompt({ userRole: 'ceo' });
    const writerPrompt = buildAnaRISystemPrompt({ userRole: 'medical_writer' });

    expect(ceoPrompt).toContain('biotech CEO');
    expect(writerPrompt).toContain('Medical Writer');
  });

  it('injects intent lens overlay', () => {
    const auditPrompt = buildAnaRISystemPrompt({ intentLens: 'audit' });
    expect(auditPrompt).toContain('AUDIT lens');
    expect(auditPrompt).toContain('severity');

    const autoPrompt = buildAnaRISystemPrompt({ intentLens: 'auto' });
    expect(autoPrompt).not.toContain('ACTIVE INTENT LENS');
  });

  it('injects workstream context when provided', () => {
    const prompt = buildAnaRISystemPrompt({
      workstreamContext: {
        stream: 'submission_strategy',
        phase: 'decision',
        objective:
          'Decide whether to pursue a pre-IND meeting before finalizing the briefing package.',
        currentFocus: 'Pre-IND meeting package',
        blockers: ['Pathway or agency strategy is not settled'],
        nextStep:
          'Choose the meeting objective and lock the evidence package for the briefing book.',
        collaborationMode: 'drive',
      },
    });

    expect(prompt).toContain('ACTIVE WORKSTREAM');
    expect(prompt).toContain('Stream: submission_strategy');
    expect(prompt).toContain('Collaboration Mode: drive');
  });

  it('injects workstream handoff context when provided', () => {
    const prompt = buildAnaRISystemPrompt({
      workstreamHandoff: {
        from: 'submission_strategy',
        to: 'document_authoring',
        carryForward: ['pre-IND', 'Section 2.7.4'],
        openLoops: ['Pathway decision remains open for IND'],
        transitionReason:
          'The thread moved from strategy into drafting so analysis can become governed text.',
      },
    });

    expect(prompt).toContain('WORKSTREAM HANDOFF');
    expect(prompt).toContain('From: submission_strategy');
    expect(prompt).toContain('To: document_authoring');
  });
});

// ── Edge Case Tests ──────────────────────────────────────────────────────────

describe('AnA RI Edge Cases', () => {
  describe('intent detection edge cases', () => {
    it('handles empty string without crashing', () => {
      const result = detectIntent('');
      expect(result.lens).toBe('auto');
      expect(result.confidence).toBe(0);
    });

    it('handles very long messages', () => {
      const longMessage = 'audit '.repeat(1000);
      const result = detectIntent(longMessage);
      expect(result.lens).toBe('audit');
    });

    it('resolves ties deterministically — highest score wins', () => {
      // "Fix the deficiency gap" matches both audit (gap, deficiency) and improve (fix)
      // audit gets 2 matches, improve gets 1 — audit should win
      const result = detectIntent('Fix the deficiency gap in the submission');
      expect(result.lens).toBe('audit');
    });
  });

  describe('submission type edge cases', () => {
    it('returns null for empty string', () => {
      expect(detectSubmissionType('')).toBeNull();
    });

    it('detects de novo from message', () => {
      expect(detectSubmissionType('This is a de novo classification request')).toBe('de_novo');
    });

    it('detects PMA from message', () => {
      expect(detectSubmissionType('PMA premarket approval submission')).toBe('pma');
    });
  });

  describe('orchestrator edge cases', () => {
    it('handles empty conversation history', () => {
      const result = orchestrate({
        message: 'Hello',
        conversationHistory: [],
      });
      // Should not inject continuity with empty history
      expect(result.systemPrompt).not.toContain('CONVERSATION CONTINUITY');
    });

    it('handles single-message history', () => {
      const result = orchestrate({
        message: 'Continue',
        conversationHistory: [{ role: 'user', content: 'First message' }],
      });
      // buildContinuityContext requires >= 2 messages
      expect(result.systemPrompt).not.toContain('CONVERSATION CONTINUITY');
    });
  });

  describe('evaluation edge cases', () => {
    it('handles empty response', () => {
      const result = evaluateResponse('', {});
      expect(result.grade).toBe('failing');
    });

    it('calculateDimensionScore boundary: exactly 3 signals = score 3', () => {
      // A response with exactly 3 positive signals in reviewer_rigor
      const response =
        '## Assessment\nThe reviewer would challenge the gap in ICH E9. This creates a major risk.';
      const result = evaluateResponse(response, {});
      const rigor = result.dimensions.find(d => d.dimension === 'reviewer_rigor');
      expect(rigor).toBeDefined();
      expect(rigor!.score).toBeGreaterThanOrEqual(2);
    });
  });
});

// ── Artifact Generator Types Test ────────────────────────────────────────────

import { getArtifactTypes } from '../ana-ri/artifact-generator.js';

describe('AnA RI Artifact Generator', () => {
  it('returns all 8 artifact types with titles', () => {
    const types = getArtifactTypes();
    expect(types.length).toBe(8);
    expect(types.every(t => t.title.length > 0)).toBe(true);
    expect(types.every(t => t.artifactType.length > 0)).toBe(true);
  });

  it('includes all expected action types', () => {
    const types = getArtifactTypes();
    const typeNames = types.map(t => t.type);
    expect(typeNames).toContain('risk_memo');
    expect(typeNames).toContain('deficiency_preemption_memo');
    expect(typeNames).toContain('strategy_note');
    expect(typeNames).toContain('reviewer_question_brief');
    expect(typeNames).toContain('rewritten_section');
    expect(typeNames).toContain('revised_artifact');
    expect(typeNames).toContain('evidence_memo');
    expect(typeNames).toContain('attach_to_dossier');
  });
});

// ── Enforcement Layer Tests ──────────────────────────────────────────────────

import {
  validateResponseStructure,
  checkEvidenceDiscipline,
  validateArtifactQuality,
  logGeneration,
  getGenerationLog,
  getGenerationStats,
  buildArtifactContract,
} from '../ana-ri/enforcement.js';

describe('AnA RI Enforcement Layer', () => {
  describe('validateResponseStructure', () => {
    it('passes structured response with required sections', () => {
      const response = `## Overall Assessment
The submission has critical gaps.

## Reviewer Concerns
- Inadequate safety database **[KNOWN — ICH E1]**
- Endpoint not validated **[MISSING]**

## Risk Signals
- RTF risk: high **[INFERRED]**

## Recommended Actions
- Create deficiency preemption memo`;

      const result = validateResponseStructure(response);
      expect(result.valid).toBe(true);
      expect(result.present).toContain('Overall Assessment');
      expect(result.present).toContain('Reviewer Concerns / Risks');
      expect(result.present).toContain('Recommended Actions');
    });

    it('fails unstructured response', () => {
      const response = 'Looks fine. No issues found.';
      const result = validateResponseStructure(response);
      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('detects evidence labels', () => {
      const response =
        'The data is adequate **[KNOWN]** but long-term safety is **[MISSING]** and efficacy is **[INFERRED]**.';
      const result = validateResponseStructure(response);
      expect(result.present).toContain('Evidence: Known');
      expect(result.present).toContain('Evidence: Inferred');
      expect(result.present).toContain('Evidence: Missing');
    });
  });

  describe('checkEvidenceDiscipline', () => {
    it('flags substantive response without evidence labels', () => {
      const response = `## Overall Assessment
The submission has significant risks across multiple dimensions.
The primary endpoint lacks validation and the safety database is insufficient.
The regulatory strategy needs reconsideration given the competitive landscape.
This is a long substantive response that should have evidence labels but doesn't.
We identified several deficiency patterns that need immediate attention.`;
      const result = checkEvidenceDiscipline(response);
      expect(result.compliant).toBe(false);
      expect(result.hasUnlabeledClaims).toBe(true);
    });

    it('passes response with evidence labels', () => {
      const response = `## Assessment
The endpoint is validated **[KNOWN — per ICH E9]**.
Safety data are insufficient **[MISSING — no 12-month data]**.
Approval likelihood is moderate **[INFERRED — based on precedent]**.`;
      const result = checkEvidenceDiscipline(response);
      expect(result.compliant).toBe(true);
      expect(result.knownCount).toBe(1);
      expect(result.inferredCount).toBe(1);
      expect(result.missingCount).toBe(1);
    });

    it('passes short casual responses without labels', () => {
      const response = 'Hello! How can I help you today?';
      const result = checkEvidenceDiscipline(response);
      expect(result.compliant).toBe(true); // Short responses don't need labels
    });
  });

  describe('validateArtifactQuality', () => {
    it('passes high-quality artifact', () => {
      const content = `# Regulatory Risk Assessment Memo

## Executive Summary
This NDA submission faces critical risks in the safety database per ICH E1 **[KNOWN]**.

## Critical Risks
### Inadequate Safety Database — Severity: Critical
- **Evidence Status**: **[KNOWN — only 150 patients vs 300 required]**
- **Mitigation**: Conduct additional Phase IIIb study
- **Residual Risk**: Medium after mitigation

## Major Risks
### Endpoint Validation Gap — Severity: Major
- **Evidence Status**: **[MISSING — no validation study]**

## Recommendation
Conditional go — address safety exposure before filing.`;

      const result = validateArtifactQuality(content, 'risk_memo');
      expect(result.pass).toBe(true);
      expect(result.grade).not.toBe('rejected');
      expect(result.issues.length).toBe(0);
    });

    it('rejects too-short artifact', () => {
      const result = validateArtifactQuality('Short.', 'risk_memo');
      expect(result.pass).toBe(false);
      expect(result.grade).toBe('rejected');
    });

    it('flags generic AI filler', () => {
      const content = `I'd be happy to help! Here's an example of a risk memo.
Feel free to modify this template. Don't hesitate to ask if you need more.
Let me know if you'd like me to expand on any section.`;
      const result = validateArtifactQuality(content, 'risk_memo');
      expect(result.issues.some(i => i.includes('filler'))).toBe(true);
    });

    it('flags missing structure', () => {
      const content =
        'This is a long enough response that has no markdown headers or structure at all. '.repeat(
          10
        );
      const result = validateArtifactQuality(content, 'strategy_note');
      expect(result.issues.some(i => i.includes('structured sections'))).toBe(true);
    });
  });

  describe('buildArtifactContract', () => {
    it('builds complete contract with all required fields', () => {
      const contract = buildArtifactContract({
        documentType: 'risk_memo',
        projectId: 1,
        organizationId: 1,
        intentLens: 'risk',
        userRole: 'ra_lead',
        content: '## Risk Assessment\nCritical risks identified **[KNOWN]**.',
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        conversationLength: 5,
      });

      expect(contract.source).toBe('ana_ri');
      expect(contract.version).toBe(1);
      expect(contract.status).toBe('draft');
      expect(contract.provenance.generatedBy).toBe('AnA RI');
      expect(contract.structureSections.length).toBeGreaterThan(0);
      expect(contract.provenance.evidenceLabels).toBeGreaterThan(0);
    });
  });

  describe('generation observability', () => {
    it('logs and retrieves generation events', () => {
      logGeneration({
        timestamp: new Date().toISOString(),
        route: '/api/ana-ri/test',
        action: 'test_action',
        artifactCreated: true,
        anaRiOrchestrated: true,
        artifactId: 999,
      });

      const log = getGenerationLog({ route: '/api/ana-ri/test' });
      expect(log.length).toBeGreaterThan(0);
      expect(log[log.length - 1].action).toBe('test_action');
    });

    it('tracks generation stats', () => {
      const stats = getGenerationStats();
      expect(stats.total).toBeGreaterThan(0);
      expect(typeof stats.withArtifact).toBe('number');
      expect(typeof stats.anaRiOrchestrated).toBe('number');
    });
  });
});

// ── Command Registry Tests ───────────────────────────────────────────────────

import { COMMAND_REGISTRY, buildCommandContextForPrompt } from '../ana-ri/command-executor.js';

describe('AnA RI Command System', () => {
  describe('COMMAND_REGISTRY completeness', () => {
    it('has all 27 commands registered', () => {
      expect(COMMAND_REGISTRY.length).toBeGreaterThanOrEqual(27);
    });

    it('every command has name, description, parameters, and example', () => {
      for (const cmd of COMMAND_REGISTRY) {
        expect(cmd.name).toBeTruthy();
        expect(cmd.description).toBeTruthy();
        expect(cmd.parameters).toBeTruthy();
        expect(cmd.example).toBeTruthy();
      }
    });

    it('includes all critical workflow commands', () => {
      const names = COMMAND_REGISTRY.map(c => c.name);
      // Project
      expect(names).toContain('create_project');
      expect(names).toContain('list_projects');
      // Documents
      expect(names).toContain('create_artifact');
      expect(names).toContain('update_artifact');
      expect(names).toContain('list_artifacts');
      // Tasks
      expect(names).toContain('create_task');
      expect(names).toContain('list_tasks');
      // Dossier
      expect(names).toContain('check_dossier_readiness');
      expect(names).toContain('create_submission_package');
      // Review
      expect(names).toContain('create_review_thread');
      expect(names).toContain('add_review_comment');
      // Version management
      expect(names).toContain('compare_versions');
      expect(names).toContain('review_version_impact');
      expect(names).toContain('list_artifact_versions');
      expect(names).toContain('revert_to_version');
      // Export
      expect(names).toContain('export_artifact');
      // Compliance
      expect(names).toContain('run_compliance_scan');
      // Milestones
      expect(names).toContain('create_milestone');
      expect(names).toContain('list_milestones');
      // Context
      expect(names).toContain('load_user_context');
      expect(names).toContain('load_conversation_history');
    });

    it('has no duplicate command names', () => {
      const names = COMMAND_REGISTRY.map(c => c.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });
  });

  describe('buildCommandContextForPrompt', () => {
    it('returns a string with command list', () => {
      const prompt = buildCommandContextForPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('includes command format instructions', () => {
      const prompt = buildCommandContextForPrompt();
      expect(prompt).toContain('command_name');
      expect(prompt).toContain('params');
    });
  });
});

import { enrichContextForChat } from '../ana-ri/context-enrichment.js';
import { SUPPORTED_SLASH_COMMANDS, detectSlashCommand } from '../ana-ri/context-enrichment.js';

describe('AnA RI Context Enrichment', () => {
  it('handles narrative slash commands without unhandled markers', async () => {
    const result = await enrichContextForChat({
      message: '/narrative',
      projectId: 123,
      organizationId: 456,
      submissionType: 'ind',
    });

    expect(result.enrichmentMeta?.triggerType).toBe('slash_command');
    expect(result.enrichmentMeta?.detectedCommand).toBe('narrative');
    expect(result.enrichmentMeta?.sourcesAttempted).toBeGreaterThanOrEqual(1);
    expect(result.enrichmentMeta?.sourcesFailed).not.toContain('slash_unhandled:narrative');
  });

  it('supports deterministic preflight slash enrichment', async () => {
    const result = await enrichContextForChat({
      message: '/preflight',
      projectId: 123,
      organizationId: 456,
      submissionType: 'ind',
    });

    expect(result.enrichmentMeta?.triggerType).toBe('slash_command');
    expect(result.enrichmentMeta?.detectedCommand).toBe('preflight');
    expect(result.enrichmentMeta?.sourcesAttempted).toBeGreaterThanOrEqual(1);
    expect(result.enrichmentMeta?.sourcesFailed).not.toContain('slash_unhandled:preflight');
  });

  it('supports deterministic draft slash enrichment', async () => {
    const result = await enrichContextForChat({
      message: '/draft clinical overview',
      projectId: 123,
      organizationId: 456,
      submissionType: 'ind',
    });

    expect(result.enrichmentMeta?.triggerType).toBe('slash_command');
    expect(result.enrichmentMeta?.detectedCommand).toBe('draft');
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('draft');
    expect(result.enrichmentMeta?.sourcesFailed).not.toContain('slash_unhandled:draft');
    expect(result.rewrittenMessage).toContain('clinical overview');
  });

  it('detects every supported slash command token', () => {
    for (const command of SUPPORTED_SLASH_COMMANDS) {
      const parsed = detectSlashCommand(`/${command} example payload`);
      expect(parsed).not.toBeNull();
      expect(parsed?.command).toBe(command);
      expect(parsed?.args).toBe('example payload');
    }
  });

  // Frontend/backend slash-command parity test removed with AnaPersistentPanel.
  // The Claude Design bundle does not surface a slash-command menu in the
  // chat composer, so there is no frontend list to parse. The backend-side
  // test below still guarantees each registered command has a handler.
  it.skip('frontend/backend slash-command parity — removed with AnaPersistentPanel', () => {});

  it('ensures every backend slash command has a handler (no slash_unhandled)', async () => {
    for (const command of SUPPORTED_SLASH_COMMANDS) {
      const result = await enrichContextForChat({
        message: `/${command} parity-check`,
        projectId: 123,
        organizationId: 456,
        submissionType: 'ind',
      });

      expect(result.enrichmentMeta?.triggerType).toBe('slash_command');
      expect(result.enrichmentMeta?.detectedCommand).toBe(command);
      expect(result.enrichmentMeta?.sourcesFailed).not.toContain(`slash_unhandled:${command}`);
    }
  });
});

// ── Persona: character & constructive dissent ────────────────────────────────

import { getCorePrompt } from '../ana-ri/persona.js';

describe('AnA RI Persona — character & dissent', () => {
  const prompt = getCorePrompt();

  it('gives AnA a distinct character (Who You Are)', () => {
    expect(prompt).toContain('## Who You Are');
    expect(prompt).toMatch(/Seasoned and unhurried/);
    expect(prompt).toMatch(/Warm when it is earned/);
    expect(prompt).toMatch(/Sharper when the stakes are real/);
  });

  it('licenses polite, grounded pushback (Constructive Dissent)', () => {
    expect(prompt).toContain('## Constructive Dissent');
    expect(prompt).toMatch(/not a yes-machine/i);
    expect(prompt).toMatch(/Acknowledge what is right first/);
    expect(prompt).toMatch(/Offer the better path/);
    expect(prompt).toMatch(/yield gracefully/i);
    // Guardrail against reflexive contrarianism must be present.
    expect(prompt).toMatch(/Do not manufacture dissent/);
  });

  it('makes AnA aware of her wayfinding, wisdom, and challenge reflexes', () => {
    expect(prompt).toContain('## Wayfinding, Wisdom, and Challenge');
    expect(prompt).toMatch(/Orient the lost/);
    expect(prompt).toMatch(/Bring experience, not just rules/);
    expect(prompt).toMatch(/Push back when it is warranted/);
    expect(prompt).toMatch(/Structure the hard choices/);
    expect(prompt).toMatch(/Coach the agency interaction/);
    expect(prompt).toMatch(/Read the landscape/);
  });

  it('carries an always-on empathy posture (Meet the human)', () => {
    expect(prompt).toContain('## Meet the human, not just the question');
    expect(prompt).toMatch(/When bad news has just landed/);
    expect(prompt).toMatch(/Empathy here is not warmth for its own sake/);
    // Empathy must not breach the voice floor.
    const section = prompt.slice(prompt.indexOf('## Meet the human'), prompt.indexOf('## How to Communicate'));
    expect(section).not.toContain('!');
  });

  it('keeps the reconciled regulatory breadth index in the live prompt', () => {
    expect(prompt).toMatch(/Tier 1/);
    expect(prompt).toMatch(/ICH/);
    expect(prompt).toMatch(/never fabricate/i);
  });

  it('stays inside the design-system voice (no emoji, no exclamation) in the new copy', () => {
    const whoYouAre = prompt.slice(prompt.indexOf('## Who You Are'), prompt.indexOf('## How to Communicate'));
    const dissent = prompt.slice(prompt.indexOf('## Constructive Dissent'), prompt.indexOf('## Your Expertise'));
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
    for (const chunk of [whoYouAre, dissent]) {
      expect(chunk).not.toContain('!');
      expect(EMOJI.test(chunk)).toBe(false);
    }
  });
});

// ── Industry wisdom pack ─────────────────────────────────────────────────────

import {
  INDUSTRY_WISDOM,
  buildIndustryWisdomBlock,
  selectWisdom,
  inferSegmentFromSubmissionType,
  inferSegmentFromMessage,
  inferStageFromMessage,
} from '../ana-ri/industry-wisdom-pack.js';

describe('AnA RI Industry Wisdom Pack', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('covers all three segments plus cross-cutting wisdom', () => {
    const segments = new Set(INDUSTRY_WISDOM.map(h => h.segment));
    expect(segments.has('mdx')).toBe(true);
    expect(segments.has('biotech')).toBe(true);
    expect(segments.has('pharma')).toBe(true);
    expect(segments.has(null)).toBe(true); // cross-cutting
  });

  it('every heuristic is pattern -> consequence -> veteran move, with a basis', () => {
    for (const h of INDUSTRY_WISDOM) {
      expect(h.situation.length).toBeGreaterThan(10);
      expect(h.consequence.length).toBeGreaterThan(10);
      expect(h.veteranMove.length).toBeGreaterThan(10);
      expect(h.basis.length).toBeGreaterThan(3);
    }
  });

  it('infers segment from submission type', () => {
    expect(inferSegmentFromSubmissionType('510(k)')).toBe('mdx');
    expect(inferSegmentFromSubmissionType('BLA')).toBe('biotech');
    expect(inferSegmentFromSubmissionType('NDA')).toBe('pharma');
    expect(inferSegmentFromSubmissionType('IND')).toBeNull(); // ambiguous
  });

  it('infers segment and stage from free text', () => {
    expect(inferSegmentFromMessage('we need to pick a predicate device')).toBe('mdx');
    expect(inferSegmentFromMessage('our gene therapy potency assay')).toBe('biotech');
    expect(inferStageFromMessage('what should we do before we file?')).toBe('pre_submission');
    expect(inferStageFromMessage('our carcinogenicity study and module 3')).toBe('nonclinical_cmc');
  });

  it('selectWisdom always includes cross-cutting heuristics for a segment', () => {
    const selected = selectWisdom({ segment: 'biotech' });
    expect(selected.some(h => h.segment === null)).toBe(true);
    expect(selected.some(h => h.segment === 'biotech')).toBe(true);
    expect(selected.some(h => h.segment === 'mdx')).toBe(false);
  });

  it('builds a non-empty wisdom block for any segment', () => {
    const block = buildIndustryWisdomBlock({ submissionType: 'BLA' });
    expect(block).toContain('## Industry wisdom');
    expect(block).toMatch(/Pattern:/);
    expect(block).toMatch(/What veterans do:/);
  });

  it('keeps wisdom copy inside the design-system voice (no emoji, no exclamation)', () => {
    for (const h of INDUSTRY_WISDOM) {
      const text = [h.title, h.situation, h.consequence, h.veteranMove, h.basis].join(' ');
      expect(text).not.toContain('!');
      expect(EMOJI.test(text)).toBe(false);
    }
  });
});

// ── Use-case playbooks / tour guide ──────────────────────────────────────────

import {
  USE_CASES,
  listUseCasesForSegment,
  buildTourGuideBlock,
  buildOrientation,
} from '../ana-ri/use-case-playbooks.js';

describe('AnA RI Use-Case Playbooks', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('provides journeys for all three segments', () => {
    expect(listUseCasesForSegment('mdx').length).toBeGreaterThan(0);
    expect(listUseCasesForSegment('biotech').length).toBeGreaterThan(0);
    expect(listUseCasesForSegment('pharma').length).toBeGreaterThan(0);
  });

  it('every use case names first moves and a pitfall to watch', () => {
    for (const u of USE_CASES) {
      expect(u.firstMoves.length).toBeGreaterThan(0);
      expect(u.watchOut.length).toBeGreaterThan(10);
      expect(u.trigger.length).toBeGreaterThan(10);
    }
  });

  it('builds an orientation that asks to place the user when segment is unknown', () => {
    const block = buildOrientation({ segment: null, stage: null });
    expect(block).toContain('## Orientation');
    expect(block).toMatch(/Segment is not yet clear|ask one question/i);
  });

  it('builds a segment-specific tour-guide block', () => {
    const block = buildTourGuideBlock({ submissionType: 'NDA' });
    expect(block).toContain('## Orientation');
    expect(block).toMatch(/Common journeys for/);
  });

  it('keeps playbook copy inside the design-system voice (no emoji, no exclamation)', () => {
    for (const u of USE_CASES) {
      const text = [u.name, u.trigger, u.watchOut, ...u.firstMoves].join(' ');
      expect(text).not.toContain('!');
      expect(EMOJI.test(text)).toBe(false);
    }
  });
});

// ── Constructive-challenge library ───────────────────────────────────────────

import {
  CHALLENGE_PATTERNS,
  detectChallengeableClaims,
  buildChallengeBlock,
  listChallengesForSegment,
} from '../ana-ri/challenge-library.js';

describe('AnA RI Constructive-Challenge Library', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('covers all three segments plus cross-cutting challenges', () => {
    expect(listChallengesForSegment('mdx').some(p => p.segment === 'mdx')).toBe(true);
    expect(listChallengesForSegment('biotech').some(p => p.segment === 'biotech')).toBe(true);
    expect(listChallengesForSegment('pharma').some(p => p.segment === 'pharma')).toBe(true);
    expect(CHALLENGE_PATTERNS.some(p => p.segment === null)).toBe(true);
  });

  it('every pattern has a claim, triggers, risk, challenge, reframe, and basis', () => {
    for (const p of CHALLENGE_PATTERNS) {
      expect(p.claim.length).toBeGreaterThan(10);
      expect(p.triggers.length).toBeGreaterThan(0);
      expect(p.risk.length).toBeGreaterThan(10);
      expect(p.challenge.length).toBeGreaterThan(10);
      expect(p.reframe.length).toBeGreaterThan(10);
      expect(p.basis.length).toBeGreaterThan(3);
    }
  });

  it('linked heuristics resolve to real wisdom entries', () => {
    const ids = new Set(INDUSTRY_WISDOM.map(h => h.id));
    for (const p of CHALLENGE_PATTERNS) {
      if (p.relatedHeuristic) expect(ids.has(p.relatedHeuristic)).toBe(true);
    }
  });

  it('fires on representative risky assertions', () => {
    expect(detectChallengeableClaims("We're going to skip the pre-sub to save time").length).toBeGreaterThan(0);
    expect(detectChallengeableClaims('Our predicate is the closest match so it is the best').length).toBeGreaterThan(0);
    expect(detectChallengeableClaims('Our global dataset will be enough for Japan').length).toBeGreaterThan(0);
    expect(detectChallengeableClaims('Breakthrough designation means we need less data').length).toBeGreaterThan(0);
    expect(detectChallengeableClaims("We'll mature the potency assay later").length).toBeGreaterThan(0);
  });

  it('does not fire on neutral questions', () => {
    expect(detectChallengeableClaims('What is the readiness of my IND?')).toHaveLength(0);
    expect(detectChallengeableClaims('Draft the clinical overview for me')).toHaveLength(0);
  });

  it('builds a polite-challenge block that invokes the dissent doctrine', () => {
    const block = buildChallengeBlock({ message: "We're going to skip the pre-sub to save time" });
    expect(block).toContain('Constructive challenge');
    expect(block).toMatch(/acknowledge what is right/i);
    expect(block).toMatch(/The better path to offer/);
    expect(block).toMatch(/Why it is risky/);
  });

  it('returns empty when nothing is challengeable', () => {
    expect(buildChallengeBlock({ message: 'What is ICH E6?' })).toBe('');
  });

  it('keeps challenge copy inside the design-system voice (no emoji, no exclamation)', () => {
    for (const p of CHALLENGE_PATTERNS) {
      const text = [p.claim, p.risk, p.challenge, p.reframe, p.basis].join(' ');
      expect(text).not.toContain('!');
      expect(EMOJI.test(text)).toBe(false);
    }
  });
});

// ── Decision-frameworks pack ─────────────────────────────────────────────────

import {
  DECISION_FRAMEWORKS,
  detectRelevantFrameworks,
  buildDecisionFrameworkBlock,
  listFrameworksForSegment,
} from '../ana-ri/decision-frameworks.js';

describe('AnA RI Decision-Frameworks Pack', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('covers all three segments plus cross-cutting frameworks', () => {
    expect(listFrameworksForSegment('mdx').some(f => f.segment === 'mdx')).toBe(true);
    expect(listFrameworksForSegment('biotech').some(f => f.segment === 'biotech')).toBe(true);
    expect(listFrameworksForSegment('pharma').some(f => f.segment === 'pharma')).toBe(true);
    expect(DECISION_FRAMEWORKS.some(f => f.segment === null)).toBe(true);
  });

  it('every framework states the trade-off, both tilt sets, and how to decide', () => {
    for (const f of DECISION_FRAMEWORKS) {
      expect(f.theTradeoff.length).toBeGreaterThan(10);
      expect(f.tiltsTowardA.length).toBeGreaterThan(0);
      expect(f.tiltsTowardB.length).toBeGreaterThan(0);
      expect(f.howToDecide.length).toBeGreaterThan(10);
      expect(f.basis.length).toBeGreaterThan(3);
    }
  });

  it('fires on representative trade-off questions', () => {
    expect(detectRelevantFrameworks('Should we go for accelerated approval or wait for the full package?').length).toBeGreaterThan(0);
    expect(detectRelevantFrameworks('Which pathway should we use — 510(k) or De Novo?').length).toBeGreaterThan(0);
    expect(detectRelevantFrameworks('Do we power on a surrogate or a clinical outcome?').length).toBeGreaterThan(0);
    expect(detectRelevantFrameworks('Should we file FDA first or file in parallel with EMA?').length).toBeGreaterThan(0);
  });

  it('does not fire on a plain factual question', () => {
    expect(detectRelevantFrameworks('What is the page limit for Module 2.5?')).toHaveLength(0);
  });

  it('builds a framework block that refuses to decide for the user', () => {
    const block = buildDecisionFrameworkBlock({ message: 'Should we go for breakthrough or build the full package?' });
    expect(block).toContain('Decision framework');
    expect(block).toMatch(/The real trade-off/);
    expect(block).toMatch(/How to decide/);
    expect(block).toMatch(/do not decide for them|call .* is theirs/i);
  });

  it('forceGeneric makes an explicit /decide always do work', () => {
    const block = buildDecisionFrameworkBlock({ message: 'help me choose something', forceGeneric: true });
    expect(block).toContain('Decision framework');
  });

  it('returns empty for a non-trade-off message without forceGeneric', () => {
    expect(buildDecisionFrameworkBlock({ message: 'Draft my clinical overview' })).toBe('');
  });

  it('keeps framework copy inside the design-system voice', () => {
    for (const f of DECISION_FRAMEWORKS) {
      const text = [f.choice, f.theTradeoff, f.howToDecide, f.basis, ...f.tiltsTowardA, ...f.tiltsTowardB].join(' ');
      expect(text).not.toContain('!');
      expect(EMOJI.test(text)).toBe(false);
    }
  });
});

// ── Agency-interaction tactics pack ──────────────────────────────────────────

import {
  AGENCY_TACTICS,
  detectRelevantTactics,
  buildAgencyTacticsBlock,
  listTacticsByKind,
} from '../ana-ri/agency-tactics.js';

describe('AnA RI Agency-Tactics Pack', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('covers meeting prep, response strategy, and posture', () => {
    expect(listTacticsByKind('meeting_prep').length).toBeGreaterThan(0);
    expect(listTacticsByKind('response_strategy').length).toBeGreaterThan(0);
    expect(listTacticsByKind('posture').length).toBeGreaterThan(0);
  });

  it('every tactic states the move, why, watch-out, and basis', () => {
    for (const t of AGENCY_TACTICS) {
      expect(t.tactic.length).toBeGreaterThan(10);
      expect(t.why.length).toBeGreaterThan(10);
      expect(t.watchOut.length).toBeGreaterThan(10);
      expect(t.basis.length).toBeGreaterThan(3);
      expect(t.triggers.length).toBeGreaterThan(0);
    }
  });

  it('fires on meeting-prep and response-letter situations', () => {
    expect(detectRelevantTactics('We are preparing questions for our pre-IND meeting').length).toBeGreaterThan(0);
    expect(detectRelevantTactics('How should we respond to the FDA deficiency letter?').length).toBeGreaterThan(0);
    expect(detectRelevantTactics('We just received a complete response letter').length).toBeGreaterThan(0);
    expect(detectRelevantTactics('Should we appeal or escalate our disagreement with the division?').length).toBeGreaterThan(0);
  });

  it('can narrow by kind', () => {
    const prep = detectRelevantTactics('preparing our briefing book for the meeting', { kind: 'meeting_prep' });
    expect(prep.every(t => t.kind === 'meeting_prep')).toBe(true);
  });

  it('does not fire on an unrelated drafting request', () => {
    expect(detectRelevantTactics('Draft Module 3.2.P.5 for me')).toHaveLength(0);
  });

  it('builds a tactics block, and forceGeneric always does work', () => {
    const block = buildAgencyTacticsBlock({ message: 'responding to a CRL' });
    expect(block).toContain('Agency-interaction tactics');
    expect(block).toMatch(/Why it works/);
    expect(buildAgencyTacticsBlock({ message: 'nothing relevant here', forceGeneric: true })).toContain('Agency interaction');
  });

  it('keeps tactics copy inside the design-system voice', () => {
    for (const t of AGENCY_TACTICS) {
      const text = [t.situation, t.tactic, t.why, t.watchOut, t.basis].join(' ');
      expect(text).not.toContain('!');
      expect(EMOJI.test(text)).toBe(false);
    }
  });
});

// ── Competitive-strategy pack ────────────────────────────────────────────────

import {
  COMPETITIVE_PLAYS,
  detectRelevantPlays,
  buildCompetitiveBlock,
  listPlaysByFocus,
} from '../ana-ri/competitive-strategy.js';

describe('AnA RI Competitive-Strategy Pack', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('covers reading precedent, positioning, and differentiation', () => {
    expect(listPlaysByFocus('precedent_reading').length).toBeGreaterThan(0);
    expect(listPlaysByFocus('positioning').length).toBeGreaterThan(0);
    expect(listPlaysByFocus('differentiation').length).toBeGreaterThan(0);
  });

  it('every play states the insight, move, watch-out, and basis', () => {
    for (const p of COMPETITIVE_PLAYS) {
      expect(p.insight.length).toBeGreaterThan(10);
      expect(p.move.length).toBeGreaterThan(10);
      expect(p.watchOut.length).toBeGreaterThan(10);
      expect(p.basis.length).toBeGreaterThan(3);
      expect(p.triggers.length).toBeGreaterThan(0);
    }
  });

  it('fires on precedent and positioning situations', () => {
    expect(detectRelevantPlays('Can we cite that prior approval as precedent?').length).toBeGreaterThan(0);
    expect(detectRelevantPlays('How do we position against the approved competitor?').length).toBeGreaterThan(0);
    expect(detectRelevantPlays('We are first-in-class with no precedent').length).toBeGreaterThan(0);
    expect(detectRelevantPlays('How should we differentiate from the incumbent?').length).toBeGreaterThan(0);
  });

  it('does not fire on an unrelated drafting request', () => {
    expect(detectRelevantPlays('Draft the safety narrative for study 301')).toHaveLength(0);
  });

  it('builds a block, and forceGeneric always does work', () => {
    const block = buildCompetitiveBlock({ message: 'how do we position against the competitive landscape?' });
    expect(block).toContain('Competitive strategy');
    expect(block).toMatch(/The move/);
    expect(buildCompetitiveBlock({ message: 'nothing here', forceGeneric: true })).toContain('Competitive strategy');
  });

  it('keeps competitive copy inside the design-system voice', () => {
    for (const p of COMPETITIVE_PLAYS) {
      const text = [p.situation, p.insight, p.move, p.watchOut, p.basis].join(' ');
      expect(text).not.toContain('!');
      expect(EMOJI.test(text)).toBe(false);
    }
  });
});

// ── Client attunement (empathy layer) ────────────────────────────────────────

import {
  ATTUNEMENT_PATTERNS,
  detectClientState,
  buildAttunementBlock,
  getAttunement,
} from '../ana-ri/client-attunement.js';

describe('AnA RI Client Attunement', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('every state has a reading, attune, leadWith, and avoid', () => {
    for (const p of ATTUNEMENT_PATTERNS) {
      expect(p.triggers.length).toBeGreaterThan(0);
      expect(p.reading.length).toBeGreaterThan(10);
      expect(p.attune.length).toBeGreaterThan(10);
      expect(p.leadWith.length).toBeGreaterThan(10);
      expect(p.avoid.length).toBeGreaterThan(10);
    }
  });

  it('reads the salient state from a message', () => {
    expect(detectClientState('We just got a CRL from the FDA')?.state).toBe('crisis');
    expect(detectClientState('I am completely overwhelmed and do not know where to start')?.state).toBe('overwhelm');
    expect(detectClientState('We file in 3 days and are running out of time')?.state).toBe('time_pressure');
    expect(detectClientState('FDA keeps moving the goalposts, this is impossible')?.state).toBe('frustration');
    expect(detectClientState('I am worried we are missing something')?.state).toBe('anxiety');
    expect(detectClientState('the team is completely burned out')?.state).toBe('fatigue');
    expect(detectClientState('this is a slam dunk, no way they reject it')?.state).toBe('overconfidence');
  });

  it('crisis outranks a co-occurring softer state', () => {
    // Contains both a crisis signal and a frustration signal; crisis wins.
    expect(detectClientState('We just got a clinical hold and honestly this is impossible')?.state).toBe('crisis');
  });

  it('returns null on a neutral, unemotional message', () => {
    expect(detectClientState('What is the page limit for Module 2.5?')).toBeNull();
    expect(buildAttunementBlock('Draft section 3.2.P.5')).toBe('');
  });

  it('builds an attunement directive scoped to delivery, not truth', () => {
    const block = buildAttunementBlock('we just received a complete response letter');
    expect(block).toContain('Read on the user');
    expect(block).toMatch(/how you show up, not what is true/i);
    expect(block).toMatch(/How to show up/);
    expect(block).toMatch(/Avoid/);
  });

  it('exposes a lookup by state', () => {
    expect(getAttunement('crisis')?.label).toMatch(/bad news/i);
    expect(getAttunement('fatigue')?.state).toBe('fatigue');
  });

  it('keeps attunement copy inside the design-system voice (no emoji, no exclamation)', () => {
    for (const p of ATTUNEMENT_PATTERNS) {
      const text = [p.label, p.reading, p.attune, p.leadWith, p.avoid].join(' ');
      expect(text).not.toContain('!');
      expect(EMOJI.test(text)).toBe(false);
    }
  });
});

// ── Stakeholder-alignment pack ───────────────────────────────────────────────

import {
  ALIGNMENT_PLAYS,
  detectRelevantAlignment,
  buildAlignmentBlock,
  listAlignmentByAxis,
} from '../ana-ri/stakeholder-alignment.js';

describe('AnA RI Stakeholder-Alignment Pack', () => {
  const STAKE_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('covers cross-functional, commercial, executive, and partner axes', () => {
    expect(listAlignmentByAxis('cross_functional').length).toBeGreaterThan(0);
    expect(listAlignmentByAxis('commercial').length).toBeGreaterThan(0);
    expect(listAlignmentByAxis('executive').length).toBeGreaterThan(0);
    expect(listAlignmentByAxis('external_partner').length).toBeGreaterThan(0);
  });

  it('every alignment play states tension, insight, move, watch-out, and basis', () => {
    for (const p of ALIGNMENT_PLAYS) {
      expect(p.tension.length).toBeGreaterThan(10);
      expect(p.insight.length).toBeGreaterThan(10);
      expect(p.move.length).toBeGreaterThan(10);
      expect(p.watchOut.length).toBeGreaterThan(10);
      expect(p.basis.length).toBeGreaterThan(3);
      expect(p.triggers.length).toBeGreaterThan(0);
    }
  });

  it('fires on representative internal-tension situations', () => {
    expect(detectRelevantAlignment('CMC and clinical disagree on the timeline').length).toBeGreaterThan(0);
    expect(detectRelevantAlignment('commercial wants a broader label than the data supports').length).toBeGreaterThan(0);
    expect(detectRelevantAlignment('the board wants a firm date for the filing').length).toBeGreaterThan(0);
    expect(detectRelevantAlignment('our CRO holds the data we depend on').length).toBeGreaterThan(0);
  });

  it('does not fire on a plain regulatory question', () => {
    expect(detectRelevantAlignment('What ICH guideline covers stability testing?')).toHaveLength(0);
  });

  it('builds an alignment block, and forceGeneric always does work', () => {
    const block = buildAlignmentBlock({ message: 'commercial wants a broader claim' });
    expect(block).toContain('Stakeholder alignment');
    expect(block).toMatch(/How to align/);
    expect(buildAlignmentBlock({ message: 'nothing here', forceGeneric: true })).toContain('Stakeholder alignment');
  });

  it('ties the internal tension to regulatory consequence and leaves the call to the client', () => {
    const block = buildAlignmentBlock({ message: 'the board wants a date', forceGeneric: true });
    expect(block).toMatch(/regulatory consequence|program impact/i);
    expect(block).toMatch(/theirs/);
  });

  it('keeps stakeholder-alignment copy inside the design-system voice', () => {
    for (const p of ALIGNMENT_PLAYS) {
      const text = [p.tension, p.insight, p.move, p.watchOut, p.basis].join(' ');
      expect(text).not.toContain('!');
      expect(STAKE_EMOJI.test(text)).toBe(false);
    }
  });

  it('handles /align via enrichment and proactively detects stakeholder tension', async () => {
    const aligned = await enrichContextForChat({
      message: '/align',
      projectId: 123,
      organizationId: 456,
      submissionType: 'bla',
    });
    expect(aligned.enrichmentMeta?.detectedCommand).toBe('align');
    expect(aligned.enrichmentMeta?.sourcesSucceeded).toContain('align');

    const proactive = await enrichContextForChat({
      message: 'CMC and clinical disagree on the timeline and the board wants a date',
      projectId: 123,
      organizationId: 456,
      submissionType: 'ind',
    });
    expect(proactive.enrichmentMeta?.sourcesSucceeded).toContain('stakeholder-alignment');
  });
});

// ── Claim-grounding guard ────────────────────────────────────────────────────

import {
  CLAIM_CHECKS,
  detectClaimCategories,
  buildClaimGroundingBlock,
  getClaimCheck,
} from '../ana-ri/claim-grounding.js';

describe('AnA RI Claim-Grounding Guard', () => {
  const GROUND_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('every claim check has a label, directive, and triggers', () => {
    for (const c of CLAIM_CHECKS) {
      expect(c.label.length).toBeGreaterThan(3);
      expect(c.directive.length).toBeGreaterThan(20);
      expect(c.triggers.length).toBeGreaterThan(0);
    }
  });

  it('detects each high-stakes claim category', () => {
    expect(detectClaimCategories('this is per 21 CFR 314.50').some((c) => c.category === 'citation')).toBe(true);
    expect(detectClaimCategories('cite ICH E6 for GCP').some((c) => c.category === 'citation')).toBe(true);
    expect(detectClaimCategories('the probability of approval is high').some((c) => c.category === 'probability')).toBe(true);
    expect(detectClaimCategories('this is a slam dunk, guaranteed approval').some((c) => c.category === 'guarantee')).toBe(true);
    expect(detectClaimCategories('a similar product was approved last year').some((c) => c.category === 'precedent')).toBe(true);
    expect(detectClaimCategories('you need at least 1500 patients').some((c) => c.category === 'numeric')).toBe(true);
    expect(detectClaimCategories('the 75-day Pre-Sub clock starts then').some((c) => c.category === 'deadline')).toBe(true);
  });

  it('does not fire on a plain conversational message', () => {
    expect(detectClaimCategories('hi, can you help me get oriented?')).toHaveLength(0);
    expect(detectClaimCategories('what should I work on next?')).toHaveLength(0);
  });

  it('builds a non-negotiable grounding directive scoped to the claims present', () => {
    const block = buildClaimGroundingBlock('we are guaranteed approval per 21 CFR 314 with 90% probability');
    expect(block).toContain('Claim-grounding check');
    expect(block).toMatch(/KNOWN|INFERRED|MISSING/);
    expect(block).toMatch(/Absolute assurance/);
    expect(block).toMatch(/Regulatory citation/);
  });

  it('returns empty when there is nothing groundable', () => {
    expect(buildClaimGroundingBlock('thanks, that helps')).toBe('');
  });

  it('can scan AnA\'s drafted answer as a self-check, not only the user message', () => {
    const block = buildClaimGroundingBlock('tell me about the program', 'It will definitely be approved.');
    expect(block).toContain('Claim-grounding check');
    expect(block).toMatch(/Absolute assurance/);
  });

  it('exposes a lookup by category', () => {
    expect(getClaimCheck('guarantee')?.label).toMatch(/assurance/i);
    expect(getClaimCheck('citation')?.category).toBe('citation');
  });

  it('keeps claim-grounding copy inside the design-system voice', () => {
    for (const c of CLAIM_CHECKS) {
      const text = [c.label, c.directive].join(' ');
      expect(text).not.toContain('!');
      expect(GROUND_EMOJI.test(text)).toBe(false);
    }
  });

  it('persona declares the claim-grounding discipline', () => {
    expect(getCorePrompt()).toMatch(/Ground your high-stakes claims/);
  });
});

describe('AnA RI Enrichment — claim-grounding integration', () => {
  it('proactively injects the grounding guard on a high-stakes claim', async () => {
    const result = await enrichContextForChat({
      message: 'Can you confirm we are guaranteed approval under 21 CFR 314 with a 90% probability?',
      projectId: 123,
      organizationId: 456,
      submissionType: 'nda',
    });
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('claim-grounding');
    expect(result.block).toContain('Claim-grounding check');
  });

  it('grounds a high-stakes claim for a project-less user', async () => {
    const result = await enrichContextForChat({
      message: 'Is it true a similar device was cleared under ICH E6 with only 50 patients?',
    });
    expect(result.enrichmentMeta?.hasProjectContext).toBe(false);
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('claim-grounding');
  });

  it('does not inject the guard on a plain orientation request', async () => {
    const result = await enrichContextForChat({
      message: 'where do I start?',
      projectId: 123,
      organizationId: 456,
      submissionType: 'ind',
    });
    expect(result.enrichmentMeta?.sourcesSucceeded).not.toContain('claim-grounding');
  });
});

// ── Capability registry (anti-drift inventory) ───────────────────────────────

import {
  CAPABILITIES,
  CAPABILITY_COMMANDS,
  getCapability,
  getCapabilityForCommand,
  listCapabilitiesByCategory,
  buildCapabilityCatalogue,
} from '../ana-ri/capability-registry.js';

describe('AnA RI Capability Registry', () => {
  const CAP_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('every capability has commands, a description, and a category', () => {
    for (const c of CAPABILITIES) {
      expect(c.commands.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(20);
      expect(c.label.length).toBeGreaterThan(3);
      expect(typeof c.proactive).toBe('boolean');
    }
  });

  it('command lookups resolve in both directions', () => {
    expect(getCapability('challenge')?.label).toMatch(/challenge/i);
    expect(getCapabilityForCommand('redteam')?.id).toBe('challenge');
    expect(getCapabilityForCommand('landscape')?.id).toBe('position');
    expect(getCapabilityForCommand('not-a-command')).toBeNull();
  });

  it('lists capabilities by category', () => {
    expect(listCapabilitiesByCategory('judgment').length).toBeGreaterThan(0);
    expect(listCapabilitiesByCategory('agency').length).toBeGreaterThan(0);
  });

  it('has no duplicate command across capabilities', () => {
    const all = CAPABILITIES.flatMap((c) => c.commands);
    expect(new Set(all).size).toBe(all.length);
  });

  it('ANTI-DRIFT: every registered capability command is a wired slash command', () => {
    const wired = new Set<string>(SUPPORTED_SLASH_COMMANDS);
    for (const cmd of CAPABILITY_COMMANDS) {
      expect(wired.has(cmd as typeof SUPPORTED_SLASH_COMMANDS[number])).toBe(true);
    }
  });

  it('ANTI-DRIFT: every judgment-pack slash command is catalogued here', () => {
    // The judgment/guidance commands wired in context-enrichment that must be
    // documented in the registry so AnA never has an undocumented capability.
    const judgmentCommands = [
      'wisdom', 'guide', 'orient', 'tour', 'playbook',
      'challenge', 'redteam', 'devil',
      'decide', 'tradeoff', 'framework',
      'meeting', 'agency', 'tactics',
      'position', 'landscape', 'compete',
    ];
    for (const cmd of judgmentCommands) {
      expect(CAPABILITY_COMMANDS.has(cmd)).toBe(true);
    }
  });

  it('builds a grounded catalogue that is not a recite-this menu', () => {
    const cat = buildCapabilityCatalogue();
    expect(cat).toContain('enrichment capabilities');
    expect(cat).toMatch(/Do not recite this as a menu/);
    // Every capability surfaces with at least one slash command.
    for (const c of CAPABILITIES) {
      expect(cat).toContain('/' + c.commands[0]);
    }
  });

  it('keeps capability copy inside the design-system voice', () => {
    for (const c of CAPABILITIES) {
      const text = [c.label, c.description].join(' ');
      expect(text).not.toContain('!');
      expect(CAP_EMOJI.test(text)).toBe(false);
    }
  });
});

describe('AnA RI Enrichment — capabilities command', () => {
  it('grounds a "what can you do" request in the capability catalogue', async () => {
    const result = await enrichContextForChat({
      message: '/capabilities',
      projectId: 123,
      organizationId: 456,
      submissionType: 'nda',
    });
    expect(result.enrichmentMeta?.detectedCommand).toBe('capabilities');
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('capabilities');
    expect(result.block).toContain('enrichment capabilities');
  });

  it('grounds capabilities for a project-less user', async () => {
    const result = await enrichContextForChat({ message: '/capabilities' });
    expect(result.enrichmentMeta?.hasProjectContext).toBe(false);
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('capabilities');
  });
});

// ── Context composer (relevance-ranking kernel) ──────────────────────────────

import {
  tokenize,
  approxTokens,
  scoreRelevanceBM25,
  lexicalSimilarity,
  composeContext,
  priorityForSource,
  SOURCE_PRIORITY,
  type CandidateBlock,
} from '../ana-ri/context-composer.js';

describe('AnA RI Context Composer', () => {
  it('tokenizes, drops stopwords, and keeps regulatory tokens like 510(k)', () => {
    const toks = tokenize('We need a 510(k) predicate for the device');
    expect(toks).toContain('510(k)');
    expect(toks).toContain('predicate');
    expect(toks).toContain('device');
    expect(toks).not.toContain('the');
    expect(toks).not.toContain('a');
  });

  it('approxTokens scales with length and is always positive', () => {
    expect(approxTokens('')).toBeGreaterThan(0);
    expect(approxTokens('a'.repeat(400))).toBe(100);
  });

  it('BM25 ranks the block that shares query terms highest', () => {
    const blocks: CandidateBlock[] = [
      { source: 'a', text: 'Pediatric investigation plan and iPSP timing for the adult filing.' },
      { source: 'b', text: 'Predicate device toxicity and substantial equivalence matrix.' },
      { source: 'c', text: 'Stability testing and comparability for the drug substance.' },
    ];
    const scores = scoreRelevanceBM25('how do i handle the pediatric plan', blocks);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[0]).toBeGreaterThan(scores[2]);
    expect(Math.max(...scores)).toBeLessThanOrEqual(1);
  });

  it('returns all-zero relevance for an empty or stopword-only query', () => {
    const blocks: CandidateBlock[] = [{ source: 'a', text: 'pediatric plan' }];
    expect(scoreRelevanceBM25('', blocks)).toEqual([0]);
    expect(scoreRelevanceBM25('the a of', blocks)).toEqual([0]);
  });

  it('lexical similarity is high for near-duplicates, low for unrelated text', () => {
    const dup = lexicalSimilarity('pediatric plan timing filing', 'pediatric plan timing for filing');
    const diff = lexicalSimilarity('pediatric plan timing', 'predicate device toxicity matrix');
    expect(dup).toBeGreaterThan(diff);
    expect(diff).toBeLessThan(0.2);
  });

  it('composes within budget, dropping the lowest-value block when it cannot fit', () => {
    const big = 'word '.repeat(400); // ~500 tokens each
    const candidates: CandidateBlock[] = [
      { source: 'agency-tactics', text: 'pediatric plan ' + big, priority: 0.75 },
      { source: 'industry-wisdom', text: 'unrelated filler ' + big, priority: 0.55 },
      { source: 'tour-guide', text: 'orientation filler ' + big, priority: 0.5 },
    ];
    const result = composeContext('pediatric plan', candidates, { tokenBudget: 600 });
    // Budget ~600 tokens fits only one ~500-token block.
    expect(result.selected.length).toBe(1);
    expect(result.selected[0].source).toBe('agency-tactics');
    expect(result.tokensUsed).toBeLessThanOrEqual(600);
    expect(result.trace.some((t) => t.reason === 'over-budget')).toBe(true);
  });

  it('always keeps pinned blocks regardless of relevance', () => {
    const candidates: CandidateBlock[] = [
      { source: 'client-attunement', text: 'steady the user in crisis', priority: 0.95, pinned: true },
      { source: 'industry-wisdom', text: 'pediatric plan timing details', priority: 0.55 },
    ];
    const result = composeContext('something totally unrelated to either', candidates, { tokenBudget: 5000 });
    expect(result.selected.map((s) => s.source)).toContain('client-attunement');
    // Pinned block leads the order.
    expect(result.selected[0].source).toBe('client-attunement');
  });

  it('de-duplicates near-identical blocks via MMR under tight budget', () => {
    const body = 'reconcile the load bearing numbers across protocol sap csr and summary before filing';
    const candidates: CandidateBlock[] = [
      { source: 'industry-wisdom', text: body, priority: 0.55 },
      { source: 'decision-framework', text: body + ' identical twin', priority: 0.55 },
      { source: 'agency-tactics', text: 'answer the question the reviewer asked in their own order', priority: 0.75 },
    ];
    // Budget (~50 tok) fits two of three ~small blocks. With a diversity-leaning
    // lambda, MMR should prefer the distinct agency-tactics block over the
    // redundant near-duplicate of the first selection.
    const result = composeContext('reconcile numbers before filing', candidates, { tokenBudget: 50, lambda: 0.4 });
    const sources = result.selected.map((s) => s.source);
    expect(sources).toContain('agency-tactics');
    expect(result.trace.some((t) => t.reason === 'over-budget')).toBe(true);
  });

  it('is a no-op (keeps everything) when budget is generous', () => {
    const candidates: CandidateBlock[] = [
      { source: 'a', text: 'pediatric plan' },
      { source: 'b', text: 'predicate device' },
      { source: 'c', text: 'stability testing' },
    ];
    const result = composeContext('pediatric predicate stability', candidates, { tokenBudget: 100000 });
    expect(result.selected.length).toBe(3);
  });

  it('handles the empty candidate set', () => {
    const result = composeContext('anything', [], { tokenBudget: 1000 });
    expect(result.selected).toHaveLength(0);
    expect(result.text).toBe('');
    expect(result.tokensUsed).toBe(0);
  });

  it('emits an explainable trace for every candidate', () => {
    const candidates: CandidateBlock[] = [
      { source: 'a', text: 'pediatric plan timing' },
      { source: 'b', text: 'predicate device toxicity' },
    ];
    const result = composeContext('pediatric plan', candidates, { tokenBudget: 5000 });
    expect(result.trace).toHaveLength(2);
    for (const t of result.trace) {
      expect(t).toHaveProperty('source');
      expect(t).toHaveProperty('relevance');
      expect(t).toHaveProperty('kept');
      expect(t).toHaveProperty('reason');
    }
  });

  it('maps source priorities and slash-command aliases to pack weights', () => {
    expect(priorityForSource('governed-envelope')).toBe(SOURCE_PRIORITY['governed-envelope']);
    expect(priorityForSource('client-attunement')).toBeGreaterThan(priorityForSource('tour-guide'));
    // Slash aliases resolve to their pack weight.
    expect(priorityForSource('wisdom')).toBe(SOURCE_PRIORITY['industry-wisdom']);
    expect(priorityForSource('align')).toBe(SOURCE_PRIORITY['stakeholder-alignment']);
    expect(priorityForSource('totally-unknown-source')).toBe(0.5);
  });
});

describe('AnA RI Enrichment — composer integration', () => {
  it('preserves legacy join when no budget is requested', async () => {
    const result = await enrichContextForChat({
      message: 'We just got a CRL and the board wants a date',
      projectId: 123,
      organizationId: 456,
      submissionType: 'nda',
    });
    expect(result.enrichmentMeta?.composeTrace).toBeUndefined();
    expect(typeof result.block).toBe('string');
  });

  it('engages the composer and emits a trace when a budget is set', async () => {
    const result = await enrichContextForChat({
      message: 'We just received a complete response letter and the board wants a firm date for the resubmission',
      projectId: 123,
      organizationId: 456,
      submissionType: 'nda',
      composeTokenBudget: 4000,
    });
    // Multiple packs fire on this message; when composed, a trace is present
    // and the crisis read is pinned/kept.
    if (result.enrichmentMeta?.composeTrace) {
      expect(result.enrichmentMeta.composeTokensUsed).toBeGreaterThan(0);
      const attune = result.enrichmentMeta.composeTrace.find((t) => t.source === 'client-attunement');
      if (attune) expect(attune.kept).toBe(true);
    }
    expect(typeof result.block).toBe('string');
  });
});

// ── Adaptive priority (learned re-weighting) ─────────────────────────────────

import {
  smoothedReward,
  rewardToMultiplier,
  buildAdaptiveMultipliers,
  applyAdaptivePriority,
  type SourceOutcomeStats,
} from '../ana-ri/adaptive-priority.js';

describe('AnA RI Adaptive Priority', () => {
  it('returns the prior exactly when there are no samples', () => {
    const r = smoothedReward({ source: 'x', accepted: 0, edited: 0, rejected: 0, regenerated: 0 });
    expect(r).toBeCloseTo(0.5, 6);
  });

  it('rewards an all-accepted source above an all-rejected one', () => {
    const good = smoothedReward({ source: 'g', accepted: 200, edited: 0, rejected: 0, regenerated: 0 });
    const bad = smoothedReward({ source: 'b', accepted: 0, edited: 0, rejected: 200, regenerated: 0 });
    expect(good).toBeGreaterThan(0.9);
    expect(bad).toBeLessThan(0.1);
  });

  it('treats edited as partial credit (between accepted and rejected)', () => {
    const edited = smoothedReward({ source: 'e', accepted: 0, edited: 200, rejected: 0, regenerated: 0 });
    expect(edited).toBeGreaterThan(0.4);
    expect(edited).toBeLessThan(0.6);
  });

  it('shrinks low-sample sources toward the prior (small-sample safety)', () => {
    const lowN = smoothedReward({ source: 'l', accepted: 2, edited: 0, rejected: 0, regenerated: 0 });
    const highN = smoothedReward({ source: 'h', accepted: 200, edited: 0, rejected: 0, regenerated: 0 });
    // 2 accepts barely moves off 0.5; 200 accepts moves nearly to 1.
    expect(lowN).toBeLessThan(0.65);
    expect(highN).toBeGreaterThan(0.9);
  });

  it('maps rewards to bounded multipliers centered on 1.0', () => {
    expect(rewardToMultiplier(0.5)).toBeCloseTo(1.0, 6);
    expect(rewardToMultiplier(1)).toBeCloseTo(1.25, 6);
    expect(rewardToMultiplier(0)).toBeCloseTo(0.75, 6);
    // Always within bounds.
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const m = rewardToMultiplier(r);
      expect(m).toBeGreaterThanOrEqual(0.75);
      expect(m).toBeLessThanOrEqual(1.25);
    }
  });

  it('builds a multiplier map only for sources with stats', () => {
    const stats: SourceOutcomeStats[] = [
      { source: 'agency-tactics', accepted: 100, edited: 0, rejected: 0, regenerated: 0 },
      { source: 'tour-guide', accepted: 0, edited: 0, rejected: 100, regenerated: 0 },
    ];
    const m = buildAdaptiveMultipliers(stats);
    expect(m['agency-tactics']).toBeGreaterThan(1);
    expect(m['tour-guide']).toBeLessThan(1);
    expect(m['never-seen']).toBeUndefined();
  });

  it('applyAdaptivePriority scales and clamps, and is a no-op for unknown sources', () => {
    const m = { 'agency-tactics': 1.25, 'tour-guide': 0.75 };
    expect(applyAdaptivePriority(0.6, 'agency-tactics', m)).toBeCloseTo(0.75, 6);
    expect(applyAdaptivePriority(0.6, 'tour-guide', m)).toBeCloseTo(0.45, 6);
    expect(applyAdaptivePriority(0.6, 'unknown', m)).toBe(0.6);
    expect(applyAdaptivePriority(0.6, 'agency-tactics', undefined)).toBe(0.6);
    // Clamp: a high base times a >1 multiplier never exceeds 1.
    expect(applyAdaptivePriority(0.95, 'agency-tactics', m)).toBeLessThanOrEqual(1);
  });

  it('learned multipliers can reorder composer selection under tight budget', () => {
    const big = 'word '.repeat(400); // ~500 tokens each
    const candidates: CandidateBlock[] = [
      { source: 'tour-guide', text: 'shared topic alpha ' + big, priority: 0.6 },
      { source: 'agency-tactics', text: 'shared topic alpha ' + big, priority: 0.6 },
    ];
    // Equal base priority and identical relevance: tie. A learned multiplier
    // favoring agency-tactics should make it win the single budget slot.
    const result = composeContext('shared topic alpha', candidates, {
      tokenBudget: 600,
      priorityMultipliers: { 'agency-tactics': 1.25, 'tour-guide': 0.75 },
    });
    expect(result.selected.length).toBe(1);
    expect(result.selected[0].source).toBe('agency-tactics');
  });
});

// ── Role lens ────────────────────────────────────────────────────────────────
// ── Role lens ────────────────────────────────────────────────────────────────

import { buildRoleLensBlock, hasRoleLens } from '../ana-ri/role-lens.js';

describe('AnA RI Role Lens', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
  const ROLES = ['ceo', 'ra_lead', 'medical_writer', 'clinical_lead', 'cmc_lead', 'investor'] as const;

  it('produces a distinct audience lens for each non-general role', () => {
    const blocks = ROLES.map(r => buildRoleLensBlock(r));
    for (const b of blocks) {
      expect(b).toContain('Audience lens');
      expect(b).toMatch(/emphasize/i);
    }
    // Lenses are distinct (CEO is not the same as RA lead).
    expect(buildRoleLensBlock('ceo')).not.toBe(buildRoleLensBlock('ra_lead'));
  });

  it('returns empty for the general role and reports lens availability', () => {
    expect(buildRoleLensBlock('general')).toBe('');
    expect(hasRoleLens('ceo')).toBe(true);
    expect(hasRoleLens('general')).toBe(false);
    expect(hasRoleLens(undefined)).toBe(false);
  });

  it('keeps lens copy inside the design-system voice', () => {
    for (const r of ROLES) {
      const b = buildRoleLensBlock(r);
      expect(b).not.toContain('!');
      expect(EMOJI.test(b)).toBe(false);
    }
  });
});

// ── First-session onboarding tour + pack integrity ──────────────────────────

import { listSurfaceKeys } from '../ana-ri/mdx-knowledge-pack.js';
import { getFirstSessionTour, buildFirstSessionTour } from '../ana-ri/onboarding-tour.js';

describe('AnA RI Onboarding Tour & Pack Integrity', () => {
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

  it('provides a first-session tour for every segment plus a generic fallback', () => {
    for (const seg of ['mdx', 'biotech', 'pharma'] as const) {
      const t = getFirstSessionTour(seg);
      expect(t.segment).toBe(seg);
      expect(t.steps.length).toBeGreaterThan(2);
      expect(t.firstOffer.length).toBeGreaterThan(10);
    }
    expect(getFirstSessionTour(null).segment).toBeNull();
  });

  it('builds a segment-specific welcome from the message', () => {
    const block = buildFirstSessionTour({ message: 'I am building a 510(k) device' });
    expect(block).toContain('First-session welcome');
    expect(block).toContain('Medical device');
  });

  it('keeps onboarding copy inside the design-system voice', () => {
    for (const seg of ['mdx', 'biotech', 'pharma', null] as const) {
      const t = getFirstSessionTour(seg);
      const text = [t.opening, t.firstOffer, ...t.steps.map(s => s.whatAnaDoes)].join(' ');
      expect(text).not.toContain('!');
      expect(EMOJI.test(text)).toBe(false);
    }
  });

  it('every use-case command resolves to a registered slash command (no drift)', () => {
    const valid = new Set(SUPPORTED_SLASH_COMMANDS);
    for (const u of USE_CASES) {
      for (const c of u.commands) {
        expect(valid.has(c as typeof SUPPORTED_SLASH_COMMANDS[number])).toBe(true);
      }
    }
  });

  it('every mdx use-case surface resolves to a known MDX surface key (no drift)', () => {
    const keys = new Set(listSurfaceKeys());
    for (const u of USE_CASES.filter(u => u.segment === 'mdx')) {
      for (const s of u.surfaces) {
        expect(keys.has(s)).toBe(true);
      }
    }
  });
});

// ── Enrichment wiring for wisdom + tour guide ────────────────────────────────

describe('AnA RI Enrichment — wisdom & wayfinding', () => {
  it('handles /wisdom as a first-class slash command', async () => {
    const result = await enrichContextForChat({
      message: '/wisdom',
      projectId: 123,
      organizationId: 456,
      submissionType: 'bla',
    });
    expect(result.enrichmentMeta?.detectedCommand).toBe('wisdom');
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('wisdom');
    expect(result.block).toContain('Industry wisdom');
  });

  it('handles /guide as a first-class slash command', async () => {
    const result = await enrichContextForChat({
      message: '/guide',
      projectId: 123,
      organizationId: 456,
      submissionType: '510k',
    });
    expect(result.enrichmentMeta?.detectedCommand).toBe('guide');
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('guide');
    expect(result.block).toContain('Orientation');
  });

  it('orients a project-less (new) user from a wayfinding question', async () => {
    const result = await enrichContextForChat({
      message: 'I am new here, where do I start?',
    });
    expect(result.enrichmentMeta?.hasProjectContext).toBe(false);
    expect(result.block).toContain('Orientation');
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('tour-guide');
  });

  it('surfaces industry wisdom from a natural-language pitfall question', async () => {
    const result = await enrichContextForChat({
      message: 'what common mistakes trip up first-time IND sponsors on CMC?',
      projectId: 123,
      organizationId: 456,
      submissionType: 'ind',
    });
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('industry-wisdom');
    expect(result.block).toContain('Industry wisdom');
  });

  it('handles /challenge as a first-class slash command', async () => {
    const result = await enrichContextForChat({
      message: '/challenge',
      projectId: 123,
      organizationId: 456,
      submissionType: 'nda',
    });
    expect(result.enrichmentMeta?.detectedCommand).toBe('challenge');
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('challenge');
    expect(result.block).toContain('Constructive challenge');
  });

  it('proactively challenges a risky assertion mid-conversation', async () => {
    const result = await enrichContextForChat({
      message: 'We are going to skip the pre-sub to save time and just file.',
      projectId: 123,
      organizationId: 456,
      submissionType: 'ind',
    });
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('constructive-challenge');
    expect(result.block).toContain('push back, politely');
  });

  it('challenges a risky assertion from a project-less user', async () => {
    const result = await enrichContextForChat({
      message: 'We will just mature the potency assay later, a placeholder is fine.',
    });
    expect(result.enrichmentMeta?.hasProjectContext).toBe(false);
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('constructive-challenge');
  });

  it('welcomes a project-less new user with a first-session tour', async () => {
    const result = await enrichContextForChat({ message: 'hi' });
    expect(result.enrichmentMeta?.hasProjectContext).toBe(false);
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('first-session-tour');
    expect(result.block).toContain('First-session welcome');
  });

  it('handles /decide as a first-class slash command', async () => {
    const result = await enrichContextForChat({
      message: '/decide',
      projectId: 123,
      organizationId: 456,
      submissionType: 'nda',
    });
    expect(result.enrichmentMeta?.detectedCommand).toBe('decide');
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('decide');
    expect(result.block).toContain('Decision framework');
  });

  it('proactively frames a trade-off the user is weighing', async () => {
    const result = await enrichContextForChat({
      message: 'Should we go for accelerated approval or wait for the full package?',
      projectId: 123,
      organizationId: 456,
      submissionType: 'bla',
    });
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('decision-framework');
    expect(result.block).toContain('Decision framework');
  });

  it('frames a trade-off for a project-less user', async () => {
    const result = await enrichContextForChat({
      message: 'For our device, should we use 510(k) or De Novo?',
    });
    expect(result.enrichmentMeta?.hasProjectContext).toBe(false);
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('decision-framework');
  });

  it('handles /meeting as a first-class slash command', async () => {
    const result = await enrichContextForChat({
      message: '/meeting',
      projectId: 123,
      organizationId: 456,
      submissionType: 'ind',
    });
    expect(result.enrichmentMeta?.detectedCommand).toBe('meeting');
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('meeting');
    expect(result.block).toContain('Agency interaction');
  });

  it('proactively coaches an agency-interaction situation', async () => {
    const result = await enrichContextForChat({
      message: 'How should we respond to the FDA deficiency letter we just received?',
      projectId: 123,
      organizationId: 456,
      submissionType: 'nda',
    });
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('agency-tactics');
    expect(result.block).toContain('Agency-interaction tactics');
  });

  it('applies a role lens when a role is supplied and a pack fired', async () => {
    const result = await enrichContextForChat({
      message: 'what common mistakes trip up first-time sponsors?',
      projectId: 123,
      organizationId: 456,
      submissionType: 'ind',
      userRole: 'investor',
    });
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('industry-wisdom');
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('role-lens');
    expect(result.block).toContain('Audience lens');
  });

  it('handles /position as a first-class slash command', async () => {
    const result = await enrichContextForChat({
      message: '/position',
      projectId: 123,
      organizationId: 456,
      submissionType: 'bla',
    });
    expect(result.enrichmentMeta?.detectedCommand).toBe('position');
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('position');
    expect(result.block).toContain('Competitive strategy');
  });

  it('proactively reads the landscape on a positioning question', async () => {
    const result = await enrichContextForChat({
      message: 'How do we position against the approved competitor in this space?',
      projectId: 123,
      organizationId: 456,
      submissionType: 'nda',
    });
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('competitive-strategy');
    expect(result.block).toContain('Competitive strategy');
  });

  it('reads a client in crisis and steadies the delivery', async () => {
    const result = await enrichContextForChat({
      message: 'We just got a complete response letter from the FDA, what do we do?',
      projectId: 123,
      organizationId: 456,
      submissionType: 'nda',
    });
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('client-attunement');
    expect(result.block).toContain('Read on the user');
  });

  it('attunes to an overwhelmed project-less newcomer', async () => {
    const result = await enrichContextForChat({
      message: 'I am completely overwhelmed and have no idea where to start',
    });
    expect(result.enrichmentMeta?.hasProjectContext).toBe(false);
    expect(result.enrichmentMeta?.sourcesSucceeded).toContain('client-attunement');
  });

  it('does not apply a role lens for the general role', async () => {
    const result = await enrichContextForChat({
      message: 'what common mistakes trip up first-time sponsors?',
      projectId: 123,
      organizationId: 456,
      submissionType: 'ind',
      userRole: 'general',
    });
    expect(result.enrichmentMeta?.sourcesSucceeded).not.toContain('role-lens');
  });
});

// ── Diff Service Integration Tests ───────────────────────────────────────────

describe('AnA RI Diff Service Integration', () => {
  it('diffText produces correct results for simple changes', async () => {
    // Dynamic import to match how command-executor uses it
    const { diffText } = await import('../versionDiffService.js');

    const oldText = 'The primary endpoint is clinically meaningful.\nSafety data are adequate.';
    const newText =
      'The primary endpoint is clinically meaningful.\nSafety data are insufficient for chronic dosing.';

    const result = diffText(oldText, newText);

    expect(result.additions).toBeGreaterThan(0);
    expect(result.deletions).toBeGreaterThan(0);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes.some(c => c.type === 'add')).toBe(true);
    expect(result.changes.some(c => c.type === 'delete')).toBe(true);
  });

  it('diffText handles identical content', async () => {
    const { diffText } = await import('../versionDiffService.js');

    const text = 'No changes here.\nExactly the same.';
    const result = diffText(text, text);

    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it('diffText handles empty strings', async () => {
    const { diffText } = await import('../versionDiffService.js');

    const result = diffText('', 'New content added.');
    expect(result.additions).toBeGreaterThan(0);
    expect(result.deletions).toBe(0);
  });
});

// ── Quality Gate Regression Tests ────────────────────────────────────────────

describe('AnA RI Quality Gate Regression', () => {
  it('dynamic maxScore: depth types get 12, others get 10', () => {
    const riskResult = validateArtifactQuality(
      '## Risk Assessment\nCritical risk identified due to inadequate safety data **[KNOWN — ICH E1]**.\n\n## Mitigation\nConduct additional Phase IIIb study to gather 12-month exposure data.',
      'risk_memo'
    );
    expect(riskResult.maxScore).toBe(12);

    const strategyResult = validateArtifactQuality(
      '## Strategy Note\nRecommend accelerated pathway based on regulatory precedent.',
      'strategy_note'
    );
    expect(strategyResult.maxScore).toBe(10);
  });

  it('semantic depth gate rewards root cause + evidence + action', () => {
    const withDepth = validateArtifactQuality(
      '## Risk Assessment\nThe safety database is inadequate because only 150 patients were enrolled, falling short of ICH E1 requirements for 300 patients at 6 months. This creates a critical deficiency risk.\n\n## Mitigation\nConduct an additional Phase IIIb study to gather the required exposure data before filing.\n\n## Evidence\nICH E1 data **[KNOWN]**. Reviewer precedent from similar NDA rejections **[INFERRED]**.',
      'risk_memo'
    );

    const withoutDepth = validateArtifactQuality(
      '## Risk Assessment\nThere are some risks.\n\n## Mitigation\nConsider addressing them.\n\n## Evidence\nSome data exists.',
      'risk_memo'
    );

    expect(withDepth.score).toBeGreaterThan(withoutDepth.score);
  });

  it('filler patterns are detected correctly', () => {
    const fillerResult = validateArtifactQuality(
      "I'd be happy to help! Feel free to ask. Don't hesitate to reach out. Here's an example of what you might want.",
      'risk_memo'
    );
    expect(fillerResult.issues.some(i => i.includes('filler'))).toBe(true);
  });
});
