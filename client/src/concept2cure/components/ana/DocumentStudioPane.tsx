/**
 * DocumentStudioPane — the right-hand live document preview inside AnA, the
 * surface from the Opus split-pane screenshot re-targeted to regulatory docs.
 *
 * Chat stays on the left; this pane renders the active generated draft with:
 *   - a header (title · format, Download-as-DOCX, close),
 *   - a sub-bar (version picker + page pagination) when there is more than one
 *     version or the document spans multiple pages,
 *   - the VerificationPanel ("verified against your source") for the selected
 *     version, and
 *   - the rendered document body (serif reading surface), one page at a time.
 *
 * It owns no chat state — it is a pure view over the draft + versions the chat
 * hook already produced. Gated by ENABLE_ANA_DOCUMENT_STUDIO upstream.
 */
import { useEffect, useMemo, useState } from 'react';
import { I } from './icons';
import { VerificationPanel } from './VerificationPanel';
import {
  NatHistoryDossierAffordance,
  type DossierProvenance,
} from './NatHistoryDossierAffordance';
import type { VerificationResult } from './useAnaChat';
import { renderSafeMarkdown } from './renderSafeMarkdown';
import styles from './styles.module.css';

export interface DocumentStudioDraft {
  title: string;
  content: string;
  documentType?: string;
}

export interface DocumentStudioPaneProps {
  draft: DocumentStudioDraft;
  /** Verification result for the selected version, when AnA verified it. */
  verification?: VerificationResult;
  /** How many versions of this document exist this session (1 = no picker). */
  versionCount?: number;
  /** Zero-based index of the version currently shown. */
  activeVersionIndex?: number;
  /** Switch the preview to another version. */
  onSelectVersion?: (index: number) => void;
  /** Download the rendered document as a Word file. */
  onDownloadDocx: (draft: DocumentStudioDraft) => void;
  /** Collapse the preview pane. */
  onClose: () => void;
  /** Ask AnA to fix an unverified document (missing strings / divergence). */
  onResolveVerification?: () => void;
  /** True while a download/render request is in flight. */
  downloading?: boolean;
  /** Target characters per page for pagination. Exposed for testing. */
  pageSize?: number;
  /**
   * E13 natural-history / external-control evidence-dossier affordance. When
   * provided, renders the flag-gated panel that asks AnA to assemble the dossier
   * and surfaces the Part 11 export/seal honesty state. Omit to hide it (the
   * default — existing Studio surfaces are unaffected).
   */
  dossier?: {
    indication: string;
    sponsor?: string;
    provenance?: DossierProvenance;
    onAssemble: (message: string) => void;
    busy?: boolean;
  };
}

const DEFAULT_PAGE_SIZE = 2200;

/**
 * Split markdown content into pages at paragraph boundaries, accumulating
 * blocks until the page reaches ~pageSize characters. A single oversized block
 * becomes its own page rather than being cut mid-paragraph. Pure + exported for
 * unit testing.
 */
export function paginateContent(content: string, pageSize = DEFAULT_PAGE_SIZE): string[] {
  const text = (content || '').trim();
  if (!text) return [''];
  const blocks = text.split(/\n{2,}/);
  const pages: string[] = [];
  let current = '';
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > pageSize) {
      pages.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) pages.push(current);
  return pages.length > 0 ? pages : [''];
}

export function DocumentStudioPane({
  draft,
  verification,
  versionCount = 1,
  activeVersionIndex = 0,
  onSelectVersion,
  onDownloadDocx,
  onClose,
  onResolveVerification,
  downloading,
  pageSize,
  dossier,
}: DocumentStudioPaneProps) {
  const format = (draft.documentType || 'DOCX').toUpperCase();
  const pages = useMemo(() => paginateContent(draft.content, pageSize), [draft.content, pageSize]);

  const [page, setPage] = useState(0);
  // Reset to the first page whenever the rendered content changes (new draft or
  // a version switch), so the reader never lands on a now-out-of-range page.
  useEffect(() => {
    setPage(0);
  }, [draft.content]);

  const safePage = Math.min(page, pages.length - 1);
  const html = useMemo(() => renderSafeMarkdown(pages[safePage] ?? ''), [pages, safePage]);

  const hasVersions = versionCount > 1;
  const hasPages = pages.length > 1;

  return (
    <aside className={styles.studioPane} aria-label="Document preview">
      <header className={styles.studioHeader}>
        <div className={styles.studioTitleWrap}>
          <span className={styles.ico} aria-hidden="true">
            <I.file size={14} />
          </span>
          <span className={styles.studioTitle} title={draft.title}>
            {draft.title}
          </span>
          <span className={styles.studioFormat}>· {format}</span>
        </div>
        <div className={styles.studioActions}>
          <button
            type="button"
            className={styles.studioDownload}
            onClick={() => onDownloadDocx(draft)}
            disabled={downloading}
          >
            <I.share size={13} />
            <span>{downloading ? 'Preparing…' : 'Download as DOCX'}</span>
          </button>
          <button
            type="button"
            className={styles.studioClose}
            onClick={onClose}
            aria-label="Close preview"
          >
            <I.close size={15} />
          </button>
        </div>
      </header>

      {(hasVersions || hasPages) && (
        <div className={styles.studioSubbar}>
          {hasVersions && (
            <label className={styles.studioVersion}>
              <span className={styles.studioSubLabel}>Version</span>
              <select
                className={styles.studioVersionSelect}
                aria-label="Document version"
                value={activeVersionIndex}
                onChange={(e) => onSelectVersion?.(Number(e.target.value))}
              >
                {Array.from({ length: versionCount }, (_, i) => (
                  <option key={i} value={i}>
                    v{i + 1}
                    {i === versionCount - 1 ? ' (latest)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {hasPages && (
            <div className={styles.studioPager}>
              <button
                type="button"
                className={styles.studioPagerBtn}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                aria-label="Previous page"
              >
                <I.down size={13} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <span className={styles.studioPagerLabel} aria-live="polite">
                Page {safePage + 1} / {pages.length}
              </span>
              <button
                type="button"
                className={styles.studioPagerBtn}
                onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
                disabled={safePage === pages.length - 1}
                aria-label="Next page"
              >
                <I.down size={13} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            </div>
          )}
        </div>
      )}

      {verification && (
        <div className={styles.studioVerify}>
          <VerificationPanel verification={verification} onResolve={onResolveVerification} />
        </div>
      )}

      {dossier && (
        <div className={styles.studioVerify}>
          <NatHistoryDossierAffordance
            indication={dossier.indication}
            sponsor={dossier.sponsor}
            provenance={dossier.provenance}
            onAssemble={dossier.onAssemble}
            busy={dossier.busy}
          />
        </div>
      )}

      <div className={styles.studioBody}>
        <article
          className={styles.studioDoc}
          // renderSafeMarkdown runs marked + DOMPurify; same sanitized path the
          // chat prose uses, so this is safe to inject.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </aside>
  );
}
