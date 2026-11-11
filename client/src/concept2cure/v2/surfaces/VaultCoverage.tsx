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
import React, { useId, useState } from 'react';
import { I } from '../icons';
import { useVaultCanWrite } from './VaultViewOnly';

export type VaultCoverageShape =
  | {
      state: 'available';
      provenance: { source: 'rule_pack' | 'fallback'; docType?: string; agency?: string; packVersion?: string; reason?: string };
      modules: Array<{ code: string; name: string; covered: string[]; missing: string[] }>;
      required: number;
      covered: number;
    }
  | { state: 'unavailable'; reason: string }
  /** `outlineInLibrary`: a filing with its own outline, whose required sections the Library marks (S6). */
  | { state: 'not_applicable'; reason: string; outlineInLibrary?: true };

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
  /** Start with the sections listed: the Required documents view is this list (D6 §C.4 step 5). */
  defaultOpen?: boolean;
  /** Open the filing's own outline, in the Library, for a filing the Vault does not count (S6). */
  onShowOutline?: () => void;
  /** A required section's name by its number, from the filing's outline; null where the outline names none. */
  sectionName?: (code: string) => string | null;
}

/** An agency as people write it: the rule pack records "fda", a person reads "FDA". A longer name is left as recorded. */
function agencyName(agency: string | undefined): string {
  const a = (agency ?? '').trim();
  if (!a) return 'the agency';
  return a.length <= 5 ? a.toUpperCase() : a;
}

function provenanceLine(p: Extract<VaultCoverageShape, { state: 'available' }>['provenance']): string {
  if (p.source === 'rule_pack') {
    return `Required list from the ${(p.docType ?? '').toUpperCase()} rule pack for ${agencyName(p.agency)}, version ${p.packVersion ?? 'unrecorded'}.`;
  }
  return `Required list is the ICH CTD baseline, not this project's own: ${p.reason ?? 'no rule pack applies.'}`;
}

/**
 * A missing section: its number, its name where the filing's outline has one, and the gap. A person reads
 * "1.12.14 Environmental analysis", not a number alone. Where the outline has no name the row is the number and the
 * gap, as before; no name is made up.
 */
function SectionCells({ code, name }: { code: string; name: string | null }) {
  return (
    <>
      <span className="vd-dr-kind">{code}</span>
      {name ? <span className="vd-dr-name" data-testid={`vault-coverage-name-${code}`}>{name}</span> : null}
      <span className={name ? 'vd-dr-detail' : 'vd-dr-name'}>No confirmed document</span>
    </>
  );
}

function MissingLine({ code, name }: { code: string; name: string | null }) {
  return (
    <div className="vd-dr-row" data-testid={`vault-coverage-missing-${code}`}>
      <SectionCells code={code} name={name} />
    </div>
  );
}

function MissingSection({
  code,
  name,
  moduleCode,
  documents,
  onUpload,
  onFileHere,
  busy,
}: { code: string; name: string | null; moduleCode: string } & Omit<Props, 'coverage' | 'defaultOpen' | 'sectionName'>) {
  const [docId, setDocId] = useState('');
  // The gap is stated to every reader; uploading and filing into it only to a role the routes admit.
  const canWrite = useVaultCanWrite();
  if (!canWrite) return <MissingLine code={code} name={name} />;
  return (
    <div className="vd-dr-row" data-testid={`vault-coverage-missing-${code}`}>
      <SectionCells code={code} name={name} />
      <button type="button" className="btn ghost small" onClick={onUpload} disabled={busy}>
        {I.upload} Upload
      </button>
      {documents.length > 0 && (
        <>
          <select
            className="c2c-input vd-cov-pick"
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
            type="button"
            className="btn ghost small"
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

export function VaultCoverage({ coverage, documents, onUpload, onFileHere, busy, defaultOpen = false, onShowOutline, sectionName }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const headingId = useId();
  /* A section of the Required documents view (D6 §C.4 step 11): the heading,
     the server's count as its count, the list toggle as its action. */
  const head = (sub: React.ReactNode, acts?: React.ReactNode) => (
    <div className="pj-sec-h">
      <h2 id={headingId}>Vault coverage</h2>
      <span className="sec-sub">{sub}</span>
      {acts ? <div className="pj-sec-acts">{acts}</div> : null}
    </div>
  );
  if (!coverage) {
    /* An older server sends no figure. Nothing was read, so nothing is claimed. */
    return (
      <section className="pj-sec" data-testid="vault-coverage" aria-labelledby={headingId}>
        {head('This project’s Vault read carried no required-sections list.')}
      </section>
    );
  }
  if (coverage.state !== 'available') {
    /* A filing with its own outline (a device or diagnostic filing, S6): its required sections are the Library's. */
    const outline = coverage.state === 'not_applicable' && coverage.outlineInLibrary && onShowOutline
      ? <button type="button" className="btn ghost small" onClick={onShowOutline}>Show the outline in the Library</button>
      : undefined;
    return (
      <section className="pj-sec" data-testid="vault-coverage" aria-labelledby={headingId}>
        {head(coverage.state === 'unavailable' ? `Not shown. ${coverage.reason}` : coverage.reason, outline)}
      </section>
    );
  }
  return (
    <section className="pj-sec" data-testid="vault-coverage" aria-labelledby={headingId}>
      {head(
        <>Required sections: <b>{coverage.covered}</b> of <b>{coverage.required}</b> have a confirmed document</>,
        coverage.required > 0 ? (
          <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide sections' : 'Show sections'}
          </button>
        ) : null,
      )}
      <div className="vd-dr-empty">{provenanceLine(coverage.provenance)}</div>
      {open && (
        <div className="vd-dr-rows vd-cov-rows">
          {coverage.modules.map((m) => (
            <React.Fragment key={m.code}>
              <div className="vd-dr-row vd-cov-mod">
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
                  name={sectionName?.(code) ?? null}
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
    </section>
  );
}
