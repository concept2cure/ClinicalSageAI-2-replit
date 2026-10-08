/**
 * Audit & compliance reports — one run's result: the chain statement, what the
 * seal means, the manifest strip, the downloads, and the sections.
 *
 * Split from ComplianceReports.tsx so each file stays readable; the rules for
 * what may be said live in complianceReportData.ts, and this file only draws
 * them. Colour is never the only signal: every tone travels with its word.
 */
import React, { useId, useState } from 'react';
import { I } from '../icons';
import { apiCall } from '../apiCall';
import { downloadText } from '../download';
import {
  SCREEN_ROW_LIMIT, cellFull, cellText, columnLabel, columnsFor, countDifferences, manifestFacts, verdictTone,
  type ReportData, type Section, type StatementLine, type Tone,
} from './complianceReportData';
import {
  fileBase, parseExport, pastAsOfNote, runErrorOf, runUrl, statementOf,
  type RunResult,
} from './complianceReportsModel';
import { JWT_SECRET_FALLBACK_KEY_ID } from '@shared/constants/audit-export-key';

const muted: React.CSSProperties = { fontSize: 12, color: 'var(--text-400)' };
const TONE_COLOR: Record<Tone, string> = {
  ok: 'var(--success)', error: 'var(--error)', muted: 'var(--text-300)', neutral: 'var(--text-200)',
};
const TONE_ICON: Record<Tone, React.ReactNode> = {
  ok: I.shieldCheck, error: I.alertTriangle, muted: I.info, neutral: I.info,
};
const REFUSED_DOWNLOAD = 'This browser refused the download. Nothing was saved.';

export function ReportResult({ result, readersNotice, onChooseIntegrity }: {
  result: RunResult; readersNotice: string; onChooseIntegrity: (() => void) | null;
}) {
  const { report, exp, data } = result;
  const titles: Record<string, string> =
    data.kind === 'sections' ? Object.fromEntries(data.sections.map((s) => [s.key, s.title])) : {};
  const span = report.period === 'as-of' ? `As of ${result.period.to}` : `${result.period.from} to ${result.period.to}`;
  const asOfNote = pastAsOfNote(report, result.period, data.kind === 'sections' ? data.generatedAt : null);
  const offer = data.kind === 'sections' && data.chain.scope !== 'integrity-checks' ? onChooseIntegrity : null;
  return (
    <>
      <div className="pj-card" style={{ marginBottom: 14, gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{report.title}</h2>
          <div style={muted}>{span} (UTC)</div>
          {asOfNote && <div style={{ ...muted, color: 'var(--text-300)' }}>{asOfNote}</div>}
        </div>
        {statementOf(result).map((l, i) => <Statement key={i} line={l} />)}
        {offer && (
          <div>
            <button type="button" className="btn ghost" onClick={offer}>Choose the integrity attestation</button>
          </div>
        )}
        <ManifestStrip manifest={exp.manifest} titles={titles} />
        <SealPanel manifest={exp.manifest} verification={exp.verification} />
        <Downloads result={result} readersNotice={readersNotice} />
      </div>
      {data.kind === 'sections'
        ? data.sections.map((s, i) => <SectionCard key={`${s.key}-${i}`} section={s} />)
        : <SectionCard section={rowsSection(data, exp.manifest)} />}
      <NotRecorded items={data.kind === 'sections' ? data.notRecorded : report.notRecorded} />
    </>
  );
}

function rowsSection(data: Extract<ReportData, { kind: 'rows' }>, manifest: Record<string, unknown>): Section {
  const stated = typeof manifest.rowCount === 'number' ? manifest.rowCount : data.rows.length;
  return {
    key: 'rows', title: 'Recorded events', columns: columnsFor(data.rows), rows: data.rows,
    rowCount: data.rows.length, truncated: manifest.truncated === true, notes: [],
    readable: data.readable && stated === data.rows.length,
  };
}

function Statement({ line }: { line: StatementLine }) {
  return (
    <div data-tone={line.tone}>
      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 600, color: TONE_COLOR[line.tone] }}>
        <span aria-hidden="true">{TONE_ICON[line.tone]}</span>
        <span>{line.text}</span>
      </div>
      {line.reason && <div style={muted}>{line.reason}</div>}
    </div>
  );
}

