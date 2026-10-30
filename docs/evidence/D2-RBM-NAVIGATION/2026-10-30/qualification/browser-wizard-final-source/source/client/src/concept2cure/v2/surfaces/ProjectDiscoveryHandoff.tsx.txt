import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { getJwtOrgId } from '@/utils/authToken';
import { DISCOVERY_OPTIONS, onboardingDiscoveryRecordSchema, type OnboardingDiscoveryRecord } from '@shared/types/onboarding-discovery';

export interface ProjectDiscoveryFields {
  name: string;
  target: string;
  indication: string;
  intendedUse: string;
}

type Read = { state: 'unread' | 'loading' | 'empty' } | { state: 'error' } | { state: 'ready'; record: OnboardingDiscoveryRecord };

function discoveryFromResponse(body: unknown): OnboardingDiscoveryRecord | null {
  const outer = body as { data?: unknown; success?: unknown } | null;
  if (outer?.success === false) throw new Error('Discovery unavailable');
  const data = (outer?.data ?? body) as { discovery?: unknown } | null;
  if (!data || !Object.prototype.hasOwnProperty.call(data, 'discovery')) throw new Error('Discovery unavailable');
  if (data.discovery === null) return null;
  const record = onboardingDiscoveryRecordSchema.safeParse(data.discovery);
  if (!record.success) throw new Error('Discovery unavailable');
  return record.data;
}

function copyIntoBlankFields(fields: ProjectDiscoveryFields, record: OnboardingDiscoveryRecord | null, isDeviceFiling: boolean): Partial<ProjectDiscoveryFields> {
  if (!record) return {};
  const { answers } = record;
  const stated: Partial<ProjectDiscoveryFields> = {
    name: answers.projectName, target: answers.targetDate,
    [isDeviceFiling ? 'intendedUse' : 'indication']: isDeviceFiling ? answers.devicePurpose : answers.indication,
  };
  return Object.fromEntries(Object.entries(stated).filter(([key, value]) => value && !fields[key as keyof ProjectDiscoveryFields].trim()));
}

function DiscoveryPreview({ record, isDeviceFiling, canApply, onApply }: {
  record: OnboardingDiscoveryRecord;
  isDeviceFiling: boolean;
  canApply: boolean;
  onApply: () => void;
}) {
  const { answers } = record;
  const markets = answers.targetMarkets.map(value => DISCOVERY_OPTIONS.targetMarkets.find(option => option.value === value)?.label ?? value).join(', ');
  return <>
    <p className="npw-field-help">{record.completedAt ? 'Completed discovery' : 'Saved discovery draft'} · revision {record.revision}. Goals and markets below are context; the selected filing type remains your choice.</p>
    <dl className="npw-review">
      {([
        ['Project name', answers.projectName], ['Company goal', answers.companyGoal],
        ['Project goal', answers.projectGoal], ['Target markets', markets],
        ['Target milestone date', answers.targetDate],
        [isDeviceFiling ? 'Device / diagnostic intended use' : 'Indication / patient population', isDeviceFiling ? answers.devicePurpose : answers.indication],
      ] as Array<[string, string]>).map(([label, value]) => <div className="npw-review-row" key={label}><dt>{label}</dt><dd>{value || 'Not answered'}</dd></div>)}
    </dl>
    <p className="npw-field-help">Copy only the saved project name, date and {isDeviceFiling ? 'intended use' : 'indication'} into blank fields. Review whether the recorded milestone date suits the submission. Choose product name, product type and classification separately.</p>
    <button type="button" className="sp-ask" disabled={!canApply} onClick={onApply}>Use saved discovery in blank fields</button>
    {!canApply && <p className="npw-field-help">There are no saved answers to copy into blank fields.</p>}
  </>;
}

/** An explicit, read-only handoff. Discovery never chooses a filing or class. */
export function ProjectDiscoveryHandoff({ fields, isDeviceFiling, disabled, onApply }: {
  fields: ProjectDiscoveryFields;
  isDeviceFiling: boolean;
  disabled: boolean;
  onApply: (fields: Partial<ProjectDiscoveryFields>) => void;
}) {
  const orgId = getJwtOrgId();
  const [read, setRead] = useState<Read>({ state: 'unread' });
  const [note, setNote] = useState<string | null>(null);
  const generation = useRef(0);
  const reading = useRef(false);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  useEffect(() => {
    invalidate();
    reading.current = false;
    setRead({ state: 'unread' });
    setNote(null);
    return invalidate;
  }, [orgId, invalidate]);

  const load = async () => {
    if (reading.current || disabled) return;
    reading.current = true;
    const request = ++generation.current;
    setRead({ state: 'loading' });
    setNote(null);
    const current = () => request === generation.current && orgId === getJwtOrgId();
    try {
      const response = await apiRequest('GET', '/api/onboarding/discovery');
      if (!response.ok) throw new Error('Discovery unavailable');
      const record = discoveryFromResponse(await response.json());
      if (current()) setRead(record ? { state: 'ready', record } : { state: 'empty' });
    } catch {
      if (current()) setRead({ state: 'error' });
    } finally {
      if (request === generation.current) reading.current = false;
    }
  };

  const record = read.state === 'ready' ? read.record : null;
  const transferable = copyIntoBlankFields(fields, record, isDeviceFiling);
  const canApply = !disabled && Object.keys(transferable).length > 0;
  const apply = () => {
    if (!canApply || !record || orgId !== getJwtOrgId()) return;
    onApply(transferable);
    setNote('Saved discovery copied into blank fields. Review the wording and date before creating this project.');
  };
  return (
    <section className="npw-field npw-field-wide" aria-label="Saved onboarding discovery">
      <h3 className="npw-seg-t">Start from your saved discovery</h3>
      <p className="npw-field-help">Review your organization&apos;s recorded project context, then choose whether to copy it. Your entered fields stay as you wrote them.</p>
      {read.state !== 'ready' && <button type="button" className="sp-ask" disabled={disabled || read.state === 'loading'} onClick={() => void load()}>
        {read.state === 'loading' ? 'Reading saved discovery…' : read.state === 'error' ? 'Retry saved discovery' : 'Review saved discovery'}
      </button>}
      {read.state === 'error' && <p className="npw-field-help" role="alert">Saved discovery could not be read. Try again, or enter the project details yourself.</p>}
      {read.state === 'empty' && <p className="npw-field-help" role="status">Your organization has no saved discovery yet. You can enter this project&apos;s details yourself.</p>}
      {record && <DiscoveryPreview record={record} isDeviceFiling={isDeviceFiling} canApply={canApply} onApply={apply} />}
      {note && <p className="npw-field-help" role="status">{note}</p>}
    </section>
  );
}
