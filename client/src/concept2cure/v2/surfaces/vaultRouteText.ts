/**
 * How a Vault review route is said: UTC times, printed names, lists of names
 * and the word for a role's work. Shared by the round (VaultReviewRoute.tsx)
 * and its naming acts (VaultRouteReassign.tsx), so both say them alike. Moved
 * out of VaultReviewRoute.tsx unchanged in RR3.
 */

/** An instant as "YYYY-MM-DD HH:MM:SS UTC"; a missing or unreadable one says so. */
export const utc = (iso: string | null | undefined): string => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC` : 'time not recorded';
};
/** An instant's clock time, "HH:MM UTC". */
export const utcClock = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(11, 16)} UTC`;
};
/** A named member's printed name at naming, else their account. */
export const nameOf = (m: { printedName: string | null; userId: number }) => m.printedName ?? `Account #${m.userId}`;
/** Names as a sentence's list: "A", "A and B", "A, B and C". */
export const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
/** What a role does on the route. */
export const work = (role: 'reviewer' | 'approver' | undefined) => (role === 'approver' ? 'approval' : 'review');
