import { isNotificationRecordTarget, type NotificationRecordTarget } from '@shared/types/notification-navigation';
import { authService } from '@/services/portal/authService';
import { ceremonyOpen } from './ceremony';
import { clearShellProject, publishShellProject } from './shellProject';
import { stashNavParamsForTarget, surfaceLeaveRefusal } from './navParams';
import { clearEditorTarget, setEditorTarget } from './editorTarget';
import { taskActorScope, taskTargetLocation } from './taskTarget';
import { setVaultTarget } from './vaultTarget';

/** The record channel a destination reads: the editor's target, or the Vault's (a review route's notice opens its version, RR1b). */
function publishRecordTarget(target: NotificationRecordTarget): void {
  if (target.surface === 'vault' && target.programId) setVaultTarget({documentId:target.params.documentId,programId:target.programId});
  if (target.surface === 'document-authoring') {
    setEditorTarget({docType:null,docId:target.params.documentId,code:target.params.sectionCode,programId:target.programId});
  } else clearEditorTarget();
}

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
  publishRecordTarget(target);
  // A conversation (a detached AnA turn's notice) opens through the shell's
  // one conversation hand-off, as a resumed conversation does (ProjectHome).
  if (target.surface === 'conversation-thread') {
    (window as unknown as { C2C_CONVO?: { id: string } }).C2C_CONVO = { id: target.params.threadId };
  }
  stashNavParamsForTarget(target.surface,params);
  navigate(target.surface+(search.size ? `?${search.toString()}` : ''));
}
