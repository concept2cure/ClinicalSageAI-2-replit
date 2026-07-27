#!/usr/bin/env node
/**
 * verify-otp-delivery.mjs — Prove a login OTP can actually reach a real inbox.
 *
 * Readiness blocker #3. Login OTP over email is MANDATORY 2FA
 * (server/routes/... → sendLoginOtpEmail), so if SMTP does not truly deliver,
 * NOBODY can log in. server/startup/services.ts already fails loud at boot when
 * SMTP is unconfigured — but "configured" is not "delivering". This script
 * closes that gap in one command:
 *
 *   PREFLIGHT → CONNECT (transporter.verify) → SEND (real message) → GUIDANCE
 *
 * Design contract:
 *   • The transport config is MIRRORED EXACTLY from server/services/emailService.ts
 *     (see SMTP_CONTRACT below). This script deliberately does NOT "improve" on
 *     it — a test that connects differently than the app proves nothing about
 *     the app. Vars the app ignores (SMTP_PASSWORD, SMTP_SECURE, EMAIL_FROM,
 *     MAIL_FROM) are detected and REPORTED as ignored rather than honoured,
 *     because silently honouring them is exactly how a green test hides a
 *     broken login.
 *   • Secret VALUES are never printed. Host/port are shown verbatim (not
 *     secret), SMTP_USER is masked, SMTP_PASS is only ever reported as set.
 *   • Every network step is bounded by a timeout, and failures are CLASSIFIED
 *     — auth vs DNS vs TLS vs timeout vs firewall are different problems with
 *     different fixes, and "it didn't work" is not an actionable report.
 *   • Exit non-zero on any failure (2 = usage/preflight, 1 = connect/send).
 *
 * Usage:
 *   node scripts/ops/verify-otp-delivery.mjs you@gmail.com
 *   TEST_OTP_RECIPIENT=you@outlook.com npm run pilot:verify-otp
 *   npm run pilot:verify-otp -- you@gmail.com --verify-only
 *
 * Run it with the SAME env the app boots with. A pass here is necessary but NOT
 * sufficient — see the GUIDANCE section printed on success.
 */

import process from 'node:process';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// ════════════════════════════════════════════════════════════════════════════
// SMTP_CONTRACT — verbatim mirror of server/services/emailService.ts
// ════════════════════════════════════════════════════════════════════════════
//   getTransporter():
//     host   = process.env.SMTP_HOST                       (required)
//     port   = parseInt(process.env.SMTP_PORT || '465', 10) (default 465)
//     user   = process.env.SMTP_USER                       (required)
//     pass   = process.env.SMTP_PASS                       (required)
//     secure = (port === 465)      ← DERIVED FROM PORT, not from any env var
//     auth   = { user, pass }
//     returns null unless host && user && pass  → email silently not sent
//   FROM_ADDRESS = process.env.SMTP_FROM || 'noreply@concept2cure.pro'
//   sendMail from: `"Concept2Cure" <${FROM_ADDRESS}>`
//   isEmailConfigured() = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)
//
// There is NO OAuth2 / API transport on the login-OTP path: emailService.ts
// constructs a plain SMTP transport with password auth and nothing else. If
// that ever changes, this script must change with it — detectForeignTransports()
// below shouts when non-SMTP mail credentials are present in the environment so
// the drift is visible instead of assumed away.
const REQUIRED_VARS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
const DEFAULT_PORT = 465;
const DEFAULT_FROM = 'noreply@concept2cure.pro';

/**
 * Vars that LOOK like they configure the OTP path but do NOT.
 * SMTP_PASSWORD / SMTP_SECURE / EMAIL_FROM are read by server/jobs/retentionCron.ts
 * (a different, unrelated mailer). MAIL_FROM appears only in docs. Setting any
 * of these while the real one is unset is a live footgun: the retention cron
 * mails fine, login OTP does not.
 */
