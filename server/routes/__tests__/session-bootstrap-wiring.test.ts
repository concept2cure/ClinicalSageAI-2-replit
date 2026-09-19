/**
 * Every canonical chat entry point rehydrates at session start.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The session-start rehydration — the working summary, the top project and
 * client atoms, AnA's own past lessons, and (the point of the whole
 * document-catalog workstream) WHAT FILES THE CLIENT HAS, where each is filed
 * and what it is for — was called from exactly one place:
 * `POST /api/chat/send-message`.
 *
 * The product has two canonical chat endpoints, and it is the OTHER one,
 * `POST /api/ana-ri/stream`, that a chat UI actually uses. There, memory was
 * query-driven only: it answers what the user just typed and never says a
 * document exists. So a streaming session began not knowing the client had
 * uploaded anything — the exact "she doesn't remember the file is there" this
 * workstream was built to end, still true on the path that matters most,
 * because the capability had been wired to one of two equivalent doors.
 *
 * ── Why a source-reading test ────────────────────────────────────────────────
 * Both handlers are thousand-line streaming routes with a dozen external
 * dependencies; standing one up to observe a system turn would test the
 * harness. What has to hold is narrow and structural — each path calls the one
 * gated helper — and that is exactly what reading the source can assert. It is
 * the same shape as the persona tripwire: cheap, and it fails the moment
 * someone adds a third chat path or quietly drops the call from one.
 *
 * If a third canonical chat entry point appears, add it here. A path missing
 * from this list is a path that silently starts cold.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

/** endpoint → the module that handles it. */
const CHAT_ENTRY_POINTS: Array<{ endpoint: string; file: string }> = [
  { endpoint: 'POST /api/chat/send-message', file: 'server/routes/chat/send-message.ts' },
  { endpoint: 'POST /api/ana-ri/stream', file: 'server/routes/ana-ri/stream.ts' },
];

const read = (rel: string): string => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('session-start rehydration is on every chat path', () => {
  it.each(CHAT_ENTRY_POINTS)('$endpoint calls sessionBootstrapBlockFor', ({ file }) => {
    expect(read(file)).toContain('sessionBootstrapBlockFor');
  });

  it.each(CHAT_ENTRY_POINTS)('$endpoint injects the block it gets back', ({ file }) => {
    // Building the block and dropping it is the same outcome as never building
    // it, and is the easier mistake to make in a refactor.
    const src = read(file);
    expect(src).toMatch(/sessionBootstrapBlockFor\([\s\S]{0,600}?\)/);
    expect(src).toMatch(/BootstrapBlock|bootstrapBlock/);
  });

  it('neither path carries its own copy of the gate', () => {
    // The helper owns shouldAutoBootstrap, the ANA_SESSION_BOOTSTRAP_AUTO
    // kill-switch and the try/catch. A route re-implementing any of them is how
    // the two paths diverged in the first place.
    for (const { file } of CHAT_ENTRY_POINTS) {
      const src = read(file);
      expect(src, `${file} should not re-implement the gate`).not.toContain('shouldAutoBootstrap');
      expect(src, `${file} should not read the kill-switch itself`).not.toContain(
        'ANA_SESSION_BOOTSTRAP_AUTO',
      );
    }
  });

  it('the helper still owns the gate, the kill-switch and the failure path', () => {
    const helper = read('server/services/ana-session-bootstrap.ts');
    expect(helper).toContain('shouldAutoBootstrap');
    expect(helper).toContain('ANA_SESSION_BOOTSTRAP_AUTO');
    // Never throws: a failed rehydration degrades the turn, it does not end it.
    expect(helper).toMatch(/catch\s*\{\s*return '';\s*\}/);
  });
});
