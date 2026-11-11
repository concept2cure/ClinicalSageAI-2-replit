/**
 * P-122 defects, item 4: what the project-management engines answer for C2C-101 and LMN-201, through the reads the
 * project page's Schedule and Projects' "at risk" answer make. Run before and after the seed.
 *
 *   node docs/evidence/DESIGN/P-122/defects/4-demo-data/engines.mjs <base-url> <email>
 *
 * Signs in as the seed does (lib.mjs connect: dev-login on a local server started with ALLOW_DEV_AUTH=1).
 */
import { connect, must } from '../../../../../../scripts/demo/launch-demo/lib.mjs';

const PROJECTS = [['C2C-101', '[Demo · Biotech] C2C-101'], ['LMN-201', '[Demo · Lumen] LMN-201']];
const rowsOf = (j) => (Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : []);

async function projectIdOf(api, prefix) {
  const programs = must(await api('GET', '/api/c2c/projects?limit=200'), 200, 'list programs').data ?? [];
  const program = programs.find((p) => String(p.title ?? p.name ?? '').startsWith(prefix));
  const row = rowsOf(must(await api('GET', '/api/projects'), 200, 'list projects')).find((p) => p.regulatoryProgramId === program?.id);
  return row ? Number(row.id) : null;
}

async function engines(api, id) {
  const get = async (path) => must(await api('GET', path), 200, path);
  const summary = await get(`/api/project-sections/summary?project_id=${id}`);
  const timeline = await get(`/api/project-sections/timeline?project_id=${id}`);
  const tasks = rowsOf(await get(`/api/concept2cure/projects/${id}/tasks`));
  const rollup = (await get(`/api/project-hierarchy/${id}/rollup`)).rollup ?? {};
  return {
    sectionsTracked: summary.overall?.total, sectionsWithOwner: summary.overall?.assigned, sectionsOverdue: summary.overall?.overdue,
    sectionOwners: (summary.teamWorkload ?? []).length,
    timeline: { sectionDeadlines: timeline.totalSectionDeadlines, milestones: timeline.totalMilestones },
    milestoneTasks: tasks.length, tasksByStatus: tasks.reduce((m, t) => ({ ...m, [t.status]: (m[t.status] ?? 0) + 1 }), {}),
    rollup: { workProjects: rollup.childCount, tasksAcrossHierarchy: rollup.totalTasks, done: rollup.completedTasks,
      blocked: rollup.blockedTasks, overdue: rollup.overdueTasks, worstRiskLevel: rollup.worstRiskLevel ?? null },
  };
}

const ctx = await connect({ baseUrl: process.argv[2], email: process.argv[3] });
const out = { at: new Date().toISOString(), organizationId: ctx.identity.organizationId, projects: {} };
for (const [label, prefix] of PROJECTS) {
  const id = await projectIdOf(ctx.api, prefix);
  out.projects[label] = id === null ? { error: 'no project row' } : { projectId: id, ...(await engines(ctx.api, id)) };
}
const blockers = rowsOf(must(await ctx.api('GET', '/api/submission-ops/blockers'), 200, 'blockers'));
const due = must(await ctx.api('GET', '/api/submission-ops/due-soon'), 200, 'due soon').data?.canonicalTasks ?? [];
const findings = must(await ctx.api('GET', '/api/sentinel/findings?status=open&limit=20'), 200, 'sentinel');
out.atRisk = { sentinelOpenFindings: findings.total, blockers: blockers.length,
  dueOrOverdueIn7Days: due.map((w) => `${w.title} (due ${String(w.due_at).slice(0, 10)})`) };
console.info(JSON.stringify(out, null, 2));
