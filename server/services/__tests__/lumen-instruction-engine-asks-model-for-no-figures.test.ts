/**
 * The instruction engine never asks the model for a readiness figure, an effort
 * estimate, a submission or completion date, or a Go/No-Go.
 *
 * What the code used to do (until 2026-10-15): VALIDATE-COMPLETENESS required,
 * for every validation, a "Readiness score — percentage of required elements
 * present", an "Estimated effort … (hours/days)" and a "Go/No-Go
 * recommendation"; the Dossier Manager told the model to "Predict submission
 * readiness date based on current velocity" and to give "Realistic time
 * estimates per section"; Narrative Intelligence to "Rate each section's
 * readiness for submission (0-100%)"; Traceability to provide velocity metrics
 * and predict a completion date; Escalation to estimate timeline impact; and the
 * Verify gate to "confirm 100% of data claims traced". No engine computed any of
 * those figures or that verdict — the model would have made them up. CLAUDE.md
 * RULE 2: "A tool that asks a model for a figure is a defect."
 *
 * Readiness is now quoted only from an engine or tool result, named, and is
 * otherwise "not assessed".
 */
import { describe, expect, it } from 'vitest';

import { assembleInstructionEnginePrompt } from '../lumen-instruction-engine.js';

// Explicit canonical owners select every inherited section; empty is generic core.
const prompt = assembleInstructionEnginePrompt(['submission-center', 'document-authoring']);

describe('instruction engine — the model is asked for no figure, date or verdict', () => {
  it.each([
    ['a readiness percentage', 'Readiness score'],
    ['a 0-100% section rating', '(0-100%)'],
    ['effort sizing in hours/days', 'Estimated effort'],
    ['a Go/No-Go', 'Go/No-Go recommendation'],
    ['a predicted readiness date', 'Predict submission readiness date'],
    ['per-section time estimates', 'Realistic time estimates'],
    ['a predicted completion date', 'Predicting completion date'],
    ['velocity metrics it would compute itself', 'Providing velocity metrics'],
    ['an estimated timeline impact', 'Include estimated timeline impact'],
    ['a traced-claims percentage', '100% of data claims'],
  ])('does not ask for %s', (_what, phrase) => {
    expect(prompt).not.toContain(phrase);
  });

  it('tells the model to quote readiness only from an engine or tool result, else "not assessed"', () => {
    expect(prompt).toMatch(/readiness[^\n]*only from[^\n]*engine or tool result/i);
    expect(prompt).toContain('not assessed');
  });

  it('keeps the qualitative completeness work: blockers, gaps and a risk-ranked plan', () => {
    expect(prompt).toContain('**Blocker list**');
    expect(prompt).toContain('**Gap list**');
    expect(prompt).toContain('**Risk-ranked action plan**');
  });
});
