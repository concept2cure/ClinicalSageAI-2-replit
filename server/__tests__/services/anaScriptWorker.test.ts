import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runDocxInsertIsolated } from '../../services/compute/scriptWorker';
import { validateEnvelope } from '../../../workers/artifact-compute/runner';

// python-docx ships in the services/ Docker image but is not guaranteed on the
// Node test runner. Probe once; skip the docx-dependent suite when it's absent
// (the docx-insert runtime is exercised directly in environments that have it).
const pythonDocxAvailable = spawnSync('python3', ['-c', 'import docx'], { stdio: 'ignore' }).status === 0;

describe('AnA compute worker policy', () => {
  it('allows the fixed document runtimes', () => {
    expect(() =>
      validateEnvelope({ runtimeProfile: 'docx-insert', networkEnabled: false, timeoutSeconds: 30 })
    ).not.toThrow();
  });

  it('has no host profile for model-written code (INJ-PATH-002)', () => {
    // run_python_script exec()'d AnA's code on the application host with the
    // whole filesystem in reach. It runs in the hardened container now; the
    // host profile is gone, so nothing can quietly route code back here.
    expect(() =>
      // @ts-expect-error — the profile no longer exists
      validateEnvelope({ runtimeProfile: 'python-script', networkEnabled: false, timeoutSeconds: 30 })
    ).toThrow(/Runtime profile not allowed/);
  });

  it('rejects unknown profiles', () => {
    expect(() =>
      // @ts-expect-error — exercising the policy gate with a disallowed profile
      validateEnvelope({ runtimeProfile: 'arbitrary-shell', networkEnabled: false, timeoutSeconds: 30 })
    ).toThrow(/Runtime profile not allowed/);
  });

  it('blocks network egress for compute profiles', () => {
    expect(() =>
      validateEnvelope({ runtimeProfile: 'docx-insert', networkEnabled: true, timeoutSeconds: 30 })
    ).toThrow(/Network egress is disabled/);
  });
});

describe.skipIf(!pythonDocxAvailable)('insert_document_content (targeted docx insertion)', () => {
  // Build the source .docx with python-docx directly (a host requirement of
  // this suite) so the test needs no JS docx dependency.
  async function buildSourceDocx(): Promise<Buffer> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-insert-src-'));
    try {
      const built = spawnSync(
        'python3',
        [
          '-c',
          [
            'from docx import Document',
            'd = Document()',
            "d.add_heading('10.3 Statistical Methods', level=2)",
            "d.add_paragraph('Prepared for {{SPONSOR}}.')",
            "d.save('source.docx')",
          ].join('\n'),
        ],
        { cwd: dir },
      );
      expect(built.status).toBe(0);
      return fs.readFileSync(path.join(dir, 'source.docx'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it('inserts after a heading, replaces a placeholder, and appends at end', async () => {
    const source = await buildSourceDocx();
    const result = await runDocxInsertIsolated(
      source,
      [
        {
          anchorType: 'heading_text',
          anchorValue: '10.3 Statistical Methods',
          position: 'after',
          content: '### 10.3.1 Sample Size\n- Power 0.9\nInserted precisely.',
        },
        {
          anchorType: 'placeholder',
          anchorValue: '{{SPONSOR}}',
          position: 'replace',
          content: 'Concept2Cure, Inc.',
        },
        { anchorType: 'end', content: 'Appendix line.' },
      ],
      'edited.docx'
    );

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.applied).toHaveLength(3);
    expect(result.applied.every(a => a.status === 'applied')).toBe(true);
    expect(result.applied[0].paragraphs).toBe(3);
  });

  it('reports anchor_not_found without aborting other insertions', async () => {
    const source = await buildSourceDocx();
    const result = await runDocxInsertIsolated(source, [
      { anchorType: 'heading_text', anchorValue: 'Nonexistent Heading', content: 'x' },
      { anchorType: 'end', content: 'still applied' },
    ]);
    expect(result.applied[0].status).toBe('anchor_not_found');
    expect(result.applied[1].status).toBe('applied');
  });
});
