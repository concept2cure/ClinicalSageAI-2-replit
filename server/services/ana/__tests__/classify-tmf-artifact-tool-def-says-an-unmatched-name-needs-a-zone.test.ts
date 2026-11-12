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
  it('the classifier it describes names no record for an unmatched name', () => {
    expect(classifyArtifact('holiday-photos-notes').confidence).toBe('unclassified');
    expect(classifyArtifact('holiday-photos-notes').zone).toBeNull();
  });

  it('does not promise that every zone-less artifact is auto-classified', () => {
    expect(CLASSIFY_TMF_ARTIFACT.description).not.toMatch(/it is AUTO-CLASSIFIED/);
  });

  /* 2026-11-12 (eTMF convergence E4 step 3, L-1): the tool files a record of the reference model for a study, through
     the deployed store. There is no zone to give: a name that is no record is refused, and AnA asks which record. */
  it('says an unmatched name is unclassified and not filed, and to ask the user which record it is', () => {
    const d = CLASSIFY_TMF_ARTIFACT.description;
    expect(d).toMatch(/is unclassified and is not filed/);
    expect(d).toMatch(/ask the user which record it is/);
    const props = CLASSIFY_TMF_ARTIFACT.input_schema.properties as Record<string, { description?: string }>;
    expect(props.artifact_name.description).toMatch(/unmatched name is refused/);
    expect(props).not.toHaveProperty('zone');
    expect(props).not.toHaveProperty('status');
    expect(CLASSIFY_TMF_ARTIFACT.input_schema.required).toEqual(['study_id', 'artifact_name']);
  });

  it('fits under the provider description trim', () => {
    expect(CLASSIFY_TMF_ARTIFACT.description.length).toBeLessThan(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
  });
});
