import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  runPythonScriptIsolated,
  runDocxInsertIsolated,
} from '../../services/compute/scriptWorker';
import { validateEnvelope } from '../../../workers/artifact-compute/runner';

// python-docx ships in the services/ Docker image but is not guaranteed on the
// Node test runner. Probe once; skip the docx-dependent suite when it's absent
// (the docx-insert runtime is exercised directly in environments that have it).
const pythonDocxAvailable = await (async () => {
  try {
    const probe = await runPythonScriptIsolated({ code: 'import docx' });
    return probe.ok;
  } catch {
    return false;
  }
})();

describe('AnA compute worker policy', () => {
  it('allows the new runtime profiles', () => {
    expect(() =>
      validateEnvelope({ runtimeProfile: 'python-script', networkEnabled: false, timeoutSeconds: 30 })
    ).not.toThrow();
    expect(() =>
      validateEnvelope({ runtimeProfile: 'docx-insert', networkEnabled: false, timeoutSeconds: 30 })
    ).not.toThrow();
  });

  it('rejects unknown profiles', () => {
    expect(() =>
      // @ts-expect-error — exercising the policy gate with a disallowed profile
      validateEnvelope({ runtimeProfile: 'arbitrary-shell', networkEnabled: false, timeoutSeconds: 30 })
    ).toThrow(/Runtime profile not allowed/);
  });

  it('blocks network egress for compute profiles', () => {
    expect(() =>
      validateEnvelope({ runtimeProfile: 'python-script', networkEnabled: true, timeoutSeconds: 30 })
    ).toThrow(/Network egress is disabled/);
  });
});

describe('run_python_script sandbox', () => {
  it('runs AnA-authored Python, captures stdout, and returns produced files', async () => {
    const result = await runPythonScriptIsolated({
      code: [
        "with open('out.txt', 'w') as f:",
        "    f.write('hello from ana')",
        "print('done', 2 + 2)",
      ].join('\n'),
    });

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('done 4');
    expect(result.outputFiles['out.txt']).toBeTruthy();
    expect(Buffer.from(result.outputFiles['out.txt'] as string, 'base64').toString('utf8')).toBe(
      'hello from ana'
    );
  });

  it('reads provided input files from the sandbox cwd', async () => {
    const result = await runPythonScriptIsolated({
      code: "print(open('data.txt').read().upper())",
      inputFiles: { 'data.txt': Buffer.from('abc').toString('base64') },
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('ABC');
  });

  it('reports script errors without crashing the worker', async () => {
    const result = await runPythonScriptIsolated({ code: 'raise ValueError("boom")' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ValueError');
  });

  it('blocks outbound network from inside the sandbox', async () => {
    const result = await runPythonScriptIsolated({
      code: [
        'import socket',
        'try:',
        '    socket.socket()',
        "    print('OPEN')",
        'except OSError:',
        "    print('BLOCKED')",
      ].join('\n'),
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('BLOCKED');
  });
});

describe.skipIf(!pythonDocxAvailable)('insert_document_content (targeted docx insertion)', () => {
  // Build the source .docx in the same isolated sandbox (python-docx is a host
  // requirement) so the test needs no JS docx dependency.
  async function buildSourceDocx(): Promise<Buffer> {
    const built = await runPythonScriptIsolated({
      code: [
        'from docx import Document',
        'd = Document()',
        "d.add_heading('10.3 Statistical Methods', level=2)",
        "d.add_paragraph('Prepared for {{SPONSOR}}.')",
        "d.save('source.docx')",
      ].join('\n'),
    });
    expect(built.ok).toBe(true);
    const b64 = built.outputFiles['source.docx'];
    expect(b64).toBeTruthy();
    return Buffer.from(b64 as string, 'base64');
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
