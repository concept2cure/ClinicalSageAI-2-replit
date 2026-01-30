import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { describe, it, expect } from 'vitest';

describe('migrate-logging codemod', () => {
  it('replaces console.* with logger.* in files (apply mode)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-'));
    const f = path.join(tmp, 'sample.js');
    fs.writeFileSync(f, "console.log('hello'); console.error('boom'); console.warn('yo');\n");

    // run codemod with --apply against temp dir
    const script = path.join(process.cwd(), 'scripts', 'migrate-logging-to-pino.mjs');
    execSync(`node ${script} --apply --dir ${tmp}`, { stdio: 'inherit' });

    const out = fs.readFileSync(f, 'utf8');
    expect(out).toContain("logger.info('hello')");
    expect(out).toContain("logger.error('boom')");
    expect(out).toContain("logger.warn('yo')");
  });
});
