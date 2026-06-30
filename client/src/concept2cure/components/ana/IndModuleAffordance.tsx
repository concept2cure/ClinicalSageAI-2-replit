/**
 * IndModuleAffordance — the flag-gated (ENABLE_ANA_DOCUMENT_STUDIO) authoring
 * affordance for an E11 IND narrative module (CTD Module 2.5 Clinical Overview /
 * 2.7 Clinical Summary).
 *
 * It does not author anything itself. It composes the request AnA receives —
 * "author the IND module from the structured source via author_docx_native, then
 * verify it with verify_docx_against_source where required_strings include every
 * source figure" — so a transcription error (a missing/mistyped figure) is caught
 * by the verify step BEFORE the user can sign + seal the persisted version. It
 * also surfaces the 21 CFR Part 11 honesty state so the user can see, before
 * sealing, whether the source is live (sealable) or sample/unassessed (draft-only).
 *
 * Microcopy is factual (no exclamations, no emoji). The panel is a live region so
 * assistive tech announces the seal-readiness verdict. Motion is the calm shared
 * 200ms ease-out; prefers-reduced-motion honoured.
 */
import { I } from './icons';
import styles from './styles.module.css';

/** Provenance mirror of the server IndModuleProvenance — drives sealability. */
export type IndModuleProvenance = 'live' | 'sample' | 'not_assessed';

/**
 * Compose the message AnA receives when the user asks it to author the IND
 * module. It names the authoring + verify tools and pins the contract that
 * required_strings must include every source figure — so the resulting
 * verify_docx_against_source call proves transcription fidelity, not just
 * structure. Pure + exported for testing.
 */
export function composeIndModuleRequestMessage(module: string, productName: string, indication: string): string {
  const subject = productName.trim() || 'the product';
  const ind = indication.trim() || 'the proposed indication';
  const parts: string[] = [
    `Author IND CTD Module ${module} (clinical summary) for ${subject} in ${ind}, transcribed from the structured source.`,
    'Use plan_ind_module_authoring to build the author_docx_native content and the derived required_strings from the structured source facts/figures.',
    'Drive author_docx_native with that title + content, transcribing every source figure verbatim.',
    'Then run verify_docx_against_source with required_strings = the derived strings (section headers PLUS every source figure), so a missing or mistyped figure fails verification before sealing.',
    'A sample or not-assessed source is draft-only and is never sealable — seal only after a clean verification against a live source.',
  ];
  return parts.join(' ');
}

/**
 * Whether an IND module draft of the given provenance may be sealed under the
 * honesty contract. Only a live source qualifies. Pure.
 */
export function isIndModuleSealable(provenance: IndModuleProvenance): boolean {
  return provenance === 'live';
}

export interface IndModuleAffordanceProps {
  /** CTD module to author (e.g. "2.5", "2.7"). */
  module: string;
  /** Product / compound name (drives the request message). */
  productName: string;
  /** Proposed indication. */
  indication: string;
  /** Provenance of the underlying source; default not_assessed. */
  provenance?: IndModuleProvenance;
  /** Send the composed request to AnA. */
  onAuthor: (message: string) => void;
  /** Disable the action while a request is in flight. */
  busy?: boolean;
}

export function IndModuleAffordance({
  module,
  productName,
  indication,
  provenance = 'not_assessed',
  onAuthor,
  busy,
}: IndModuleAffordanceProps) {
  const sealable = isIndModuleSealable(provenance);

  let detail: string;
  if (provenance === 'live') {
    detail =
      'Source is live. Every figure is transcribed verbatim and verified against the source — the module is sealable once verification is clean.';
  } else if (provenance === 'sample') {
    detail =
      'Sample source shown for preview only. A sample module is not sealable — re-author from a live structured source before sealing.';
  } else {
    detail =
      'No source assessed yet. Ask AnA to author the module from the structured source and verify it; it cannot be sealed until the source is live and verification is clean.';
  }

  return (
    <div className={styles.dossierPanel} data-sealable={String(sealable)} role="status" aria-live="polite">
      <div className={styles.dossierHead}>
        <span className={styles.ico} aria-hidden="true">
          {sealable ? <I.shieldCheck size={14} /> : <I.book size={14} />}
        </span>
        <span className={styles.dossierTitle}>IND Module {module} — verified authoring</span>
      </div>

      <p className={styles.dossierDetail}>{detail}</p>

      <button
        type="button"
        className={styles.dossierAssemble}
        onClick={() => onAuthor(composeIndModuleRequestMessage(module, productName, indication))}
        disabled={busy}
      >
        <I.sparkles size={12} />
        <span>{busy ? 'Authoring…' : `Author Module ${module} from source`}</span>
      </button>
    </div>
  );
}
