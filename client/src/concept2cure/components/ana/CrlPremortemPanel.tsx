/**
 * CrlPremortemPanel — the board-ready CRL/RTF pre-mortem DECISION ARTIFACT (E14).
 *
 * Renders the artifact assembled by `assemble_crl_premortem_artifact` as a calm,
 * reviewer-grade decision surface an executive committee reads before committing
 * filing runway:
 *
 *   - an approval-probability ESTIMATE strip — always framed as an estimate
 *     grounded in cited precedent, never a guarantee (the honesty contract made
 *     visible), carrying its denominator + confidence;
 *   - the ranked top-risks, each bound to the precedent that grounds it;
 *   - the prioritized fix-list (criticals/highs first);
 *   - an export affordance — disabled, with an explicit reason, when the
 *     artifact is `not_assessed` (insufficient grounding) or `sample`.
 *
 * Microcopy is factual (no emoji, no cheerleading). The probability strip is a
 * live region. The component owns no chat state — it is a pure view over the
 * artifact the chat hook produced. Gated upstream by the SERVER env flag
 * ENABLE_ANA_DOCUMENT_STUDIO (the client flag of that name was deleted —
 * it had no call sites).
 *
 * E1 INTEGRATION: when E1's Sign-and-seal + SealBadge/ProvenanceTrail land, the
 * seal action and the SealBadge attach here — next to the export action, keyed
 * off `artifact.sealable` / `artifact.sealStatus`. Until then the artifact
 * renders UNSEALED and is fully generatable/exportable without sealing.
 */
import { I } from './icons';
import styles from './styles.module.css';

export type ArtifactStatus = 'estimated' | 'not_assessed' | 'sample';
export type ProbabilityClass = 'low' | 'moderate' | 'high';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
export type Confidence = 'low' | 'medium' | 'high';
export type SealStatus = 'unsealed' | 'sealed';

export interface ApprovalProbabilityEstimate {
  value: number | null;
  class: ProbabilityClass | null;
  denominator: number;
  approved: number;
  denied: number;
  unknown: number;
  confidence: Confidence;
  framing: string;
}

export interface RiskGrounding {
  citationId: string;
  citationLabel: string;
  fromCorpus: boolean;
}

export interface RankedRisk {
  rank: number;
  title: string;
  severity: Severity;
  category: string;
  reviewerQuestion: string;
  regulatoryBasis: string;
  grounding: RiskGrounding;
}

export interface FixListItem {
  order: number;
  priority: Severity;
  action: string;
  addressesRisk: string;
  citationId: string;
}

export interface PrecedentCitation {
  id: string;
  label: string;
  outcome: string;
}

export interface CrlPremortemArtifact {
  title: string;
  status: ArtifactStatus;
  riskLevel: RiskLevel;
  approvalProbability: ApprovalProbabilityEstimate;
  topRisks: RankedRisk[];
  fixList: FixListItem[];
  precedentCitations: PrecedentCitation[];
  honestyNote: string;
  exportable: boolean;
  sealable: boolean;
  sealStatus: SealStatus;
  generatedAt: string;
}

const STATUS_REASON: Record<Exclude<ArtifactStatus, 'estimated'>, string> = {
  not_assessed:
    'Not exportable: this is a pattern-only read — no precedent with a known outcome is available to ground a probability. Populate the precedent corpus to enable export.',
  sample:
    'Not exportable: this is a sample artifact. Sample and not-assessed artifacts can never be sealed or exported.',
};

export interface CrlPremortemPanelProps {
  artifact: CrlPremortemArtifact;
  /**
   * Export the artifact as a Word document. Only invoked when the artifact is
   * exportable; the button is disabled with an explicit reason otherwise.
   */
  onExport?: (artifact: CrlPremortemArtifact) => void;
  /** True while an export/render request is in flight. */
  exporting?: boolean;
}

