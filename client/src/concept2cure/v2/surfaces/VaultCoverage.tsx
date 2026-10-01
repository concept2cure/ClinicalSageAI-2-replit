/**
 * Vault coverage (VR-15, row D2): what this Vault holds against what the
 * program's rule pack requires.
 *
 * The figure is the server's (server/services/vault/vault-coverage.ts, from
 * the one required-sections resolver): counts of sections with a confirmed
 * document, and where the list came from. The block shows counts only, never a
 * percentage and never a readiness ring. When there is no figure it says why.
 * Each missing section offers Upload (the page's own file picker) and filing
 * an existing document there (the page's own filing call, which the server
 * records in the audit trail).
 */
import React, { useState } from 'react';
import { I } from '../icons';

export type VaultCoverageShape =
  | {
      state: 'available';
      provenance: { source: 'rule_pack' | 'fallback'; docType?: string; agency?: string; packVersion?: string; reason?: string };
      modules: Array<{ code: string; name: string; covered: string[]; missing: string[] }>;
      required: number;
      covered: number;
    }
  | { state: 'unavailable'; reason: string }
  | { state: 'not_applicable'; reason: string };

/** A document a person may file at a missing section. */
export interface CoverageDocument {
  docId: string;
  title: string;
}

interface Props {
  coverage: VaultCoverageShape | undefined;
  documents: CoverageDocument[];
  onUpload: () => void;
  onFileHere: (docId: string, target: { folderId: string; ctdSection: string }) => void;
  busy: boolean;
}

function provenanceLine(p: Extract<VaultCoverageShape, { state: 'available' }>['provenance']): string {
  if (p.source === 'rule_pack') {
    return `Required list from the ${(p.docType ?? '').toUpperCase()} rule pack for ${p.agency ?? 'the agency'}, version ${p.packVersion ?? 'unrecorded'}.`;
  }
  return `Required list is the ICH CTD baseline, not this program's own: ${p.reason ?? 'no rule pack applies.'}`;
}

function MissingSection({
  code,
  moduleCode,
  documents,
  onUpload,
  onFileHere,
  busy,
}: { code: string; moduleCode: string } & Omit<Props, 'coverage'>) {
  const [docId, setDocId] = useState('');
  return (
    <div className="vd-dr-row" data-testid={`vault-coverage-missing-${code}`}>
      <span className="vd-dr-kind">{code}</span>
      <span className="vd-dr-name">No confirmed document</span>
      <button className="vd-dr-toggle" onClick={onUpload} disabled={busy}>
        {I.upload} Upload
      </button>
      {documents.length > 0 && (
        <>
          <select
            aria-label={`Document to file at ${code}`}
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            disabled={busy}
          >
            <option value="">Choose a document…</option>
            {documents.map((d) => (
              <option key={d.docId} value={d.docId}>
                {d.title}
              </option>
            ))}
          </select>
          <button
            className="vd-dr-toggle"
            disabled={busy || !docId}
            onClick={() => onFileHere(docId, { folderId: `module-${moduleCode.replace(/^m/, '')}`, ctdSection: code })}
          >
            File here
          </button>
        </>
      )}
    </div>
  );
}

export function VaultCoverage({ coverage, documents, onUpload, onFileHere, busy }: Props) {
  const [open, setOpen] = useState(false);
  if (!coverage) return null;
  if (coverage.state !== 'available') {
    return (
      <div className="vd-dr" data-testid="vault-coverage">
        <div className="vd-dr-head">
          <span className="vd-dr-title">{I.folder} Vault coverage</span>
          <span className="vd-dr-meta">
            {coverage.state === 'unavailable' ? `Not shown. ${coverage.reason}` : coverage.reason}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="vd-dr" data-testid="vault-coverage">
      <div className="vd-dr-head">
        <span className="vd-dr-title">{I.folder} Vault coverage</span>
        <span className="vd-dr-meta">
          Required sections: <b>{coverage.covered}</b> of <b>{coverage.required}</b> have a confirmed document
        </span>
        {coverage.required > 0 && (
          <button className="vd-dr-toggle" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide sections' : 'Show sections'}
          </button>
        )}
      </div>
      <div className="vd-dr-empty">{provenanceLine(coverage.provenance)}</div>
      {open && (
        <div className="vd-dr-rows">
          {coverage.modules.map((m) => (
            <React.Fragment key={m.code}>
              <div className="vd-dr-row">
                <span className="vd-dr-kind">{m.code.toUpperCase()}</span>
                <span className="vd-dr-name">{m.name}</span>
                <span className="vd-dr-detail">
                  {m.covered.length} of {m.covered.length + m.missing.length}
                  {m.covered.length > 0 ? ` · confirmed: ${m.covered.join(', ')}` : ''}
                </span>
              </div>
              {m.missing.map((code) => (
                <MissingSection
                  key={code}
                  code={code}
                  moduleCode={m.code}
                  documents={documents}
                  onUpload={onUpload}
                  onFileHere={onFileHere}
                  busy={busy}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
