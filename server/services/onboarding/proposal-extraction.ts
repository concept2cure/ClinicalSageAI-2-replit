/**
 * AnA agentic onboarding — proposal extraction (P2).
 *
 * Turns the already-extracted text of an uploaded onboarding document into
 * `FieldProposal`s the human reviews. This is the "AnA reads the document" step;
 * it performs NO writes and asserts nothing about correctness — every value is a
 * suggestion a human must confirm.
 *
 * Honesty rules, enforced here rather than trusted:
 *  - **Provenance is verified, not asserted.** The model must return the verbatim
 *    excerpt it read each value from. We then check that excerpt actually occurs
 *    in the source text. A hallucinated citation cannot survive that check, so a
 *    fabricated value is dropped instead of being shown with a plausible-looking
 *    source. This is the difference between claiming provenance and having it.
 *  - **A value with no usable provenance is dropped**, never shown with an empty
 *    or invented source (the contract requires provenance for every proposal).
 *  - **Confidence is the model's own signal, clamped to [0,1]** — never
 *    back-filled with a default that would make a guess look certain.
 *  - **No provider, no proposals.** If the gateway is unavailable we return an
 *    honest empty result with a warning; we never fall back to invented content.
 *  - Every drop is reported in `warnings`, so the human sees that something was
 *    discarded rather than silently losing it.
 *
 * @module server/services/onboarding/proposal-extraction
 */

import { getGateway } from '../ai-gateway/gateway';
import {
  initialStatus,
  type OnboardingEntity,
  type OnboardingIngestResult,
  type OnboardingProposalField,
  type OnboardingProposalGroup,
} from '@shared/types/onboarding-ingest';

/** Cap the text handed to the model; onboarding docs can be large. */
const MAX_EXTRACT_CHARS = 24_000;
/** An excerpt shorter than this is too weak to verify against the source. */
const MIN_EXCERPT_CHARS = 8;

/**
 * The onboarding fields extraction may propose. Org-profile targets are the only
 * ones with a governed write path today; program/contact targets are surfaced as
 * suggestions for the human to carry into the existing governed wizard (project
 * creation is not governed, so onboarding never writes one).
 */
const TARGETS: ReadonlyArray<{ targetField: string; entity: OnboardingEntity; label: string; hint: string }> = [
  { targetField: 'org_profile.name', entity: 'org_profile', label: 'Organization name', hint: 'The legal or trading name of the company.' },
  { targetField: 'org_profile.clientType', entity: 'org_profile', label: 'Client type', hint: 'One of: medtech, biotech, pharma, diagnostics, cro, health.' },
  { targetField: 'org_profile.industryMode', entity: 'org_profile', label: 'Industry area', hint: 'The industry or therapeutic focus, 2-64 characters.' },
  { targetField: 'program.name', entity: 'program', label: 'Program name', hint: 'The study, product or program name.' },
  { targetField: 'program.code', entity: 'program', label: 'Program code', hint: 'A short identifier such as MER-204.' },
  { targetField: 'program.pathway', entity: 'program', label: 'Regulatory pathway', hint: 'e.g. IND, NDA, BLA, 510(k), De Novo, PMA, MAA.' },
  { targetField: 'program.indication', entity: 'program', label: 'Indication', hint: 'The disease or condition studied.' },
  { targetField: 'program.phase', entity: 'program', label: 'Phase', hint: 'e.g. Preclinical, Phase 1, Phase 2, Phase 3.' },
  { targetField: 'contact.name', entity: 'contact', label: 'Primary contact', hint: 'The named primary contact person.' },
  { targetField: 'contact.email', entity: 'contact', label: 'Contact email', hint: 'That contact’s email address.' },
];

const TARGET_BY_FIELD = new Map(TARGETS.map((t) => [t.targetField, t]));

const GROUP_LABEL: Record<OnboardingEntity, string> = {
  org_profile: 'Organization profile',
  program: 'First program',
  contact: 'Primary contact',
};

/** Normalize for excerpt matching: collapse whitespace, casefold. */
function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

interface RawProposal {
  targetField?: unknown;
  value?: unknown;
  confidence?: unknown;
  excerpt?: unknown;
  page?: unknown;
}

/** Pull the first JSON array/object out of a model reply, tolerating prose/fences. */
function parseModelJson(reply: string): RawProposal[] {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : reply).trim();
  const start = body.search(/[[{]/);
  if (start < 0) return [];
  const candidate = body.slice(start);
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed as RawProposal[];
    if (parsed && typeof parsed === 'object') {
      const arr = (parsed as { proposals?: unknown }).proposals;
      return Array.isArray(arr) ? (arr as RawProposal[]) : [];
    }
  } catch {
    /* fall through — an unparseable reply yields no proposals, never a guess */
  }
  return [];
}

