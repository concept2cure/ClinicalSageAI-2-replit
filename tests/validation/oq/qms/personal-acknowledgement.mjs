/** OQ-006 uses the native text/acknowledgement contract, never a seed attestation. */
export async function prepareControlledQualificationText({ api, expect }, document) {
  const context = await api('GET', `/api/mdx/qms/documents/${document.id}`);
  const current = context.json?.meta?.training;
  expect(context.status === 200 && current?.documentVersion === document.version && current?.contentDigest,
    'draft controlled-text context missing', context.json);
  const text = await api('PATCH', `/api/mdx/qms/documents/${document.id}`, {
    controlledText: {
      documentVersion: current.documentVersion,
      contentDigest: current.contentDigest,
      sections: [{ key: 'procedure', label: 'Qualification procedure', body: 'For this qualification exercise, inspect the recorded document identifier, revision and controlled text. Record only your own read-and-understood acknowledgement of the released revision.' }],
    },
    reason: 'OQ-006 step 06a: record the controlled qualification procedure before review.',
  });
  expect(text.status === 200 && text.json?.meta?.auditTrail?.chained === true,
    'controlled text did not save with its chained audit', text.json);
  return text.json.data;
}

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
