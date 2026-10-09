/**
 * The consent page and its POST handler.
 *
 * GET /authorize (SDK handler → provider.authorize) renders this page. It
 * authenticates through the platform's EXISTING login endpoints from the
 * browser (same origin), obtains a platform access token, and posts it back
 * here with the signed pending-authorization assertion. Only after that token
 * passes verifyPlatformBearer — the one verifier — is an authorization code
 * issued and the client redirected. Nothing about credentials is stored here;
 * the page never sees a password after the login call returns.
 *
 * If the browser already holds the app's session token (localStorage key
 * `trialsage_access_token`, the app's own convention), the page skips the
 * login form and asks only for consent. The server still verifies the token.
 */

import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { SCOPE_DESCRIPTIONS, type McpConfig, type McpScope } from '../config';
import { readPendingAuthorization, verifyPlatformBearer, principalOf } from './platform-token';
import * as store from './store';

export interface ConsentPageModel {
  clientName: string;
  redirectUri: string;
  scopes: string[];
  assertion: string;
  consentPath: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function renderConsentPage(res: Response, model: ConsentPageModel): void {
  const nonce = randomBytes(16).toString('base64');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; ` +
      `form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  const redirectHost = (() => {
    try {
      return new URL(model.redirectUri).host;
    } catch {
      return model.redirectUri;
    }
  })();
  const scopeRows = model.scopes
    .map((s) => `<li><code>${esc(s)}</code> — ${esc(SCOPE_DESCRIPTIONS[s as McpScope] ?? '')}</li>`)
    .join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorise ${esc(model.clientName)} — Concept2Cure</title>
<style nonce="${nonce}">
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f8;color:#1c1e21;margin:0;padding:32px 16px}
  main{max-width:520px;margin:0 auto;background:#fff;border:1px solid #d9dde2;border-radius:8px;padding:28px}
  h1{font-size:20px;margin:0 0 8px}p{line-height:1.5}code{background:#eef1f4;padding:1px 4px;border-radius:3px}
  label{display:block;margin:12px 0 4px;font-weight:600}input{width:100%;box-sizing:border-box;padding:8px;border:1px solid #b8c0c8;border-radius:4px;font-size:15px}
  .row{display:flex;gap:12px;margin-top:20px}button{padding:10px 16px;border-radius:4px;border:1px solid #1c1e21;background:#1c1e21;color:#fff;font-size:15px;cursor:pointer}
  button.secondary{background:#fff;color:#1c1e21}.error{color:#a4262c;margin-top:12px}.hidden{display:none}ul{padding-left:20px}
</style></head><body><main>
  <h1>Authorise <strong>${esc(model.clientName)}</strong></h1>
  <p>The application at <code>${esc(redirectHost)}</code> is asking to use Concept2Cure on your behalf. It will be able to:</p>
  <ul>${scopeRows}</ul>
  <p>Signing, freezing and transmitting a sequence stay in Concept2Cure behind 21 CFR Part 11 sign-off; no connector scope can do those.</p>
  <form id="login" class="hidden">
    <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required>
    <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
    <div id="mfa" class="hidden"><label for="code">Verification code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code"></div>
    <div class="row"><button type="submit">Sign in and continue</button></div>
  </form>
  <form id="consent" method="post" action="${esc(model.consentPath)}" class="hidden">
    <input type="hidden" name="request" value="${esc(model.assertion)}">
    <input type="hidden" name="access_token" id="access_token" value="">
    <p id="who"></p>
    <div class="row">
      <button type="submit" name="decision" value="allow">Allow</button>
      <button type="submit" name="decision" value="deny" class="secondary">Deny</button>
    </div>
  </form>
  <p id="error" class="error hidden"></p>
  <script nonce="${nonce}">
  (function(){
    var loginForm=document.getElementById('login'),consentForm=document.getElementById('consent'),err=document.getElementById('error');
    var mfaBox=document.getElementById('mfa'),challengeId=null;
    function showError(m){err.textContent=m;err.classList.remove('hidden');}
    function toConsent(token,label){document.getElementById('access_token').value=token;document.getElementById('who').textContent=label?('Signed in as '+label):'';loginForm.classList.add('hidden');consentForm.classList.remove('hidden');}
    var existing=null;try{existing=window.localStorage.getItem('trialsage_access_token');}catch(e){}
    if(existing){toConsent(existing,'your current Concept2Cure session');}else{loginForm.classList.remove('hidden');}
    loginForm.addEventListener('submit',function(ev){ev.preventDefault();err.classList.add('hidden');
      var email=document.getElementById('email').value,password=document.getElementById('password').value,code=document.getElementById('code').value;
      var req=challengeId?fetch('/api/auth/mfa/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId:challengeId,code:code})})
                         :fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,password:password})});
      req.then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};});}).then(function(res){
        var b=res.body||{};
        if(!res.ok){showError((b.error&&b.error.message)||b.message||'Sign-in failed.');return;}
        if(b.mfaRequired){challengeId=b.challengeId;mfaBox.classList.remove('hidden');showError('Enter the verification code sent to you.');return;}
        if(b.accessToken){toConsent(b.accessToken,email);return;}
        showError('Sign-in did not return a session.');
      }).catch(function(){showError('Network error during sign-in.');});
    });
  })();
  </script>
</main></body></html>`;
  res.status(200).type('html').send(html);
}

function redirectWithError(res: Response, redirectUri: string, error: string, description: string, state: string | null): void {
  const u = new URL(redirectUri);
  u.searchParams.set('error', error);
  u.searchParams.set('error_description', description);
  if (state) u.searchParams.set('state', state);
  res.redirect(302, u.href);
}

/** POST /oauth/consent — form-encoded: request, access_token, decision. */
export function consentHandler(config: McpConfig) {
  return async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const pending = typeof body.request === 'string' ? readPendingAuthorization(body.request) : null;
    if (!pending) {
      res.status(400).json({ error: 'invalid_request', error_description: 'The authorization request is missing, malformed or expired. Start again from the client.' });
      return;
    }
    if (body.decision !== 'allow') {
      redirectWithError(res, pending.redirectUri, 'access_denied', 'The user declined the authorization request.', pending.state);
      return;
    }
    const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
    let principal;
    try {
      principal = principalOf(await verifyPlatformBearer(accessToken, config));
    } catch {
      principal = null;
    }
    if (!principal) {
      res.status(401).json({ error: 'invalid_token', error_description: 'Sign-in could not be verified. Sign in again and retry.' });
      return;
    }
    const membership = await store.findMembership(principal.userId, principal.organizationId);
    if (!membership) {
      res.status(403).json({ error: 'access_denied', error_description: 'No organisation membership for this user.' });
      return;
    }
    const code = await store.issueAuthorizationCode({
      clientId: pending.clientId,
      membership,
      codeChallenge: pending.codeChallenge,
      redirectUri: pending.redirectUri,
      scopes: pending.scopes,
      resource: pending.resource,
      ttlSeconds: config.authorizationCodeTtlSeconds,
    });
    const u = new URL(pending.redirectUri);
    u.searchParams.set('code', code);
    if (pending.state) u.searchParams.set('state', pending.state);
    res.redirect(302, u.href);
  };
}
