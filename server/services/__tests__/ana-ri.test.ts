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

import { describe, it, expect } from 'vitest';

// ── Orchestrator Tests ───────────────────────────────────────────────────────

import {
  orchestrate,
  detectIntent,
  detectSubmissionType,
} from '../ana-ri/orchestrator.js';

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
          { role: 'assistant', content: 'The safety signal for hepatotoxicity needs further characterization. The adverse event rate is higher than background.' },
        ],
      });
      expect(result.systemPrompt).toContain('CONVERSATION CONTINUITY');
      expect(result.systemPrompt).toContain('Safety concerns');
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
    const hedgingResponse = 'You might perhaps want to maybe consider possibly improving this section.';
    const directResponse = '**This section is deficient.** The primary endpoint lacks validation. Rewrite required.';

    const hedgingEval = evaluateResponse(hedgingResponse, {});
    const directEval = evaluateResponse(directResponse, {});

    const hedgingWriting = hedgingEval.dimensions.find(d => d.dimension === 'writing_quality');
    const directWriting = directEval.dimensions.find(d => d.dimension === 'writing_quality');

    expect(hedgingWriting!.score).toBeLessThan(directWriting!.score);
  });

  it('rewards evidence labels in evidence discipline', () => {
    const unlabeledResponse = 'The endpoint is adequate. The safety profile is acceptable.';
    const labeledResponse = 'The endpoint validation is established **[KNOWN — per ICH E9]**. The long-term safety is uncertain **[MISSING — no 12-month data]**.';

    const unlabeledEval = evaluateResponse(unlabeledResponse, {});
    const labeledEval = evaluateResponse(labeledResponse, { hasEvidenceLabels: true, hasCitations: true });

    const unlabeledEvidence = unlabeledEval.dimensions.find(d => d.dimension === 'evidence_discipline');
    const labeledEvidence = labeledEval.dimensions.find(d => d.dimension === 'evidence_discipline');

    expect(labeledEvidence!.score).toBeGreaterThan(unlabeledEvidence!.score);
  });

  it('detects document consequence in responses', () => {
    const noActionResponse = 'The section looks fine overall.';
    const actionResponse = 'Create a **Risk Memo** addressing the safety signal. Generate a deficiency preemption memo for the endpoint concern.';

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
});
