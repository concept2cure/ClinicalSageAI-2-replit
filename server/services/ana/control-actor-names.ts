/**
 * Names for the administrators who took a control on an AnA run, as the
 * reader's tenant may name them (AnA detach DT3 review: an administrator's
 * cancel is credited to them by name, never to the asker). Through the one
 * resolver, services/tenant/actor-names.ts (public.actor_name): an id it does
 * not answer for is absent, and the caller renders it as "user <id>".
 *
 * @module server/services/ana/control-actor-names
 */
import { resolveActorNames } from '../tenant/actor-names.js';
import type { ReadActorNames } from './turn-summary.js';

export const readControlActorNames: ReadActorNames = async ids => {
  const names = await resolveActorNames(ids);
  return new Map([...names].map(([id, a]) => [id, a.name]));
};
