/**
 * AnA scripting + targeted-insertion compute workers.
 *
 * Two isolated Python runtimes that give AnA real, governed code execution
 * without opening up arbitrary filesystem/shell access:
 *
 *   runPythonScriptIsolated  → workers/artifact-compute/python-script-runtime.py
 *     Runs AnA-authored Python in an ephemeral tempdir with NO network egress,
 *     bounded CPU time, a bounded address space, and a wall-clock SIGKILL.
 *     Returns stdout/stderr plus any files the script produced.
 *
 *   runDocxInsertIsolated    → workers/artifact-compute/docx-insert-runtime.py
 *     Surgically inserts content into an existing .docx at exact anchors
 *     (heading text, placeholder token, paragraph index, start/end) using
 *     python-docx. This is the governed equivalent of "write a Python script
 *     to make the targeted insertions precisely".
 *
 * Both enforce the same no-network policy as runDocxPythonIsolated and run
 * under the locked-down artifact-compute profile (see runner.ts).
 */

import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { validateEnvelope, type WorkerEnvelope } from '../../../workers/artifact-compute/runner';
import { sandboxEnv } from './sandboxEnv';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

interface SpawnResult {
  payload: any;
  workdir: string;
}

/**
 * Spawn a python runtime against a JSON input/output contract inside an
 * ephemeral tempdir with the no-network policy enforced. Shared by both the
 * scripting and the docx-insert paths.
 */
async function runPythonRuntime(
  runtimeProfile: WorkerEnvelope['runtimeProfile'],
  runtimeRelPath: string,
  input: Record<string, unknown>,
  timeoutMs: number
): Promise<SpawnResult> {
  // Policy gate: no network, bounded timeout, allowed profile.
  validateEnvelope({
    runtimeProfile,
    networkEnabled: false,
    timeoutSeconds: Math.ceil(timeoutMs / 1000),
  });

  const runtimeScript = path.resolve(process.cwd(), runtimeRelPath);
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-compute-'));
  const inputPath = path.join(workdir, 'input.json');
  const outputPath = path.join(workdir, 'output.json');

  await fs.writeFile(
    inputPath,
    JSON.stringify({ ...input, output_path: outputPath }, null, 2)
  );

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('python3', [runtimeScript, inputPath], {
      cwd: workdir,
      // Deliberately NOT the whole server environment: this runtime exec()s
      // AnA-authored code, so the server's secrets must not be reachable from
      // it. The allowlist and the reasoning live in sandboxEnv.ts.
      env: sandboxEnv({
        ARTIFACT_COMPUTE_NO_NETWORK: '1',
        ARTIFACT_COMPUTE_WORKDIR: workdir,
      }),
      stdio: 'pipe',
    });

    let stderr = '';
    proc.stderr.on('data', d => {
      stderr += d.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`${runtimeProfile} worker timeout exceeded (${timeoutMs}ms)`));
    }, timeoutMs);

    proc.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on('exit', code => {
      clearTimeout(timeout);
      if (code === 0) return resolve();
      reject(new Error(`${runtimeProfile} worker failed (${code}): ${stderr || 'unknown error'}`));
    });
  });

  const outputRaw = await fs.readFile(outputPath, 'utf8');
  return { payload: JSON.parse(outputRaw), workdir };
}

export interface PythonScriptInput {
  /** Python source AnA authored. */
  code: string;
  /** Optional map of filename → base64 bytes, written into the script's cwd. */
  inputFiles?: Record<string, string>;
  /** Bounded CPU seconds (best-effort, POSIX). Default 20. */
  cpuSeconds?: number;
  /** Per-output-file byte cap before the file is reported as too-large. Default 5MB. */
  maxOutputBytes?: number;
  /** Wall-clock timeout in ms (Node-enforced SIGKILL). Default 30s, max 120s. */
  timeoutMs?: number;
}

export interface PythonScriptResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error: string | null;
  /** filename → base64 bytes; value is null when the file exceeded the size cap. */
  outputFiles: Record<string, string | null>;
  network: string;
}

/**
 * Run AnA-authored Python in the isolated sandbox. No network, bounded CPU,
 * bounded memory, wall-clock SIGKILL. Returns structured stdout/stderr and any
 * files the script created or modified.
 */
export async function runPythonScriptIsolated(
  input: PythonScriptInput
): Promise<PythonScriptResult> {
  const timeoutMs = Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const { payload } = await runPythonRuntime(
    'python-script',
    'workers/artifact-compute/python-script-runtime.py',
    {
      code: input.code,
      input_files: input.inputFiles ?? {},
      cpu_seconds: input.cpuSeconds ?? 20,
      max_output_bytes: input.maxOutputBytes ?? 5_000_000,
    },
    timeoutMs
  );

  return {
    ok: payload.ok === true,
    stdout: typeof payload.stdout === 'string' ? payload.stdout : '',
    stderr: typeof payload.stderr === 'string' ? payload.stderr : '',
    error: payload.error ?? null,
    outputFiles: payload.output_files ?? {},
    network: payload.network ?? 'unknown',
  };
}

export interface DocxInsertion {
  anchorType: 'heading_text' | 'placeholder' | 'paragraph_index' | 'start' | 'end';
  anchorValue?: string | number;
  position?: 'before' | 'after' | 'replace';
  content: string;
  match?: 'exact' | 'contains';
}