function ManifestStrip({ manifest, titles }: { manifest: Record<string, unknown>; titles: Record<string, string> }) {
  const f = manifestFacts(manifest);
  const rows = f.rows.map((r) => (r.key === 'rows' ? String(r.rowCount) : `${titles[r.key] ?? r.key} ${r.rowCount}`) + (r.truncated ? ' (truncated)' : ''));
  const item = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 6 }}><dt style={{ color: 'var(--text-400)' }}>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></div>
  );
  return (
    <dl aria-label="Seal" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: 12, margin: 0 }}>
      {item('Generated', f.generatedAt ?? '—')}
      {item('Rows', rows.length ? rows.join(' · ') : '—')}
      {item('SHA-256', f.dataHash ? <span className="mono" title={f.dataHash}>{`${f.dataHash.slice(0, 12)}…`}</span> : '—')}
      {item('Signing key', (
        <span data-testid="cr-signing-key">
          <span className="mono">{f.signingKeyId ?? '—'}</span>
          {f.signingKeyId === JWT_SECRET_FALLBACK_KEY_ID && <span> (development fallback, not a dedicated key)</span>}
        </span>
      ))}
      {item('Export', <span className="mono">{f.exportId ?? '—'}</span>)}
    </dl>
  );
}

/**
 * Which key made the seal, in the words that are true for it. A manifest that
 * names the JWT-secret fallback was sealed with the session-signing secret
 * because no dedicated audit export key is configured; production refuses that
 * posture (auditExportKeyPosture.ts). It was called "a platform-held key" like
 * any other (QA 2026-10-08, j8). Key handling is unchanged; only the sentence.
 */
function sealKeyPhrase(keyId: string | null | undefined): string {
  if (keyId === JWT_SECRET_FALLBACK_KEY_ID) {
    return `under the development fallback key (${keyId}): no dedicated audit export key is configured on this deployment, ` +
      'so the seal was made with the session-signing secret. A production deployment refuses to seal this way.';
  }
  return `under a platform-held key (${keyId ?? 'not named'}).`;
}

/**
 * Part 11 asks that a record's protections be understood by the person relying
 * on it. The seal is the platform's integrity mark, made under a key the
 * platform holds — it says the file is unchanged, not that anyone approved it.
 */
function SealPanel({ manifest, verification }: { manifest: Record<string, unknown>; verification: Record<string, unknown> | null }) {
  const f = manifestFacts(manifest);
  const [copied, setCopied] = useState<boolean | null>(null);
  const algorithm = typeof verification?.algorithm === 'string' && verification.algorithm ? verification.algorithm : 'HMAC-SHA256';
  const who = f.generatedBy ? `${f.generatedBy}${f.generatedByRole ? ` (${f.generatedByRole})` : ''}` : 'a person the manifest does not name';
  const copy = async () => {
    try {
      if (!f.dataHash || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(f.dataHash);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>What the seal means</h3>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-300)', lineHeight: 1.5 }}>
        {`Sealed by the platform with ${algorithm} ${sealKeyPhrase(f.signingKeyId)} ` +
          `Recorded on the audit trail as export ${f.exportId ?? 'not named'}. ` +
          `Run by ${who} at ${f.generatedAt ?? 'a time the manifest does not state'}. ` +
          'The seal is the platform’s tamper-evidence: it shows the data has not changed since it was produced. ' +
          'It is not an electronic signature.'}
      </p>
      {f.dataHash && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn ghost" onClick={() => void copy()}>
            <span aria-hidden="true">{I.copy}</span>Copy SHA-256
          </button>
        </div>
      )}
      {copied === true && <div role="status" style={{ ...muted, marginTop: 4 }}>Copied the SHA-256.</div>}
      {copied === false && (
        <div role="alert" style={{ fontSize: 12, marginTop: 4, color: 'var(--error)' }}>
          This browser did not allow copying. The SHA-256 is{' '}
          <span className="mono" style={{ wordBreak: 'break-all', color: 'var(--text-200)' }}>{f.dataHash}</span>
        </div>
      )}
    </div>
  );
}

interface DownloadNote { ok: boolean; text: string; warning?: string }

