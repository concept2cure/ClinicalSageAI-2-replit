/**
 * Scrubbers for the browser Sentry client (`utils/sentry.ts`).
 *
 * A Sentry event is a third-party copy of whatever was on the page when it
 * broke: the URL and its query string, request headers, the signed-in user,
 * breadcrumbs of every fetch and console line, and any `extra` a boundary
 * attached. For a PHI-adjacent application that copy must not carry
 * credentials, identifiers or health data. The server client scrubs its
 * events (`server/utils/sentry.ts`); until 2026-09-26 the browser client did
 * not (audit DP-26, plan P1-27).
 *
 * Two layers, both fail closed. A key denylist is dropped wherever the key
 * occurs, and value patterns catch the carriers a key name does not announce:
 * a bearer token in a message, a JWT in a URL, an email address in a console
 * line. A scrubber that throws returns null, which drops the event; a missing
 * report is cheaper than a leaked one.
 */
import type { Breadcrumb, ErrorEvent } from '@sentry/react';

export const REDACTED = '[REDACTED]';

/** Header names that carry credentials or the tenant key. */
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-org-id|x-org-uuid|x-client-id|x-csrf-token)$/i;

/** Object keys whose values are dropped wherever they occur; compared lower-cased with `-` and `_` removed. */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  // credentials
  'password', 'passwd', 'secret', 'clientsecret', 'privatekey', 'token', 'accesstoken', 'refreshtoken', 'idtoken',
  'authorization', 'cookie', 'setcookie', 'apikey', 'xapikey', 'otp', 'totp', 'mfacode', 'backupcode', 'recoverycode',
  // identifiers
  'email', 'ip', 'ipaddress', 'phone', 'phonenumber', 'ssn', 'dob', 'dateofbirth',
  // health data
  'mrn', 'medicalrecordnumber', 'patientid', 'subjectid', 'phi',
]);

/** Value shapes redacted inside any string, whatever key holds it. */
const VALUE_PATTERNS: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, // a JWT
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // a provider key
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, // an email address
  /\b\d{3}-\d{2}-\d{4}\b/g, // a US SSN
];

/** `?token=…` and its kin inside a URL keep the parameter name and lose the value. */
const URL_SECRET_PARAM = /((?:^|[?&#])(?:token|access_token|refresh_token|id_token|code|api_key|apikey|key|secret|password|email)=)[^&#\s]*/gi;

const MAX_DEPTH = 12;

export function redactText(text: string): string {
  let out = text.replace(URL_SECRET_PARAM, `$1${REDACTED}`);
  for (const pattern of VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''));
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Redacts sensitive keys and value patterns through plain objects and arrays.
 * Class instances (a Date, an Error) pass through untouched; nulls stay null.
 */
export function redactDeep<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return redactText(value) as T;
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1)) as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) && item != null ? REDACTED : redactDeep(item, depth + 1);
  }
  return out as T;
}

function scrubRequest(request: NonNullable<ErrorEvent['request']>): ErrorEvent['request'] {
  const out = { ...request };
  delete out.cookies;
  if (out.headers) {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(out.headers)) headers[name] = SENSITIVE_HEADER.test(name) ? REDACTED : value;
    out.headers = headers;
  }
  if (typeof out.url === 'string') out.url = redactText(out.url);
  if (typeof out.query_string === 'string') out.query_string = redactText(out.query_string);
  return out;
}

/** The pseudonymous id may travel; the address, location, email and username may not. */
function scrubUser(user: NonNullable<ErrorEvent['user']>): ErrorEvent['user'] {
  const out = { ...user };
  delete out.ip_address;
  delete out.geo;
  if (out.email) out.email = REDACTED;
  if (out.username) out.username = REDACTED;
  return out;
}

/** `beforeSend`: the event Sentry is about to transmit, or null to drop it. */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent | null {
  try {
    const shaped: ErrorEvent = { ...event };
    if (shaped.request) shaped.request = scrubRequest(shaped.request);
    if (shaped.user) shaped.user = scrubUser(shaped.user);
    return redactDeep(shaped);
  } catch {
    return null;
  }
}

/** `beforeBreadcrumb`: every fetch, console and navigation crumb passes here first. */
export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  try {
    return redactDeep(breadcrumb);
  } catch {
    return null;
  }
}
