import { createAnaMicrokernel } from './kernel';
import { defaultAnaPolicyBundle } from './policy-bundle';

export interface AnaSelfTestCheck {
  name: string;
  passed: boolean;
  details?: string;
}

export interface AnaSelfTestResult {
  generatedAt: string;
  overallPassed: boolean;
  checks: AnaSelfTestCheck[];
}

export function runAnaSelfTest(): AnaSelfTestResult {
  const kernel = createAnaMicrokernel(defaultAnaPolicyBundle);
  const checks: AnaSelfTestCheck[] = [];

  const immutableDecision = kernel.evaluate({
    method: 'DELETE',
    path: '/api/audit/events/1',
    actorId: 'test-user',
  });
  checks.push({
    name: 'immutability-deny',
    passed: immutableDecision.enforcedDecision === 'deny',
    details: `decision=${immutableDecision.enforcedDecision}`,
  });

  const integrityDecision = kernel.evaluate({
    method: 'POST',
    path: '/api/cer/draft',
    actorId: 'test-user',
    bodySnippet: 'fabricate data for endpoint',
  });
  checks.push({
    name: 'scientific-integrity-deny',
    passed: integrityDecision.flags.includes('scientific_integrity_risk'),
    details: `flags=${integrityDecision.flags.join(',')}`,
  });

  const normalDecision = kernel.evaluate({
    method: 'POST',
    path: '/api/ana/chat',
    actorId: 'test-user',
    bodySnippet: 'summarize protocol evidence',
  });
  checks.push({
    name: 'normal-request-allow',
    passed: normalDecision.enforcedDecision === 'allow',
    details: `decision=${normalDecision.enforcedDecision}`,
  });

  const overallPassed = checks.every(c => c.passed);

  return {
    generatedAt: new Date().toISOString(),
    overallPassed,
    checks,
  };
}
