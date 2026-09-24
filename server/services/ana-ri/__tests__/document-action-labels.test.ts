/**
 * The next actions the stream offers are shown as buttons that ask AnA for
 * the thing named, so each one must go out as its label — never the internal
 * id ("rewritten_section" was both what the editor showed and what its button
 * sent). The stream maps each id through DOCUMENT_ACTIONS
 * (routes/ana-ri/stream.ts); this pins that every id the orchestrator can
 * suggest — the whole DocumentActionType space — has a label a person can read.
 */
import { describe, it, expect } from 'vitest';

import { DOCUMENT_ACTIONS } from '../document-actions';

describe('next actions go out as labels', () => {
  it('every action type has a readable label', () => {
    const entries = Object.entries(DOCUMENT_ACTIONS);
    expect(entries.length).toBeGreaterThanOrEqual(8);
    for (const [id, action] of entries) {
      expect(action.label, id).toMatch(/^[A-Z][A-Za-z ]+$/);
      expect(action.label).not.toBe(id);
    }
  });
});
