import type { MilestoneDefinition } from './document-taxonomy';

// Compact milestone/task builders — a task is [id, title, description].
export type TaskTriple = [string, string, string];
/** A milestone heading: [id, title, description]. */
export type MilestoneHead = [string, string, string];

export function ms(order: number, phase: string, [id, title, description]: MilestoneHead, tasks: TaskTriple[]): MilestoneDefinition {
  return { id, title, description, phase, order, tasks: tasks.map(([tid, tt, td]) => ({ id: tid, title: tt, description: td })) };
}
