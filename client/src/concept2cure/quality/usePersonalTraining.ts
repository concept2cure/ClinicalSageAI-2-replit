import * as React from 'react';
import { redactInternals } from '@/lib/queryClient';
import type { QmsTrainingAcknowledgement, QmsTrainingContext } from '@shared/qms/training';
import {
  acknowledgePersonalTraining, readPersonalTrainingRecord,
  type PersonalTrainingDocument, type PersonalTrainingScope,
} from './qmsPersonalTraining';

/** Which version is read: the one in force, or the one approved for a later day beside it (P-49). */
export type TrainingVersionChoice = 'in-force' | 'successor';

function versionOf(context: QmsTrainingContext | null, reading: TrainingVersionChoice): QmsTrainingContext | null {
  return reading === 'successor' && context?.successor ? context.successor : context;
}

/** The identity-keyed reader owns every response and retires late requests. */
export function usePersonalTrainingRecord(scope: PersonalTrainingScope | null, isCurrent: () => boolean) {
  const [context, setContext] = React.useState<QmsTrainingContext | null>(null);
  const [documentRecord, setDocumentRecord] = React.useState<PersonalTrainingDocument | null>(null);
  const [reading, setReadingState] = React.useState<TrainingVersionChoice>('in-force');
  const [understood, setUnderstood] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [blocked, setBlocked] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const mounted = React.useRef(true);
  const generation = React.useRef(0);
  const current = () => mounted.current && isCurrent();
  const load = React.useCallback(async () => {
    const request = ++generation.current;
    const ownsRequest = () => mounted.current && isCurrent() && request === generation.current;
    setLoading(true); setContext(null); setDocumentRecord(null);
    setUnderstood(false); setError(null); setNotice(null); setBlocked(true);
    if (!scope) {
      setError('Your signed-in identity could not be verified. Sign in again before opening this record.');
      setLoading(false);
      return;
    }
    try {
      const result = await readPersonalTrainingRecord(scope);
      if (!ownsRequest()) return;
      setContext(result.context); setDocumentRecord(result.document); setBlocked(false);
    } catch (failure) {
      if (!ownsRequest()) return;
      setError(redactInternals(failure instanceof Error ? failure.message : null, 'The released revision could not be read. Reload this record.'));
    } finally {
      if (ownsRequest()) setLoading(false);
    }
  }, [scope, isCurrent]);
  const loadRef = React.useRef(load);
  loadRef.current = load;
  React.useEffect(() => {
    mounted.current = true;
    void loadRef.current();
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  /** A declaration is made on the text read: choosing the other version withdraws it. */
  const setReading = React.useCallback((next: TrainingVersionChoice) => { setReadingState(next); setUnderstood(false); }, []);
  const selected = versionOf(context, reading);
  const receipt = selected?.acknowledgement ?? null;
  return { context, selected, reading, documentRecord, receipt, understood, loading, blocked, error, notice, current, load,
    setContext, setReading, setDocumentRecord, setUnderstood, setBlocked, setError, setNotice };
}

export type PersonalTrainingRecord = ReturnType<typeof usePersonalTrainingRecord>;

function canDeclare(record: PersonalTrainingRecord): boolean {
  return record.selected?.eligible === true && record.understood && !record.receipt && !record.blocked && record.current();
}

/** Where the version acknowledged, with its receipt, stands in a reread: null when it is no longer there. */
function acknowledgedIn(current: QmsTrainingContext, acknowledged: QmsTrainingContext): TrainingVersionChoice | null {
  const same = (version: QmsTrainingContext) => version.documentVersion === acknowledged.documentVersion &&
    version.contentDigest === acknowledged.contentDigest && !!version.acknowledgement;
  if (same(current)) return 'in-force';
  return current.successor && same(current.successor) ? 'successor' : null;
}

/** The context with the receipt confirmed for the version acknowledged. */
function withReceipt(context: QmsTrainingContext, acknowledged: QmsTrainingContext, receipt: QmsTrainingAcknowledgement): QmsTrainingContext {
  if (context.successor && context.successor.documentVersion === acknowledged.documentVersion && context.successor.contentDigest === acknowledged.contentDigest) {
    return { ...context, successor: { ...context.successor, acknowledgement: receipt } };
  }
  return { ...context, acknowledgement: receipt };
}

async function refreshConfirmedAcknowledgement(scope: PersonalTrainingScope, context: QmsTrainingContext,
  confirmed: string, record: PersonalTrainingRecord, onAcknowledged: () => void | Promise<void>) {
  try {
    await onAcknowledged();
    if (!record.current()) return;
    const refreshed = await readPersonalTrainingRecord(scope);
    if (!record.current()) return;
    const standing = acknowledgedIn(refreshed.context, context);
    if (!standing) {
      record.setBlocked(true);
      record.setNotice(`${confirmed} The current revision or receipt has changed. Reload this record before taking another action.`);
    } else {
      record.setContext(refreshed.context); record.setDocumentRecord(refreshed.document); record.setReading(standing);
    }
  } catch {
    if (record.current()) {
      record.setBlocked(true);
      record.setNotice(`${confirmed} The current record could not be refreshed. Reload to check the latest revision and roster coverage.`);
    }
  }
}

/** Submit once, display only a confirmed actor/revision receipt, then reread. */
export function usePersonalTrainingAcknowledgement(scope: PersonalTrainingScope | null,
  record: PersonalTrainingRecord, onAcknowledged: () => void | Promise<void>) {
  const [busy, setBusy] = React.useState(false);
  const inFlight = React.useRef(false);
  const acknowledge = async () => {
    const [whole, context] = [record.context, record.selected];
    if (!scope || !whole || !context || !canDeclare(record) || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); record.setError(null); record.setNotice(null);
    try {
      const result = await acknowledgePersonalTraining(scope, context);
      if (!record.current()) return;
      record.setContext(withReceipt(whole, context, result.receipt));
      record.setUnderstood(false);
      const confirmed = result.alreadyAcknowledged ? 'Your current acknowledgement was already recorded.' : 'Your personal acknowledgement was recorded with its audit record.';
      record.setNotice(confirmed);
      await refreshConfirmedAcknowledgement(scope, context, confirmed, record, onAcknowledged);
    } catch (failure) {
      if (!record.current()) return;
      record.setBlocked(true); record.setUnderstood(false);
      record.setError(redactInternals(failure instanceof Error ? failure.message : null, 'The acknowledgement could not be confirmed. Reload this record to check before trying again.'));
    } finally {
      inFlight.current = false;
      if (record.current()) setBusy(false);
    }
  };
  return { busy, inFlight, acknowledge };
}