const IGNORED_VARS = [
  { name: 'SMTP_PASSWORD', realVar: 'SMTP_PASS', usedBy: 'server/jobs/retentionCron.ts (retention digest only)' },
  { name: 'SMTP_SECURE', realVar: 'SMTP_PORT (secure is derived: port === 465)', usedBy: 'server/jobs/retentionCron.ts only' },
  { name: 'EMAIL_FROM', realVar: 'SMTP_FROM', usedBy: 'server/jobs/retentionCron.ts only' },
  { name: 'MAIL_FROM', realVar: 'SMTP_FROM', usedBy: 'nothing in this repo' },
];

/** Non-SMTP mail credentials that this app does NOT use to deliver login OTP. */
const FOREIGN_TRANSPORTS = [
  { vars: ['SENDGRID_API_KEY'], label: 'SendGrid API' },
  { vars: ['MAILGUN_API_KEY', 'MAILGUN_SMTP_SERVER', 'MAILGUN_SMTP_PORT'], label: 'Mailgun' },
  { vars: ['POSTMARK_API_TOKEN', 'POSTMARK_SERVER_TOKEN'], label: 'Postmark API' },
  { vars: ['AWS_SES_REGION', 'SES_REGION', 'SES_ACCESS_KEY_ID'], label: 'AWS SES API' },
  { vars: ['RESEND_API_KEY'], label: 'Resend API' },
  {
    vars: ['SMTP_OAUTH_CLIENT_ID', 'SMTP_CLIENT_ID', 'SMTP_REFRESH_TOKEN', 'GMAIL_CLIENT_ID', 'GMAIL_REFRESH_TOKEN'],
    label: 'SMTP OAuth2 (XOAUTH2)',
  },
];

const VERIFY_TIMEOUT_MS = clampInt(process.env.SMTP_VERIFY_TIMEOUT_MS, 20_000, 1_000, 120_000);
const SEND_TIMEOUT_MS = clampInt(process.env.SMTP_SEND_TIMEOUT_MS, 30_000, 1_000, 180_000);

// ── tiny helpers ────────────────────────────────────────────────────────────
function clampInt(raw, fallback, min, max) {
  const n = parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const color = (s, code) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = (s) => color(s, '31');
const green = (s) => color(s, '32');
const yellow = (s) => color(s, '33');
const bold = (s) => color(s, '1');

function section(title) {
  console.log('');
  console.log(bold(`── ${title} ${'─'.repeat(Math.max(0, 66 - title.length))}`));
}

/**
 * Mask an SMTP username for display. Usernames are frequently the full mailbox
 * address, i.e. semi-secret and always PII — show enough to catch a typo
 * (wrong domain, trailing space) and nothing more.
 */
function maskUser(value) {
  if (!value) return '(unset)';
  const at = value.lastIndexOf('@');
  if (at > 0) {
    const local = value.slice(0, at);
    const domain = value.slice(at + 1);
    const head = local.slice(0, 1);
    return `${head}${'*'.repeat(Math.max(2, local.length - 1))}@${domain}`;
  }
  return `${value.slice(0, 1)}${'*'.repeat(Math.max(2, value.length - 1))}`;
}

/** Flag values that will break auth or routing but look fine in a dashboard. */
function whitespaceWarning(name, value) {
  if (value === undefined) return null;
  if (value !== value.trim()) {
    return `${name} has leading/trailing whitespace — SMTP servers do not trim it; this is a common copy/paste auth failure`;
  }
  if (value.trim() === '') return `${name} is set but EMPTY`;
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Run a promise under a hard deadline. Rejects with a tagged timeout error. */
async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`${label} exceeded the ${ms}ms deadline`);
          err.code = 'C2C_TIMEOUT';
          reject(err);
        }, ms);
        if (typeof timer.unref === 'function') timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ── failure classification ──────────────────────────────────────────────────
/**
 * Auth failure, DNS failure, TLS mismatch and timeout are FOUR DIFFERENT
 * PROBLEMS with four different fixes. Reporting "SMTP failed" wastes an
 * operator's afternoon, so name the class and the fix.
 */
