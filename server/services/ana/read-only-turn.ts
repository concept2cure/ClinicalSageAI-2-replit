/** Explicit turn constraints are enforced independently of model instructions. */
import { toolAuthorizationOf } from './tool-authorization.js';

export function requestsReadOnly(message: string): boolean {
  return /\bread[\s-]+only\b/i.test(message)
    || /\b(?:do not|don't|don’t)\s+(?:create|draft|edit|modify|save|write|change)\b/i.test(message);
}

export function readOnlyToolRefusal(name: string, input: Record<string, unknown>, readOnly: boolean) {
  if (!readOnly || toolAuthorizationOf(name, input).class === 'read') return null;
  return {
    error: 'USER_REQUESTED_READ_ONLY',
    tool: name,
    message: 'You requested a read-only response. This action was not run or proposed for approval.',
  };
}

/** Do not offer executable action blocks after a read-only answer either. */
export function readOnlyAnswer(content: string): string {
  const clean = content.replace(/```(?:command|ana-action)\b[\s\S]*?(?:```|$)/g, '').trim();
  return clean === content.trim() ? content
    : (clean ? clean + '\n\n' : '') + 'Your read-only request was preserved; no action was run or proposed.';
}

export const READ_ONLY_INSTRUCTION =
  'This turn is READ ONLY at the user’s explicit request. Read existing information and answer their question. ' +
  'Do not draft, create, edit, save, propose commands, start agents or workflows, or change the screen. ' +
  'Earlier drafting requests do not authorize drafting on this turn.';
