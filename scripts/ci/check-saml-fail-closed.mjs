#!/usr/bin/env node
/**
 * CI guardrail — SAML SSO must remain fail-closed.
 *
 * Prevents regression of the authentication-bypass class fixed in the SAML
 * rewrite: assertions must be verified by the vetted library (signed-assertion
 * required), and the ACS must never trust an unverified assertion.
 *
 * Fails (exit 1) if any of these invariants are violated.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => {
  try {
    return readFileSync(join(root, p), 'utf-8');
  } catch {
    return null;
  }
};

const violations = [];
const provider = read('server/services/saml-provider.ts');
const sso = read('server/routes/sso.ts');

if (!provider) {
  violations.push('server/services/saml-provider.ts is missing');
} else {
  if (!provider.includes('@node-saml/node-saml')) {
    violations.push(
      'saml-provider.ts must use the vetted @node-saml/node-saml library (no hand-rolled XML-DSig)'
    );
  }
  if (!/wantAssertionsSigned:\s*true/.test(provider)) {
    violations.push('saml-provider.ts must set wantAssertionsSigned: true (signed assertion required)');
  }
  if (/wantAssertionsSigned:\s*false/.test(provider)) {
    violations.push('saml-provider.ts must NOT disable wantAssertionsSigned');
  }
  // The old hand-rolled, regex-based parser symbols must not return.
  for (const banned of ['extractSamlAttributes', 'function verifySignature']) {
    if (provider.includes(banned)) {
      violations.push(`saml-provider.ts must not reintroduce hand-rolled SAML parsing: "${banned}"`);
    }
  }
}

if (!sso) {
  violations.push('server/routes/sso.ts is missing');
} else {
  if (/proceeding with caution/i.test(sso)) {
    violations.push(
      'sso.ts contains the fail-open "proceeding with caution" path — SAML must reject invalid signatures'
    );
  }
  if (!sso.includes('validateResponse(')) {
    violations.push('sso.ts ACS must validate the response via the fail-closed provider.validateResponse()');
  }
}

if (violations.length > 0) {
  console.error('✗ SAML fail-closed guardrail violations:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log('✓ SAML SSO fail-closed invariants hold (vetted library, signed assertion required).');