function classifyError(err, cfg) {
  const code = String(err?.code || '');
  const rc = err?.responseCode;
  const msg = String(err?.message || err || '');
  const low = msg.toLowerCase();
  const altPort = cfg.port === 465 ? 587 : 465;

  if (code === 'C2C_TIMEOUT' || code === 'ETIMEDOUT' || low.includes('timeout') || low.includes('timed out')) {
    return {
      kind: 'TIMEOUT / NETWORK EGRESS BLOCKED',
      hint:
        `No response from ${cfg.host}:${cfg.port} before the deadline. This is almost always outbound ` +
        `port ${cfg.port} being blocked by a firewall, security group, or the hosting provider (many PaaS ` +
        `platforms block SMTP by default). Verify egress from THIS host, not from your laptop.`,
    };
  }
  if (code === 'EAUTH' || rc === 535 || rc === 534 || rc === 530 || low.includes('authentication') || low.includes('username and password')) {
    return {
      kind: 'AUTHENTICATION REJECTED',
      hint:
        `The server reachable at ${cfg.host}:${cfg.port} refused the credentials. The host/port/TLS are FINE — ` +
        `only SMTP_USER/SMTP_PASS are wrong. Check: (a) SMTP_USER is usually the FULL mailbox address; ` +
        `(b) providers with 2FA (Gmail, Zoho, Fastmail) require an app-specific password, not the account ` +
        `password; (c) no stray whitespace in the secret; (d) the mailbox is allowed to send as SMTP_FROM.`,
    };
  }
  if (code === 'EDNS' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || low.includes('getaddrinfo')) {
    return {
      kind: 'DNS RESOLUTION FAILED',
      hint:
        `SMTP_HOST "${cfg.host}" does not resolve from this host. It never reached a mail server, so ` +
        `credentials are untested. Check for a typo in SMTP_HOST, or a private/split-horizon DNS zone that ` +
        `this container cannot see.`,
    };
  }
  if (code === 'ECONNREFUSED' || low.includes('econnrefused')) {
    return {
      kind: 'CONNECTION REFUSED',
      hint:
        `${cfg.host} resolved but actively refused port ${cfg.port}. Nothing is listening there. Try ` +
        `SMTP_PORT=${altPort} (465 = implicit TLS, 587 = STARTTLS) and confirm the provider's documented port.`,
    };
  }
  if (
    low.includes('wrong version number') ||
    low.includes('ssl') ||
    low.includes('tls') ||
    low.includes('certificate') ||
    low.includes('self signed') ||
    low.includes('altnames') ||
    code === 'ESOCKET'
  ) {
    return {
      kind: 'TLS / HANDSHAKE FAILURE',
      hint:
        `The TCP connection worked but the TLS handshake did not. NOTE: the app derives secure=${cfg.secure} ` +
        `PURELY from SMTP_PORT (secure === port 465) — SMTP_SECURE is ignored on the login-OTP path. ` +
        `"wrong version number" means implicit-TLS vs STARTTLS are swapped: set SMTP_PORT=${altPort}. ` +
        `A certificate/altname error means SMTP_HOST does not match the server's certificate. ` +
        `A self-signed error means an internal MTA/proxy is terminating the connection.`,
    };
  }
  if (code === 'EENVELOPE' || rc === 550 || rc === 553 || rc === 554) {
    return {
      kind: 'ENVELOPE REJECTED (sender or recipient)',
      hint:
        `The server accepted the connection and login but rejected the envelope. Usually the FROM address ` +
        `(${cfg.from}) is not an address this mailbox is authorised to send as, or the recipient was refused. ` +
        `Set SMTP_FROM to an address the SMTP account owns, and confirm SPF/DKIM/DMARC for that domain.`,
    };
  }
  return {
    kind: 'UNCLASSIFIED SMTP FAILURE',
    hint: 'See the raw error below and the SMTP conversation it quotes.',
  };
}

