import { describe, expect, it } from 'vitest';
import { notificationTarget } from '../notificationTarget';
describe('notification navigation boundary',()=>{
  it('uses validated saved-report identity rather than its supplied URL',()=>{
    expect(notificationTarget({resource_type:'report_run',resource_id:'41',action_url:'https://evil.invalid/'})).toEqual({surface:'insights?reportRunId=41',label:'Open saved report'});
    expect(notificationTarget({resource_type:'report_run',resource_id:'../41',action_url:'/concept2cure/insights'})).toBeNull();
  });
  it('hands a unified task to the real board with its identity',()=>{
    expect(notificationTarget({resource_type:'unified_task',resource_id:'TASK-abc-123'})).toEqual({surface:'tasks',label:'Open task',params:{taskId:'TASK-abc-123'}});
  });
  it('keeps declared local record identifiers but drops redirect parameters',()=>{
    expect(notificationTarget({action_url:'/concept2cure/submission-center?submissionId=42&sequenceId=7&redirect=https://evil.invalid'})).toEqual({surface:'submission-center',label:'Open linked record',params:{submissionId:'42',sequenceId:'7'}});
  });
  it.each(['https://evil.invalid/','//evil.invalid/x','javascript:alert(1)','/concept2cure/not-a-surface','/concept2cure/tasks/../../evil','/concept2cure/tasks\\..\\evil'])('refuses unsafe/unknown destinations %s',action_url=>{
    expect(notificationTarget({action_url})).toBeNull();
  });
});
