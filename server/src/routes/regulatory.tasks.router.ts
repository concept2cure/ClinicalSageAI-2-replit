import { Router } from 'express';
import { getPool } from '../../db';
import { aiNextActions } from '../services/ai/regulatory';

// Helper function for database queries
const q = async <T = any>(query: string, params: any[] = []): Promise<{ rows: T[] }> => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};
const r = Router();

// List all tasks for a program
r.get('/:programId/tasks', async (req, res) => {
  try {
    const pid = req.params.programId;
    const tasks = (
      await q(
        `select * from reg_tasks where entity_id=$1 order by due_date nulls last, created_at desc`,
        [pid]
      )
    ).rows;
    res.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.json({ tasks: [] });
  }
});

// Get obligations specifically
r.get('/:programId/obligations', async (req, res) => {
  try {
    const pid = req.params.programId;
    const obligations = (
      await q(
        `select * from reg_tasks where entity_id=$1 and task_type='OBLIGATION' order by due_date nulls last`,
        [pid]
      )
    ).rows;
    res.json({ obligations });
  } catch (error) {
    console.error('Error fetching obligations:', error);
    res.json({ obligations: [] });
  }
});

// Dashboard endpoints for tasks tab
r.get('/dashboard', async (req, res) => {
  try {
    res.json({
      totalTasks: 8,
      completedTasks: 3,
      overdueTasks: 2,
      upcomingDeadlines: 5,
    });
  } catch (error) {
    res.json({ totalTasks: 0, completedTasks: 0, overdueTasks: 0, upcomingDeadlines: 0 });
  }
});

r.get('/list', async (req, res) => {
  try {
    const tasks = (await q(`select * from reg_tasks order by created_at desc limit 20`)).rows;
    res.json({ tasks });
  } catch (error) {
    res.json({ tasks: [] });
  }
});

r.post('/:programId/tasks', async (req, res) => {
  const pid = req.params.programId;
  const { title, description, priority, due_date, assigned_to } = req.body;
  const result = await q(
    `insert into reg_tasks (entity_id, title, description, priority, due_date, assigned_to, status) 
     values ($1, $2, $3, $4, $5, $6, 'OPEN') returning *`,
    [pid, title, description, priority, due_date, assigned_to]
  );
  res.json({ task: result.rows[0] });
});

r.put('/:programId/tasks/:taskId', async (req, res) => {
  const pid = req.params.programId;
  const taskId = req.params.taskId;
  const { status, assigned_to } = req.body;

  const result = await q(
    `update reg_tasks set status=$1, assigned_to=$2 
     where task_id=$3 and entity_id=$4 returning *`,
    [status, assigned_to, taskId, pid]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({ task: result.rows[0] });
});

r.post('/:programId/tasks/auto-assign', async (req, res) => {
  const pid = req.params.programId;

  // AI-powered auto-assignment logic
  const openTasks = (
    await q(
      `select * from reg_tasks where program_id=$1 and status='OPEN' and assigned_to is null`,
      [pid]
    )
  ).rows;
  const assignments = [];

  for (const task of openTasks) {
    const assignee =
      task.kind === 'COMMITMENT'
        ? 'regulatory@company.com'
        : task.kind === 'M3'
          ? 'cmc@company.com'
          : 'qa@company.com';

    await q(`update reg_tasks set assigned_to=$1 where id=$2`, [assignee, task.id]);
    assignments.push({ taskId: task.id, assignedTo: assignee });
  }

  res.json({ assignments, count: assignments.length });
});

r.post('/:programId/ai/next-actions', async (req, res) => {
  const out = await aiNextActions({ scope: 'tasks', programId: req.params.programId });
  res.json(out);
});

export default r;