function printError(err, cfg) {
  const { kind, hint } = classifyError(err, cfg);
  console.error(`  ${red('✗')} ${bold(kind)}`);
  console.error(`    ${hint}`);
  console.error('');
  console.error('  Raw error:');
  console.error(`    message:      ${err?.message || String(err)}`);
  if (err?.code) console.error(`    code:         ${err.code}`);
  if (err?.errno !== undefined) console.error(`    errno:        ${err.errno}`);
  if (err?.syscall) console.error(`    syscall:      ${err.syscall}`);
  if (err?.command) console.error(`    smtp command: ${err.command}`);
  if (err?.responseCode) console.error(`    responseCode: ${err.responseCode}`);
  if (err?.response) console.error(`    response:     ${String(err.response).trim()}`);
}

// ── message body ────────────────────────────────────────────────────────────
function fakeCode() {
  // Deliberately NOT crypto-random and never persisted: this code authenticates
  // nothing. It exists so the message has the same shape (and therefore the same
  // spam-filter treatment) as the real OTP.
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildTestOtpText(code, stamp) {
  return [
    'THIS IS AN SMTP DELIVERY TEST — NOT A REAL LOGIN CODE.',
    '',
    `Test code: ${code}`,
    '',
    'This message was sent by scripts/ops/verify-otp-delivery.mjs to prove that',
    'Concept2Cure login verification codes can physically reach this inbox.',
    'Nobody requested a login. The code above is fake, authenticates nothing, and',
    'was never issued to any account. You do not need to do anything with it.',
    '',
    'What the operator needs to know:',
    '  1. Did this message arrive at all?',
    '  2. Did it land in the INBOX, or in Spam/Junk/Quarantine?',
    '  3. How long did it take from send to arrival?',
    '',
    `Sent at: ${stamp}`,
  ].join('\n');
}

function buildTestOtpHtml(code, stamp) {
  // Mirrors buildOtpEmailHtml() in server/services/emailService.ts closely enough
  // that spam filters score it comparably, with an unmissable test banner so no
  // human mistakes it for a real security email.
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background-color:#292524;padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Concept2Cure</h1>
            <p style="margin:4px 0 0;color:#b0aea5;font-size:13px;">AI-Powered Regulatory Intelligence</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#fef3c7;border-bottom:2px solid #f59e0b;padding:16px 40px;text-align:center;">
            <p style="margin:0;color:#92400e;font-size:14px;font-weight:700;letter-spacing:0.5px;">
              SMTP DELIVERY TEST &middot; NOT A REAL LOGIN CODE
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#292524;font-size:20px;font-weight:600;">Your verification code</h2>
            <p style="margin:0 0 24px;color:#4a4a68;font-size:15px;line-height:1.6;">
              This message was generated by an operational check to prove that login verification codes
              can physically reach this inbox. <strong>Nobody requested a login.</strong> The code below is
              fake, authenticates nothing, and was never issued to any account.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center" style="padding:8px 0 32px;">
                <div style="display:inline-block;background-color:#f0f0ff;border:2px solid #4f46e5;border-radius:12px;padding:20px 40px;">
                  <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#292524;font-family:'Courier New',monospace;">${code}</span>
                </div>
              </td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #e8e6dc;margin:24px 0;" />
            <p style="margin:0 0 8px;color:#4a4a68;font-size:13px;line-height:1.6;">
              <strong>Operator checklist:</strong> did this land in the <strong>Inbox</strong> (not Spam/Junk/Quarantine),
              and how long did it take to arrive?
            </p>
            <p style="margin:0;color:#8a8880;font-size:12px;line-height:1.5;">Sent at ${stamp}</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#faf9f5;padding:24px 40px;text-align:center;">
            <p style="margin:0;color:#8a8880;font-size:11px;">
              &copy; ${new Date().getFullYear()} Concept2Cure, Inc. &middot; delivery test, no action required
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { recipient: null, verifyOnly: false, help: false };
  for (const a of argv) {
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--verify-only') args.verifyOnly = true;
    else if (a.startsWith('--to=')) args.recipient = a.slice(5).trim();
    else if (!a.startsWith('-') && !args.recipient) args.recipient = a.trim();
  }
  return args;
}

function printUsage() {
  console.log(`
verify-otp-delivery — prove a login OTP reaches a real inbox.

Usage:
  node scripts/ops/verify-otp-delivery.mjs <recipient@example.com> [--verify-only]
  TEST_OTP_RECIPIENT=you@gmail.com npm run pilot:verify-otp
  npm run pilot:verify-otp -- you@gmail.com

Options:
  <recipient>     Address to send the real test message to. Falls back to
                  TEST_OTP_RECIPIENT. Required unless --verify-only.
  --to=ADDR       Same as the positional recipient.
  --verify-only   Run PREFLIGHT + CONNECT only; do not send mail.
  -h, --help      This message.

Environment (mirrors server/services/emailService.ts exactly):
  SMTP_HOST                 required
  SMTP_USER                 required
  SMTP_PASS                 required   (NOT SMTP_PASSWORD)
  SMTP_PORT                 default ${DEFAULT_PORT}; secure TLS is DERIVED as (port === 465)
  SMTP_FROM                 default ${DEFAULT_FROM}
  SMTP_VERIFY_TIMEOUT_MS    default ${VERIFY_TIMEOUT_MS}
  SMTP_SEND_TIMEOUT_MS      default ${SEND_TIMEOUT_MS}

Exit codes: 0 ok · 2 usage/preflight failure · 1 connect or send failure.
`);
}

// ── steps ───────────────────────────────────────────────────────────────────
function detectForeignTransports() {
  const found = [];
  for (const t of FOREIGN_TRANSPORTS) {
    const present = t.vars.filter((v) => (process.env[v] ?? '').trim() !== '');
    if (present.length) found.push({ label: t.label, vars: present });
  }
  return found;
}

/** PREFLIGHT — resolve the app's transport config and refuse to guess. */
function preflight() {
  console.log(`  Transport:  SMTP + password auth (nodemailer), mirrored from server/services/emailService.ts`);

  const foreign = detectForeignTransports();
  if (foreign.length) {
    console.log('');
    for (const f of foreign) {
      console.log(
        `  ${yellow('⚠')} ${f.label} credentials present (${f.vars.join(', ')}) — the login-OTP path does NOT`,
      );
      console.log(`      use them. emailService.ts builds a plain SMTP transport only. Verifying SMTP.`);
    }
  }

  const raw = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
  };

  console.log('');
  console.log('  Variable     Status');
  console.log('  ───────────  ──────────────────────────────────────────────────────');
  const missing = [];
  for (const name of REQUIRED_VARS) {
    const v = raw[name];
    const set = (v ?? '').trim() !== '';
    if (!set) missing.push(name);
    let shown;
    if (!set) shown = red('MISSING (required)');
    else if (name === 'SMTP_HOST') shown = `set → ${v}`;
    else if (name === 'SMTP_USER') shown = `set → ${maskUser(v)}`;
    else shown = 'set (value never printed)';
    console.log(`  ${name.padEnd(11)}  ${shown}`);
  }

  const port = parseInt(raw.SMTP_PORT || String(DEFAULT_PORT), 10);
  const portOk = Number.isFinite(port) && port > 0 && port < 65536;
  console.log(
    `  SMTP_PORT    ${raw.SMTP_PORT ? `set → ${raw.SMTP_PORT}` : `unset → default ${DEFAULT_PORT}`}` +
      (portOk ? '' : red('  ← NOT A VALID PORT')),
  );
  const from = raw.SMTP_FROM || DEFAULT_FROM;
  console.log(`  SMTP_FROM    ${raw.SMTP_FROM ? `set → ${raw.SMTP_FROM}` : `unset → default ${DEFAULT_FROM}`}`);

  const secure = port === 465;
  console.log('');
  console.log(`  Derived TLS mode: secure=${secure} (${secure ? 'implicit TLS' : 'plaintext + STARTTLS'})`);
  console.log(`    ↳ emailService.ts computes this as (port === 465). SMTP_SECURE is NOT consulted.`);

  // Ignored-but-set vars: the single most likely reason a "configured" env still
  // cannot deliver a login code.
  const warnings = [];
  for (const ig of IGNORED_VARS) {
    if ((process.env[ig.name] ?? '').trim() === '') continue;
    warnings.push(
      `${ig.name} is set but IGNORED by the login-OTP path (used by ${ig.usedBy}). The OTP path reads ${ig.realVar}.`,
    );
  }
  for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_PORT']) {
    const w = whitespaceWarning(name, process.env[name]);
    if (w) warnings.push(w);
  }
  if (warnings.length) {
    console.log('');
    for (const w of warnings) console.log(`  ${yellow('⚠')} ${w}`);
  }

  const errors = [];
  if (missing.length) {
    errors.push(
      `SMTP is NOT configured. Missing required variable(s): ${missing.join(', ')}. ` +
        `emailService.getTransporter() returns null unless SMTP_HOST, SMTP_USER and SMTP_PASS are ALL set — ` +
        `login OTP emails are then silently dropped and no user can complete 2FA login.` +
        (process.env.SMTP_PASSWORD && missing.includes('SMTP_PASS')
          ? ' You have SMTP_PASSWORD set — the login-OTP path reads SMTP_PASS, not SMTP_PASSWORD. Rename it.'
          : ''),
    );
  }
  if (!portOk) errors.push(`SMTP_PORT="${raw.SMTP_PORT}" is not a valid TCP port.`);

  return { ok: errors.length === 0, errors, cfg: { host: raw.SMTP_HOST, port, user: raw.SMTP_USER, pass: raw.SMTP_PASS, secure, from } };
}

