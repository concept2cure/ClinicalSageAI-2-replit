import { describe, expect, it } from 'vitest';
import {
  assembleInstructionEnginePrompt, getInstructionEnginePrompt, getDossierWorkflowPrompt,
  getDataRoomPrompt, getDossierManagerPrompt, getDocumentEditorPrompt,
  getNarrativeShapingPrompt, getTraceabilityPrompt, getRegulatoryPrecedentPrompt,
  getCrossJurisdictionalPrompt,
} from '../lumen-instruction-engine';

const expected = (flags: string) => [
  getInstructionEnginePrompt(), ...(flags.includes('A') ? [getDossierWorkflowPrompt()] : []),
  getDataRoomPrompt(), ...(flags.includes('S') ? [getDossierManagerPrompt()] : []),
  ...(flags.includes('E') ? [getDocumentEditorPrompt()] : []), getNarrativeShapingPrompt(),
  getTraceabilityPrompt(), getRegulatoryPrecedentPrompt(),
  ...(flags.includes('G') ? [getCrossJurisdictionalPrompt()] : []),
].join('\n');

describe('instruction ownership follows the existing core modules', () => {
  it.each([
    ['ind-checklist', 'ASG'], ['submission-center', 'ASEG'],
    ['device-510k', 'S'], ['device-pma', 'S'], ['device-submission', 'S'], ['device-cer', 'ASG'],
    ['cmc', 'AE'], ['document-authoring', 'AE'], ['protocol-dev', 'AE'],
  ])('%s receives exactly its inherited blocks (%s)', (moduleId, flags) => {
    expect(assembleInstructionEnginePrompt([moduleId])).toBe(expected(flags));
  });

  it.each([
    ['ectd-coauthor', 'ASEG'], ['ind-filing', 'ASG'], ['nda-bla', 'SG'],
    ['510k-submission', 'S'], ['pma-submission', 'S'], ['ce-marking', 'SG'],
    ['cmc-wizard', 'AE'], ['doc-canvas', 'AE'], ['csr-author', 'AE'],
    ['cer-generator', 'A'], ['protocol-designer', 'AE'],
    ['maa-submission', 'G'], ['global-strategy', 'G'],
  ])('preserves the original nonempty legacy output for %s', (moduleId, flags) => {
    expect(assembleInstructionEnginePrompt([moduleId])).toBe(expected(flags));
  });

  it.each([[], ['tasks'], ['not-a-module']].map(modules => ({ modules })))('empty or unrelated module set $modules gets generic core only', ({ modules }) => {
    expect(assembleInstructionEnginePrompt(modules)).toBe(expected(''));
  });

  it('combines canonical and compatibility keys without repeating blocks', () => {
    expect(assembleInstructionEnginePrompt(['submission-center', 'ectd-coauthor', 'document-authoring', 'device-cer']))
      .toBe(expected('ASEG'));
  });
});
