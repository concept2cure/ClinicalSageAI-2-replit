import { describe, it, expect } from 'vitest';
import * as bridge from '../authoring-canonical-bridge.js';

/* 2026-10-17 (D2, document store consolidation step 6): the authoring →
   concept2cure_artifacts projection is retired. The submit route's behaviour is
   pinned by server/routes/__tests__/authoring-submit-no-artifact-projection.pglite.test.ts;
   this pins that the module no longer offers a way back to it. */
describe('authoring-canonical-bridge after step 6', () => {
  it('exports no projection: only the snapshot reader and the assembler remain', () => {
    expect(Object.keys(bridge).sort()).toEqual(['assembleAuthoredSections', 'defaultAuthoringBridgeDeps']);
    expect(Object.keys(bridge.defaultAuthoringBridgeDeps())).toEqual(['loadDocumentSnapshot']);
  });

  it('assembles sections in the order given, heading each by code and title', () => {
    expect(bridge.assembleAuthoredSections([
      { code: '2.5.1', title: 'Rationale', content: 'Why.' },
      { code: null, title: null, content: 'Loose text.' },
      { code: '2.5.2', title: 'Overview', content: null },
    ])).toBe('## 2.5.1 — Rationale\n\nWhy.\n\nLoose text.\n\n## 2.5.2 — Overview');
  });
});