/** CONNECT — prove DNS, TCP, TLS and credentials all actually work. */
async function connect(cfg) {
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    // Bounded at the socket level too, so a black-holed port fails inside the
    // deadline instead of being killed by the outer race with the socket left open.
    connectionTimeout: VERIFY_TIMEOUT_MS,
    greetingTimeout: VERIFY_TIMEOUT_MS,
    socketTimeout: Math.max(VERIFY_TIMEOUT_MS, SEND_TIMEOUT_MS),
  });

  console.log(`  Connecting to ${cfg.host}:${cfg.port} (secure=${cfg.secure}) as ${maskUser(cfg.user)} …`);
  console.log(`  Deadline: ${VERIFY_TIMEOUT_MS}ms`);
  const started = Date.now();
  try {
    await withTimeout(transporter.verify(), VERIFY_TIMEOUT_MS, 'transporter.verify()');
    console.log(`  ${green('✓')} verify() succeeded in ${Date.now() - started}ms — DNS, TCP, TLS and AUTH all work.`);
    return { ok: true, transporter };
  } catch (err) {
    console.error(`  Failed after ${Date.now() - started}ms.`);
    printError(err, cfg);
    try {
      transporter.close();
    } catch {
      /* best effort */
    }
    return { ok: false, transporter: null };
  }
}

