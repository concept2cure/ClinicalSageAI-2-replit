import { isNotificationRecordTarget, type NotificationRecordTarget } from '@shared/types/notification-navigation';
import { ceremonyOpen } from './ceremony';
import { clearShellProject, publishShellProject } from './shellProject';
import { stashNavParamsForTarget } from './navParams';
import { clearEditorTarget, setEditorTarget } from './editorTarget';

/** Only a confirmed response enters the existing program/record channels. */
export function openNotificationRecord(target: NotificationRecordTarget, navigate: (target: string)=>void): void {
  if (!isNotificationRecordTarget(target)) throw new Error('The linked record was not confirmed. Try again.');
  if (ceremonyOpen()) throw new Error('Finish or cancel the open governed form before opening another record.');
  const leave = new Event('beforeunload',{cancelable:true}); window.dispatchEvent(leave);
  if (leave.defaultPrevented) throw new Error('Save or discard your unsaved document changes before opening another record.');
  if (target.programId) publishShellProject({id:target.programId});
  else clearShellProject();
  if (target.surface === 'document-authoring') {
    setEditorTarget({docType:null,docId:target.params.documentId,code:target.params.sectionCode,programId:target.programId});
  } else clearEditorTarget();
  stashNavParamsForTarget(target.surface,target.params);
  const search = new URLSearchParams(target.params);
  if (target.programId) search.set('program',target.programId);
  navigate(target.surface+(search.size ? `?${search.toString()}` : ''));
}
