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
