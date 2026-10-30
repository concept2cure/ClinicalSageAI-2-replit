/**
 * The published CSR source contract (GET /api/csr/source-inputs/contract,
 * shared/csr-source-contract.ts) states its rules in prose beside a JSON
 * schema generated from the same Zod schemas the loader uses. The schema
 * follows a new field automatically; the prose does not. This test holds the
 * prose to the schema: every optional field, which is where a source or a
 * manifest declares something (efficacyStatus, an armless result's method,
 * conventions.populations …), must be named in the rules that govern it, so a
 * declaration cannot ship undocumented (2026-10-30, D10–D12 review finding).
 */
import { describe, expect, it } from 'vitest';
import { csrSourceContract } from '../csr-source-contract';

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; additionalProperties?: Schema | boolean };

/** Every optional property of a generated JSON schema, by dotted path. */
function optionalFields(schema: Schema, path = ''): string[] {
  const out: string[] = [];
  if (schema.type === 'object' && schema.properties) {
    for (const [name, field] of Object.entries(schema.properties)) {
      const at = path ? `${path}.${name}` : name;
      if (!schema.required?.includes(name)) out.push(at);
      out.push(...optionalFields(field, at));
    }
  } else if (schema.type === 'array' && schema.items) out.push(...optionalFields(schema.items, `${path}[]`));
  else if (schema.type === 'object' && schema.additionalProperties && typeof schema.additionalProperties === 'object') out.push(...optionalFields(schema.additionalProperties, `${path}{}`));
  return out;
}

const fieldName = (path: string) => path.split('.').pop()!.replace(/\[\]|\{\}/g, '');
const names = (rules: readonly string[], token: string) => new RegExp(`(^|[^A-Za-z0-9_])${token.replace(/\./g, '\\.')}($|[^A-Za-z0-9_])`).test(rules.join('\n'));

/** The optional fields whose name no rule states. A manifest convention is named as conventions.<key>. */
function undocumented(contract: ReturnType<typeof csrSourceContract>) {
  const source = optionalFields(contract.sourceSchema as Schema).filter(p => !names(contract.validationRules, fieldName(p)));
  const manifest = optionalFields(contract.adamBundle.manifestSchema as Schema).filter(p => {
    const convention = /^conventions\.([A-Za-z]+)$/.exec(p);
    return !names(contract.adamBundle.derivationRules, convention ? `conventions.${convention[1]}` : fieldName(p));
  });
  const efficacyFile = optionalFields(contract.adamBundle.efficacyResults.schema as Schema)
    .filter(p => !names([...contract.validationRules, ...contract.adamBundle.derivationRules], fieldName(p)));
  return { source, manifest, efficacyFile };
}

describe('the CSR source contract documents every declared field', () => {
  const contract = csrSourceContract();

  it('names every optional field of the source, the ADaM manifest and the efficacy file in its rules', () => {
    expect(undocumented(contract)).toEqual({ source: [], manifest: [], efficacyFile: [] });
  });

  it('states the D10–D12 and D17 declarations as the validator and the derivation apply them', () => {
    const rules = contract.validationRules.join('\n');
    expect(rules).toMatch(/efficacyStatus "not-supplied"[^\n]*completeDomains\.efficacy false/);
    expect(rules).toMatch(/armless result[^\n]*method and population[^\n]*no comparator/i);
    expect(rules).toMatch(/additionalPopulations[^\n]*built-in/);
    expect(rules).toMatch(/demographicsPresentation "descriptive"/);
    const derivation = contract.adamBundle.derivationRules.join('\n');
    for (const c of ['conventions.populations', 'conventions.demographics', 'conventions.aeDiscontinuationFlag', 'conventions.aeDiscontinuationDate']) expect(derivation).toContain(c);
    expect(derivation).toMatch(/EFFICACY_MISSING[^\n]*EFFICACY_UNDECLARED/);
  });

  it('fails when a declaration loses its rule (the check is not vacuous)', () => {
    const without = (rules: readonly string[], token: string) => rules.filter(r => !names([r], token));
    const pruned = { ...contract, validationRules: without(contract.validationRules, 'efficacyStatus'),
      adamBundle: { ...contract.adamBundle, derivationRules: without(contract.adamBundle.derivationRules, 'conventions.populations') } };
    const found = undocumented(pruned);
    expect(found.source).toContain('studyData.efficacyStatus');
    expect(found.manifest).toContain('conventions.populations');
  });
});
