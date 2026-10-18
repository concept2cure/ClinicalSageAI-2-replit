import React, { useEffect, useRef, useState } from 'react';
import { isNotificationRecordTarget } from '@shared/types/notification-navigation';
import { getAuthToken } from '@/utils/authToken';
import { apiCall, apiErrorText } from './apiCall';
import { notificationTarget, type NoticeResource } from './notificationTarget';
import { openNotificationRecord } from './notificationNavigation';

export function NotificationOpenButton({notice,navigate}: {notice:NoticeResource & {id:number};navigate:(target:string)=>void}) {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string | null>(null);
  const active = useRef(true); const sending = useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const open = async()=>{
    if (sending.current) return;
    sending.current=true; setBusy(true); setError(null);
    const session = getAuthToken();
    try {
      const response = await apiCall<{data?:unknown}>('GET',`/api/mdx/notifications/${notice.id}/target`);
      if (!active.current) return;
      if (session !== getAuthToken()) throw new Error('Your session changed. Reopen the tray and try again.');
      if (!response.ok) throw new Error(apiErrorText(response,'The linked record could not be checked. Try again.'));
      if (!isNotificationRecordTarget(response.body?.data)) throw new Error('The linked record was not confirmed. Try again.');
      openNotificationRecord(response.body.data,navigate);
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : 'The linked record could not be checked. Try again.');
    } finally {sending.current=false;if(active.current)setBusy(false);}
  };
  if (!(notice.resource_type && notice.resource_id) && !notice.action_url) return null;
  return <>
    <button type="button" className="btn ghost" disabled={busy} onClick={()=>void open()}>{busy ? 'Checking linked record…' : error ? 'Retry linked record' : notificationTarget(notice)?.label ?? 'Open linked record'}</button>
    {error && <span className="tt-item-sub" role="alert">{error}</span>}
  </>;
}
