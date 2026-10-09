/**
 * How many proxies in front of this server may report the client's address:
 * Express `trust proxy`, as a hop count.
 *
 * Production runs behind an AWS application load balancer
 * (terraform/modules/alb), reached through CloudFront for /api/* and also
 * directly. Express reads req.ip from the socket unless it is told how many
 * proxies to trust, and nothing told it, so every request appeared to come
 * from the load balancer:
 *   - the per-address sign-in and MFA limits (10 per 15 minutes) were one
 *     allowance for every user of the deployment, so the eleventh sign-in in
 *     any quarter hour was refused for everyone (VSR-001 §13.3);
 *   - every audit row recorded the load balancer's address instead of the
 *     user's (21 CFR 11.10(e); server/routes/charters.ts states the contract).
 *
 * One hop is the production default. The load balancer appends the address it
 * received the connection from as the last X-Forwarded-For entry, and one hop
 * trusts that entry alone, so no client can choose its own address. Through
 * CloudFront that entry is a CloudFront edge rather than the user. Two hops
 * would reach the user, but only once the load balancer accepts traffic from
 * CloudFront alone: while it is open to the internet, a client that connects
 * to it directly writes the second-to-last entry itself. Never `true`, which
 * trusts the left-most entry, the one every client can write.
 */
export const TRUST_PROXY_ENV = 'TRUST_PROXY_HOPS';

const MAX_HOPS = 5;

export interface TrustProxySetting {
  hops: number;
  source: 'configured' | 'production default' | 'off outside production';
}

export function resolveTrustProxy(env: Record<string, string | undefined> = process.env): TrustProxySetting {
  const raw = env[TRUST_PROXY_ENV]?.trim();
  if (raw) {
    if (!/^\d+$/.test(raw) || Number(raw) > MAX_HOPS) {
      throw new Error(
        `${TRUST_PROXY_ENV} must be the number of proxies in front of the server, a whole number from 0 to ${MAX_HOPS}; got "${raw}"`,
      );
    }
    return { hops: Number(raw), source: 'configured' };
  }
  return env.NODE_ENV === 'production'
    ? { hops: 1, source: 'production default' }
    : { hops: 0, source: 'off outside production' };
}
