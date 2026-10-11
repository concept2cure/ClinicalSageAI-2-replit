/**
 * Account — the signed-in person's own account, opened from the shell's account
 * menu (P-25, docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * Three things, each through a route the server already has
 * (server/routes/auth.ts), via the one auth client (services/portal/authService):
 *
 *   Profile       GET  /session          name, e-mail, the session's organisation
 *                                        and the membership role, read-only. The
 *                                        membership and role are the
 *                                        administrators' (P-25). PATCH
 *                                        /api/users/me writes a name with no audit
 *                                        event, so this panel does not offer it.
 *   Password      POST /password/change  current + new. A wrong current password
 *                                        is a 401 AUTH_001 the client returns as
 *                                        the server's refusal
 *                                        (unauthorizedMeansSession). A change ends
 *                                        every session, this one too.
 *   Authenticator POST /mfa/setup → /mfa/enable, and /mfa/disable. The key and
 *                                        QR code are shown until a code confirms
 *                                        them; the recovery codes are shown once,
 *                                        from the enable answer, and kept nowhere.
 *
 * Until this panel the server's /mfa/setup and /mfa/enable had no client caller:
 * the authenticator ADR-0014 expects of signers could not be enrolled anywhere in
 * the product (QA 2026-10-08, j9 finding 9).
 *
 * Every refusal is the server's sentence; a failed read is an error with a retry,
 * never an empty panel.
 */
import React from 'react';
import { authService, useAuth, type AuthError, type AuthUser, type MfaSetup } from '@/services/portal/authService';
import { I } from './icons';
import { useDialog } from './useDialog';
import { EmptyState, ErrorState } from './dataConnect';

type AccountRead =
  | { state: 'loading' }
  | { state: 'ready'; user: AuthUser }
  | { state: 'error'; error: AuthError };

const NO_ANSWER: AuthError = { code: 'HTTP_0', message: '' };

/**
 * The server's refusal as lines to show: its message, then any further reasons
 * it listed (the password policy answers `error.details.errors`). PURE.
 */
export function refusalLines(error: AuthError | undefined, fallback: string): string[] {
  if (!error) return [fallback];
  const body = (error.details ?? {}) as { error?: { details?: { errors?: unknown } } };
  const listed = body.error?.details?.errors;
  const more = Array.isArray(listed) ? listed.filter((e): e is string => typeof e === 'string' && e.trim() !== '') : [];
  return Array.from(new Set([error.message || fallback, ...more]));
}

/** Only the server's own drawing is shown: a QR code from anywhere else would carry the secret to that host (D6). */
const isServerDrawnQr = (src: unknown): src is string => typeof src === 'string' && src.startsWith('data:image/');

const digitsOf = (code: string) => code.replace(/\s+/g, '');
const SIX_DIGITS = /^\d{6}$/;

/* ── Small pieces ─────────────────────────────────────────────────────── */