export interface DocxInsertResult {
  /** The edited .docx as a Buffer. */
  buffer: Buffer;
  fileName: string;
  /** Per-insertion outcome report (applied / anchor_not_found / etc.). */
  applied: Array<{ index: number; anchor: string; status: string; paragraphs: number }>;
}

/**
 * Apply targeted insertions to an existing .docx using python-docx in the
 * isolated worker. The source document is supplied as a Buffer; the edited
 * document is returned as a Buffer (the caller persists it).
 */
export async function runDocxInsertIsolated(
  sourceDocx: Buffer,
  insertions: DocxInsertion[],
  fileName = 'edited.docx',
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<DocxInsertResult> {
  const { payload } = await runPythonRuntime(
    'docx-insert',
    'workers/artifact-compute/docx-insert-runtime.py',
    {
      source_docx_base64: sourceDocx.toString('base64'),
      file_name: fileName,
      insertions: insertions.map(ins => ({
        anchor_type: ins.anchorType,
        anchor_value: ins.anchorValue,
        position: ins.position ?? 'after',
        content: ins.content,
        match: ins.match ?? 'contains',
      })),
    },
    Math.min(timeoutMs, MAX_TIMEOUT_MS)
  );

  if (payload.output_type !== 'docx' || typeof payload.content_base64 !== 'string') {
    throw new Error('docx-insert worker returned no docx output');
  }

  return {
    buffer: Buffer.from(payload.content_base64, 'base64'),
    fileName: payload.file_name ?? fileName,
    applied: Array.isArray(payload.applied) ? payload.applied : [],
  };
}

export interface DocxValidationReport {
  ok: boolean;
  partsChecked: number;
  malformedParts: Array<{ part: string; error: string }>;
  missingParts: string[];
  danglingRels: Array<{ rels: string; target: string }>;
  reopened: boolean;
  paragraphCount: number | null;
  errors: string[];
}

function normalizeValidation(v: any): DocxValidationReport {
  return {
    ok: v?.ok === true,
    partsChecked: v?.parts_checked ?? 0,
    malformedParts: Array.isArray(v?.malformed_parts) ? v.malformed_parts : [],
    missingParts: Array.isArray(v?.missing_parts) ? v.missing_parts : [],
    danglingRels: Array.isArray(v?.dangling_rels) ? v.dangling_rels : [],
    reopened: v?.reopened === true,
    paragraphCount: typeof v?.paragraph_count === 'number' ? v.paragraph_count : null,
    errors: Array.isArray(v?.errors) ? v.errors : [],
  };
}

export interface DocxXmlOperation {
  op: 'insert_paragraphs' | 'replace_text';
  // insert_paragraphs
  anchorText?: string;
  match?: 'exact' | 'contains';
  position?: 'before' | 'after';
  paragraphs?: string[];
  inheritFormat?: boolean;
  // replace_text
  find?: string;
  replace?: string;
}

export interface DocxXmlResult {
  buffer: Buffer;
  fileName: string;
  applied: Array<{ op: string; status: string; count: number; anchor?: string; find?: string }>;
  validation: DocxValidationReport;
}

/**
 * Raw-OOXML surgery on an existing .docx: locate text anchors inside
 * word/document.xml and insert <w:p> blocks (inheriting the anchor's
 * formatting) or replace placeholder text, then repack and validate. Operates
 * at the XML tree level (lxml), so it preserves fonts/bold/italic/spacing/
 * justification that the python-docx object API can't address positionally.
 */
export async function runDocxXmlSurgeryIsolated(
  sourceDocx: Buffer,
  operations: DocxXmlOperation[],
  fileName = 'edited.docx',
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<DocxXmlResult> {
  const { payload } = await runPythonRuntime(
    'docx-xml',
    'workers/artifact-compute/docx-xml-runtime.py',
    {
      source_docx_base64: sourceDocx.toString('base64'),
      file_name: fileName,
      operations: operations.map(o => ({
        op: o.op,
        anchor_text: o.anchorText,
        match: o.match ?? 'contains',
        position: o.position ?? 'after',
        paragraphs: o.paragraphs,
        inherit_format: o.inheritFormat ?? true,
        find: o.find,
        replace: o.replace,
      })),
    },
    Math.min(timeoutMs, MAX_TIMEOUT_MS)
  );

  if (payload.output_type !== 'docx' || typeof payload.content_base64 !== 'string') {
    throw new Error('docx-xml worker returned no docx output');
  }

  return {
    buffer: Buffer.from(payload.content_base64, 'base64'),
    fileName: payload.file_name ?? fileName,
    applied: Array.isArray(payload.applied) ? payload.applied : [],
    validation: normalizeValidation(payload.validation),
  };
}

/**
 * Validate a .docx (OOXML/ZIP integrity, well-formedness, rels resolution,
 * python-docx round-trip) without modifying it.
 */
export async function runDocxValidateIsolated(
  sourceDocx: Buffer,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<DocxValidationReport> {
  const { payload } = await runPythonRuntime(
    'docx-validate',
    'workers/artifact-compute/docx-validate-runtime.py',
    { source_docx_base64: sourceDocx.toString('base64') },
    Math.min(timeoutMs, MAX_TIMEOUT_MS)
  );
  return normalizeValidation(payload);
}
