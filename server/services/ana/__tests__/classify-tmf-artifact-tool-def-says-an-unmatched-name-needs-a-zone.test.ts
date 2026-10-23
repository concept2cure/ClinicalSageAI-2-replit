/**
 * classify_tmf_artifact tells AnA what happens to a name that matches no zone
 * keyword (2026-10-15).
 *
 * The description said a zone-less artifact "is AUTO-CLASSIFIED into a DIA TMF
 * Reference Model zone by name" — true when that classifier filed every
 * unmatched name in Zone 2. It no longer does: an unmatched name is
 * 'unclassified' (etmf-logic.classifyArtifact) and addArtifactTx refuses it,
 * naming the missing zone. So AnA was told a filing would land that is refused,
 * and was not told to ask the user for the zone.
 */
import { describe, it, expect } from 'vitest';
import { CLASSIFY_TMF_ARTIFACT } from '../notifications-study-memory-tool-defs';
import { classifyArtifact } from '../../etmf/etmf-logic';

// The provider trims tool descriptions here (server/services/ai-gateway/gateway.ts, not exported).
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

describe('classify_tmf_artifact', () => {
  it('the classifier it describes leaves an unmatched name without a zone', () => {
    expect(classifyArtifact('holiday-photos-notes').confidence).toBe('unclassified');
    expect(classifyArtifact('holiday-photos-notes').zone).toBeNull();
  });

  it('does not promise that every zone-less artifact is auto-classified', () => {
    expect(CLASSIFY_TMF_ARTIFACT.description).not.toMatch(/it is AUTO-CLASSIFIED/);
  });

  it('says an unmatched name is unclassified and not filed, and to ask the user for the zone', () => {
    const d = CLASSIFY_TMF_ARTIFACT.description;
    expect(d).toMatch(/matches no zone keyword is unclassified and is not filed/);
    expect(d).toMatch(/ask the user which zone \(1-11\)/);
    const zone = (CLASSIFY_TMF_ARTIFACT.input_schema.properties as Record<string, { description?: string }>).zone;
    expect(zone.description).not.toMatch(/omit to auto-classify\.$/);
    expect(zone.description).toMatch(/unmatched name is refused/);
  });

  it('fits under the provider description trim', () => {
    expect(CLASSIFY_TMF_ARTIFACT.description.length).toBeLessThan(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
  });
});
