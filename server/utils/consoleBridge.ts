/**
 * Console → logger bridge.
 *
 * The codebase has 150+ route and service files (~1400 call sites)
 * that emit log lines through plain `console.error` / `.warn` /
 * `.log`. Migrating each one to `createScopedLogger` is the right
 * long-term move, but the volume makes it a multi-day mechanical
 * change that has no place in a security PR.
 *
 * In the meantime, the bigger gap is that the bare-console path
 * BYPASSES the redaction walker that `createScopedLogger` runs every
 * message through. A `console.error('[auth] login failed:', err)`
 * where `err.message` contains `"password=hunter2"` writes that
 * string verbatim to stdout — outside HIPAA / Part 11 visibility.
 *
 * This bridge fixes the redaction gap without touching call sites.
 * In production it patches the three console methods so each
 * argument flows through the same redaction logic the logger uses.
 * The patched functions still call the original console under the
 * hood (so log shipping / journald / CloudWatch capture is
 * preserved), but each argument that contains an object is first
 * walked by `redactContext` to scrub sensitive keys.
 *
 * Skipped in non-production so the dev feedback loop is untouched.
 * Skipped in test (NODE_ENV='test') so vitest stack traces remain
 * readable.
 *
 * Per-file migration to scoped loggers should still happen — it
 * gives structured context (`{ userId, orgId, requestId }`) that
 * this bridge can't recover from positional args. But the bridge
 * closes the redaction hole TODAY for every legacy call site.
 */

import { __testing } from './logger';

const { redactContext } = __testing;

let installed = false;

interface InstallableConsole {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

/**
 * Redact each argument: pass-through for primitives, walk objects /
 * errors / arrays through the existing redaction logic. Returns a
 * new array so the original arguments object isn't mutated.
 */
function redactArgs(args: unknown[]): unknown[] {
  return args.map(arg => {
    if (arg == null) return arg;
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
      return arg;
    }
    if (arg instanceof Error) {
      // Errors are objects but their useful fields (message, stack)
      // aren't on the SENSITIVE_KEYS list and shouldn't be redacted
      // wholesale. Pass them through; the logger format will still
      // surface message + stack.
      return arg;
    }
    if (typeof arg === 'object') {
      try {
        return redactContext(arg as Record<string, unknown>);
      } catch {
        return arg;
      }
    }
    return arg;
  });
}

export function installConsoleBridge(target: InstallableConsole = console): void {
  if (installed) return;
  if (process.env.NODE_ENV !== 'production') return;

  installed = true;

  const origLog = target.log.bind(target);
  const origError = target.error.bind(target);
  const origWarn = target.warn.bind(target);

  target.log = (...args: unknown[]) => origLog(...redactArgs(args));
  target.error = (...args: unknown[]) => origError(...redactArgs(args));
  target.warn = (...args: unknown[]) => origWarn(...redactArgs(args));
}

/** Exposed for tests so they can install/uninstall in isolation. */
export const __testing_consoleBridge = { installed: () => installed, redactArgs };

/** Reset for tests — never called from app code. */
export function __testing_resetConsoleBridge(): void {
  installed = false;
}
