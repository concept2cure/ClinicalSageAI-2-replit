/**
 * The Exports rail — what left this document, and whether it is still current.
 *
 * ── What was missing ─────────────────────────────────────────────────────────
 * `POST /docs/:docId/export` has a real producer in the UI
 * (AuthoringCreateExport), and every call writes an `authoring_export_history`
 * row: who exported, when, which format, the file name and size, and
 * `doc_sha256` — the document's content hash AT EXPORT TIME. Three endpoints
 * read that table. None had a caller.
 *
 * So the product could hand a regulatory author a Word file and then had no way
 * to answer the one question they have about it afterwards: **is the file I am
 * holding still this document?** An exported section pack that has since been
 * edited is the thing that gets filed by mistake.
 *
 * ── The two questions are different, and are answered separately ─────────────
 * This rail deliberately reports two drifts that a single "out of date" badge
 * would have merged:
 *
 *   CONTENT drift — the last export's `doc_sha256` versus the document's hash
 *     now. Covers section code and content, in order. It is the strong signal:
 *     if it differs, the exported text is not this text.
 *   CITATION drift — `…/diff-since-export`, which lists `authoring_citations`
 *     rows created after the last export. It is NOT a content comparison and
 *     must never be labelled as one: a document can gain a citation with its
 *     prose untouched, and can have its prose rewritten without gaining one.
 *
 * ── Honesty rules ────────────────────────────────────────────────────────────
 * `content_changed_since_last_export` is null when there is nothing to compare
 * against — no export yet, or a stored row with no hash. Null is rendered as
 * "cannot be checked", never as "unchanged": telling an author their stale file
 * is current is the single worst thing this rail could do, and it is exactly
 * what a `?? false` here would produce. A failed read renders as a failure to
 * READ, never as "this document has never been exported".
 */
import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';

/** A row of `authoring_export_history`, as GET /docs/:docId/exports returns it. */
export interface ExportRecord {
  id: string;
  document_id: string | null;
  export_type: string | null;
  exported_by: string | null;
  exported_at: string | null;
  file_name: string | null;
  file_size: number | null;
  /** computeDocHash at export time. Null on rows written before it was stored. */
  doc_sha256: string | null;
  download_url?: string | null;
}

/** A citation created since the last export, per GET …/diff-since-export. */
export interface CitationDrift {
  id: string;
  section_id: string | null;
  section_code: string | null;
  section_title: string | null;
  citation_text: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string | null;
}

export interface ExportsState {
  exports: ExportRecord[];
  total: number;
  lastExport: ExportRecord | null;
  currentContentHash: string | null;
  /** null = nothing to compare against. NEVER coerce to false. */
  contentChanged: boolean | null;
}

/** The four states of the headline verdict, and the sentence for each. */
export type StalenessVerdict =
  | { kind: 'never-exported'; text: string }
  | { kind: 'uncheckable'; text: string }
  | { kind: 'current'; text: string }
  | { kind: 'drifted'; text: string };

/**
 * The verdict, as a decision separated from its rendering so it can be tested
 * as one. The three inputs are exactly the three the server sends, and each
 * combination maps to a different sentence — including the one where the
 * honest answer is "this cannot be checked".
 */
export function describeStaleness(
  lastExport: ExportRecord | null,
  contentChanged: boolean | null,
): StalenessVerdict {
  if (!lastExport) {
    return {
      kind: 'never-exported',
      text: 'This document has not been exported. There is no file to be out of date.',
    };
  }
  const fmt = lastExport.export_type ? lastExport.export_type.toUpperCase() : 'file';
  if (contentChanged === null) {
    return {
      kind: 'uncheckable',
      text:
        `The last export (${fmt}) recorded no content hash, so whether it still matches this ` +
        'document cannot be checked. Export again to establish a baseline.',
    };
  }
  if (contentChanged) {
    return {
      kind: 'drifted',
      text:
        `The section text has changed since the last export (${fmt}). Anyone holding that file ` +
        'does not have this document. Export again before filing or circulating it.',
    };
  }
  return {
    kind: 'current',
    text:
      `The last export (${fmt}) matches the current section text. This check covers section ` +
      'codes and content only — not citations, attachments or signatures.',
  };
}

