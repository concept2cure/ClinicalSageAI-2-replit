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
const REGISTER_FORMS = 'client/src/concept2cure/v2/surfaces/ProtocolRegisterForms.tsx';
/* ProtocolDev.tsx was split on 2026-09-21 when its registers became writable
   (see that file's header): the loaded document and the register-form mount are
   ProtocolDevWorkspace.tsx, the schedule-of-assessments grid ProtocolDevSoa.tsx,
   and the other panes their ProtocolDev*.tsx siblings. The contract follows the
   code there: positive assertions read the file that now holds the behaviour,
   and every "must not" scans the whole family, not just the entry file. */
const PROTOCOL_DEV_WORKSPACE = 'client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx';
const PROTOCOL_DEV_SOA = 'client/src/concept2cure/v2/surfaces/ProtocolDevSoa.tsx';

/** ProtocolDev.tsx and every ProtocolDev*.ts(x) sibling, repo-relative. */
function protocolDevFamily(): string[] {
  const dir = path.dirname(PROTOCOL_DEV);
  const files = fs.readdirSync(path.join(REPO_ROOT, dir))
    .filter((n) => /^ProtocolDev.*\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n))
    .map((n) => dir + '/' + n);
  // An anchor, so a rename cannot shrink the scan to nothing unnoticed.
  for (const must of [PROTOCOL_DEV, PROTOCOL_DEV_WORKSPACE, PROTOCOL_DEV_SOA]) expect(files).toContain(must);
  return files;
}

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
  /* e0e041080 ("the e-signature dialog wrote nothing — six dead controls")
     wired add-objective, add-criterion, finalize and export to the governed
     endpoints that had existed all along, and deleted GovernedActionDialog —
     whose one mount was `onConfirm={() => {}}`. The two contracts that used to
     hold this surface honest ("must disclose that nothing is written", "must
     force esign false") flipped polarity: the acts are REAL now, so the old
     disclosures would be false in the other direction. What is pinned instead:
     the real write path, its fail-closed shape, and that no client-side
     signature ceremony returns. */

  it('its governed acts reach the server — the no-op dialog and its disclosure are gone together', () => {
    // The old honest disclosure must not reappear (it would now be a false
    // claim of NON-persistence), and neither may the dialog it excused —
    // anywhere in the surface.
    for (const f of protocolDevFamily()) {
      const src = code(f);
      expect(src, f).not.toMatch(/not yet connected to the record/i);
      expect(src, f).not.toMatch(/GovernedActionDialog/);
    }
    // The surface renders the workspace that owns the register-form mount.
    expect(code(PROTOCOL_DEV)).toMatch(/import \{ ProtocolWorkspaceDoc \} from '\.\/ProtocolDevWorkspace'/);
    expect(code(PROTOCOL_DEV)).toMatch(/<ProtocolWorkspaceDoc\b/);
    // The one real path: the governed register form (POST + server-enforced
    // reason). Its success copy is produced in onDone — which fires only after
    // the 201 — and the surface then RE-READS the governed row (onChanged)
    // rather than appending locally.
    const src = code(PROTOCOL_DEV_WORKSPACE);
    expect(src).toMatch(/<ProtocolRegisterForm/);
    const mount = src.slice(src.indexOf('<ProtocolRegisterForm'), src.indexOf('<C2CToast'));
    expect(mount).toContain('onDone=');
    expect(mount).toContain('registerDoneMessage(');
    expect(mount).toContain('onChanged?.()');
    // The copy moved out of the JSX into registerDoneMessage. It is said there
    // and nowhere else, and registerDoneMessage is called from that onDone
    // and nowhere else — so it still cannot be shown on any other path.
    const copyFn = src.slice(src.indexOf('function registerDoneMessage'));
    expect(src.indexOf('function registerDoneMessage')).toBeGreaterThan(-1);
    expect(copyFn).toContain('was written to the governed register');
    expect(src.split('was written to the governed register').length - 1).toBe(1);
    expect(src.split('registerDoneMessage(').length - 1).toBe(2); // the definition + the onDone call
  });

  it('the write path fails closed: reason floor, no success without the server', () => {
    // ProtocolRegisterForms is the module every governed act on this surface
    // routes through. If "was written to the governed register" is ever shown,
    // these are the properties that make it true.
    const forms = code(REGISTER_FORMS);
    expect(forms).toMatch(/reason\.length\s*<\s*8/);
    expect(forms).toMatch(/if \(!res\.ok\)/);
    expect(forms).toMatch(/Nothing was persisted/);
    // onDone (the only success callback) is reached only after the awaited
    // write resolves — a throw above it never announces anything.
    expect(forms.indexOf('await submitProtocolRegister')).toBeGreaterThan(-1);
    expect(forms.indexOf('onDone(kind, result)')).toBeGreaterThan(forms.indexOf('await submitProtocolRegister'));
  });

  it('builds no signature ceremony of its own — its two signed acts use the shared EsignModal, verified by the server', () => {
    // The deleted dialog's ceremony (esign flag, password re-auth, a claimed
    // Part 11 signature with nothing behind it) must not come back in any file
    // of the surface: no local password field, no local esign flag.
    for (const f of protocolDevFamily()) {
      const src = code(f);
      expect(src, f).not.toMatch(/\besign\s*[:=]/);
      expect(src, f).not.toMatch(/type="password"/);
      expect(src, f).not.toMatch(/Part 11 e-signature/);
    }
    // Since 2026-09-23 finalizing and a reviewer's disposition ARE electronic
    // signatures (D5, finding P1). They run the shared EsignModal and nothing
    // else, and the credentials it collects go to the server as `reauth`, where
    // the signing transaction re-verifies them. A signature the browser alone
    // vouched for would be the defect above in a new polarity.
    const signing = code('client/src/concept2cure/v2/surfaces/ProtocolDevSigning.tsx');
    expect(signing).toMatch(/import \{ EsignModal[^}]*\} from '\.\.\/\.\.\/_shared\/components\/EsignModal'/);
    const writes = code('client/src/concept2cure/v2/surfaces/ProtocolDevWrites.ts');
    expect(writes).toMatch(/reauth: \{ password: s\.password/);
    expect(writes).toContain('/api/protocol-development/documents/${documentId}/finalize');
    expect(writes).toContain('/api/protocol-reviews/assignments/${assignmentId}/disposition');
    // What IS offered instead: the SoA grid stays read-only until a governed
    // reason of at least 8 characters is given, and every tick posts to the
    // audited SoA router. (The grid lives in ProtocolDevSoa.tsx since the
    // split; the literal 8 became MIN_REASON there.)
    const soa = code(PROTOCOL_DEV_SOA);
    expect(soa).toMatch(/const MIN_REASON = 8;/);
    expect(soa).toMatch(/const editable = Boolean\(canWrite\) && reason\.trim\(\)\.length >= MIN_REASON;/);
    expect(soa).toMatch(/if \(!editable \|\| saving\) return;/);
    expect(soa).toContain("'/api/protocol-soa/cells'");
    expect(soa).toContain("'/api/protocol-soa/cells/clear'");
    // The workspace mounts that grid, so the gate above is the one users meet.
    expect(code(PROTOCOL_DEV_WORKSPACE)).toMatch(/import \{ SoaTab \} from '\.\/ProtocolDevSoa'/);
    expect(code(PROTOCOL_DEV_WORKSPACE)).toMatch(/<SoaTab\b/);
  });

  it('does not claim the document body autosaves', () => {
    for (const f of protocolDevFamily()) expect(code(f), f).not.toMatch(/Autosaved/);
  });
});