export function CrlPremortemPanel({ artifact, onExport, exporting }: CrlPremortemPanelProps) {
  const ap = artifact.approvalProbability;
  /* Why export is unavailable, or empty when it is available. The artifact's
     own status is the first answer; a host that wired no handler is the
     second, and saying nothing there would leave a dead button on screen. */
  const exportReason = !artifact.exportable
    ? STATUS_REASON[artifact.status as Exclude<ArtifactStatus, 'estimated'>]
    : !onExport
      ? 'Export is not available from here. Open this artifact in Document Studio to export it as a DOCX.'
      : '';
  const pct = ap.value != null ? Math.round(ap.value * 100) : null;

  return (
    <section className={styles.premortemPanel} aria-label="CRL/RTF pre-mortem decision artifact">
      <header className={styles.premortemHeader}>
        <span className={styles.ico} aria-hidden="true">
          <I.shieldCheck size={15} />
        </span>
        <span className={styles.premortemTitle} title={artifact.title}>
          {artifact.title}
        </span>
        {/* E1 INTEGRATION: SealBadge renders here once E1 lands; until then the
            artifact is explicitly unsealed. */}
        <span className={styles.premortemSeal} data-seal={artifact.sealStatus}>
          {artifact.sealStatus === 'sealed' ? 'Sealed' : 'Unsealed draft'}
        </span>
      </header>

      <div
        className={styles.premortemEstimate}
        data-class={ap.class ?? 'none'}
        role="status"
        aria-live="polite"
      >
        <div className={styles.premortemEstimateHead}>
          <span className={styles.premortemEstimateLabel}>Approval-probability estimate</span>
          <span className={styles.premortemEstimateValue}>
            {pct != null ? `~${pct}%` : 'Not estimated'}
          </span>
        </div>
        <p className={styles.premortemFraming}>{ap.framing}</p>
        <p className={styles.premortemMeta}>
          Overall pre-mortem risk: <strong>{artifact.riskLevel.toUpperCase()}</strong>
          {' · '}Confidence: {ap.confidence}
          {' · '}n={ap.denominator}
          {ap.value != null && (
            <>
              {' · '}
              {ap.approved} approved / {ap.denied} denied
            </>
          )}
        </p>
      </div>

      <p className={styles.premortemHonesty}>{artifact.honestyNote}</p>

      <div className={styles.premortemSection}>
        <h3 className={styles.premortemSectionTitle}>Top risks</h3>
        {artifact.topRisks.length === 0 ? (
          <p className={styles.premortemDetail}>
            No codified reviewer-trigger pattern fired. This is not proof of soundness — a human reviewer
            must still confirm completeness.
          </p>
        ) : (
          <ol className={styles.premortemRiskList}>
            {artifact.topRisks.map((r) => (
              <li key={r.rank} className={styles.premortemRisk} data-severity={r.severity}>
                <div className={styles.premortemRiskHead}>
                  <span className={styles.premortemRiskSeverity}>{r.severity.toUpperCase()}</span>
                  <span className={styles.premortemRiskTitle}>{r.title}</span>
                </div>
                <p className={styles.premortemDetail}>{r.reviewerQuestion}</p>
                <p className={styles.premortemCite}>
                  <span className={styles.ico} aria-hidden="true">
                    <I.book size={11} />
                  </span>
                  <span>
                    Grounding: {r.grounding.citationLabel}
                    {!r.grounding.fromCorpus && ' (regulatory basis — no matched precedent)'}
                  </span>
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className={styles.premortemSection}>
        <h3 className={styles.premortemSectionTitle}>Prioritized fix-list</h3>
        {artifact.fixList.length === 0 ? (
          /* An empty fix-list is NOT a finding of "none required". The artifact
             carries its own status: `not_assessed` means the premortem had
             insufficient grounding and identified nothing — including nothing to
             fix — so the old unconditional "No remediations required" was
             clearance copy over a state the system itself labelled not assessed.
             `artifact.status` is the positive evidence assessmentState.ts asks
             for; only an `estimated` (assessed) artifact may say the list is
             empty, and even then it hedges the way the Top-risks sibling above
             does — "codified patterns" is a bounded check, not proof of
             soundness. */
          <p className={styles.premortemDetail}>
            {artifact.status === 'not_assessed'
              ? 'Not assessed — the premortem had insufficient grounding to identify remediations, so none can be listed.'
              : artifact.status === 'sample'
                ? 'Sample artifact — no remediation list is produced for a sample.'
                : 'No remediations required by codified patterns. This is not proof of soundness — a human reviewer must still confirm completeness.'}
          </p>
        ) : (
          <ol className={styles.premortemFixList}>
            {artifact.fixList.map((fix) => (
              <li key={fix.order} className={styles.premortemFix} data-priority={fix.priority}>
                <span className={styles.premortemFixPriority}>{fix.priority.toUpperCase()}</span>
                <span className={styles.premortemFixAction}>{fix.action}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className={styles.premortemFooter}>
        {/* `!onExport` disables too, and says so.
            The disabled state used to key off `artifact.exportable` alone, so a
            host that mounted this panel without wiring an export handler — the
            v2 rail, which has no DOCX route for this artifact — rendered an
            ENABLED button whose click ran `onExport?.(…)` on undefined and did
            nothing. A control that looks available and silently does nothing is
            the same defect as a status that claims work nobody did; the panel
            already had the disabled-with-a-reason pattern and simply did not
            cover this case. */}
        <button
          type="button"
          className={styles.premortemExport}
          onClick={() => artifact.exportable && onExport?.(artifact)}
          disabled={!artifact.exportable || !onExport || exporting}
          aria-describedby={exportReason ? 'premortem-export-reason' : undefined}
        >
          <I.share size={13} />
          <span>{exporting ? 'Preparing…' : 'Export as DOCX'}</span>
        </button>
        {exportReason && (
          <p id="premortem-export-reason" className={styles.premortemExportReason}>
            {exportReason}
          </p>
        )}
        {/* E1 INTEGRATION: the "Sign and seal" action attaches here, keyed off
            artifact.sealable. It is intentionally absent until E1 lands. */}
      </footer>
    </section>
  );
}
