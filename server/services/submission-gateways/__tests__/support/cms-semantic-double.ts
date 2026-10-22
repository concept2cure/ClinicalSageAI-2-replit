/** Test-only CMS boundary for account, disposition and delivery-state suites.
 * Real OpenSSL signature/encryption/tamper proofs remain in as2-cms.test.ts. */
type CmsModule = typeof import('../../as2-cms');
export type CmsEnvelopeInput = Parameters<CmsModule['buildAs2CmsEnvelope']>[0];
export const SEMANTIC_TEST_MIC = 'A'.repeat(43) + '=';

/** Preserve notification MIME framing and original fields for the actual parser. */
function verifiedNotification(body: Buffer, contentType: string): Buffer {
  const raw = body.toString('utf8');
  const withMic = /(?:^|\r?\n)Received-content-MIC:/i.test(raw)
    ? raw.replace(/(^|\r?\n)Received-content-MIC:[^\r\n]*/gi, `$1Received-content-MIC: ${SEMANTIC_TEST_MIC}, sha-256`)
    : raw.replace(/(^|\r?\n)(Disposition:)/gi, `$1Received-content-MIC: ${SEMANTIC_TEST_MIC}, sha-256\r\n$2`);
  // Actual CMS verification returns the inner MIME entity, with its declared
  // report boundary. Bare-notification fixtures remain bare notifications.
  const mime = /^multipart\/report\b/i.test(contentType) ? `Content-Type: ${contentType}\r\n\r\n` : '';
  return Buffer.from(mime + withMic);
}

export function semanticCmsDouble(actual: CmsModule, onEnvelope?: (args: CmsEnvelopeInput) => void): CmsModule {
  return { ...actual,
    buildAs2CmsEnvelope: async args => {
      onEnvelope?.(args);
      return { body: args.body, contentType: 'application/pkcs7-mime; smime-type=enveloped-data',
        mic: SEMANTIC_TEST_MIC, micAlgorithm: 'sha-256' };
    },
    verifyAs2CmsReceipt: async (body, contentType) => verifiedNotification(body, contentType),
  };
}
