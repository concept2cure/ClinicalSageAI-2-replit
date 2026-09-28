/**
 * "1 document", "3 documents": a count and a noun that takes a plain -s plural.
 *
 * 2026-09-28 (row 74, track H): one copy. The same arrow function was declared
 * privately in server/routes/regulatory-workspace-routes.ts and again in
 * server/services/intelligence/consistency-verdict.ts; both import this now.
 *
 * @module shared/utils/plural
 */
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