function Refusal({ lines }: { lines: string[] }) {
  return (
    <div className="de-field">
      <div className="de-err" role="alert">
        {lines.length === 1 ? (
          lines[0]
        ) : (
          <ul>
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A governance note or an outcome, in the drawer's de-gov box. `status` makes it a polite live region. */
function Note({ icon, text, label, status }: { icon: React.ReactNode; text: string; label?: string; status?: boolean }) {
  return (
    <div className="de-field">
      <div className="de-gov" role={status ? 'status' : undefined} aria-label={label}>
        <span className="ico">{icon}</span>
        <span className="de-gov-t">{text}</span>
      </div>
    </div>
  );
}

/**
 * The drawer scrolls, and what a step adds (the new key, the code field, the
 * recovery codes) lands below the fold. Brought into view when it appears,
 * instantly (no motion). jsdom has no scrollIntoView, hence the optional call.
 */
function useIntoView<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  React.useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  return ref;
}

function ReadOnlyField({ id, label, value, half }: { id: string; label: string; value: string; half?: boolean }) {
  return (
    <div className={half ? 'de-field half' : 'de-field'}>
      <label className="de-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="de-input" readOnly value={value} />
    </div>
  );
}

function PasswordField(props: {
  id: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="de-field">
      <label className="de-label" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        className="de-input"
        type="password"
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.disabled}
      />
    </div>
  );
}

/* ── Account read ─────────────────────────────────────────────────────── */

function useAccountRead() {
  const [read, setRead] = React.useState<AccountRead>({ state: 'loading' });
  /** A re-read after a change that failed: the status shown would be stale, so it is not shown. */
  const [rereadError, setRereadError] = React.useState<AuthError | null>(null);
  const load = React.useCallback(async () => {
    setRead({ state: 'loading' });
    const r = await authService.refreshUser();
    setRead(r.success && r.data ? { state: 'ready', user: r.data } : { state: 'error', error: r.error ?? NO_ANSWER });
  }, []);
  const reread = React.useCallback(async () => {
    const r = await authService.refreshUser();
    if (r.success && r.data) {
      setRereadError(null);
      setRead({ state: 'ready', user: r.data });
    } else {
      setRereadError(r.error ?? NO_ANSWER);
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);
  return { read, load, reread, rereadError };
}

/* ── Profile ──────────────────────────────────────────────────────────── */

function ProfileSection({ user }: { user: AuthUser }) {
  const id = React.useId();
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return (
    <>
      <h3 className="de-h-eye">Profile</h3>
      <ReadOnlyField id={`${id}-name`} label="Name" value={fullName || 'No name recorded'} />
      <ReadOnlyField id={`${id}-email`} label="E-mail" value={user.email} />
      <ReadOnlyField
        id={`${id}-org`}
        label="Organisation"
        value={user.organizationName || 'None on this session'}
        half
      />
      <ReadOnlyField id={`${id}-role`} label="Role" value={user.roles?.[0] || 'None on this session'} half />
    </>
  );
}

/* ── Password ─────────────────────────────────────────────────────────── */

function PasswordSection() {
  const id = React.useId();
  const { logout } = useAuth();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [refusal, setRefusal] = React.useState<string[] | null>(null);
  const [changed, setChanged] = React.useState(false);

  const submit = async () => {
    setRefusal(null);
    if (next !== confirm) {
      setRefusal(['The new passwords do not match.']);
      return;
    }
    setBusy(true);
    const r = await authService.changePassword({ currentPassword: current, newPassword: next });
    setBusy(false);
    if (!r.success) {
      setRefusal(refusalLines(r.error, 'The password was not changed.'));
      return;
    }
    setCurrent('');
    setNext('');
    setConfirm('');
    setChanged(true);
  };

  if (changed) {
    return (
      <>
        <h3 className="de-h-eye">Password</h3>
        <Note
          icon={I.check}
          status
          label="Password changed"
          text="Password changed. Every session of this account has ended, this one included. Sign in again with the new password."
        />
        <div className="de-field">
          <button type="button" className="de-btn primary" onClick={() => void logout()}>
            Sign in again
          </button>
        </div>
      </>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3 className="de-h-eye">Password</h3>
      <PasswordField id={`${id}-current`} label="Current password" autoComplete="current-password" value={current} onChange={setCurrent} disabled={busy} />
      <PasswordField id={`${id}-new`} label="New password" autoComplete="new-password" value={next} onChange={setNext} disabled={busy} />
      <PasswordField id={`${id}-confirm`} label="Confirm new password" autoComplete="new-password" value={confirm} onChange={setConfirm} disabled={busy} />
      <Note
        icon={I.lock}
        text="A change ends every session of this account, this one included, and is recorded in the audit trail."
      />
      {refusal && <Refusal lines={refusal} />}
      <div className="de-field">
        <button type="submit" className="de-btn primary" disabled={busy || !current || !next || !confirm}>
          {busy ? 'Changing password…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}

/* ── Authenticator app ────────────────────────────────────────────────── */

function useAuthenticator(reread: () => Promise<void>) {
  const [setup, setSetup] = React.useState<MfaSetup | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [refusal, setRefusal] = React.useState<string[] | null>(null);
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const clearForm = () => {
    setCode('');
    setRefusal(null);
  };
  const run = async <T,>(call: () => Promise<T>) => {
    setRefusal(null);
    setBusy(true);
    try {
      return await call();
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    clearForm();
    setNote(null);
    const r = await run(() => authService.setupMfa());
    if (r.success && r.data && typeof r.data.secret === 'string' && r.data.secret) {
      setSetup({ secret: r.data.secret, otpauthUrl: r.data.otpauthUrl, qrCode: r.data.qrCode });
      return;
    }
    setRefusal(refusalLines(r.error, 'The server did not issue a key for the authenticator app.'));
    if (r.error?.code === 'MFA_ALREADY_ENABLED') void reread();
  };

  const confirmSetup = async () => {
    const r = await run(() => authService.enableMfa(digitsOf(code)));
    if (!r.success) {
      setRefusal(refusalLines(r.error, 'The authenticator app was not set up.'));
      return;
    }
    const codes = (Array.isArray(r.data?.backupCodes) ? r.data.backupCodes : []).filter(
      (c): c is string => typeof c === 'string' && c !== '',
    );
    setSetup(null);
    clearForm();
    setRecoveryCodes(codes.length ? codes : null);
    setNote('Authenticator app set up.');
    await reread();
  };

  const confirmRemove = async () => {
    const r = await run(() => authService.disableMfa(digitsOf(code)));
    if (!r.success) {
      setRefusal(refusalLines(r.error, 'The authenticator app was not removed.'));
      return;
    }
    setRemoving(false);
    clearForm();
    setNote('Authenticator removed.');
    await reread();
  };

  const beginRemove = () => {
    clearForm();
    setNote(null);
    setRemoving(true);
  };
  const cancel = () => {
    setSetup(null);
    setRemoving(false);
    clearForm();
  };
  const dismissCodes = () => setRecoveryCodes(null);

  return { setup, removing, code, setCode, busy, refusal, recoveryCodes, note, start, confirmSetup, confirmRemove, beginRemove, cancel, dismissCodes };
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const ref = useIntoView<HTMLDivElement>();
  return (
    <div className="de-field" ref={ref}>
      <div className="de-label">Recovery codes</div>
      <div className="de-desc">
        Shown this once. Each code completes one sign-in if the app is lost. A recovery code does not sign records
        or remove the authenticator. Store them outside this product.
      </div>
      <ul className="de-quote" aria-label="Recovery codes">
        {codes.map((c) => (
          <li key={c} className="mono">
            {c}
          </li>
        ))}
      </ul>
      <button type="button" className="de-btn ghost" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

function CodeForm(props: {
  label: string;
  desc: string;
  submitLabel: string;
  busyLabel: string;
  m: ReturnType<typeof useAuthenticator>;
  onSubmit: () => Promise<void>;
  children?: React.ReactNode;
}) {
  const id = React.useId();
  const ref = useIntoView<HTMLFormElement>();
  const { m } = props;
  const ready = SIX_DIGITS.test(digitsOf(m.code)) && !m.busy;
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void props.onSubmit();
      }}
    >
      {props.children}
      <div className="de-field">
        <label className="de-label" htmlFor={id}>
          {props.label}
        </label>
        <div className="de-desc">{props.desc}</div>
        <input
          id={id}
          className="de-input mono"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={m.code}
          onChange={(e) => m.setCode(e.target.value)}
          disabled={m.busy}
        />
      </div>
      {m.refusal && <Refusal lines={m.refusal} />}
      <div className="de-field">
        <button type="submit" className="de-btn primary" disabled={!ready}>
          {m.busy ? props.busyLabel : props.submitLabel}
        </button>{' '}
        <button type="button" className="de-btn ghost" onClick={m.cancel} disabled={m.busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function NewKey({ setup }: { setup: MfaSetup }) {
  return (
    <div className="de-field">
      <div className="de-label">Add the account to the app</div>
      <div className="de-desc">
        Scan the QR code with an authenticator app, or enter the key by hand. Nothing is switched on until a code
        from the app is confirmed.
      </div>
      {isServerDrawnQr(setup.qrCode) && <img src={setup.qrCode} alt="QR code for the authenticator app" />}
      <div className="de-quote">
        <div className="de-desc">Key</div>
        <code className="mono">{setup.secret}</code>
      </div>
    </div>
  );
}

/** Removal asks for a current code; where signing needs the app, it says what removal costs first. */
function RemoveForm({ m, signingNeedsIt }: { m: ReturnType<typeof useAuthenticator>; signingNeedsIt: boolean }) {
  return (
    <>
      {signingNeedsIt && <Note icon={I.lock} text="Removing it stops you signing." />}
      <CodeForm
        label="Current code from the app"
        desc="The 6-digit code the app shows now. A recovery code is not accepted here."
        submitLabel="Remove"
        busyLabel="Removing…"
        m={m}
        onSubmit={m.confirmRemove}
      />
    </>
  );
}

function AuthenticatorSection(props: {
  enrolled: boolean;
  /** The server says signing needs an authenticator here (GET /session `signing`). */
  signingNeedsIt: boolean;
  reread: () => Promise<void>;
  rereadError: AuthError | null;
}) {
  const { enrolled, signingNeedsIt, reread, rereadError } = props;
  const m = useAuthenticator(reread);
  const idle = !m.setup && !m.removing;
  return (
    <>
      <h3 className="de-h-eye">Authenticator app</h3>
      {rereadError ? (
        <ErrorState
          variant="inline"
          title="The change was made, but your account could not be re-read, so its status is not shown."
          message={rereadError.message}
          retry={() => void reread()}
        />
      ) : (
        <p className="de-desc">
          {enrolled
            ? 'Set up. Sign-in and electronic signatures ask for a code from the app.'
            : 'Not set up. Sign-in asks for a code sent to your e-mail.'}
        </p>
      )}
      {m.note && <Note icon={I.check} text={m.note} status />}
      {m.recoveryCodes && <RecoveryCodes codes={m.recoveryCodes} onDone={m.dismissCodes} />}
      {m.setup && (
        <CodeForm label="Code from the app" desc="The 6-digit code the app shows for this account." submitLabel="Confirm" busyLabel="Confirming…" m={m} onSubmit={m.confirmSetup}>
          <NewKey setup={m.setup} />
        </CodeForm>
      )}
      {m.removing && <RemoveForm m={m} signingNeedsIt={signingNeedsIt} />}
      {idle && !rereadError && m.refusal && <Refusal lines={m.refusal} />}
      {idle && !rereadError && (
        <div className="de-field">
          {enrolled ? (
            <button type="button" className="de-btn ghost" onClick={m.beginRemove}>
              Remove authenticator
            </button>
          ) : (
            <button type="button" className="de-btn primary" onClick={() => void m.start()} disabled={m.busy}>
              {m.busy ? 'Requesting a key…' : 'Set up authenticator app'}
            </button>
          )}
        </div>
      )}
      <Note icon={I.shieldCheck} text="Each change to the authenticator is recorded in the audit trail." />
    </>
  );
}

/* ── The panel ────────────────────────────────────────────────────────── */

function AccountBody({ account }: { account: ReturnType<typeof useAccountRead> }) {
  const { read, load, reread, rereadError } = account;
  if (read.state === 'loading') return <EmptyState busy icon={I.user} title="Reading your account" />;
  if (read.state === 'error') {
    return <ErrorState title="Your account could not be read." message={read.error.message} retry={() => void load()} />;
  }
  return (
    <>
      <ProfileSection user={read.user} />
      <div className="acct-sep" />
      <PasswordSection />
      <div className="acct-sep" />
      <AuthenticatorSection
        enrolled={read.user.mfaEnabled === true}
        signingNeedsIt={read.user.signing?.authenticatorRequired === true}
        reread={reread}
        rereadError={rereadError}
      />
    </>
  );
}

export function AccountPanel({ onClose }: { onClose: () => void }) {
  const ref = useDialog(onClose);
  const titleId = React.useId();
  const account = useAccountRead();
  return (
    <div className="de-bd" onClick={onClose}>
      <div
        className="de"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        data-testid="account-panel"
      >
        <div className="de-h">
          <div>
            <div className="de-h-t" id={titleId}>
              Account
            </div>
            <div className="de-h-s">
              Your profile, password and authenticator app. Your organisation&rsquo;s administrators manage membership
              and role.
            </div>
          </div>
          <button type="button" className="de-x" onClick={onClose} aria-label="Close">
            {I.close}
          </button>
        </div>
        <div className="de-body">
          <AccountBody account={account} />
        </div>
      </div>
    </div>
  );
}
