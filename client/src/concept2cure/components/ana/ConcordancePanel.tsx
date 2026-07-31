/**
 * ConcordancePanel — E12. The cross-dossier CDx claim-concordance trust strip.
 *
 * Modeled on VerificationPanel, but where that panel proves one document
 * matches its source, this proves the CDx-related claims (intended use /
 * biomarker / population) read IDENTICALLY across a PAIRED drug + device
 * dossier (the pairing established by `pair_companion_diagnostic`).
 *
 * Each claim renders as:
 *   - CONCORDANT  → shield-check, the verbatim-identical string once, with the
 *                   two source pointers.
 *   - DISCORDANT  → alert, the two differing strings side by side, each with
 *                   its source pointer — so a reviewer sees exactly what
 *                   diverged and where.
 *   - MISSING     → alert, the one present string + a note that the counterpart
 *                   side carries no such claim.
 *
 * Microcopy is factual — calm, no cheerleading, no emoji. The strip is a live region
 * so assistive tech announces the verdict. A "match" is stated as a VERBATIM
 * comparison — never an AI judgment — per the 21 CFR Part 11 honesty contract.
 * When the report is drawn from SAMPLE / not-assessed data it is explicitly
 * marked non-sealable and the resolve action is suppressed.
 */
import { I } from './icons';
import {
  CDX_CLAIM_CATEGORY_LABEL,
  type CdxConcordanceReport,
  type ClaimConcordance,
} from './cdxConcordance';
import type { ConcordanceDataStatus } from './cdxConcordance.fixtures';
import { isSealable } from './cdxConcordance.fixtures';
import styles from './styles.module.css';

export interface ConcordancePanelProps {
  report: CdxConcordanceReport;
  /**
   * Provenance of the underlying data. 'sample' / 'not_assessed' are never
   * sealable/exportable and suppress the resolve loop — they are illustrative,
   * not a verdict against a real submission. Defaults to 'sample'.
   */
  dataStatus?: ConcordanceDataStatus;
  /**
   * When the report is DISCORDANT and drawn from assessed data, offer a
   * one-click action to ask AnA to reconcile the differing claims across the
   * two dossiers and re-check. Omit to hide the action.
   */
  onResolve?: () => void;
}

function SourcePointer({ label, submission, locator }: { label: string; submission: string; locator: string }) {
  return (
    <span className={styles.concordSource}>
      {label}: {submission} · {locator}
    </span>
  );
}

function ClaimRow({ claim }: { claim: ClaimConcordance }) {
  const label = CDX_CLAIM_CATEGORY_LABEL[claim.category];
  const concordant = claim.status === 'concordant';

  return (
    <li className={styles.concordClaim} data-status={claim.status}>
      <div className={styles.concordClaimHead}>
        <span className={styles.ico} aria-hidden="true">
          {concordant ? <I.shieldCheck size={12} /> : <I.alert size={12} />}
        </span>
        <span className={styles.concordClaimLabel}>{label}</span>
        <span className={styles.concordClaimStatus}>
          {concordant ? 'Concordant' : claim.status === 'missing_counterpart' ? 'Missing counterpart' : 'Discordant'}
        </span>
      </div>

      {concordant ? (
        <div className={styles.concordSingle}>
          <span className={styles.concordText}>{claim.drugText}</span>
          <div className={styles.concordSources}>
            {claim.drugSource && (
              <SourcePointer label="Drug" submission={claim.drugSource.submission} locator={claim.drugSource.locator} />
            )}
            {claim.deviceSource && (
              <SourcePointer label="Device" submission={claim.deviceSource.submission} locator={claim.deviceSource.locator} />
            )}
          </div>
        </div>
      ) : (
        <div className={styles.concordPair}>
          <div className={styles.concordSide}>
            <span className={styles.concordSideLabel}>Drug</span>
            {claim.drugText != null ? (
              <span className={styles.concordText}>{claim.drugText}</span>
            ) : (
              <span className={styles.concordAbsent}>No such claim in the drug submission.</span>
            )}
            {claim.drugSource && (
              <SourcePointer label="Source" submission={claim.drugSource.submission} locator={claim.drugSource.locator} />
            )}
          </div>
          <div className={styles.concordSide}>
            <span className={styles.concordSideLabel}>Device</span>
            {claim.deviceText != null ? (
              <span className={styles.concordText}>{claim.deviceText}</span>
            ) : (
              <span className={styles.concordAbsent}>No such claim in the device submission.</span>
            )}
            {claim.deviceSource && (
              <SourcePointer label="Source" submission={claim.deviceSource.submission} locator={claim.deviceSource.locator} />
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function ConcordancePanel({ report, dataStatus = 'sample', onResolve }: ConcordancePanelProps) {
  const concordant = report.verdict === 'concordant';
  const sealable = isSealable(dataStatus);
  const total = report.claims.length;

  return (
    <div
      className={styles.concordPanel}
      data-status={concordant ? 'concordant' : 'discordant'}
      role="status"
      aria-live="polite"
    >
      <div className={styles.concordHead}>
        <span className={styles.ico} aria-hidden="true">
          {concordant ? <I.shieldCheck size={14} /> : <I.alert size={14} />}
        </span>
        <span className={styles.concordTitle}>
          {concordant
            ? 'CDx claims concordant across the paired dossiers'
            : 'CDx claims not concordant across the paired dossiers'}
        </span>
      </div>

      <p className={styles.concordDetail}>
        <span>
          {report.concordantCount} of {total} CDx {total === 1 ? 'claim' : 'claims'} match verbatim across the drug and
          device submissions.
        </span>
        {' '}
        <span className={styles.concordMethod}>
          Concordance is a verbatim string comparison, not an AI judgment.
        </span>
      </p>

      {!sealable && (
        <p className={styles.concordSampleNote}>
          {dataStatus === 'sample' ? 'Sample data' : 'Not assessed'} — illustrative only. This result is not sealable or
          exportable as a submission record.
        </p>
      )}

      <ul className={styles.concordClaims} aria-label="CDx claim concordance by category">
        {report.claims.map((claim) => (
          <ClaimRow key={claim.category} claim={claim} />
        ))}
      </ul>

      {/* BUILD-1 INTEGRATION: when Build 1 lands, an 'assessed' concordance
          verdict would persist here as an immutable version row (the audited
          cross-dossier check result), and the seal/export affordances would be
          enabled — gated by isSealable(dataStatus). Sample / not_assessed data
          stays non-sealable, so nothing illustrative can be sealed. */}

      {!concordant && sealable && onResolve && (
        <button type="button" className={styles.concordResolve} onClick={onResolve}>
          <I.sparkles size={12} />
          <span>Ask AnA to resolve</span>
        </button>
      )}
    </div>
  );
}
