import * as React from 'react';
import {redactInternals} from '@/lib/queryClient';
import {EmptyState, ErrorState, type FailedRead} from '../v2/dataConnect';
import {STATUS_LABEL, type QmsDoc} from './data';
import {readQmsDocument} from './qmsDocuments';
import {DialogPanel, failedReadOf} from './ControlledDocumentDialogs';

/** Explicit object selection remains independent of the register's list/read state. */
export function useControlledDocumentTarget(id?:string,requestKey?:number) {
  const [document,setDocument]=React.useState<QmsDoc|null>(null);
  const [error,setError]=React.useState<string|null>(null);
  const [read,setRead]=React.useState<FailedRead>(undefined);
  const [retryable,setRetryable]=React.useState(true);
  const [loading,setLoading]=React.useState(false);
  const [attempt,setAttempt]=React.useState(0);
  const generation=React.useRef(0);
  const clear=React.useCallback(()=>{generation.current++;setDocument(null);setError(null);setRead(undefined);setRetryable(true);setLoading(false);},[]);
  React.useEffect(()=>{
    const current=++generation.current;setDocument(null);setError(null);setRead(undefined);setRetryable(true);setLoading(false);
    if(!id)return;
    const n=Number(id);
    if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(n)||n>2_147_483_647){setError('The controlled document reference is invalid.');setRetryable(false);return;}
    setLoading(true);
    void readQmsDocument(n).then(row=>{if(generation.current===current)setDocument(row);}).catch(err=>{
      if(generation.current!==current)return;
      setError(redactInternals(err instanceof Error?err.message:'','The selected controlled document could not be read. Try again.'));
      setRead(failedReadOf(err));
    }).finally(()=>{if(generation.current===current)setLoading(false);});
    return()=>{if(generation.current===current)generation.current++;};
  },[id,requestKey,attempt]);
  return {document,error,read,loading,clear,retry:retryable?()=>setAttempt(n=>n+1):undefined};
}

/* C15: a failed read keeps its status, so a document that is not there or not yours is said as such, with no Try
   again that cannot change it; the notices are the product's panels, and the record opens in the one drawer. */
export function ControlledDocumentTargetStatus({target,editing,onRevise}:{target:ReturnType<typeof useControlledDocumentTarget>;editing:boolean;onRevise:(d:QmsDoc)=>void}) {
  if(target.error){
    // A 404 is said here in the document's words: the shared refusal words name "this project" as what was not found.
    const missing=target.read?.status===404;
    return <ErrorState title={missing?'Not found in your organization':'The selected controlled document could not be opened'}
      message={missing?'This controlled document was not found in your organization, so it was not opened.':target.error}
      read={missing?undefined:target.read} readWhat="this controlled document" retry={missing?undefined:target.retry} onDismiss={target.clear} testId="qms-target-failed" />;
  }
  if(target.loading)return <EmptyState title="Opening the selected controlled document…" busy />;
  const d=target.document;if(!d)return null;
  if(editing)return <EmptyState title={`A notification selected ${d.docNumber} ${d.title}.`}
    hint="Use Back to Quality register to finish or leave the current document before opening it." action={{label:'Dismiss target',onAct:target.clear}} />;
  const footer=<button type="button" className="de-btn primary" onClick={()=>onRevise(d)}>Start authored revision</button>;
  return <DialogPanel title={`Controlled document ${d.docNumber}`} sub={`${d.title} · version ${d.version} · ${STATUS_LABEL[d.status]}`} busy={false} onClose={target.clear} footer={footer}>
    <p>This earlier register record has no editing copy. Its next authored revision starts from an explicit project and template; the prior record is retained.</p>
  </DialogPanel>;
}
