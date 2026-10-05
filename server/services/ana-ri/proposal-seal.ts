/**
 * The model that proposed a governed command, carried with the proposal and
 * verified when a person confirms it (D5, MC-RL-4; 2026-10-05; evidence
 * docs/evidence/D5/2026-10-05-proposal-provenance/).
 *
 * A chat turn's ```ana-action and ```command blocks become proposals with no
 * held run: the person's yes posts the command and params back to
 * POST /api/ana-ri/governed-action, and with no run the route had nothing to
 * say which model wrote them. So an artifact AnA drafted was recorded with
 * servingModel and gatewayRequestId null, and no approved-models check ran on
 * that path at all.
 *
 * The proposal now carries a server-signed seal of the command, a hash of its
 * params, the serving model and the gateway request id, for the organization
 * and person it was proposed to. The route verifies it before running the
 * command: a valid seal restores the proposer; params that differ from what
 * was proposed, another person's or organization's seal, or an expired one
 * restore nothing. The seal rides inside the params the client already posts
 * back verbatim (PROPOSAL_SEAL_KEY) and is removed before the command runs.
 */
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config/environment';
import { verifyJwtWithRotation } from '../../utils/jwtVerify';
import { FREE_TEXT_FIELD } from '../ana/governed-write-tools';
import type { CommandContext } from './command-executor';

export const PROPOSAL_SEAL_KEY = '_proposalSeal';
const PROPOSAL_SEAL_TYPE = 'ana_proposal_seal';
/** A proposal waits for a person, not for ever: the sign-off prompt is a chat card. */
const PROPOSAL_SEAL_TTL = '24h';

type ServingModel = NonNullable<CommandContext['servingModel']>;

interface SealClaims {
  type: string;
  c: string;
  h: string;
  o: number;
  u: number;
  p: string | null;
  m: string | null;
  r: string | null;
}

/** Params without the seal, as a stable string: keys sorted at every level. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => k !== PROPOSAL_SEAL_KEY && v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function paramsHash(params: Record<string, unknown>): string {
  return createHash('sha256').update(stable(params)).digest('hex');
}

/** Whether a command's params carry free text a model would have written (the governed-write gate's own test). */
export function carriesModelAuthoredText(params: Record<string, unknown> | undefined): boolean {
  if (!params) return false;
  return Object.entries(params).some(([k, v]) => FREE_TEXT_FIELD.test(k) && typeof v === 'string' && v.trim() !== '');
}

/** The params a proposal goes out with: the originals plus the seal, when a serving model is known. */
export function sealProposalParams(
  command: string,
  params: Record<string, unknown>,
  ctx: Pick<CommandContext, 'organizationId' | 'userId' | 'servingModel'>,
  secret: string = config.jwt.secret,
): Record<string, unknown> {
  const served = ctx.servingModel;
  const organizationId = Number(ctx.organizationId);
  const userId = Number(ctx.userId);
  if (!served?.provider || !served.model || !Number.isInteger(organizationId) || !Number.isInteger(userId)) return params;
  const claims: SealClaims = {
    type: PROPOSAL_SEAL_TYPE,
    c: command,
    h: paramsHash(params),
    o: organizationId,
    u: userId,
    p: served.provider,
    m: served.model,
    r: served.requestId ?? null,
  };
  const seal = jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn: PROPOSAL_SEAL_TTL });
  return { ...params, [PROPOSAL_SEAL_KEY]: seal };
}

/**
 * The proposer a confirmed command's seal names, and the params without the
 * seal. The proposer is null unless the seal is this server's, unexpired, for
 * this organization and person, for this command, and over exactly these params.
 */
export function openProposalSeal(
  command: string,
  params: Record<string, unknown>,
  ctx: { organizationId: number; userId: number },
): { params: Record<string, unknown>; proposer: ServingModel | null } {
  const { [PROPOSAL_SEAL_KEY]: seal, ...rest } = params;
  if (typeof seal !== 'string' || !seal) return { params: rest, proposer: null };
  let claims: Partial<SealClaims>;
  try {
    claims = verifyJwtWithRotation<Partial<SealClaims>>(seal);
  } catch {
    return { params: rest, proposer: null };
  }
  const valid =
    claims.type === PROPOSAL_SEAL_TYPE &&
    claims.c === command &&
    claims.o === ctx.organizationId &&
    claims.u === ctx.userId &&
    claims.h === paramsHash(rest) &&
    typeof claims.p === 'string' &&
    typeof claims.m === 'string';
  if (!valid) return { params: rest, proposer: null };
  return { params: rest, proposer: { provider: claims.p!, model: claims.m!, requestId: claims.r ?? null } };
}
