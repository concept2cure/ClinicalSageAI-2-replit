/**
 * The list a QMS read returned, or null when the body holds none. Pure, so the
 * registers and the change-link picker share it without the change hooks.
 *
 * @module client/src/concept2cure/quality/qmsList
 */

interface Envelope<T> { data?: T; rows?: T }

/** Same failure the SOP register hit (see ./hooks.ts): `p?.data ?? p?.rows ?? []`
 *  only reaches the `[]` when `data` is absent, so `{ data: {} }` came back as
 *  an object and `.map` threw during render. Null means "no list in this body" —
 *  distinct from `[]`, which is the real answer "the log is empty" and must stay
 *  renderable. */
export function listOf<T>(payload: unknown): T[] | null {
  const p = payload as Envelope<T[]> | null;
  const rows = Array.isArray(payload) ? payload : p?.data ?? p?.rows;
  if (!Array.isArray(rows)) return null;
  return rows.every((r) => typeof r === 'object' && r !== null) ? (rows as T[]) : null;
}
