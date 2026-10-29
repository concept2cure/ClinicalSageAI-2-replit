import React, { useState } from 'react';
import { I } from '../icons';
import { downloadBlob } from '../download';
import { useLiveData } from '../dataConnect';
import { getAuthToken } from '@/utils/authToken';
import '../styles/translation-v2.css';

/**
 * The GAMP 5 validation package, on administration's Settings (decision P-67).
 *
 *   GET /api/validation-kit          the package: VMP-001 and the documents that
 *                                    name it as their parent, each as its own
 *                                    header records it (server/routes/validation-kit.ts)
 *   GET /api/validation-kit/:docId   one document, recorded before it is delivered
 *
 * A regulated customer validates the system they use (21 CFR 11.10(a), EU GMP
 * Annex 11 §4), and the vendor's package is the first thing they ask for. So
 * the card claims only what the documents are: each one's status is its own
 * header's, verbatim ("DRAFT — UNSIGNED"), never a badge inferred from it, and
 * a document whose header records none says so. A read that fails is shown as
 * unread, never as an empty package.
 *
 * Moved here from the unmounted AdminConsole (AdminSurfaces.tsx, unmounted
 * since af973c5e8), which rendered a failed read as "Provided at contract" and
 * an unrecorded status as "Available".
 */

export interface ValidationDocument {
  docId: string;
  type: string;
  title: string;
  version: string | null;
  status: string | null;
  sizeBytes: number;
}

interface ValidationPackage {
  artifacts: ValidationDocument[];
  note: string;
}

function isPackage(value: unknown): value is ValidationPackage {
  const v = value as { artifacts?: unknown; note?: unknown } | null;
  return !!v && typeof v === 'object' && Array.isArray(v.artifacts) && typeof v.note === 'string';
}

/**
 * Fetch one validation document and hand it to the browser. The route is
 * Bearer-gated, so an <a href> cannot carry the token. Returns a message on
 * failure, null on success.
 */
export async function downloadValidationDocument(docId: string): Promise<string | null> {
  try {
    const token = getAuthToken();
    const res = await fetch(`/api/validation-kit/${encodeURIComponent(docId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      return res.status === 401 || res.status === 403
        ? `${docId} was not downloaded: your account may not read the validation package.`
        : `${docId} was not downloaded: the server refused the request (HTTP ${res.status}).`;
    }
    const blob = await res.blob();
    if (blob.size === 0) return `${docId} came back empty; nothing was downloaded.`;
    return downloadBlob(`${docId}.md`, blob) ? null : `${docId} was fetched, but the browser refused the download.`;
  } catch (e) {
    return `${docId} was not downloaded: ${e instanceof Error ? e.message : String(e)}.`;
  }
}

export function ValidationKitCard() {
  const [epoch, setEpoch] = useState(0);
  const kit = useLiveData<ValidationPackage>('/api/validation-kit', ['/api/validation-kit', epoch], isPackage);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const docs = kit.data?.artifacts ?? [];

  const download = async (docId: string) => {
    setBusy(docId);
    setProblem((await downloadValidationDocument(docId)) ?? '');
    setBusy(null);
  };

  let body: React.ReactNode;
  if (kit.loading && !kit.data) {
    body = <span className="txw-help">Reading…</span>;
  } else if (kit.error || !kit.data) {
    body = (
      <span className="txw-help" data-tone="warn" role="alert">
        The validation package could not be read{kit.status ? ` (HTTP ${kit.status})` : ''}.{' '}
        <button type="button" className="btn ghost small" onClick={() => setEpoch(n => n + 1)}>
          Retry
        </button>
      </span>
    );
  } else if (docs.length === 0) {
    body = <span className="txw-help">{kit.data.note}</span>;
  } else {
    body = (
      <>
        {docs.map(d => (
          <div className="txw-row" key={d.docId} data-testid="validation-kit-document">
            <div className="txw-row-l">
              {d.docId}
              {d.version ? <> · v{d.version}</> : null}
              <small>{d.title}</small>
            </div>
            <div className="txw-row-r">
              <div className="txw-row-r-grid">
                <span>{d.status ?? 'No status recorded in the document'}</span>
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={`Download ${d.docId}`}
                  disabled={busy !== null}
                  onClick={() => void download(d.docId)}
                >
                  {I.download} Download
                </button>
              </div>
            </div>
          </div>
        ))}
        <p className="txw-help">{kit.data.note}</p>
      </>
    );
  }

  return (
    <div className="txw-set-card" data-testid="validation-kit-card">
      <div className="txw-set-head">
        <div className="txw-set-head-l">
          <div className="txw-set-eyebrow">Validation</div>
          <h2 className="txw-set-title">GAMP 5 validation package</h2>
          <p className="txw-set-sub">
            The validation master plan for the launch applications and the documents under it, each
            with the status its own header records. Every download is recorded in the audit trail.
          </p>
        </div>
      </div>
      <div className="txw-set-body">
        {body}
        <div
          className={problem ? 'txw-help' : undefined}
          data-tone={problem ? 'warn' : undefined}
          role="status"
          aria-live="polite"
        >
          {problem || null}
        </div>
      </div>
    </div>
  );
}
