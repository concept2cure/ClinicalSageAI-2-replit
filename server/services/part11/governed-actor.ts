/**
 * Who a governed write is attributed to when it is not a signature.
 *
 * Two honest answers exist: the authenticated user's id, or a named machine
 * actor. `user-41@system.local` is neither — it is a person-shaped identity
 * for user 41 that no reader can tell from a real address, and machine-run
 * jobs were writing it into the same `userEmail` an inspector reads (ledger
 * L136, L142). `resolveGovernedContext` derives its actor as
 * `userId || userEmail`, so a real user needs no email here at all, and a job
 * with no user names itself.
 */

export const SYSTEM_ACTOR_DOMAIN = 'concept2cure.local';

const COMPONENT = /^[a-z][a-z0-9-]{1,63}$/;

export interface GovernedActor {
  /** The authenticated user, or 0 for a machine actor. */
  userId: number;
  /** Present only for a machine actor — see `systemActorEmail`. */
  userEmail?: string;
}

/**
 * A named machine actor: `system+<component>@concept2cure.local`. Recognisable
 * on sight and by `isSystemActorEmail`; never confusable with a person.
 */
export function systemActorEmail(component: string): string {
  if (!COMPONENT.test(component)) {
    throw new Error(
      `systemActorEmail: component must be kebab-case, got ${JSON.stringify(component)}`,
    );
  }
  return `system+${component}@${SYSTEM_ACTOR_DOMAIN}`;
}

export function isSystemActorEmail(email: string | null | undefined): boolean {
  return (
    typeof email === 'string' &&
    email.startsWith('system+') &&
    email.endsWith(`@${SYSTEM_ACTOR_DOMAIN}`)
  );
}

/**
 * The actor fields for a governed write: the real user when there is one, the
 * named component when there is not. Never a guess shaped like a person.
 */
export function governedActor(userId: number | null | undefined, component: string): GovernedActor {
  if (typeof userId === 'number' && Number.isFinite(userId) && userId > 0) return { userId };
  return { userId: 0, userEmail: systemActorEmail(component) };
}
