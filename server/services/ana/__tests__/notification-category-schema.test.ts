import { describe,it,expect } from 'vitest';
import { FIRE_NOTIFICATION } from '../notifications-study-memory-tool-defs';
describe('active producer categories reach the AnA notification input contract',()=>{
  it('allows the existing task, collaboration, schedule and digest producer spellings',()=>{
    expect(FIRE_NOTIFICATION.input_schema).toMatchObject({properties:{category:{enum:expect.arrayContaining([
      'task_assigned','task_blocked','task_completed','task_update','collaboration',
      'schedule_goal_reset','schedule_milestone_slip','schedule_milestone_at_risk','proactive_digest',
    ])}}});
  });
  it('keeps unknown categories outside the advertised input vocabulary',()=>{
    expect(FIRE_NOTIFICATION.input_schema).toMatchObject({properties:{category:{enum:expect.not.arrayContaining(['not_an_active_notice'])}}});
  });
});