/** Bytes as a short human string. Null stays null — never "0 B" for unknown. */
export function formatSize(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const VERDICT_STYLE: Record<StalenessVerdict['kind'], React.CSSProperties> = {
  'never-exported': {},
  current: {},
  uncheckable: { borderLeftColor: 'var(--warning,#b54708)' },
  drifted: { borderLeftColor: 'var(--c2c-err,#b42318)' },
};

export interface AuthoringExportsProps {
  docId: string | null;
  /** Bumped by the host after a save or an export so the rail re-reads. */
  refreshKey?: number;
}

export function AuthoringExports({ docId, refreshKey = 0 }: AuthoringExportsProps) {
  const [state, setState] = useState<ExportsState | null>(null);
  /* 'error' is a distinct state on purpose: an empty list because the read
     failed and an empty list because nothing was exported are the same value
     and opposite facts. */
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const [drift, setDrift] = useState<{ baseline: string | null; changed: CitationDrift[] } | null>(
    null,
  );
  const [driftStatus, setDriftStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const load = useCallback(async (id: string) => {
    setStatus('loading');
    setError(null);
    try {
      const res = await apiRequest('GET', `/api/authoring/docs/${id}/exports`);
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || json?.success !== true) {
        setStatus('error');
        // "HTTP 401" reached the screen: this rail renders directly, not
        // through ErrorState, so no redaction applied to the bare status.
        setError(
          res.status === 401
            ? 'your session isn’t authenticated'
            : (serverMessage(json) ?? 'the export service did not answer'),
        );
        return;
      }
      setState({
        exports: Array.isArray(json.exports) ? (json.exports as ExportRecord[]) : [],
        total: typeof json.total === 'number' ? json.total : 0,
        lastExport: (json.last_export as ExportRecord | null) ?? null,
        currentContentHash:
          typeof json.current_content_hash === 'string' ? json.current_content_hash : null,
        /* Read strictly. `undefined` from an older server is "unknown", which
           is the null case — not false. */
        contentChanged:
          typeof json.content_changed_since_last_export === 'boolean'
            ? json.content_changed_since_last_export
            : null,
      });
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadDrift = useCallback(async (id: string) => {
    setDriftStatus('loading');
    try {
      const res = await apiRequest('GET', `/api/authoring/docs/${id}/diff-since-export`);
      /* This endpoint answers with no `success` field — checking for one would
         reject every good response it sends. */
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !json) {
        setDriftStatus('error');
        return;
      }
      setDrift({
        baseline: typeof json.baseline === 'string' ? json.baseline : null,
        changed: Array.isArray(json.changed) ? (json.changed as CitationDrift[]) : [],
      });
      setDriftStatus('ready');
    } catch {
      setDriftStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!docId) {
      setState(null);
      setStatus('idle');
      setDrift(null);
      setDriftStatus('idle');
      return;
    }
    void load(docId);
    void loadDrift(docId);
  }, [docId, refreshKey, load, loadDrift]);

  if (!docId) {
    return (
      <div style={{ padding: 12, fontSize: 12, opacity: 0.75 }}>
        Open a document to see what has been exported from it.
      </div>
    );
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <div style={{ padding: 12, fontSize: 12, opacity: 0.75 }} role="status">
        Reading the export history…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className="scaf-note"
        role="alert"
        data-testid="exports-error"
        style={{ margin: 12, fontSize: 12, ...VERDICT_STYLE.drifted }}
      >
        Couldn’t read the export history{error ? ` — ${error}` : ''}. This is a failed read, not an
        empty history: whether this document has been exported is unknown right now.
      </div>
    );
  }

  const verdict = describeStaleness(state?.lastExport ?? null, state?.contentChanged ?? null);
  const exports = state?.exports ?? [];

  return (
    <div style={{ display: 'grid', gap: 12, padding: 12 }} data-testid="exports-rail">
      {/* ── The headline: is the exported file still this document? ── */}
      <div
        className="scaf-note"
        role="status"
        data-testid="exports-verdict"
        data-verdict={verdict.kind}
        style={{ margin: 0, fontSize: 12, ...VERDICT_STYLE[verdict.kind] }}
      >
        {verdict.text}
      </div>

      {/* ── Citation drift: a DIFFERENT question, kept visibly separate ── */}
      {driftStatus === 'error' && (
        <div style={{ fontSize: 11, color: 'var(--warning,#b54708)' }} role="status">
          Couldn’t check which citations were added since the last export.
        </div>
      )}
      {driftStatus === 'ready' && drift && drift.baseline && drift.changed.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }} data-testid="exports-citation-drift">
          <b style={{ fontSize: 12 }}>
            {drift.changed.length} citation{drift.changed.length === 1 ? '' : 's'} added since the
            last export
          </b>
          <span style={{ fontSize: 11, opacity: 0.75 }}>
            Separate from the text check above — a citation can be added without the prose
            changing, and the prose can change without one.
          </span>
          {drift.changed.slice(0, 8).map(c => (
            <div key={c.id} style={{ fontSize: 11, display: 'flex', gap: 6 }}>
              <span style={{ fontWeight: 600, flexShrink: 0 }}>{c.section_code ?? '—'}</span>
              <span style={{ minWidth: 0 }}>{c.citation_text || c.source || 'citation'}</span>
            </div>
          ))}
          {drift.changed.length > 8 && (
            <span style={{ fontSize: 11, opacity: 0.75 }}>
              and {drift.changed.length - 8} more.
            </span>
          )}
        </div>
      )}

      {/* ── The history itself ── */}
      {exports.length === 0 ? (
        <div style={{ fontSize: 12, opacity: 0.75 }} data-testid="exports-empty">
          {/* The server's own count is the fact; an empty page against a
              non-zero total is a paging skew, not an empty history. */}
          {(state?.total ?? 0) > 0
            ? `${state!.total} export${state!.total === 1 ? '' : 's'} recorded; none were returned in this page.`
            : 'No exports recorded for this document.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <b style={{ fontSize: 12 }}>
            {state?.total ?? exports.length} export
            {(state?.total ?? exports.length) === 1 ? '' : 's'}
          </b>
          {exports.map(x => {
            const size = formatSize(x.file_size);
            return (
              <div
                key={x.id}
                data-testid="export-row"
                style={{
                  display: 'grid',
                  gap: 2,
                  fontSize: 11,
                  paddingBottom: 8,
                  borderBottom: '1px solid var(--c2c-line,#e4e7ec)',
                }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                    {x.export_type ?? 'export'}
                  </span>
                  <span style={{ minWidth: 0, opacity: 0.85 }}>{x.file_name ?? '—'}</span>
                  {size && <span style={{ opacity: 0.6 }}>{size}</span>}
                </div>
                <div style={{ opacity: 0.75 }}>
                  {/* The exporter's identity is the server's, never guessed. */}
                  {x.exported_by ?? 'unknown actor'}
                </div>
                <GovernedTimestamp value={x.exported_at} layout="inline" />
                {x.doc_sha256 ? (
                  <code style={{ fontSize: 10, opacity: 0.7 }} title={x.doc_sha256}>
                    {x.doc_sha256.slice(0, 16)}…
                  </code>
                ) : (
                  <span style={{ fontSize: 10, opacity: 0.7 }}>no content hash recorded</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {state?.currentContentHash && (
        <div style={{ fontSize: 10, opacity: 0.7 }}>
          Current document hash{' '}
          <code title={state.currentContentHash}>{state.currentContentHash.slice(0, 16)}…</code>
        </div>
      )}
    </div>
  );
}

export default AuthoringExports;
