/**
 * GA demo workflow templates — END-TO-END against in-process PGlite (real
 * Postgres, WASM), through the REAL listTemplatesForOrg.
 *
 * The template picker was empty on every install before the catalog merge
 * landed: the list route selected only from task_templates, nothing seeded that
 * table, and there is no UI to author one. 22-task-templates.mjs is the demo
 * half of that fix, and the property worth pinning is the override — an org
 * template sharing a templateId with a built-in must REPLACE it, appearing once
 * and as the org's version. That collapses to a merge bug the moment either
 * side changes, and no mocked query can catch it because the merge happens in
 * JS over rows a stub would have invented.
 *
 * So: the seed's real SQL runs against a real engine, and the assertions call
 * the production function with its own Drizzle query bound to PGlite.
 *
 * PGlite is pure-WASM Postgres: no server, no docker, no DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../../../shared/schema';
import { vi } from 'vitest';

let pg: PGlite;
let drz: ReturnType<typeof drizzle>;

vi.mock('../../../db', () => ({
  get db() {
    return drz;
  },
}));

type SeedFn = (client: unknown, ctx: unknown) => Promise<void>;
const SEED_22: string = '../../../../scripts/seed/ga-demo.d/22-task-templates.mjs';
async function loadSeed(): Promise<SeedFn> {
  return ((await import(SEED_22)) as { default: SeedFn }).default;
}

const client = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return {
      rows: r.rows as Array<Record<string, unknown>>,
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};

const ORG = { id: 42, name: 'Concept2Cure Therapeutics' };
const OTHER_ORG = 77;
const ADMIN = { id: 1, name: 'JM Smith' };

/**
 * Every column in the Drizzle model — listTemplatesForOrg calls .select() with
 * no projection, so a short DDL fails here rather than in production.
 * UNIQUE(template_id) is reproduced exactly as the migration declares it:
 * single-column and therefore GLOBAL across tenants, which is the constraint the
 * seed's SELECT-before-INSERT ownership check exists to respect.
 */
const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE users (id serial PRIMARY KEY, email text, name text);

CREATE TABLE task_templates (
  id serial PRIMARY KEY,
  template_id text NOT NULL UNIQUE,
  organization_id integer NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  submission_type text,
  milestone text,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  version integer DEFAULT 1,
  tasks json NOT NULL,
  dependencies json,
  milestones json,
  default_duration integer,
  critical_path json,
  best_practices text,
  regulatory_requirements json,
  risk_factors json,
  usage_count integer DEFAULT 0,
  last_used_at timestamp,
  avg_completion_time real,
  success_rate real,
  tags text[],
  metadata json,
  created_by_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
`;

interface Preview {
  templateId: string;
  name: string;
  builtin: boolean;
  taskCount: number;
  dependencyCount: number;
  spanDays: number;
  estimatedHours: number;
  isDefault: boolean;
  version: number;
  usageCount: number;
  tasksTruncated: boolean;
}

async function list(orgId = ORG.id): Promise<Preview[]> {
  const { listTemplatesForOrg } = await import('../task-template-catalog');
  return (await listTemplatesForOrg(orgId)) as unknown as Preview[];
}

beforeAll(async () => {
  pg = new PGlite();
  drz = drizzle(pg, { schema }) as unknown as ReturnType<typeof drizzle>;
  await pg.exec(DDL);
  await pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG.id}, 'Concept2Cure'), (${OTHER_ORG}, 'Other Co')`);
  await pg.exec(`INSERT INTO users (id, email, name) VALUES (1, 'admin@concept2cure.pro', 'JM Smith')`);
  await (await loadSeed())(client, { org: ORG, admin: ADMIN });
});
afterAll(async () => { await pg?.close(); });

describe('the seed itself', () => {
  it('writes three org templates, all active and org-scoped', async () => {
    const r = await pg.query<{ template_id: string; is_active: boolean; organization_id: number }>(
      'SELECT template_id, is_active, organization_id FROM task_templates ORDER BY template_id'
    );
    expect(r.rows.map(x => x.template_id)).toEqual([
      'BUILTIN-510K',
      'C2C-CMC-POST-APPROVAL-CHANGE',
      'C2C-IND-SAFETY-REPORT',
    ]);
    expect(r.rows.every(x => x.is_active === true)).toBe(true);
    expect(r.rows.every(x => x.organization_id === ORG.id)).toBe(true);
  });

  it('shapes tasks[] with the fields the instantiate route consumes', async () => {
    const r = await pg.query<{ tasks: unknown }>(
      "SELECT tasks FROM task_templates WHERE template_id = 'C2C-IND-SAFETY-REPORT'"
    );
    const tasks = r.rows[0].tasks as Array<Record<string, unknown>>;
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      // These names are load-bearing: the from-template route reads exactly
      // these, and the preview's spanDays/estimatedHours are computed from
      // dayOffset/duration/estimatedHours. A rename silently zeroes the preview.
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('title');
      expect(t).toHaveProperty('moduleType');
      expect(typeof t.dayOffset).toBe('number');
      expect(typeof t.duration).toBe('number');
      expect(Number(t.duration)).toBeGreaterThan(0);
      expect(['low', 'medium', 'high', 'critical']).toContain(t.priority);
    }
  });

  it('points every dependency at a task id that exists in the same template', async () => {
    const r = await pg.query<{ template_id: string; tasks: unknown; dependencies: unknown }>(
      'SELECT template_id, tasks, dependencies FROM task_templates'
    );
    for (const row of r.rows) {
      const ids = new Set((row.tasks as Array<{ id: string }>).map(t => t.id));
      for (const d of (row.dependencies ?? []) as Array<{ predecessor: string; successor: string }>) {
        expect(ids, `${row.template_id} predecessor`).toContain(d.predecessor);
        expect(ids, `${row.template_id} successor`).toContain(d.successor);
      }
    }
  });
});

