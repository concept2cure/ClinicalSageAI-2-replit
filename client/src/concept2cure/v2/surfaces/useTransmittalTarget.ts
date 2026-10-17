import { useCallback,useEffect,useRef,useState } from 'react';
import { NOTICE_UUID,noticePositiveId } from '@shared/types/notification-navigation';
import { apiCall } from '../apiCall';
import { consumeNavParams,NAV_PARAMS_EVENT } from '../navParams';

function initialId(): string | null {
  return consumeNavParams('gateway-transmittals')?.transmittalId ?? new URLSearchParams(window.location.search).get('transmittalId');
}
/** The exact row is read separately from the bounded log page; failures retain a retryable target. */
export function useTransmittalTarget<T extends {id:number;program_id?:string | null}>() {
  const [id,setId]=useState<string|null>(initialId);
  const [record,setRecord]=useState<T|null>(null);
  const [state,setState]=useState<'idle'|'loading'|'ready'|'error'>(()=>id?'loading':'idle');
  const [attempt,setAttempt]=useState(0);
  const generation=useRef(0);
  useEffect(()=>{
    const handoff=(event:Event)=>{
      if((event as CustomEvent<{surfaceId?:string}>).detail?.surfaceId!=='gateway-transmittals')return;
      const next=consumeNavParams('gateway-transmittals')?.transmittalId;
      if(next){setId(next);setAttempt(value=>value+1);}
    };
    window.addEventListener(NAV_PARAMS_EVENT,handoff);
    return()=>window.removeEventListener(NAV_PARAMS_EVENT,handoff);
  },[]);
  useEffect(()=>{
    const current=++generation.current;setRecord(null);
    if(!id){setState('idle');return;}
    if(!noticePositiveId(id)){setState('error');return;}
    setState('loading');
    const program=new URLSearchParams(window.location.search).get('program');
    void apiCall<{data?:T}>('GET',`/api/mdx/gateways/transmittals/${id}`).then(response=>{
      if(current!==generation.current)return;
      const row=response.body?.data;
      const sameProgram=!program || !NOTICE_UUID.test(program) || row?.program_id?.toLowerCase()===program.toLowerCase();
      if(!response.ok || !row || String(row.id)!==id || !sameProgram){setState('error');return;}
      setRecord(row);setState('ready');
    });
    return()=>{generation.current+=1;};
  },[id,attempt]);
  const retry=useCallback(()=>setAttempt(value=>value+1),[]);
  return {id,record,state,retry};
}