function Downloads({ result, readersNotice }: { result: RunResult; readersNotice: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<DownloadNote | null>(null);
  const base = fileBase(result.report, result.period);

  const saveJson = () => {
    const { data, manifest, signature, verification } = result.exp;
    const saved = downloadText(`${base}.json`, JSON.stringify({ data, manifest, signature, verification }, null, 2), 'application/json');
    setNote(saved ? { ok: true, text: `Saved ${base}.json.` } : { ok: false, text: REFUSED_DOWNLOAD });
  };
  const saveCsv = async () => {
    setBusy(true);
    setNote(null);
    const r = await apiCall('GET', runUrl(result.report, result.period, 'csv'));
    setBusy(false);
    if (!r.ok) return setNote({ ok: false, text: runErrorOf(r, readersNotice).message });
    const exp = parseExport(r.body);
    if (!exp) return setNote({ ok: false, text: 'The CSV came back in a form this screen cannot read. Nothing was saved.' });
    // Verbatim: the manifest's SHA-256 is over this exact string.
    if (!downloadText(`${base}.csv`, exp.data, 'text/csv;charset=utf-8')) return setNote({ ok: false, text: REFUSED_DOWNLOAD });
    const seal = JSON.stringify({ manifest: exp.manifest, signature: exp.signature, verification: exp.verification }, null, 2);
    if (!downloadText(`${base}.manifest.json`, seal, 'application/json')) {
      return setNote({ ok: false, text: `Saved ${base}.csv, but this browser refused its manifest, so the file cannot be verified on its own.` });
    }
    const second = manifestFacts(exp.manifest);
    const diffs = countDifferences(result.data, exp.manifest);
    setNote({
      ok: true,
      text: `Saved ${base}.csv and its signed manifest. Download CSV ran the report again: export ` +
        `${second.exportId ?? 'not named'}, generated ${second.generatedAt ?? 'at a time not stated'}.`,
      warning: diffs.length
        ? `The second run found different row counts from the report on screen — ${diffs.join('; ')}. ` +
          'Records changed between the two runs; the CSV and its manifest describe the second run.'
        : undefined,
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn ghost" onClick={saveJson}><span aria-hidden="true">{I.download}</span>Download JSON</button>
        <button type="button" className="btn ghost" onClick={() => void saveCsv()} disabled={busy}>
          <span aria-hidden="true">{I.download}</span>{busy ? 'Preparing CSV…' : 'Download CSV'}
        </button>
      </div>
      <div style={{ ...muted, marginTop: 6 }}>
        Each run is recorded on the audit trail. Download CSV runs the report again and is recorded as its own run.
      </div>
      {note && (
        <div role={note.ok ? 'status' : 'alert'} style={{ fontSize: 12, marginTop: 6, color: note.ok ? 'var(--text-300)' : 'var(--error)' }}>
          <div>{note.text}</div>
          {note.warning && <div style={{ color: 'var(--warning)', marginTop: 4 }}>{note.warning}</div>}
        </div>
      )}
    </div>
  );
}

function SectionBody({ section, headingId }: { section: Section; headingId: string }) {
  if (!section.readable) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--error)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <span aria-hidden="true">{I.alertTriangle}</span>This section could not be read.
      </p>
    );
  }
  if (section.rows.length === 0) return <p style={{ margin: 0, fontSize: 13, color: 'var(--text-300)' }}>No records in this period.</p>;
  const shown = section.rows.slice(0, SCREEN_ROW_LIMIT);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="reg-tbl" aria-labelledby={headingId}>
        <thead><tr>{section.columns.map((c) => <th key={c.key} scope="col">{columnLabel(c, shown)}</th>)}</tr></thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {section.columns.map((c) => {
                const text = cellText(row[c.key]);
                const full = cellFull(row[c.key]);
                const tone = verdictTone(c.key, row[c.key]);
                return (
                  <td key={c.key} data-tone={tone ?? undefined} title={text !== full && text.endsWith('…') ? full : undefined}
                    style={tone ? { color: TONE_COLOR[tone], fontWeight: tone === 'error' ? 600 : undefined } : undefined}>
                    {text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionCard({ section }: { section: Section }) {
  const headingId = useId();
  const total = section.rows.length;
  return (
    <div className="pj-card" style={{ marginBottom: 14, gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h3 id={headingId} style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>{section.title}</h3>
        {section.readable && <span style={muted}>{section.rowCount === 1 ? '1 row' : `${section.rowCount} rows`}</span>}
      </div>
      {section.readable && section.truncated && (
        <div style={{ ...muted, color: 'var(--warning)' }}>This section reached its row limit, so it is truncated. Narrow the period to report every row.</div>
      )}
      {section.notes.map((n, i) => <div key={i} style={muted}>{n}</div>)}
      <SectionBody section={section} headingId={headingId} />
      {section.readable && total > SCREEN_ROW_LIMIT && (
        <div style={muted}>{`Showing ${SCREEN_ROW_LIMIT} of ${total} — the download contains all rows.`}</div>
      )}
    </div>
  );
}

export function NotRecorded({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>Not recorded by the platform</h3>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-300)', lineHeight: 1.5 }}>
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}
