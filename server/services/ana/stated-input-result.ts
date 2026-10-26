/** Label successful worksheet answers without relabeling refusals or faults. */
export function statedInputResult(reply: string, note: string): string {
  const out = JSON.parse(reply) as Record<string, unknown>;
  if (!['computed', 'classified', 'assessed'].includes(String(out.status))) return reply;
  return JSON.stringify({
    ...out,
    basis: 'stated',
    appliesTo: 'the inputs stated in this conversation',
    instruction: `${String(out.instruction ?? '')} ${note}`.trim(),
  });
}

export const STATED_DOSE_NOTE = 'This is a calculation from the NOAEL you stated; it was not read from the program\'s studies and is not the program\'s starting dose. Do not use it as governed content.';