/** SEND — put a real message on the wire and report what the server said. */
async function send(transporter, cfg, recipient) {
  const code = fakeCode();
  const stamp = new Date().toISOString();
  console.log(`  To:       ${recipient}`);
  console.log(`  From:     "Concept2Cure" <${cfg.from}>`);
  console.log(`  Code:     ${code} (fake — authenticates nothing)`);
  console.log(`  Deadline: ${SEND_TIMEOUT_MS}ms`);
  console.log('');

  const started = Date.now();
  let info;
  try {
    info = await withTimeout(
      transporter.sendMail({
        // Identical shape to sendLoginOtpEmail() so delivery/spam behaviour is comparable.
        from: `"Concept2Cure" <${cfg.from}>`,
        to: recipient,
        subject: `${code} — Concept2Cure verification code [SMTP DELIVERY TEST]`,
        text: buildTestOtpText(code, stamp),
        html: buildTestOtpHtml(code, stamp),
        headers: { 'X-C2C-Delivery-Test': 'login-otp' },
      }),
      SEND_TIMEOUT_MS,
      'transporter.sendMail()',
    );
  } catch (err) {
    console.error(`  Failed after ${Date.now() - started}ms.`);
    printError(err, cfg);
    return { ok: false, code };
  }

  const accepted = info?.accepted ?? [];
  const rejected = info?.rejected ?? [];
  const pending = info?.pending ?? [];

  console.log(`  ${green('✓')} sendMail() returned in ${Date.now() - started}ms`);
  console.log(`    messageId:  ${info?.messageId ?? '(none returned)'}`);
  console.log(`    accepted:   ${accepted.length ? accepted.join(', ') : '(none)'}`);
  console.log(`    rejected:   ${rejected.length ? red(rejected.join(', ')) : '(none)'}`);
  if (pending.length) console.log(`    pending:    ${pending.join(', ')}`);
  console.log(`    envelope:   from=${info?.envelope?.from ?? '?'} to=${(info?.envelope?.to ?? []).join(', ') || '?'}`);
  console.log(`    response:   ${String(info?.response ?? '(no response line)').trim()}`);

  if (rejected.length || accepted.length === 0) {
    console.error('');
    console.error(`  ${red('✗')} The server did NOT accept the message for every recipient.`);
    console.error(
      `    A rejected recipient means the mail was never queued for delivery. Check the response line above ` +
        `for the server's reason (relay denied, sender not authorised, unknown mailbox).`,
    );
    return { ok: false, code };
  }
  return { ok: true, code, messageId: info?.messageId };
}

