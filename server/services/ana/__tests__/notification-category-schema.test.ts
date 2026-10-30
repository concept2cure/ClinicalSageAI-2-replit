import { describe,it,expect } from 'vitest';
import { FIRE_NOTIFICATION } from '../notifications-study-memory-tool-defs';
describe('active producer categories reach the AnA notification input contract',()=>{
  it('allows the existing collaboration, schedule and digest producer spellings',()=>{
    expect(FIRE_NOTIFICATION.input_schema).toMatchObject({properties:{category:{enum:expect.arrayContaining([
      'collaboration','schedule_goal_reset','schedule_milestone_slip','schedule_milestone_at_risk','proactive_digest',
    ])}}});
  });
  // Only the platform's own producers write a task or AnA-turn notice (RR1b finding M4, 2dd1861602): a forged
  // "Review requested" would send a colleague to sign what someone else chose, so the model is not offered them.
  it('does not offer AnA the server-only task and turn categories',()=>{
    // One by one: not.arrayContaining passes as soon as any one of a list is absent.
    for (const category of ['task_assigned','task_blocked','task_completed','task_update','ana_turn']) {
      expect((FIRE_NOTIFICATION.input_schema.properties.category as {enum:string[]}).enum).not.toContain(category);
    }
  });
  it('keeps unknown categories outside the advertised input vocabulary',()=>{
    expect(FIRE_NOTIFICATION.input_schema).toMatchObject({properties:{category:{enum:expect.not.arrayContaining(['not_an_active_notice'])}}});
  });
});
