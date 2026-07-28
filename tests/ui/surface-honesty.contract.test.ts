/**
 * Contract: a surface may not claim something happened that did not happen.
 *
 * This is not a style rule. In a 21 CFR Part 11 product, a control that reports
 * a regulatory action occurred — when no bytes left the browser — is the most
 * dangerous artefact the codebase can ship. Three shipped:
 *
 *   mdx/components/AnaDrafter.tsx
 *     "Save draft" was bound to onClose and discarded every edit. A primary
 *     button read "Sent to FDA" after a click whose entire implementation was
 *     setDraft({...draft, status:'sent'}), tooltipped "Send to FDA via eSTAR
 *     portal". The file contains no network call of any kind.
 *
 *   v2/surfaces/ProtocolGov.tsx
 *     A module-level counter minting Part 11 audit identifiers client-side. The
 *     governed-action dialog called it on every confirm and toasted
 *     "<Action> recorded" with the invented id, behind a dialog whose stated
 *     basis is "21 CFR Part 11 e-signature", while its caller's onConfirm was a
 *     literal no-op. A fabricated audit id is worse than none: it is exactly
 *     the artefact an inspector would ask to trace, and it traces to nothing.
 *
 *   v2/surfaces/DocJourney.tsx
 *     A green-check "Autosaved" pill above a contentEditable page with no
 *     onInput, no state and no write. Typed text was lost on reload and on any
 *     re-render.
 *
 * These assertions are deliberately narrow and name real files. A generic
 * "does this component persist?" check is not statically decidable, and a vague
 * gate that some future refactor silently satisfies is worse than none.
 *
 * Every "must not contain" check scans COMMENT-STRIPPED source. Without that,
 * each assertion matches the comment documenting the defect it guards against
 * and fails on a file that is actually correct — which happened four times
 * while these tests were being written.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './_strip-comments';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIENT = path.join(REPO_ROOT, 'client/src');

/** Source with comments blanked — for "must NOT contain" assertions. */
const code = (r: string) => stripComments(fs.readFileSync(path.join(REPO_ROOT, r), 'utf8'));
/** Raw source — for the few assertions that a disclosure IS present. */
const raw = (r: string) => fs.readFileSync(path.join(REPO_ROOT, r), 'utf8');

const rel = (abs: string) => path.relative(REPO_ROOT, abs).split(path.sep).join('/');

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk(CLIENT);
  return out;
}

const A_DRAFTER = 'client/src/concept2cure/mdx/components/AnaDrafter.tsx';
const DOC_JOURNEY = 'client/src/concept2cure/v2/surfaces/DocJourney.tsx';
const PROTOCOL_DEV = 'client/src/concept2cure/v2/surfaces/ProtocolDev.tsx';

describe('no surface mints its own audit identifier', () => {
  it('audit ids come from the server or not at all', () => {
    // Real audit ids are issued by recordGovernedAction, which writes a
    // hash-chained audit_logs row and returns its id. Anything the client
    // invents is unfalsifiable and untraceable.
    const offenders: string[] = [];
    for (const f of sourceFiles()) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/['"`]AUD-['"`]\s*\+|nextAudit\s*\(/g)) {
        offenders.push(`${rel(f)}: ${m[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('AnaDrafter does not claim a regulatory transmission', () => {
  it('has no network call — the premise of every assertion below', () => {
    // If this becomes false the file gained a backend, and these assertions
    // must be revisited rather than deleted.
    expect(code(A_DRAFTER)).not.toMatch(/fetch\s*\(|['"`]\/api\//);
  });

  it('no control reports the response was sent to an agency', () => {
    const src = code(A_DRAFTER);
    expect(src).not.toMatch(/Sent to FDA/);
    expect(src).not.toMatch(/eSTAR portal/);
  });

  it('never sets a draft to a transmitted state', () => {
    expect(code(A_DRAFTER)).not.toMatch(/status:\s*['"]sent['"]/);
  });

  it('states that the draft is not persisted', () => {
    expect(raw(A_DRAFTER)).toMatch(/not saved to the record/i);
  });
});

describe('DocJourney does not claim to autosave', () => {
  it('the page is not editable — it has no save path', () => {
    // contentEditable={false} on the watermark is fine; a bare contentEditable
    // on the page is the trap.
    expect(code(DOC_JOURNEY)).not.toMatch(/contentEditable(?!\s*=\s*\{\s*false\s*\})/);
  });

  it('the toolbar does not display an autosave confirmation', () => {
    expect(code(DOC_JOURNEY)).not.toMatch(/Autosaved/);
  });

  it('says what it actually is', () => {
    expect(raw(DOC_JOURNEY)).toMatch(/Read-only preview/);
  });
});

describe('ProtocolDev does not present unpersisted actions as filed', () => {
  it('its governed-action dialog discloses that nothing is written', () => {
    // onConfirm is still `() => {}`; the disclosure is what makes that honest.
    expect(raw(PROTOCOL_DEV)).toMatch(/not yet connected to the record/i);
  });

  it('does not offer an e-signature for an action it cannot record', () => {
    // Signing implies a Part 11 record exists. govAct forces esign false.
    expect(code(PROTOCOL_DEV)).toMatch(/esign:\s*false/);
  });

  it('does not claim the document body autosaves', () => {
    expect(code(PROTOCOL_DEV)).not.toMatch(/Autosaved/);
  });
});
