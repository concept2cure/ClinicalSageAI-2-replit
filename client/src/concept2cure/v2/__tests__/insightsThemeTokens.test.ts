/**
 * The Reporting canvas's status, severity and lock colours are theme tokens
 * (reporting review 2026-10-01, DESIGN-1 and DESIGN-2).
 *
 * The critical tag was a fixed #8a3a3a (1.98:1 on the dark page, dimmer than
 * "High"), and the status chips mixed their hue toward #000, which sinks the
 * dark theme's tokens to 2.6-3.6:1. ci:token-contrast checks token pairs and
 * ci:design-system does not read CSS colours, so neither could see a literal
 * in a rule. This reads the rules themselves.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '..', 'styles', 'insights-v2.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector list contains `selector`. */
function declarationsOf(selector: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (m[1].split(',').some((s) => s.trim() === selector)) out.push(m[2]);
  }
  return out.join(';');
}

const STATUS_RULES = [
  '.ro-status.st-ok',
  '.ro-status.st-warn',
  '.ro-m-st.st-ready',
  '.ro-m-st.st-partial',
  '.ro-m-st.st-missing',
  '.ro-sev.sev-critical',
  '.ro-sev.sev-high',
  '.ro-sev.sev-medium',
  '.ro-lock-chip',
];

describe('Reporting canvas colours follow the theme', () => {
  it.each(STATUS_RULES)('%s takes its colours from tokens, with no literal and no mix toward black', (selector) => {
    const decls = declarationsOf(selector);
    expect(decls, `${selector} should exist`).not.toBe('');
    for (const prop of ['color', 'background']) {
      const value = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(decls)?.[1] ?? '';
      expect(value, `${selector} ${prop}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    }
  });

  it('Critical is not quieter than High: same hue, heavier weight', () => {
    expect(declarationsOf('.ro-sev.sev-critical')).toMatch(/color:\s*var\(--error\)/);
    expect(declarationsOf('.ro-sev.sev-critical')).toMatch(/font-weight:\s*700/);
  });
});
