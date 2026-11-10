import { describe, expect, it } from 'vitest';
import { notificationTarget } from '../notificationTarget';
describe('notification navigation boundary',()=>{
  it('uses validated saved-report identity rather than its supplied URL',()=>{
    expect(notificationTarget({resource_type:'report_run',resource_id:'41',action_url:'https://evil.invalid/'})).toEqual({surface:'insights?reportRunId=41',label:'Open saved report'});
    expect(notificationTarget({resource_type:'report_run',resource_id:'../41',action_url:'/concept2cure/insights'})).toBeNull();
  });
  it('hands a unified task to the real board with its identity',()=>{
    expect(notificationTarget({resource_type:'unified_task',resource_id:'TASK-abc-123'})).toEqual({surface:'tasks',label:'Open task',params:{taskId:'TASK-abc-123'}});
    // The id createUnifiedTask writes (a UUID): periodic-review, CAPA and training tasks, whose reminders the due-date sweep sends.
    const uuid='5d9f7a3c-1e2b-4c6d-8f0a-9b8c7d6e5f4a';
    expect(notificationTarget({resource_type:'unified_task',resource_id:uuid})).toEqual({surface:'tasks',label:'Open task',params:{taskId:uuid}});
    expect(notificationTarget({resource_type:'unified_task',resource_id:'5d9f7a3c-1e2b-4c6d-8f0a'})).toBeNull();
  });
  it('keeps declared local record identifiers but drops redirect parameters',()=>{
    expect(notificationTarget({action_url:'/concept2cure/submission-center?submissionId=42&sequenceId=7&redirect=https://evil.invalid'})).toEqual({surface:'submission-center',label:'Open linked record',params:{submissionId:'42',sequenceId:'7'}});
  });
  it.each(['https://evil.invalid/','//evil.invalid/x','javascript:alert(1)','/concept2cure/not-a-surface','/concept2cure/tasks/../../evil','/concept2cure/tasks\\..\\evil'])('refuses unsafe/unknown destinations %s',action_url=>{
    expect(notificationTarget({action_url})).toBeNull();
  });
});
