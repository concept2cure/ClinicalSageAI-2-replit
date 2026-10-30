import * as React from 'react';
import {redactInternals} from '@/lib/queryClient';
import type {QmsDoc} from './data';
import {readQmsDocument} from './qmsDocuments';
import {DialogPanel} from './ControlledDocumentDialogs';

/** Explicit object selection remains independent of the register's list/read state. */
export function useControlledDocumentTarget(id?:string,requestKey?:number) {
  const [document,setDocument]=React.useState<QmsDoc|null>(null);
  const [error,setError]=React.useState<string|null>(null);
  const [loading,setLoading]=React.useState(false);
  const [attempt,setAttempt]=React.useState(0);
  const generation=React.useRef(0);
  const clear=React.useCallback(()=>{generation.current++;setDocument(null);setError(null);setLoading(false);},[]);
  React.useEffect(()=>{
    const current=++generation.current;setDocument(null);setError(null);setLoading(false);
    if(!id)return;
    const n=Number(id);
    if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(n)||n>2_147_483_647){setError('The controlled document reference is invalid.');return;}
    setLoading(true);
    void readQmsDocument(n).then(row=>{if(generation.current===current)setDocument(row);}).catch(err=>{
      if(generation.current===current)setError(redactInternals(err instanceof Error?err.message:'','The selected controlled document could not be read. Try again.'));
    }).finally(()=>{if(generation.current===current)setLoading(false);});
    return()=>{if(generation.current===current)generation.current++;};
  },[id,requestKey,attempt]);
  return {document,error,loading,clear,retry:()=>setAttempt(n=>n+1)};
}

export function ControlledDocumentTargetStatus({target,editing,onRevise}:{target:ReturnType<typeof useControlledDocumentTarget>;editing:boolean;onRevise:(d:QmsDoc)=>void}) {
  if(target.error)return <div className="qms-notice" role="alert">{target.error} <button className="qms-btn ghost" onClick={target.retry}>Try again</button>
    <button className="qms-btn ghost" onClick={target.clear}>Dismiss</button></div>;
  if(target.loading)return <div className="qms-notice" role="status">Opening the selected controlled document…</div>;
  const d=target.document;if(!d)return null;
  if(editing)return <div className="qms-notice" role="status">A notification selected {d.docNumber} {d.title}. Use Back to Quality register to finish or leave the current document before opening it.
    <button className="qms-btn ghost" onClick={target.clear}>Dismiss target</button></div>;
  return <DialogPanel title={`Controlled document ${d.docNumber}`} busy={false} onClose={target.clear}>
    <p>{d.title} · version {d.version} · {d.status}</p>
    <p>This earlier register record has no editing copy. Its next authored revision starts from an explicit project and template; the prior record is retained.</p>
    <div className="qms-dialog-actions"><button className="qms-btn ghost" onClick={target.clear}>Close</button>
      <button className="qms-btn primary" onClick={()=>onRevise(d)}>Start authored revision</button></div>
  </DialogPanel>;
}
