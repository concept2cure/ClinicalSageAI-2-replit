import { z } from 'zod';
import { CSR_SOURCE_FORMAT, CsrSourceEnvelopeSchema } from './csr-source-input.js';

/** Documentation is derived from the same Zod contract as the loader. Semantic
 * cross-record rules below still require server validation of actual source. */
function jsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodEffects) return jsonSchema(schema.innerType());
  if (schema instanceof z.ZodOptional) return jsonSchema(schema.unwrap());
  if (schema instanceof z.ZodObject) {
    const entries = Object.entries(schema.shape as Record<string, z.ZodTypeAny>);
    return { type: 'object', additionalProperties: false,
      properties: Object.fromEntries(entries.map(([name, field]) => [name, jsonSchema(field)])),
      required: entries.filter(([, field]) => !field.isOptional()).map(([name]) => name) };
  }
  if (schema instanceof z.ZodArray) return { type: 'array', items: jsonSchema(schema.element),
    ...(schema._def.minLength ? { minItems: schema._def.minLength.value } : {}),
    ...(schema._def.maxLength ? { maxItems: schema._def.maxLength.value } : {}) };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodLiteral) return { type: typeof schema.value, const: schema.value };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodNumber) return numberSchema(schema);
  if (schema instanceof z.ZodString) return stringSchema(schema);
  throw new Error('Unsupported CSR source schema node');
}

function numberSchema(schema: z.ZodNumber): Record<string, unknown> {
  const result: Record<string, unknown> = { type: 'number' };
  for (const check of schema._def.checks) {
    if (check.kind === 'int') result.type = 'integer';
    if (check.kind === 'min') result[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
    if (check.kind === 'max') result[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
  }
  return result;
}
function stringSchema(schema: z.ZodString): Record<string, unknown> {
  const result: Record<string, unknown> = { type: 'string' };
  for (const check of schema._def.checks) {
    if (check.kind === 'min') result.minLength = check.value;
    if (check.kind === 'max') result.maxLength = check.value;
    if (check.kind === 'regex') result.pattern = check.regex.source;
  }
  return result;
}

export function csrSourceContract() {
  return { format: CSR_SOURCE_FORMAT,
    description: 'Explicitly recorded supporting study source for deterministic CSR tabulation. Integrity, structural consistency and platform lifecycle approval do not establish clinical verification, statistical validation or CDISC/FDA qualification. This file is not a filing leaf.',
    limits: { maximumBytes: 5 * 1024 * 1024, maximumParticipants: 100_000, maximumTreatmentArms: 100 },
    sourceSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', ...jsonSchema(CsrSourceEnvelopeSchema) },
    validationRules: [
      'All study and protocol identifiers, StudyInfo and data-cut date must be explicitly recorded.',
      'Participant identifiers are unique across the study and belong to one known treatment arm; crossover and reassignment are not supported by this contract.',
      'Recorded arm and population counts must equal the participant listing and explicit boolean population flags. At least one participant must be randomized.',
      'StudyInfo.sampleSize, when supplied, is the randomized participant count for this contract.',
      'Every participant has exactly one final disposition. Every randomized participant has exactly one baseline demographic record; demographics describe randomized participants.',
      'Completed flags match final disposition. Randomized participants cannot be screen-failed.',
      'All adverse events name an existing participant and that participant’s safety arm. Empty events require the explicit complete-domain declaration.',
      'Primary endpoint results match StudyInfo.primaryEndpoint; recorded result values, display strings, confidence intervals and p-values are not computed or clinically verified by this adapter.',
      'Exposure and lab summaries use known arms without duplicate summaries. Lab counts do not exceed assessed denominators.',
      'A new package run requires the current, nonwithdrawn Vault version, exact preview digest and existing approved canonical lifecycle bound to those bytes.',
    ] };
}
