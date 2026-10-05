/**
 * "1 document", "3 documents": a count and its noun. The plural form defaults
 * to a plain -s; pass it for any other ("1 quantity", "2 quantities").
 *
 * 2026-09-28 (row 74, track H): one copy. The same arrow function was declared
 * privately in server/routes/regulatory-workspace-routes.ts and again in
 * server/services/intelligence/consistency-verdict.ts; both import this now.
 *
 * 2026-09-28 (row 74, track NC): the optional plural form, so a noun that does
 * not take -s needs no second helper. Two-argument calls are unchanged.
 * client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx keeps a private
 * three-argument copy with this signature; it can import this one.
 *
 * @module shared/utils/plural
 */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
