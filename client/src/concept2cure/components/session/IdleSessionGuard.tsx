/**
 * The inactivity clock and its warning (security audit 2026-09-24, IAM-06;
 * plan P1-1; Annex 11 §12.4, HIPAA §164.312(a)(2)(iii)).
 *
 * The server measures requests (server/services/session-inactivity.ts); this
 * measures the person. Mounted once inside the authenticated shell: it reads
 * the session's clocks from the server (`GET /session`: the tenant's idle
 * window, the end of the 12-hour lifetime), warns a minute before the window
 * ends, and signs out at the end of the window or of the lifetime, keeping the
 * reason for the sign-in page. "Stay signed in" starts the window again and
 * tells the server, which otherwise sees no activity from a person who reads.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { authService } from '@/services/portal/authService';
import { startIdleWatch, type IdleWatch } from '@/services/portal/idleSession';
import { rememberSignOutReason, type SessionEndReason } from '@/utils/sessionEnd';

import styles from './IdleSessionGuard.module.css';

/** How long before the end of the window the warning stands. */
const WARN_MS = 60_000;
/** How often, at most, activity without API traffic is reported to the server. */
const KEEP_ALIVE_MS = 5 * 60_000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

function keepAliveIntervalFor(idleMs: number): number {
  return Math.min(KEEP_ALIVE_MS, Math.max(30_000, Math.floor(idleMs / 3)));
}

export function IdleSessionGuard(): ReactElement | null {
  const { t } = useTranslation();
  const titleId = useId();
  const bodyId = useId();
  const [policy, setPolicy] = useState(() => authService.getSessionPolicy());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const watchRef = useRef<IdleWatch | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current !== null) clearInterval(countdownRef.current);
    countdownRef.current = null;
    setSecondsLeft(null);
  }, []);

  const endSession = useCallback(
    (reason: SessionEndReason) => {
      stopCountdown();
      rememberSignOutReason(reason);
      void authService.logout();
    },
    [stopCountdown],
  );

  // The clocks the server enforces; the defaults until it answers.
  useEffect(() => {
    let alive = true;
    authService
      .refreshSessionPolicy()
      .then(next => {
        if (alive) setPolicy(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // The idle window.
  useEffect(() => {
    const idleMs = Math.max(60_000, policy.idleMinutes * 60_000);
    const watch = startIdleWatch({
      idleMs,
      warnMs: Math.min(WARN_MS, Math.floor(idleMs / 2)),
      onWarn: remaining => {
        const endAt = Date.now() + remaining;
        setSecondsLeft(Math.ceil(remaining / 1000));
        if (countdownRef.current !== null) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((endAt - Date.now()) / 1000))), 1000);
      },
      onIdle: () => endSession('idle'),
    });
    watchRef.current = watch;
    // A person who reads makes no requests; the server would count that as
    // idle. Activity since the last report is reported, at most every few minutes.
    let reportedAt = Date.now();
    const keepAlive = setInterval(() => {
      if (watch.warned() || watch.lastActivityAt() <= reportedAt) return;
      reportedAt = Date.now();
      authService.keepAlive().catch(() => undefined);
    }, keepAliveIntervalFor(idleMs));
    return () => {
      clearInterval(keepAlive);
      watch.stop();
      watchRef.current = null;
      if (countdownRef.current !== null) clearInterval(countdownRef.current);
      countdownRef.current = null;
    };
  }, [policy.idleMinutes, endSession]);

  // The lifetime: over at the moment the server named, whatever the activity.
  useEffect(() => {
    if (!policy.expiresAt) return;
    const remaining = Date.parse(policy.expiresAt) - Date.now();
    if (!Number.isFinite(remaining)) return;
    const timer = setTimeout(() => endSession('lifetime'), Math.max(0, Math.min(remaining, MAX_TIMEOUT_MS)));
    return () => clearTimeout(timer);
  }, [policy.expiresAt, endSession]);

  const stay = () => {
    stopCountdown();
    watchRef.current?.extend();
    authService.keepAlive().catch(() => undefined);
  };

  if (secondsLeft === null) return null;

  return (
    <div className={styles.backdrop}>
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} className={styles.dialog}>
        <h2 id={titleId} className={styles.title}>
          {t('session.stillThere')}
        </h2>
        <p id={bodyId} className={styles.body}>
          {t('session.signOutIn', { seconds: secondsLeft })}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => endSession('idle')}>
            {t('session.signOutNow')}
          </button>
          <button type="button" className={styles.primary} onClick={stay} autoFocus>
            {t('session.staySignedIn')}
          </button>
        </div>
      </div>
    </div>
  );
}
