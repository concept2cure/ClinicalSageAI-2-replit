/**
 * Translation service — MANUAL (human / LSP) provider.
 *
 * A {@link TranslationProvider} that represents human or Language-Service-Provider
 * translation. There is no model and no gateway call: the human IS the engine.
 * Its translate() does not GENERATE text — it RECORDS that a human-supplied
 * translation was provided and returns that text, stamping a 'human' engine
 * label for provenance. This is the surface a route handler uses when a reviewer
 * pastes a from-scratch human translation (workflow action `start_human`), as
 * opposed to post-editing a machine draft.
 *
 * REGULATED-PLATFORM GUARDRAILS honored here:
 *  - The method this provider stands for is 'human' (an approvable method, unlike
 *    'machine'). It still flows through the SAME workflow state machine — a human
 *    translation is not auto-approved; it must pass back-translation + a distinct
 *    reviewer of record (see hybrid-workflow.ts).
 *  - DNT identifiers are the human translator's responsibility to preserve; this
 *    provider does not mask/unmask (there is no model to protect from). It returns
 *    the human text verbatim so identifiers stay exactly as the human wrote them.
 *  - NO FABRICATION: if no human text is supplied, it throws a typed
 *    {@link ManualProviderError} rather than returning empty or invented content.
 *
 * @module server/services/translation/providers/manual-provider
 */

import type {
  ProviderTranslateInput,
  ProviderTranslateOutput,
  TranslationProvider,
} from '../types';

/** Stable provider id used for audit/provenance. */
export const MANUAL_PROVIDER_ID = 'manual-human';

/**
 * Engine label recorded for human translations. Not a model id — it marks the
 * provenance `engine` as a human/LSP source so the audit trail is unambiguous.
 */
export const MANUAL_ENGINE_LABEL = 'human';

/** Stable failure codes for the manual provider. */
export type ManualProviderErrorCode = 'human_text_required';

/** Typed manual-provider error — never substitutes machine output for a human. */
export class ManualProviderError extends Error {
  readonly code: ManualProviderErrorCode;

  constructor(code: ManualProviderErrorCode, message: string) {
    super(message);
    this.name = 'ManualProviderError';
    this.code = code;
    Object.setPrototypeOf(this, ManualProviderError.prototype);
  }
}

/**
 * Input to the manual provider. Extends the standard provider input with the
 * human-supplied target text — because the "translation" is performed by a
 * person, not generated here. `maskedSourceText` is accepted for interface
 * parity but is informational only (no masking is applied to human output).
 */
export interface ManualTranslateInput extends ProviderTranslateInput {
  /** The translation text supplied by the human translator / LSP. Required. */
  humanText: string;
  /** Optional engine/source label override (e.g. an LSP vendor id). */
  engine?: string;
}

/**
 * Human/LSP translation provider. translate() records that the text must be
 * supplied by a human and returns that human-provided text. It performs no model
 * call and never invents content.
 */
export class ManualTranslationProvider implements TranslationProvider {
  readonly id = MANUAL_PROVIDER_ID;

  /**
   * "Translate" by recording the human-supplied text. The {@link ManualTranslateInput}
   * carries `humanText`; this method validates it is present and returns it
   * verbatim with a 'human' engine label and `deterministic: false` (human output
   * is genuine content, always promotable through the normal workflow gates).
   *
   * Note: the base {@link TranslationProvider.translate} signature takes a
   * {@link ProviderTranslateInput}; callers must pass a {@link ManualTranslateInput}
   * (a structural superset). A plain input without `humanText` is a programmer
   * error and throws — the manual provider can never originate text on its own.
   */
  async translate(input: ProviderTranslateInput): Promise<ProviderTranslateOutput> {
    const manual = input as ManualTranslateInput;
    const text = typeof manual.humanText === 'string' ? manual.humanText : '';
    if (text.trim() === '') {
      throw new ManualProviderError(
        'human_text_required',
        'Manual translation requires human-supplied target text; the manual provider ' +
          'records human/LSP translations and never generates content.',
      );
    }
    return {
      // Verbatim — the human is responsible for DNT identifier fidelity.
      targetText: text,
      engine: manual.engine && manual.engine.trim() !== '' ? manual.engine : MANUAL_ENGINE_LABEL,
      deterministic: false,
    };
  }
}

/** Factory mirroring the service layer's construction style. */
export function createManualTranslationProvider(): ManualTranslationProvider {
  return new ManualTranslationProvider();
}
