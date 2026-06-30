/**
 * NatHistoryDossierAffordance — the flag-gated (ENABLE_ANA_DOCUMENT_STUDIO)
 * authoring affordance for the E13 natural-history / external-control evidence
 * dossier.
 *
 * It does not author anything itself. It composes the request AnA receives —
 * "gather natural-history / external-control sources, advise the external-
 * control design, assemble the dossier, then verify it against the cited source
 * identifiers and section headers" — and surfaces the 21 CFR Part 11 honesty
 * state so the user can see, before sealing, whether the dossier's evidence is
 * live (sealable/exportable) or sample/unassessed (draft-only, never sealable).
 *
 * Microcopy is factual (no exclamations, no emoji). The panel is a live region
 * so assistive tech announces the export-readiness verdict. Motion is the calm
 * 200ms ease-out shared with the verify panel; prefers-reduced-motion honoured.
 */
import { I } from './icons';
import styles from './styles.module.css';

/** Provenance mirror of the server EvidenceProvenance — drives exportability. */
export type DossierProvenance = 'live' | 'sample' | 'not_assessed';

/**
 * Compose the message AnA receives when the user asks it to assemble the
 * dossier. It names the two source tools and the verify step, and pins the
 * mandatory section headers — so the resulting verify_docx_against_source call
 * proves both citations and structure. Pure + exported for testing.
 */
export function composeDossierRequestMessage(indication: string, sponsor?: string): string {
  const subject = indication.trim() || 'the rare disease';
  const parts: string[] = [
    `Assemble a natural-history / external-control evidence dossier for ${subject}` +
      (sponsor ? ` (sponsor/program: ${sponsor.trim()})` : '') +
      ', supporting a pivotal-trial rationale where a concurrent control is infeasible.',
    'Use search_clinical_evidence to gather natural-history and external-control sources (cite each by its NCT identifier and URL), and advise_rwe_design for the external-control design rationale.',
    'Assemble the dossier with author_docx_native covering: Disease Natural History, Proposed External Control, Comparability and Bias Discussion, and a Source Evidence Table.',
    'Every prevalence, effect, and outcome claim must carry a cited source — no uncited assertions.',
    'Then run verify_docx_against_source with required_strings = the cited source identifiers plus those four section headers, so the document is proven to carry every citation and section.',
  ];
  return parts.join(' ');
}

/**
 * Whether a dossier of the given provenance may be sealed / exported under the
 * honesty contract. Only live evidence qualifies. Pure.
 */
export function isDossierExportable(provenance: DossierProvenance): boolean {
  return provenance === 'live';
}

export interface NatHistoryDossierAffordanceProps {
  /** Indication / disease the dossier supports (drives the request message). */
  indication: string;
  /** Optional sponsor / program name. */
  sponsor?: string;
  /** Provenance of any already-assembled evidence; default not_assessed. */
  provenance?: DossierProvenance;
  /** Send the composed request to AnA. */
  onAssemble: (message: string) => void;
  /** Disable the action while a request is in flight. */
  busy?: boolean;
}

export function NatHistoryDossierAffordance({
  indication,
  sponsor,
  provenance = 'not_assessed',
  onAssemble,
  busy,
}: NatHistoryDossierAffordanceProps) {
  const exportable = isDossierExportable(provenance);

  let detail: string;
  if (provenance === 'live') {
    detail =
      'Evidence is from a live search — every claim is cited and the dossier is sealable and exportable.';
  } else if (provenance === 'sample') {
    detail =
      'Sample evidence shown for preview only. A sample dossier is not sealable or exportable — re-run with a live evidence search before sealing.';
  } else {
    detail =
      'No evidence assessed yet. Ask AnA to gather natural-history and external-control sources and assemble the dossier; it cannot be sealed until the evidence is live.';
  }

  return (
    <div className={styles.dossierPanel} data-exportable={String(exportable)} role="status" aria-live="polite">
      <div className={styles.dossierHead}>
        <span className={styles.ico} aria-hidden="true">
          {exportable ? <I.shieldCheck size={14} /> : <I.book size={14} />}
        </span>
        <span className={styles.dossierTitle}>Natural-history / external-control dossier</span>
      </div>

      <p className={styles.dossierDetail}>{detail}</p>

      <button
        type="button"
        className={styles.dossierAssemble}
        onClick={() => onAssemble(composeDossierRequestMessage(indication, sponsor))}
        disabled={busy}
      >
        <I.sparkles size={12} />
        <span>{busy ? 'Assembling…' : 'Assemble evidence dossier'}</span>
      </button>
    </div>
  );
}
