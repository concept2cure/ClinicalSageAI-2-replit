/**
 * ui-v2 URL model — every reconciled registry id is a route segment under
 * /concept2cure, resolved by the shell (replaces ZenRouter's four-surface
 * switch). Pure module so routing stays unit-testable without the shell.
 */
import { DEEP_LINK_ALIASES } from './registryModel';

export const UI_V2_BASE = '/concept2cure';

/** /concept2cure[/:surfaceId[/…]] → surface id ('home' for the bare base). */
export function surfaceIdFromLocation(location: string): string {
  if (!location.startsWith(UI_V2_BASE)) return 'home';
  const rest = location.slice(UI_V2_BASE.length).replace(/^\//, '');
  if (!rest) return 'home';
  const seg = rest.split('/')[0].split('?')[0];
  return DEEP_LINK_ALIASES[seg] ?? seg;
}

/** surface id → its canonical URL. */
export function locationForSurface(id: string): string {
  return id === 'home' ? UI_V2_BASE : `${UI_V2_BASE}/${id}`;
}
