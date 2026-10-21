import { isNotificationRecordTarget, type NotificationRecordTarget } from '@shared/types/notification-navigation';
import { authService } from '@/services/portal/authService';
import { ceremonyOpen } from './ceremony';
import { clearShellProject, publishShellProject } from './shellProject';
import { stashNavParamsForTarget, surfaceLeaveRefusal } from './navParams';
import { clearEditorTarget, setEditorTarget } from './editorTarget';
import { taskActorScope, taskTargetLocation } from './taskTarget';

/** Only a confirmed response enters the existing program/record channels. */
export function openNotificationRecord(target: NotificationRecordTarget, navigate: (target: string)=>void, beforeOpen?: () => void): void {
  if (!isNotificationRecordTarget(target)) throw new Error('The linked record was not confirmed. Try again.');
  beforeOpen?.();
  if (ceremonyOpen()) throw new Error('Finish or cancel the open governed form before opening another record.');
  const leave = new Event('beforeunload',{cancelable:true}); window.dispatchEvent(leave);
  if (leave.defaultPrevented) throw new Error('Save or discard your unsaved document changes before opening another record.');
  const refusal = surfaceLeaveRefusal();
  if (refusal) throw new Error(refusal);
  const taskLocation = target.surface === 'tasks' ? taskTargetLocation(target.params.taskId, taskActorScope(authService.getUser())) : null;
  if (target.surface === 'tasks' && !taskLocation) throw new Error('Your signed-in account or organization changed. Reopen Your work.');
  const params = taskLocation ? Object.fromEntries(new URLSearchParams(taskLocation.slice(taskLocation.indexOf('?') + 1))) : target.params;
  const search = new URLSearchParams(params);
  if (target.programId) search.set('program',target.programId);
  if (target.programId) publishShellProject({id:target.programId});
  else clearShellProject();
  if (target.surface === 'document-authoring') {
    setEditorTarget({docType:null,docId:target.params.documentId,code:target.params.sectionCode,programId:target.programId});
  } else clearEditorTarget();
  stashNavParamsForTarget(target.surface,params);
  navigate(target.surface+(search.size ? `?${search.toString()}` : ''));
}
