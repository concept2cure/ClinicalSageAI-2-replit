/**
 * DocumentStudioPane — the right-hand live document preview inside AnA, the
 * surface from the Opus split-pane screenshot re-targeted to regulatory docs.
 *
 * Chat stays on the left; this pane renders the active generated draft with:
 *   - a header (title · DOCX, version label, Download-as-DOCX, close),
 *   - the VerificationPanel ("verified against your source") when AnA ran the
 *     verify step this turn,
 *   - the rendered document body (serif reading surface).
 *
 * It owns no chat state — it is a pure view over the draft + verification the
 * chat hook already produced. Gated by ENABLE_ANA_DOCUMENT_STUDIO upstream.
 */
import { I } from './icons';
import { VerificationPanel } from './VerificationPanel';
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
  /** Verification result for this draft, when AnA verified it against the source. */
  verification?: VerificationResult;
  /** Download the rendered document as a Word file. */
  onDownloadDocx: (draft: DocumentStudioDraft) => void;
  /** Collapse the preview pane. */
  onClose: () => void;
  /** True while a download/render request is in flight. */
  downloading?: boolean;
}

export function DocumentStudioPane({
  draft,
  verification,
  onDownloadDocx,
  onClose,
  downloading,
}: DocumentStudioPaneProps) {
  const format = (draft.documentType || 'DOCX').toUpperCase();
  const html = renderSafeMarkdown(draft.content);

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

      {verification && (
        <div className={styles.studioVerify}>
          <VerificationPanel verification={verification} />
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