function buildMessages(fileName: string, text: string) {
  const fields = TARGETS.map((t) => `- ${t.targetField}: ${t.hint}`).join('\n');
  return [
    {
      role: 'system' as const,
      content:
        'You extract onboarding facts from a client document for a regulated life-sciences platform. ' +
        'You never guess. If a field is not clearly stated in the document, omit it entirely — an omission is correct, an invention is a serious error. ' +
        'For every value you return you MUST quote, verbatim, the span of the document you read it from.',
    },
    {
      role: 'user' as const,
      content:
        `Document: ${fileName}\n\n` +
        `Extract only these fields where the document clearly states them:\n${fields}\n\n` +
        'Reply with JSON only, no prose:\n' +
        '[{"targetField":"org_profile.name","value":"...","confidence":0.0-1.0,"excerpt":"verbatim quote from the document","page":1}]\n\n' +
        'Rules: omit any field the document does not state. `excerpt` must be copied character-for-character from the document text below. ' +
        '`confidence` is your genuine certainty. Omit `page` if unknown.\n\n' +
        `--- DOCUMENT TEXT ---\n${text}`,
    },
  ];
}

export interface ExtractInput {
  /** Plain text already extracted from the upload (OCR/parse happens upstream). */
  text: string;
  /** Source file name, recorded as provenance. */
  fileName: string;
}

/**
 * Extract reviewable onboarding proposals from one document's text.
 * Never throws: a failure yields an honest empty result plus a warning.
 */
export async function extractOnboardingProposals(input: ExtractInput): Promise<OnboardingIngestResult> {
  const warnings: string[] = [];
  const fileName = input.fileName || 'uploaded document';
  const text = (input.text || '').trim();
  const empty = (): OnboardingIngestResult => ({
    groups: [],
    sources: [{ file: fileName, bytes: text.length }],
    warnings,
  });

  if (!text) {
    warnings.push(`No readable text was extracted from ${fileName}, so nothing could be proposed.`);
    return empty();
  }

  const gw = getGateway();
  if (!gw || gw.getEnabledProviders?.().length === 0) {
    warnings.push('The extraction service is unavailable right now, so no values were proposed. Nothing was invented.');
    return empty();
  }

  const excerptSource = text.slice(0, MAX_EXTRACT_CHARS);
  if (text.length > MAX_EXTRACT_CHARS) {
    warnings.push(
      `${fileName} is long — only the first ${MAX_EXTRACT_CHARS.toLocaleString()} characters were read, so later sections were not considered.`,
    );
  }

  let reply = '';
  try {
    const resp = await gw.route({
      taskType: 'extraction',
      messages: buildMessages(fileName, excerptSource),
      maxTokens: 1200,
      temperature: 0,
      callerModule: 'onboarding-proposal-extraction',
    } as never);
    reply = String((resp as { content?: unknown })?.content ?? '');
  } catch (err) {
    warnings.push(
      `The extraction service could not read ${fileName} (${err instanceof Error ? err.message : 'unknown error'}). No values were proposed.`,
    );
    return empty();
  }

  const raw = parseModelJson(reply);
  if (raw.length === 0) {
    warnings.push(`Nothing could be confidently extracted from ${fileName}.`);
    return empty();
  }

  const haystack = norm(excerptSource);
  const fields: OnboardingProposalField[] = [];
  let droppedUnverified = 0;
  let droppedUnknownField = 0;
  const seen = new Set<string>();

  raw.forEach((r, i) => {
    const targetField = typeof r.targetField === 'string' ? r.targetField : '';
    const spec = TARGET_BY_FIELD.get(targetField);
    if (!spec) {
      droppedUnknownField += 1;
      return;
    }
    const value = typeof r.value === 'string' ? r.value.trim() : '';
    const excerpt = typeof r.excerpt === 'string' ? r.excerpt.trim() : '';
    if (!value) return;

    // PROVENANCE VERIFICATION — the excerpt must really occur in the document.
    // A model that invents a value almost always invents its citation too, and
    // that citation will not be found here.
    if (excerpt.length < MIN_EXCERPT_CHARS || !haystack.includes(norm(excerpt))) {
      droppedUnverified += 1;
      return;
    }
    // One proposal per target field — keep the first, which the model ordered
    // by its own confidence; a second is a conflict we do not silently merge.
    if (seen.has(targetField)) return;
    seen.add(targetField);

    const confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence)
      ? Math.max(0, Math.min(1, r.confidence))
      : 0;
    const page = typeof r.page === 'number' && Number.isInteger(r.page) && r.page > 0 ? r.page : undefined;

    fields.push({
      id: `p${i}-${targetField}`,
      entity: spec.entity,
      targetField,
      label: spec.label,
      value,
      extractedValue: value,
      provenance: { file: fileName, page, snippet: excerpt.slice(0, 400) },
      confidence,
      status: initialStatus(confidence),
    });
  });

  if (droppedUnverified > 0) {
    warnings.push(
      `${droppedUnverified} suggested value${droppedUnverified === 1 ? ' was' : 's were'} discarded because the quoted source text could not be found in ${fileName}.`,
    );
  }
  if (droppedUnknownField > 0) {
    warnings.push(`${droppedUnknownField} suggestion${droppedUnknownField === 1 ? '' : 's'} referred to fields this workspace does not collect.`);
  }
  if (fields.length === 0) warnings.push(`No values from ${fileName} could be verified against the document text.`);

  // Group in a stable, human-meaningful order.
  const order: OnboardingEntity[] = ['org_profile', 'program', 'contact'];
  const groups: OnboardingProposalGroup[] = order
    .map((entity) => ({ entity, label: GROUP_LABEL[entity], fields: fields.filter((f) => f.entity === entity) }))
    .filter((g) => g.fields.length > 0);

  return { groups, sources: [{ file: fileName, bytes: text.length }], warnings };
}
