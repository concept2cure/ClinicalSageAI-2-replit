/**
 * "Verify a saved report" — the check a client (or the inspector they hand the
 * file to) runs on a report saved from this screen.
 *
 * The platform holds the seal key, so verification is the platform's to do:
 * the files are sent to the existing verifier (POST /api/audit/export/verify),
 * which recomputes the SHA-256 of `data` against the manifest and the HMAC over
 * the manifest under the key it names. This screen computes no verdict.
 *
 * `data` must be the exact string that was sealed. For a JSON bundle that is its
 * `data` field; for a CSV it is the file's text exactly as read — any trimming or
 * line-ending change is a different string and must fail, which is the point.
 */
import React, { useId, useState } from 'react';
import { I } from '../icons';
import { apiCall, apiErrorText } from '../apiCall';
import { isRecord, reasonText, str } from './complianceReportData';

const VERIFY_PATH = '/api/audit/export/verify';
const WHICH_FILES = 'Choose a saved JSON report, or a CSV together with its manifest file.';

interface SealedPackage {
  data: string;
  manifest: Record<string, unknown>;
  signature: string;
}

type Outcome =
  | { kind: 'valid'; keyId: string | null }
  | { kind: 'invalid'; keyId: string | null; errors: string[] }
  | { kind: 'problem'; text: string };

/** A file's text exactly as stored. FileReader is what every browser (and jsdom) has. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
    reader.readAsText(file);
  });
}

async function readJson(file: File): Promise<unknown> {
  try {
    return JSON.parse(await readText(file));
  } catch {
    return null;
  }
}

const lower = (f: File) => f.name.toLowerCase();

/** The saved files as `{ data, manifest, signature }`, or why they are not a saved report. */
async function sealedPackage(files: File[]): Promise<SealedPackage | string> {
  if (files.length === 1 && lower(files[0]).endsWith('.json') && !lower(files[0]).endsWith('.manifest.json')) {
    const b = await readJson(files[0]);
    if (isRecord(b) && typeof b.data === 'string' && isRecord(b.manifest) && typeof b.signature === 'string') {
      return { data: b.data, manifest: b.manifest, signature: b.signature };
    }
    return 'That file is not a saved report: it has no sealed data, manifest and signature.';
  }
  const csv = files.find((f) => lower(f).endsWith('.csv'));
  const seal = files.find((f) => lower(f).endsWith('.manifest.json'));
  if (files.length !== 2 || !csv || !seal) return WHICH_FILES;
  const m = await readJson(seal);
  if (!isRecord(m) || !isRecord(m.manifest) || typeof m.signature !== 'string') {
    return 'The manifest file is not a saved report manifest: it has no manifest and signature.';
  }
  try {
    return { data: await readText(csv), manifest: m.manifest, signature: m.signature };
  } catch {
    return 'The CSV file could not be read.';
  }
}

function outcomeOf(body: unknown): Outcome | null {
  const v = isRecord(body) ? body.verification : null;
  if (!isRecord(v) || typeof v.valid !== 'boolean') return null;
  const keyId = str(v.signingKeyId);
  if (v.valid) return { kind: 'valid', keyId };
  const errors = (Array.isArray(v.errors) ? v.errors : []).map(reasonText).filter((e): e is string => Boolean(e));
  return { kind: 'invalid', keyId, errors };
}

export function VerifySavedReport() {
  const inputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const verify = async () => {
    setOutcome(null);
    const pkg = await sealedPackage(files);
    if (typeof pkg === 'string') return setOutcome({ kind: 'problem', text: pkg });
    setBusy(true);
    const r = await apiCall('POST', VERIFY_PATH, pkg);
    setBusy(false);
    if (!r.ok) return setOutcome({ kind: 'problem', text: apiErrorText(r, 'The saved report could not be checked.') });
    setOutcome(outcomeOf(r.body) ?? { kind: 'problem', text: 'The check came back in a form this screen cannot read.' });
  };

  return (
    <div className="pj-card" style={{ marginTop: 18, gap: 8 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Verify a saved report</h2>
      <div style={{ fontSize: 12.5, color: 'var(--text-300)', lineHeight: 1.5 }}>
        Choose a report saved from this screen: the JSON file, or the CSV together with its manifest file. The platform
        checks that the data still matches its seal.
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-300)' }}>
          <label htmlFor={inputId}>Saved report files</label>
          <input
            id={inputId} type="file" multiple accept=".json,.csv,application/json,text/csv"
            onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setOutcome(null); }}
          />
        </div>
        <button type="button" className="btn ghost" disabled={busy || files.length === 0} onClick={() => void verify()}>
          <span aria-hidden="true">{I.shieldCheck}</span>{busy ? 'Checking…' : 'Verify saved report'}
        </button>
      </div>
      {outcome && <VerifyOutcome outcome={outcome} />}
    </div>
  );
}

function VerifyOutcome({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === 'problem') {
    return <div role="alert" style={{ fontSize: 12.5, color: 'var(--error)' }}>{outcome.text}</div>;
  }
  if (outcome.kind === 'valid') {
    return (
      <div role="status" data-tone="ok" style={{ fontSize: 12.5, color: 'var(--success)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <span aria-hidden="true">{I.shieldCheck}</span>
        <span>
          {outcome.keyId
            ? `The saved report verifies: its data matches its seal, made with key ${outcome.keyId}.`
            : 'The saved report verifies: its data matches its seal.'}
        </span>
      </div>
    );
  }
  return (
    <div role="alert" data-tone="error" style={{ fontSize: 12.5, color: 'var(--error)' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600 }}>
        <span aria-hidden="true">{I.alertTriangle}</span>
        <span>The saved report does not verify.</span>
      </div>
      {outcome.errors.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {outcome.errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {outcome.keyId && <div style={{ color: 'var(--text-300)', marginTop: 4 }}>{`The seal names key ${outcome.keyId}.`}</div>}
    </div>
  );
}
