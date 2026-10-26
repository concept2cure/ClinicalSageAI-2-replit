import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, redactInternals } from '@/lib/queryClient';
import { getOrgId } from '@/utils/authToken';
import {
  assessOnboardingDiscovery,
  emptyDiscoveryAnswers,
  onboardingDiscoveryAnswersSchema,
  onboardingDiscoveryRecordSchema,
  type OnboardingDiscoveryAnswers,
  type OnboardingDiscoveryRecord,
} from '@shared/types/onboarding-discovery';

const PATH = '/api/onboarding/discovery';

function readableError(err: unknown, fallback: string) {
  return redactInternals(err instanceof Error ? err.message : '', fallback);
}

function statusOf(err: unknown) {
  return (err as { status?: number } | null)?.status;
}

function decodeReply(body: unknown) {
  const envelope = body as { data?: unknown } | null;
  const data = (envelope?.data ?? body) as { canEdit?: unknown; discovery?: unknown } | null;
  if (typeof data?.canEdit !== 'boolean' || !('discovery' in data)) {
    throw new Error('The discovery questionnaire returned an incomplete response.');
  }
  const parsed = onboardingDiscoveryRecordSchema.nullable().safeParse(data.discovery);
  if (!parsed.success) throw new Error('The saved discovery questionnaire could not be read.');
  return { record: parsed.data, canEdit: data.canEdit };
}

function validateDraft(answers: OnboardingDiscoveryAnswers, complete: boolean) {
  const parsed = onboardingDiscoveryAnswersSchema.safeParse({
    ...answers, therapeuticAreas: answers.therapeuticAreas.map((area) => area.trim()).filter(Boolean),
  });
  if (!parsed.success) return { error: parsed.error.issues.map((issue) => issue.message).join(' ') };
  if (complete && !assessOnboardingDiscovery(parsed.data).readyToComplete) {
    return { error: 'Complete the required discovery questions before activating.' };
  }
  return { answers: parsed.data };
}

async function persistDraft(answers: OnboardingDiscoveryAnswers, revision: number, complete: boolean) {
  const res = await apiRequest('PATCH', PATH, {
    answers, expectedRevision: revision, complete,
    reason: complete ? 'Client discovery completed during workspace onboarding.' : 'Client discovery draft saved during workspace onboarding.',
  });
  if (!res.ok) throw new Error('Discovery was not saved. Confirm your session and retry.');
  const { record } = decodeReply(await res.json());
  if (!record || record.revision !== revision + 1 || (complete && !record.completedAt)) throw new Error('The server did not confirm saved discovery answers.');
  return record;
}

function useDiscoveryExitGuard(hold: boolean) {
  useEffect(() => {
    if (!hold) return;
    const holdDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', holdDraft);
    return () => window.removeEventListener('beforeunload', holdDraft);
  }, [hold]);
}

/** Organisation-wide answers stay on the server; no browser storage or model context. */
export function useOnboardingDiscovery() {
  const orgId = getOrgId();
  const [answers, setAnswers] = useState<OnboardingDiscoveryAnswers>(emptyDiscoveryAnswers);
  const [record, setRecord] = useState<OnboardingDiscoveryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const generation = useRef(0);
  const changed = useRef(false);
  const writePending = useRef(false);

  const load = useCallback(async (replaceDraft = false) => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    setNote(null);
    setCanEdit(false);
    try {
      const res = await apiRequest('GET', PATH);
      if (!res.ok) throw new Error('Your session could not read the discovery questionnaire.');
      const data = decodeReply(await res.json());
      if (request !== generation.current) return;
      setRecord(data.record);
      if (replaceDraft || !changed.current) {
        setAnswers(data.record?.answers ?? emptyDiscoveryAnswers());
        changed.current = false;
        setDirty(false);
      }
      setCanEdit(data.canEdit);
    } catch (err) {
      if (request === generation.current) {
        setError(readableError(err, 'Discovery could not be read.'));
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    changed.current = false;
    setAnswers(emptyDiscoveryAnswers());
    setRecord(null);
    setBusy(false);
    setDirty(false);
    void load();
    return () => { generation.current += 1; };
  }, [orgId, load]);

  useDiscoveryExitGuard(dirty || busy);

  const setAnswer = <K extends keyof OnboardingDiscoveryAnswers>(key: K, value: OnboardingDiscoveryAnswers[K]) => {
    if (!canEdit || loading || error || writePending.current) return;
    changed.current = true;
    setDirty(true);
    setNote(null);
    setAnswers((current) => ({ ...current, [key]: value }));
  };
  const assessment = useMemo(() => assessOnboardingDiscovery(answers), [answers]);
  const editable = canEdit && !loading && !error;

  const save = async (complete = false): Promise<boolean> => {
    if (writePending.current || !editable) return false;
    const validated = validateDraft(answers, complete);
    if (!validated.answers) {
      setNote(validated.error ?? 'Discovery answers could not be validated.');
      return false;
    }
    writePending.current = true;
    setBusy(true);
    setNote(null);
    const request = generation.current;
    try {
      const saved = await persistDraft(validated.answers, record?.revision ?? 0, complete);
      if (request !== generation.current) return false;
      setRecord(saved);
      setAnswers(saved.answers);
      changed.current = false;
      setDirty(false);
      setNote(complete ? 'Discovery completed and saved.' : 'Discovery draft saved. You can return to it later.');
      return true;
    } catch (err) {
      if (request === generation.current) {
        const status = statusOf(err);
        if (status === 409) {
          setError('Discovery changed in another session. Reload the saved answers and review them before saving again.');
        } else {
          setNote(readableError(err, 'Discovery was not saved.'));
          if (status === 403) setCanEdit(false);
        }
      }
      return false;
    } finally {
      writePending.current = false;
      if (request === generation.current) setBusy(false);
    }
  };

  const reloadSaved = () => {
    if (writePending.current) return;
    void load(true);
  };
  return { answers, setAnswer, record, assessment, loading, canEdit, busy, error, note, dirty, save, reloadSaved };
}
