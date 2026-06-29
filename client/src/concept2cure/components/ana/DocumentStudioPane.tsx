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
import { ReadinessGatePanel } from './ReadinessGatePanel';
import type { ReadinessGate, BlockingItem } from './ectdReadiness';
import { ConcordancePanel } from './ConcordancePanel';
import type { CdxConcordanceReport } from './cdxConcordance';
import type { ConcordanceDataStatus } from './cdxConcordance.fixtures';
import {
  NatHistoryDossierAffordance,
  type DossierProvenance,
} from './NatHistoryDossierAffordance';
import { ConsistencyPanel } from './ConsistencyPanel';
import { BriefingBookPanel, type BriefingBookPremortemResult } from './BriefingBookPanel';
import type { VerificationResult, ConsistencyResult } from './useAnaChat';
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
  /** Dossier-consistency sweep for the selected version, when AnA ran it. */
  consistency?: ConsistencyResult;
  /**
   * Briefing-book reviewer-challenge / pre-mortem for the selected version (E8),
   * when this document is a Pre-IND / EOP2 briefing book. Renders the
   * "anticipated FDA pushback" panel below the verification strip.
   */
  briefingPremortem?: BriefingBookPremortemResult;
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
  /**
   * E12 — cross-dossier CDx claim-concordance report for the paired drug +
   * device dossier this draft belongs to. When present, the concordance
   * trust-panel is shown beneath the verification panel. Omit when the draft is
   * not part of a `pair_companion_diagnostic` pairing.
   */
  concordance?: CdxConcordanceReport;
  /** Provenance of the concordance data — 'sample' is never sealable. */
  concordanceDataStatus?: ConcordanceDataStatus;
  /** Ask AnA to reconcile discordant CDx claims across the paired dossiers. */
  onResolveConcordance?: () => void;
  /** Ask AnA to reconcile dossier inconsistencies and re-run the sweep. */
  onResolveConsistency?: () => void;
  /** True while a download/render request is in flight. */
  downloading?: boolean;
  /** Target characters per page for pagination. Exposed for testing. */
  pageSize?: number;
  /**
   * E10 — eCTD Module 2/5 assembly + readiness gate (flag-gated upstream by
   * ENABLE_ANA_DOCUMENT_STUDIO). When `ectdEnabled` is true, the pane shows a
   * single "Assemble Module 2/5 + check readiness" affordance. Once run, the
   * aggregated `readinessGate` is rendered as a blocking gate that must be green
   * before the seal / PDUFA-clock submission step.
   */
  ectdEnabled?: boolean;
  /** The aggregated readiness verdict, once the assemble + checks have run. */
  readinessGate?: ReadinessGate;
  /** Run the one-turn assemble-module + structural + consistency action. */
  onAssembleModule?: (moduleNumber: string) => void;
  /** Seal / submit to the PDUFA clock — only reachable when the gate is green. */
  onSeal?: () => void;
  /** Follow a blocking item's deep link (jump to a CTD section / open module). */
  onFollowReadinessLink?: (item: BlockingItem) => void;
  /** True while the assemble + readiness action is in flight. */
  assembling?: boolean;
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

/** The CTD modules E10 can assemble in one turn — the summary + clinical modules. */
const ECTD_MODULE_CHOICES: { value: string; label: string }[] = [
  { value: '2.5', label: 'Module 2.5 — Clinical Overview' },
  { value: '2.7', label: 'Module 2.7 — Clinical Summary' },
  { value: '5.3.5', label: 'Module 5.3.5 — Clinical Study Reports' },
];

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
  consistency,
  briefingPremortem,
  versionCount = 1,
  activeVersionIndex = 0,
  onSelectVersion,
  onDownloadDocx,
  onClose,
  onResolveVerification,
  concordance,
  concordanceDataStatus = 'sample',
  onResolveConcordance,
  onResolveConsistency,
  downloading,
  pageSize,
  ectdEnabled,
  readinessGate,
  onAssembleModule,
  onSeal,
  onFollowReadinessLink,
  assembling,
  dossier,
}: DocumentStudioPaneProps) {
  const format = (draft.documentType || 'DOCX').toUpperCase();
  const pages = useMemo(() => paginateContent(draft.content, pageSize), [draft.content, pageSize]);

  const [moduleChoice, setModuleChoice] = useState(ECTD_MODULE_CHOICES[0].value);
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

      {ectdEnabled && (
        <div className={styles.studioEctd}>
          {!readinessGate && (
            <div className={styles.studioAssemble} role="group" aria-label="Assemble eCTD module">
              <label className={styles.studioAssembleLabel}>
                <span className={styles.studioSubLabel}>eCTD module</span>
                <select
                  className={styles.studioVersionSelect}
                  aria-label="eCTD module to assemble"
                  value={moduleChoice}
                  onChange={e => setModuleChoice(e.target.value)}
                  disabled={assembling}
                >
                  {ECTD_MODULE_CHOICES.map(m => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.studioAssembleBtn}
                onClick={() => onAssembleModule?.(moduleChoice)}
                disabled={assembling || !onAssembleModule}
              >
                <span className={styles.ico} aria-hidden="true">
                  <I.file size={13} />
                </span>
                <span>{assembling ? 'Assembling and checking…' : 'Assemble module and check readiness'}</span>
              </button>
            </div>
          )}
          {readinessGate && (
            <ReadinessGatePanel
              gate={readinessGate}
              onSeal={onSeal}
              onFollowLink={onFollowReadinessLink}
              assessing={assembling}
            />
          )}
        </div>
      )}

      {concordance && (
        <div className={styles.studioVerify}>
          <ConcordancePanel
            report={concordance}
            dataStatus={concordanceDataStatus}
            onResolve={onResolveConcordance}
          />
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

      {consistency && (
        <div className={styles.studioConsistency}>
          <ConsistencyPanel consistency={consistency} onResolve={onResolveConsistency} />
        </div>
      )}

      {briefingPremortem && (
        <div className={styles.studioVerify}>
          <BriefingBookPanel premortem={briefingPremortem} />
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
