#!/usr/bin/env node
/**
 * Convert actual retained AnA CSR outputs into a review packet.
 * Never assign a passing verdict. Human reviewers must assess every criterion.
 * This extends the existing evaluate-csr-challenge-set.mjs input contract.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function prepareCsrReviewPacket(spec, responses) {
  if (!spec || !Array.isArray(spec.cases) || !spec.cases.length) throw new Error('Benchmark specification required');
  if (!responses || !Array.isArray(responses.cases)) throw new Error('Actual AnA responses required');
  const ids = new Set(spec.cases.map(c => c.id));
  if (ids.size !== spec.cases.length) throw new Error('Duplicate benchmark case IDs');
  const byId = new Map();
  for (const response of responses.cases) {
    if (!ids.has(response.id) || byId.has(response.id) ||
        typeof response.responseText !== 'string' || !response.responseText.trim() ||
        typeof response.runId !== 'string' || !response.runId.trim()) {
      throw new Error('Each case needs one nonempty actual response and run ID');
    }
    byId.set(response.id, response);
  }
  if (byId.size !== ids.size) throw new Error('Missing AnA responses for benchmark cases');
  return {
    benchmarkId: spec.targetStudy,
    status: 'awaiting_expert_review',
    cases: spec.cases.map(c => {
      if (!Array.isArray(c.expected) || !c.expected.length) throw new Error('Case expected criteria required');
      const response = byId.get(c.id);
      return {
        id: c.id, runId: response.runId, responseText: response.responseText,
        responseSha256: createHash('sha256').update(response.responseText, 'utf8').digest('hex'),
        passed: null, reviewer: '', evidenceReference: '', reviewNotes: '',
        criteria: c.expected.map(expected => ({
          expected, passed: null, evidenceReference: '', reviewNotes: '',
        })),
      };
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [specFile, responsesFile, outputFile] = process.argv.slice(2);
  if (!specFile || !responsesFile || !outputFile) {
    console.error('Usage: node scripts/cre/prepare-csr-review-packet.mjs <spec.json> <ana-responses.json> <review-packet.json>');
    process.exitCode = 2;
  } else {
    try {
      const packet = prepareCsrReviewPacket(
        JSON.parse(readFileSync(specFile, 'utf8')), JSON.parse(readFileSync(responsesFile, 'utf8')));
      writeFileSync(outputFile, JSON.stringify(packet, null, 2) + '\n', { flag: 'wx' });
      console.log(JSON.stringify({ status: packet.status, caseCount: packet.cases.length, outputFile }));
    } catch (error) { console.error(error.message); process.exitCode = 2; }
  }
}
