/** Negative controls for stated-reason scanning through canonical services and wrappers. */
import fs from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

export function registerCanonicalPositionalReasonControls<Carrier>(checks: {
  serviceFile: string;
  serviceName?: string;
  reasonPosition: number;
  scan(source: string): Carrier[];
  notStated(carrier: Carrier): string | null;
}): void {
  const serviceName = checks.serviceName ?? 'reviseControlledQmsDocument';
  describe(`canonical positional reason scanning: ${serviceName}`, () => {
    it('pins the canonical revision signature so the scanned position cannot silently drift', () => {
      const tree = ts.createSourceFile(checks.serviceFile, fs.readFileSync(checks.serviceFile, 'utf8'), ts.ScriptTarget.Latest, true);
      const fn = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === serviceName);
      expect(fn?.parameters[checks.reasonPosition].name.getText(tree)).toBe('reason');
    });

    it.each([
      ['gatedReason(input)', null],
      ["'Requested automatically'", 'not read with gatedReason'],
      ['input.reason', 'not read with gatedReason'],
      ["input.reason || 'Fallback revision'", 'not read with gatedReason'],
    ])('detects the positional reason bound from %s', (initializer, expected) => {
      const args = Array.from({ length: checks.reasonPosition }, (_, i) => `arg${i}`).join(', ');
      const found = checks.scan(`async function handler(input) { const reason = ${initializer}; await ${serviceName}(${args}, reason); }`);
      expect(found).toHaveLength(1);
      if (expected) expect(checks.notStated(found[0])).toContain(expected);
      else expect(checks.notStated(found[0])).toBeNull();
    });

    it('rejects a literal passed directly as the canonical revision reason', () => {
      const args = Array.from({ length: checks.reasonPosition }, (_, i) => `arg${i}`).join(', ');
      const found = checks.scan(`async function handler() { await ${serviceName}(${args}, 'Invented revision reason'); }`);
      expect(found).toHaveLength(1);
      expect(checks.notStated(found[0])).toContain('not stated by the person');
    });
  });
}

export function registerCaughtErrorReasonControls<Carrier>(checks: {
  wrapperSource: string;
  scan(source: string): Carrier[];
  notStated(carrier: Carrier): string | null;
}): void {
  describe('caught-error wrapper reason scanning', () => {
    it('pins the actual handler argument before optional outcome settings', () => {
      const tree = ts.createSourceFile('document-tools-shared.ts', checks.wrapperSource, ts.ScriptTarget.Latest, true);
      const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'withCaughtErrors');
      expect(wrapper?.parameters[1].name.getText(tree)).toBe('handler');
      expect(wrapper?.parameters[2].name.getText(tree)).toBe('opts');
    });

    it.each([
      ['gatedReason(input)', null],
      ["'A fabricated source reason'", 'not read with gatedReason'],
    ])('scans the actual handler through trailing safe-outcome options: %s', (reason, refusal) => {
      const found = checks.scan(`withCaughtErrors('tool', async (input) => { const reason = ${reason}; await reviseControlledQmsDocument(ctx, id, reason); }, { safeOutcome: true });`);
      expect(found).toHaveLength(1);
      if (refusal) expect(checks.notStated(found[0])).toContain(refusal);
      else expect(checks.notStated(found[0])).toBeNull();
    });
  });
}
