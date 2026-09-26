/**
 * The bcrypt cost an unknown e-mail, or an account with no stored password, pays
 * at sign-in, so the answer time does not say whether the address is enrolled
 * (security audit 2026-09-24, IAM-18 item 8).
 *
 * Both sign-in doors — routes/auth.ts POST /login and routes/authEnterprise.ts
 * POST /verify-password — look the account up by e-mail and compare the password
 * only for a known account with a stored hash. Every other branch answered in
 * the time of the lookup alone, a few milliseconds against the quarter of a
 * second a cost-12 comparison takes, so a caller could sort a list of addresses
 * into enrolled and not by timing the refusals. The main door gained the pad on
 * 2026-09-26 (P1-2 part 2) as a function of its own; this module is the one copy
 * both doors call, on the unknown-e-mail branch and on the null-hash branch.
 *
 * The pad is a bcrypt comparison against a hash nobody can sign in with, built
 * once on first use at PASSWORD_HASH_COST, the cost every stored hash uses.
 * Nothing about it is secret: the point is the work, not the value. It does not
 * make the branches indistinguishable to the microsecond (the lookup and the
 * audit write still differ); it removes the quarter-second gap that made the
 * difference readable over a network.
 */
import bcrypt from 'bcryptjs';

/**
 * The bcrypt cost of every stored password hash (routes/auth.ts: sign-up, reset
 * and change). The pad uses the same constant so the two cannot drift apart.
 */
export const PASSWORD_HASH_COST = 12;

let padHash: string | null = null;

/** One comparison at the stored hashes' cost, against a hash no account has. */
export async function padUnknownEmailTiming(password: unknown): Promise<void> {
  padHash ??= await bcrypt.hash('unknown-email-timing-pad', PASSWORD_HASH_COST);
  await bcrypt.compare(String(password ?? ''), padHash);
}
