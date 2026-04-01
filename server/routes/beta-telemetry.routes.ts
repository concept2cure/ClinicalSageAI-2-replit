import { Router } from 'express';
import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const router = Router();

const inMemoryEvents: Array<Record<string, unknown>> = [];
const MAX_EVENTS = 1000;
const TELEMETRY_DIR = path.resolve(process.cwd(), 'test-results', 'beta-telemetry');
const TELEMETRY_LOG = path.join(TELEMETRY_DIR, 'events.ndjson');

const eventSchema = z.object({
  type: z.enum([
    'route_entry',
    'workflow_step_completion',
    'validation_failure',
    'export_attempt',
    'fallback_activation',
    'sparse_state_rendering',
  ]),
  route: z.string().min(1),
  activeTab: z.string().min(1).nullable().optional(),
  projectId: z.union([z.string(), z.number()]).nullable().optional(),
  detail: z.record(z.any()).optional(),
});

const issueSchema = z.object({
  summary: z.string().min(5),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  route: z.string().min(1),
  activeTab: z.string().min(1).nullable().optional(),
  projectId: z.union([z.string(), z.number()]).nullable().optional(),
  createdAt: z.string().optional(),
});

async function persistTelemetry(record: Record<string, unknown>) {
  await mkdir(TELEMETRY_DIR, { recursive: true });
  await appendFile(TELEMETRY_LOG, `${JSON.stringify(record)}\n`, 'utf8');
}

router.post('/event', async (req, res) => {
  const parsed = eventSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'invalid_event_payload' });
  }

  const event = {
    ...parsed.data,
    createdAt: new Date().toISOString(),
  };

  inMemoryEvents.push(event);
  if (inMemoryEvents.length > MAX_EVENTS) inMemoryEvents.shift();

  try {
    await persistTelemetry(event);
  } catch {
    // fail-open for beta telemetry persistence
  }

  return res.status(202).json({ ok: true });
});

router.post('/issue', async (req, res) => {
  const parsed = issueSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'invalid_issue_payload' });
  }

  const issue = {
    type: 'issue',
    ...parsed.data,
    createdAt: parsed.data.createdAt || new Date().toISOString(),
  };

  inMemoryEvents.push(issue);
  if (inMemoryEvents.length > MAX_EVENTS) inMemoryEvents.shift();

  try {
    await persistTelemetry(issue);
  } catch {
    // fail-open for beta telemetry persistence
  }

  return res.status(202).json({ ok: true });
});

router.get('/events', (_req, res) => {
  const type = typeof _req.query.type === 'string' ? _req.query.type : null;
  const projectId = typeof _req.query.projectId === 'string' ? _req.query.projectId : null;

  const filtered = inMemoryEvents.filter(event => {
    if (type && event.type !== type) return false;
    if (projectId && String(event.projectId ?? '') !== projectId) return false;
    return true;
  });

  return res.json({ events: filtered.slice(-200) });
});

export default router;