describe('listTemplatesForOrg — the real merge', () => {
  it('returns the org templates merged with the built-in catalog', async () => {
    const out = await list();
    const ids = out.map(t => t.templateId).sort();
    // Three stored + the two built-ins the org did not override.
    expect(ids).toEqual([
      'BUILTIN-510K',
      'BUILTIN-IND',
      'BUILTIN-NDA-FILING',
      'C2C-CMC-POST-APPROVAL-CHANGE',
      'C2C-IND-SAFETY-REPORT',
    ]);
  });

  it('lets the org template WIN over the built-in of the same id, exactly once', async () => {
    const out = await list();
    const hits = out.filter(t => t.templateId === 'BUILTIN-510K');
    expect(hits).toHaveLength(1);
    // The org's row, not the catalog entry.
    expect(hits[0].builtin).toBe(false);

    const stored = await pg.query<{ name: string }>(
      "SELECT name FROM task_templates WHERE template_id = 'BUILTIN-510K'"
    );
    expect(hits[0].name).toBe(stored.rows[0].name);
  });

  it('still labels the un-overridden catalog entries as built-in', async () => {
    const out = await list();
    for (const id of ['BUILTIN-IND', 'BUILTIN-NDA-FILING']) {
      expect(out.find(t => t.templateId === id)?.builtin).toBe(true);
    }
  });

  it('computes the preview counters from the seeded rows', async () => {
    const out = await list();
    const byId = new Map(out.map(t => [t.templateId, t]));
    // Counts come straight off the seeded tasks[]/dependencies[] arrays.
    expect(byId.get('BUILTIN-510K')).toMatchObject({ taskCount: 7, dependencyCount: 8 });
    expect(byId.get('C2C-IND-SAFETY-REPORT')).toMatchObject({ taskCount: 6, dependencyCount: 6 });
    expect(byId.get('C2C-CMC-POST-APPROVAL-CHANGE')).toMatchObject({ taskCount: 5, dependencyCount: 5 });

    for (const id of ['BUILTIN-510K', 'C2C-IND-SAFETY-REPORT', 'C2C-CMC-POST-APPROVAL-CHANGE']) {
      const t = byId.get(id)!;
      // spanDays and estimatedHours are derived, so a zero here means the field
      // names drifted — the failure the picker would show as an empty timeline.
      expect(t.spanDays, `${id} spanDays`).toBeGreaterThan(0);
      expect(t.estimatedHours, `${id} estimatedHours`).toBeGreaterThan(0);
      expect(t.tasksTruncated).toBe(false);
    }
  });

  it('is org-scoped — another tenant gets the catalog only', async () => {
    const out = await list(OTHER_ORG);
    expect(out.every(t => t.builtin)).toBe(true);
    expect(out.map(t => t.templateId).sort()).toEqual([
      'BUILTIN-510K', 'BUILTIN-IND', 'BUILTIN-NDA-FILING',
    ]);
  });

  it('excludes a deactivated template and restores the built-in behind it', async () => {
    // is_active is filtered by the list query, so deactivating the override must
    // hand the id back to the catalog rather than dropping it entirely.
    await pg.exec("UPDATE task_templates SET is_active = false WHERE template_id = 'BUILTIN-510K'");
    const out = await list();
    const hits = out.filter(t => t.templateId === 'BUILTIN-510K');
    expect(hits).toHaveLength(1);
    expect(hits[0].builtin).toBe(true);
    await pg.exec("UPDATE task_templates SET is_active = true WHERE template_id = 'BUILTIN-510K'");
  });
});

describe('cross-tenant safety of the global unique key', () => {
  it('does not overwrite a template id already owned by another org', async () => {
    // UNIQUE(template_id) is global, so a naive upsert would let this seed steal
    // another tenant's row. Plant one and re-run.
    await pg.exec(`INSERT INTO task_templates
      (template_id, organization_id, name, category, tasks)
      VALUES ('C2C-IND-SAFETY-REPORT-FOREIGN', ${OTHER_ORG}, 'Foreign', 'regulatory', '[]'::json)`);
    const before = await pg.query<{ organization_id: number; name: string }>(
      "SELECT organization_id, name FROM task_templates WHERE template_id = 'C2C-IND-SAFETY-REPORT-FOREIGN'"
    );

    await (await loadSeed())(client, { org: ORG, admin: ADMIN });

    const after = await pg.query<{ organization_id: number; name: string }>(
      "SELECT organization_id, name FROM task_templates WHERE template_id = 'C2C-IND-SAFETY-REPORT-FOREIGN'"
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});

describe('idempotency', () => {
  it('re-running the seed writes nothing new', async () => {
    const count = async () =>
      (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM task_templates')).rows[0].n;
    const before = await count();
    await (await loadSeed())(client, { org: ORG, admin: ADMIN });
    expect(await count()).toBe(before);
  });
});
