/**
 * OQ-006 uses the native acknowledgement contract, never a seed attestation.
 * v0.8: the qualification SOP's text is written in its authored section
 * (controlled-sop.mjs createAuthoredSop), which replaced the registry-only
 * controlled-text save prepareControlledQualificationText made here.
 */
async function readReleasedTraining({ api, expect }, documentId) {
  const document = await api('GET', `/api/mdx/qms/documents/${documentId}`);
  const training = document.json?.meta?.training;
  expect(document.status === 200 && training?.eligible === true && training?.sections?.length > 0,
    'released readable procedure unavailable', document.json);
  return training;
}

function verifyReceipt(expect, result, training) {
  expect(result.status === 201, `expected 201, got ${result.status}`, result.json);
  const receipt = result.json?.data;
  const audit = result.json?.meta?.auditTrail;
  expect(receipt?.documentVersion === training.documentVersion && receipt?.contentDigest === training.contentDigest,
    'receipt does not cover the read release', result.json);
  expect(audit?.persisted === true && audit?.chained === true, 'receipt audit is not confirmed', result.json);
  return receipt;
}

export async function qualifyPersonalAcknowledgement(context, documentId) {
  const { api, expect } = context;
  const training = await readReleasedTraining(context, documentId);
  const result = await api('POST', `/api/mdx/qms/documents/${documentId}/training-ack`, {
    documentVersion: training.documentVersion, contentDigest: training.contentDigest, understood: true, method: 'attestation',
  });
  const receipt = verifyReceipt(expect, result, training);
  const coverage = await api('GET', '/api/mdx/qms/training/compliance');
  expect(coverage.status === 200, `compliance expected 200, got ${coverage.status}`, coverage.json);
  return `personal ack for v${receipt.documentVersion}; chained audit confirmed; coverage HTTP 200`;
}
