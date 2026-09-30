/**
 * The OAuth 2.1 authorization server behind the connector.
 *
 * The platform had no authorization server (SAML/SCIM for enterprise SSO, JWT
 * sessions for the app, no OAuth issuer), so this is the minimum the MCP
 * authorization specification requires: /authorize with PKCE S256, /token for
 * the authorization_code and refresh_token grants, /register for RFC 7591
 * dynamic client registration, and RFC 8414 / RFC 9728 metadata. The SDK's
 * `mcpAuthRouter` owns the HTTP handling and PKCE verification; this class
 * owns the records and the decisions.
 *
 * Login is NOT reimplemented. The consent page authenticates through the
 * existing /api/auth/login (+ /api/auth/mfa/verify) and hands the resulting
 * platform access token back; the code is issued only after that token passes
 * the ONE verifier (verifyPlatformBearer).
 */

import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  ServerError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { ACCOUNT_INACTIVE_MESSAGE, isAccountActiveBeforeTenant } from '../../services/account-standing';
import { ALL_MCP_SCOPES, type McpConfig } from '../config';
import * as store from './store';
import { mintAccessToken, signPendingAuthorization, verifyPlatformBearer } from './platform-token';
import { renderConsentPage } from './consent';

export class ConceptToCureOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;

  constructor(private readonly config: McpConfig) {
    this.clientsStore = {
      getClient: (clientId) => store.getClient(clientId),
      registerClient: (client) => store.registerClient(client as OAuthClientInformationFull),
    };
  }

  /** Reject any scope the connector does not define; default to read-only. */
  private normaliseScopes(requested: string[] | undefined): string[] {
    const known = new Set<string>(ALL_MCP_SCOPES);
    const wanted = (requested ?? []).filter((s) => s.length > 0);
    for (const s of wanted) {
      if (!known.has(s)) throw new InvalidScopeError(`Unknown scope "${s}". Supported: ${ALL_MCP_SCOPES.join(' ')}`);
    }
    return wanted.length > 0 ? Array.from(new Set(wanted)) : ['c2c:read'];
  }

  private checkResource(resource: URL | undefined): string | null {
    if (!resource) return null;
    if (resource.href !== this.config.resourceUrl.href) {
      throw new InvalidTargetError(
        `resource must be ${this.config.resourceUrl.href} for this server (got ${resource.href}).`,
      );
    }
    return resource.href;
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const scopes = this.normaliseScopes(params.scopes);
    const resource = this.checkResource(params.resource);
    const assertion = signPendingAuthorization(
      {
        clientId: client.client_id,
        clientName: client.client_name ?? null,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        scopes,
        state: params.state ?? null,
        resource,
      },
      this.config.authorizationCodeTtlSeconds,
    );
    renderConsentPage(res, {
      clientName: client.client_name ?? client.client_id,
      redirectUri: params.redirectUri,
      scopes,
      assertion,
      consentPath: '/oauth/consent',
    });
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const stored = await store.readAuthorizationCode(authorizationCode);
    if (!stored || stored.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
    if (stored.expired) throw new InvalidGrantError('Authorization code has expired');
    if (stored.redeemed) throw new InvalidGrantError('Authorization code has already been used');
    return stored.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const stored = await store.readAuthorizationCode(authorizationCode);
    if (!stored || stored.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
    if (stored.expired) throw new InvalidGrantError('Authorization code has expired');
    if (redirectUri !== undefined && redirectUri !== stored.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match the authorization request');
    }
    const boundResource = this.checkResource(resource) ?? stored.resource ?? this.config.resourceUrl.href;
    // Single use: the UPDATE is the lock. A replay races here and loses.
    const redeemed = await store.redeemAuthorizationCode(authorizationCode);
    if (!redeemed) throw new InvalidGrantError('Authorization code has already been used');

    const membership = await this.liveGrantorMembership(stored);
    return this.issueTokens(client.client_id, membership, stored.scopes, boundResource, null);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const stored = await store.readRefreshToken(refreshToken);
    if (!stored || stored.clientId !== client.client_id) throw new InvalidGrantError('Invalid refresh token');
    if (stored.expired) throw new InvalidGrantError('Refresh token has expired');
    if (stored.revoked) throw new InvalidGrantError('Refresh token has been revoked');
    const boundResource = this.checkResource(resource) ?? stored.resource ?? this.config.resourceUrl.href;
    // A refresh may narrow the grant, never widen it.
    const granted = new Set(stored.scopes);
    const effective = scopes && scopes.length > 0 ? scopes.filter((s) => granted.has(s)) : stored.scopes;
    if (scopes && scopes.some((s) => !granted.has(s))) {
      throw new InvalidScopeError('A refresh cannot request scopes beyond the original grant');
    }
    // Before the rotation, so a refusal leaves the grant as it was: a suspension
    // is reversible, and refusing one must not quietly destroy the grant.
    const membership = await this.liveGrantorMembership(stored);
    await store.revokeRefreshToken(refreshToken);
    return this.issueTokens(client.client_id, membership, effective, boundResource, store.sha256Hex(refreshToken));
  }

  /**
   * The membership a grant was made under, provided the account that made it is
   * still in use (VSR-001 F-28/F-29; account-standing.ts) and the membership is
   * the same one.
   *
   * Both /token exchanges run this. Until 2026-09-25 they re-checked the
   * membership only, so an account suspended or deprovisioned after it
   * authorised a client kept that client: the refresh token minted access for
   * its 30-day life, rotating forward each time, and a code issued before the
   * suspension still redeemed (mcp-account-standing.dbtest.ts). An account that
   * cannot be read is a ServerError, never a pass.
   */
  private async liveGrantorMembership(grant: {
    userId: number;
    organizationId: number;
    membershipId: number;
  }): Promise<store.Membership> {
    let active: boolean;
    try {
      active = await isAccountActiveBeforeTenant(grant.userId);
    } catch {
      throw new ServerError('The account could not be checked. Try again.');
    }
    if (!active) throw new InvalidGrantError(ACCOUNT_INACTIVE_MESSAGE);
    const membership = await store.findMembership(grant.userId, grant.organizationId);
    if (!membership || membership.membershipId !== grant.membershipId) {
      throw new InvalidGrantError('The authorising membership no longer exists');
    }
    return membership;
  }

  private async issueTokens(
    clientId: string,
    membership: store.Membership,
    scopes: string[],
    resource: string,
    rotatedFrom: string | null,
  ): Promise<OAuthTokens> {
    const access = await mintAccessToken({
      membership,
      clientId,
      scopes,
      resource,
      ttlSeconds: this.config.accessTokenTtlSeconds,
    });
    const refresh = await store.issueRefreshToken(
      {
        clientId,
        organizationId: membership.organizationId,
        userId: membership.userId,
        membershipId: membership.membershipId,
        scopes,
        resource,
      },
      this.config.refreshTokenTtlSeconds,
      rotatedFrom,
    );
    return {
      access_token: access.token,
      token_type: 'bearer',
      expires_in: access.expiresIn,
      scope: scopes.join(' '),
      refresh_token: refresh,
    };
  }

  verifyAccessToken(token: string): Promise<AuthInfo> {
    return verifyPlatformBearer(token, this.config);
  }

  async revokeToken(client: OAuthClientInformationFull, request: { token: string }): Promise<void> {
    const stored = await store.readRefreshToken(request.token);
    if (stored && stored.clientId === client.client_id) await store.revokeRefreshToken(request.token);
    // Access tokens are short-lived JWTs; revocation of one is expiry.
  }
}
