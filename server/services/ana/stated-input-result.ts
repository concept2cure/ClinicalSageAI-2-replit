export const STATED_APPLIES_TO = 'the inputs stated in this conversation';
export const STATED_BASIS = 'Assess only the stated inputs and any engine defaults reported in the result. No program or product source records were read. This is not the program\'s or product\'s verdict or governed content.';

/** Label successful worksheet envelopes without relabeling refusals or faults. */
export function statedInputEnvelope(out: Record<string, unknown>, note = ''): Record<string, unknown> {
  if (!out || out.error != null || out.ok === false || !['computed', 'classified', 'assessed'].includes(String(out.status))) return out;
  let instruction = String(out.instruction ?? '');
  for (const addition of [STATED_BASIS, note]) {
    const text = addition.trim();
    if (text && !instruction.includes(text)) instruction = `${instruction} ${text}`.trim();
  }
  return {
    ...out,
    basis: 'stated',
    appliesTo: out.appliesTo === undefined ? STATED_APPLIES_TO : out.appliesTo,
    instruction,
  };
}

/** String adapter retained for the S4 handlers and their specific cautions. */
export function statedInputResult(reply: string, note = ''): string {
  const out = JSON.parse(reply) as Record<string, unknown>;
  const labelled = statedInputEnvelope(out, note);
  return labelled === out ? reply : JSON.stringify(labelled);
}

export const STATED_DOSE_NOTE = 'This is a calculation from the NOAEL you stated; it was not read from the program\'s studies and is not the program\'s starting dose. Do not use it as governed content.';