/** GUIDANCE — the part that makes this a gate rather than a green checkmark. */
function printGuidance(recipient, code) {
  section('GUIDANCE — THE GATE IS NOT CLOSED YET');
  console.log(`  ${yellow('SMTP accepting a message is NOT the same as an inbox receiving it.')}`);
  console.log('');
  console.log('  All this run proved is that the mail server took the message and queued it. It did NOT');
  console.log('  prove delivery. Between here and a tester\'s screen sit SPF, DKIM, DMARC, reputation');
  console.log('  scoring, greylisting and tenant quarantine policy — and a login code that lands in Spam');
  console.log('  is, operationally, a login that does not work. That distinction is the whole point of');
  console.log('  this gate.');
  console.log('');
  console.log(`  You must now CONFIRM BY EYE that the message arrived in the INBOX — not Spam, not Junk,`);
  console.log('  not quarantine — for BOTH of these, because they filter very differently:');
  console.log('');
  console.log(`    ${bold('1. An external Gmail address')}    (…@gmail.com)`);
  console.log(`    ${bold('2. An Outlook / Microsoft 365 address')}  (…@outlook.com or a real M365 tenant)`);
  console.log('');
  console.log(`  Re-run this script once per address:`);
  console.log(`      npm run pilot:verify-otp -- you@gmail.com`);
  console.log(`      npm run pilot:verify-otp -- you@outlook.com`);
  console.log('');
  console.log('  For each one, record:');
  console.log(`    ☐ Arrived? (subject contains the code ${code} and "[SMTP DELIVERY TEST]")`);
  console.log('    ☐ Inbox or Spam/Junk/Quarantine?');
  console.log('    ☐ Time from send to arrival (an OTP that lands after its 10-minute expiry is a failed login)');
  console.log('    ☐ If Spam: fix SPF/DKIM/DMARC for the SMTP_FROM domain, then re-test. Do not ship on');
  console.log('      "tell the testers to check their spam folder" — that is not a working login.');
  console.log('');
  console.log(`  Last sent to: ${recipient}`);
  console.log('');
  console.log(`  ${yellow('This gate stays OPEN until a human has confirmed inbox placement on both providers.')}`);
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  VERIFY OTP DELIVERY — can a login verification code reach an inbox? ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`  Time:      ${new Date().toISOString()}`);
  console.log(`  NODE_ENV:  ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Mirrors:   server/services/emailService.ts → getTransporter() / sendLoginOtpEmail()`);

  // ── 1. PREFLIGHT ──────────────────────────────────────────────────────────
  section('1 · PREFLIGHT — SMTP configuration');
  const pre = preflight();
  if (!pre.ok) {
    console.error('');
    for (const e of pre.errors) console.error(`  ${red('✗')} ${e}`);
    console.error('');
    console.error(`  ${red('RESULT: NO-GO')} — cannot even attempt delivery. Set the variable(s) above and re-run.`);
    console.error(`  Reference: .env.example lines for SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM.`);
    console.error('');
    process.exit(2);
  }
  console.log('');
  console.log(`  ${green('✓')} All required SMTP variables are present.`);

  // Recipient is required for the SEND step — resolve it BEFORE opening a
  // connection so a usage mistake never burns an SMTP auth attempt.
  const recipient = args.recipient || (process.env.TEST_OTP_RECIPIENT ?? '').trim() || null;
  if (!args.verifyOnly) {
    if (!recipient) {
      console.error('');
      console.error(
        `  ${red('✗')} No test recipient. Pass one as the first argument or set TEST_OTP_RECIPIENT.`,
      );
      console.error('      node scripts/ops/verify-otp-delivery.mjs you@gmail.com');
      console.error('      npm run pilot:verify-otp -- you@gmail.com');
      console.error('      (or use --verify-only to check credentials without sending)');
      console.error('');
      process.exit(2);
    }
    if (!EMAIL_RE.test(recipient)) {
      console.error('');
      console.error(`  ${red('✗')} "${recipient}" does not look like an email address.`);
      console.error('');
      process.exit(2);
    }
  }

  // ── 2. CONNECT ────────────────────────────────────────────────────────────
  section('2 · CONNECT — transporter.verify()');
  const conn = await connect(pre.cfg);
  if (!conn.ok) {
    console.error('');
    console.error(
      `  ${red('RESULT: NO-GO')} — the app cannot reach or authenticate to the mail server, so login OTP ` +
        `delivery is impossible. Fix the class of failure named above and re-run.`,
    );
    console.error('');
    process.exit(1);
  }

  if (args.verifyOnly) {
    console.log('');
    console.log(`  ${yellow('--verify-only')}: stopping before SEND. Credentials work; delivery is UNPROVEN.`);
    console.log('  Re-run with a recipient to prove a message actually leaves the building.');
    console.log('');
    try {
      conn.transporter.close();
    } catch {
      /* best effort */
    }
    process.exit(0);
  }

  // ── 3. SEND ───────────────────────────────────────────────────────────────
  section('3 · SEND — real test message mimicking the login OTP');
  const result = await send(conn.transporter, pre.cfg, recipient);
  try {
    conn.transporter.close();
  } catch {
    /* best effort */
  }

  if (!result.ok) {
    console.error('');
    console.error(
      `  ${red('RESULT: NO-GO')} — the mail server did not accept the login-OTP test message. ` +
        `Testers cannot log in until this sends cleanly.`,
    );
    console.error('');
    process.exit(1);
  }

  // ── 4. GUIDANCE ───────────────────────────────────────────────────────────
  printGuidance(recipient, result.code);
  console.log(`  ${green('RESULT: SMTP ACCEPTED THE MESSAGE')} — now go look at the two inboxes.`);
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  // Framework-level crash. A crash in the gate is itself a no-go.
  console.error(`\nFATAL: verify-otp-delivery crashed: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
