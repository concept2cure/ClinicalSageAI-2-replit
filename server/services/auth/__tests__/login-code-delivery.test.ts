/**
 * Whether a login verification code can be delivered — the predicate the three
 * login routes refuse on.
 *
 * Pure, and tested against the environment rather than a double, because the
 * environment IS the input: the deployment this was written for had no SMTP
 * credentials, and `scripts/ops/pilot-go-no-go.mjs` called that the decisive
 * blocker ("NO tester can complete a login").
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  canDeliverLoginCode,
  LOGIN_CODE_UNDELIVERABLE_CODE,
  LOGIN_CODE_UNDELIVERABLE_MESSAGE,
  LOGIN_CODE_UNDELIVERABLE_REASON,
} from '../login-code-delivery';
import { isEmailConfigured } from '../../email/smtp-config';

const KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'NODE_ENV'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
});

function setSmtp(configured: boolean): void {
  if (configured) {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASS = 'secret';
  } else {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  }
}

describe('isEmailConfigured', () => {
  it('needs all three of host, user and password', () => {
    setSmtp(true);
    expect(isEmailConfigured()).toBe(true);
    for (const missing of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
      setSmtp(true);
      delete process.env[missing];
      expect(isEmailConfigured(), `${missing} missing was read as configured`).toBe(false);
    }
  });

  it('reads an empty string as not configured, not as a value', () => {
    setSmtp(true);
    process.env.SMTP_PASS = '';
    expect(isEmailConfigured()).toBe(false);
  });
});

describe('canDeliverLoginCode', () => {
  /* THE CASE THIS EXISTS FOR. Production, no credentials: the code is
     generated, mailed nowhere, and logged nowhere a user can reach — and all
     three routes used to answer `success: true` with a masked address. */
  it('is false in production with no SMTP credentials', () => {
    process.env.NODE_ENV = 'production';
    setSmtp(false);
    expect(canDeliverLoginCode()).toBe(false);
  });

  it('is true in production once SMTP is configured', () => {
    process.env.NODE_ENV = 'production';
    setSmtp(true);
    expect(canDeliverLoginCode()).toBe(true);
  });

  /* A laptop must not hide the login from the person building the product:
     off production, sendLoginOtpEmail writes the code to the debug log and the
     developer reads it there, which is a real channel. */
  it('is true off production even with no SMTP credentials', () => {
    setSmtp(false);
    for (const env of ['development', 'test', 'staging']) {
      process.env.NODE_ENV = env;
      expect(canDeliverLoginCode(), `${env} refused a code it can log`).toBe(true);
    }
  });

  it('is true when NODE_ENV is unset, which is not production', () => {
    delete process.env.NODE_ENV;
    setSmtp(false);
    expect(canDeliverLoginCode()).toBe(true);
  });
});

describe('what the routes say', () => {
  it('names the server as the cause and clears the account', () => {
    expect(LOGIN_CODE_UNDELIVERABLE_MESSAGE).toMatch(/not with your account/);
    expect(LOGIN_CODE_UNDELIVERABLE_MESSAGE).toMatch(/could not send/);
  });

  /* The caller has verified a password, not earned a configuration report. */
  it('names no setting, path or internal identifier', () => {
    expect(LOGIN_CODE_UNDELIVERABLE_MESSAGE).not.toMatch(/SMTP|NODE_ENV|getTransporter|nodemailer|\.ts\b/);
  });

  it('keeps one code and one audit reason for all three routes', () => {
    expect(LOGIN_CODE_UNDELIVERABLE_CODE).toBe('AUTH_OTP_UNDELIVERABLE');
    expect(LOGIN_CODE_UNDELIVERABLE_REASON).toBe('mfa_challenge_email_undeliverable');
  });
});
