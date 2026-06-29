/**
 * SealBadge + ProvenanceTrail — the UI manifestation of E1's Part 11
 * verified-and-sealed export.
 *
 * Once a verified version is signed and sealed, this replaces the "Sign and
 * seal" action with calm, factual evidence: who signed, the §11.50 meaning,
 * when it was sealed, and an expandable provenance trail (printed name, meaning,
 * sealedAt, content hash, AI disclosure, source atoms). This is the evidence a
 * regulatory reviewer — and the 21 CFR Part 11 trail — cites.
 *
 * Microcopy is factual (no emoji, no cheerleading). The trail is a real
 * disclosure widget (button + region) so assistive tech can expand it; the
 * content hash is monospaced for verification.
 */
import { useId, useState } from 'react';

import { I } from './icons';
import type { VerifiedSeal } from './useVerifiedSeal';
import styles from './styles.module.css';

const MEANING_LABEL: Record<VerifiedSeal['meaning'], string> = {
  AUTHOR: 'Authorship',
  REVIEWER: 'Review',
  APPROVER: 'Approval',
};

/** Format an ISO instant as a stable, timezone-explicit UTC string. Pure +
 * exported for testing. */
export function formatSealedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

export interface SealBadgeProps {
  seal: VerifiedSeal;
  /**
   * When this sealed version has been superseded, the version that replaced it.
   * Stated as text ("Superseded by v4") so the reviewer is never shown a stale
   * seal as current. Omit for the current sealed version.
   */
  supersededByVersion?: number;
}

export function SealBadge({ seal, supersededByVersion }: SealBadgeProps) {
  const [open, setOpen] = useState(false);
  const trailId = useId();
  const { sealedRecord } = seal;
  const meaningLabel = MEANING_LABEL[seal.meaning] ?? seal.meaning;
  const versionText = seal.version > 0 ? `v${seal.version}` : 'this version';
  const superseded = typeof supersededByVersion === 'number';

  return (
    <div className={styles.sealBadge} role="group" aria-label="Sealed verified version">
      <div className={styles.sealBadgeHead}>
        <span className={styles.ico} aria-hidden="true">
          <I.shieldCheck size={14} />
        </span>
        {/* Status is carried as text, never colour alone. */}
        <span>{superseded ? 'Signed and sealed (superseded)' : 'Signed and sealed'}</span>
      </div>

      <p className={styles.sealBadgeMeta}>
        {versionText} — {meaningLabel} by {seal.printedName} on {formatSealedAt(sealedRecord.sealedAt)}.
        {sealedRecord.aiDisclosed ? ' AI involvement disclosed.' : ''}
        {superseded ? ` Superseded by v${supersededByVersion}.` : ''}
      </p>

      <button
        type="button"
        className={styles.provTrailToggle}
        aria-expanded={open}
        aria-controls={trailId}
        onClick={() => setOpen(o => !o)}
      >
        <span
          className={styles.provTrailChevron}
          data-open={open}
          aria-hidden="true"
        >
          <I.down size={12} />
        </span>
        <span>{open ? 'Hide provenance trail' : 'Show provenance trail'}</span>
      </button>

      {open && (
        <dl id={trailId} className={styles.provTrail}>
          <dt>Printed name</dt>
          <dd>{seal.printedName}</dd>

          <dt>Meaning (§11.50)</dt>
          <dd>{meaningLabel}</dd>

          <dt>Reason for change</dt>
          <dd>{seal.reasonForChange}</dd>

          <dt>Sealed at</dt>
          <dd>{formatSealedAt(sealedRecord.sealedAt)}</dd>

          <dt>Content hash (SHA-256)</dt>
          <dd className={styles.provTrailHash}>{sealedRecord.contentHash}</dd>

          <dt>AI disclosure</dt>
          <dd>{sealedRecord.aiDisclosed ? 'AI involvement disclosed' : 'No AI involvement'}</dd>

          {sealedRecord.atomCount > 0 && (
            <>
              <dt>Provenance atoms</dt>
              <dd>
                {sealedRecord.atomCount} source {sealedRecord.atomCount === 1 ? 'reference' : 'references'}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
