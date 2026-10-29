/**
 * AnA skills — mounted at /api/ana-skills (Admin and access → Skills).
 *
 *   GET  /library                     The platform library as this organization has it set.
 *   GET  /library/:key                One library skill, whole.
 *   PUT  /library/:key/enabled        Turn a library skill on or off. Body { enabled, reason }.
 *   GET  /organization                The organization's own skills (?archived=1 for history).
 *   POST /organization                Create one. Body: the skill and a reason.
 *   PUT  /organization/:id            Change one (the whole skill). Body: the skill and a reason.
 *   GET  /organization/:id/history    Its versions: who changed it, when, why (the audit rows).
 *   GET  /available                   What a person can choose in AnA's composer (?project=).
 *   GET  /projects/:project           The project's skill settings and its own skills.
 *                                     :project is the program id the shell holds, or the project number.
 *   PUT  /projects/:project/settings/:key
 *                                     Deploy a skill to the project ('always'), turn it off there
 *                                     ('off'), or clear the project's setting (null). Body { state, reason }.
 *   POST /projects/:project/skills    Write a skill for the project. Body: the skill and a reason.
 *   PUT  /projects/:project/skills/:id
 *                                     Change one of the project's skills.
 *   GET  /usage                       How often AnA used each skill (?days=30), from the turn
 *                                     records. Administrators only: it describes the organization's
 *                                     activity.
 *   POST /test                        Which skills AnA would load for a question, and why;
 *                                     with `draft`, as if an unsaved skill were active (tuning);
 *                                     with `project`, as in that project.
 *
 * Reads are for any member of the organization: the skills are the methods AnA
 * follows for them; a project's are for those the project admits. A change to
 * the organization's skills is an administrator's (admin or owner); a change to
 * a project's skills is for whoever the project admits to write
 * (requireProjectAdmission). Every change takes a stated reason (the shared
 * 8-character floor) and commits with its chained audit row on the request's
 * tenant-scoped connection
 * (server/services/account-skill-bundles.ts). A test selects and explains; it
 * loads nothing and records nothing.
 *
 * Design: docs/design/ANA_SKILLS_2026-10-22.md.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { requestConnectable, requestPgClient } from '../db/requestDb';
import { clientIpOf } from '../utils/client-ip';
import { createScopedLogger } from '../utils/logger';
import { requireGovernedReason } from './governed-reason';
import {
  OrgSkillRefusal,
  createOrgSkill,
  listOrgSkills,
  readSkillSettings,
  setLibrarySkillEnabled,
  updateOrgSkill,
  type OrgSkillRecord,
  type SkillActor,
} from '../services/account-skill-bundles';
import { getSkillLibrary, getLibrarySkill } from '../services/ana/skills/library/index';
import { selectTurnSkills, therapeuticAreaOf } from '../services/ana/skills/turn-skills';
import { libraryDetail, librarySummary, orgSkillDto, selectionDto } from '../services/ana/skills/admin-view';
import { fieldsOf, firstIssue, orgSkillBody } from '../services/ana/skills/org-skill-input';
import { PROJECT_ALWAYS_MAX, orgSkillKey } from '@shared/ana/skills';
import { readOrgSkillHistory } from '../services/ana/skills/history';
import { readSkillUsage } from '../services/ana/skills/usage';
import { readProjectSkillSettings, setProjectSkillState } from '../services/ana/skills/project-skills';
import { orgSkillsForProject } from '../services/ana/skills/turn-skills';
import { availableSkills, projectSettingsDto } from '../services/ana/skills/admin-view';
import { ProjectAdmissionRefusal, requireProjectAdmission } from './c2c/project-access';
import { AnaProjectScopeError, admitAnaProjectScope } from '../services/ana/project-scope-admission';

const router = Router();
const log = createScopedLogger('ana-skills');
router.use(createRateLimiter());

const writeGuard = requireRole('admin', 'owner');

function positiveInt(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

function orgOf(req: Request, res: Response): number | null {
  const orgId = positiveInt((req as any).user?.organizationId);
  if (orgId === null) {
    res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization context required.' } });
  }
  return orgId;
}

function actorOf(req: Request, res: Response): SkillActor | null {
  const userId = positiveInt((req as any).user?.id);
  if (userId === null) {
    res.status(401).json({ error: { code: 'NO_USER', message: 'A signed-in user is required to change skills.' } });
    return null;
  }
  const name = (req as any).user?.name;
  return {
    userId,
    name: typeof name === 'string' ? name : null,
    ipAddress: clientIpOf(req),
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}

/** A refusal the store stated, or a failure that says only what did not happen. */
function failed(res: Response, err: unknown, message: string): Response {
  if (err instanceof OrgSkillRefusal) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  log.error(message, { err: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ error: { code: 'INTERNAL', message } });
}

// ─── Library ────────────────────────────────────────────────────────────────

router.get('/library', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  try {
    const client = requestPgClient(req);
    const [settings, orgSkills] = await Promise.all([readSkillSettings(client, orgId), listOrgSkills(client, orgId)]);
    const library = getSkillLibrary();
    return res.json({
      skills: library.skills.map(s => librarySummary(s, settings, orgSkills)),
      // Skills the registry left out of this build, by key: never served, never hidden.
      withheld: Array.from(new Set(library.problems.map(p => p.key))),
    });
  } catch (err) {
    return failed(res, err, 'The skill library could not be read.');
  }
});

router.get('/library/:key', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const skill = getLibrarySkill(String(req.params.key));
  if (!skill) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That skill is not in the library.' } });
  try {
    const client = requestPgClient(req);
    const [settings, orgSkills] = await Promise.all([readSkillSettings(client, orgId), listOrgSkills(client, orgId)]);
    return res.json({ skill: libraryDetail(skill, settings, orgSkills) });
  } catch (err) {
    return failed(res, err, 'The skill could not be read.');
  }
});

const enabledBody = z.object({ enabled: z.boolean(), reason: z.unknown() });

router.put('/library/:key/enabled', writeGuard, async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const actor = actorOf(req, res);
  if (!actor) return;
  const key = String(req.params.key);
  if (!getLibrarySkill(key)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That skill is not in the library.' } });
  }
  const parsed = enabledBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID', message: 'Say whether the skill is on or off.' } });
  }
  const reason = requireGovernedReason(parsed.data.reason);
  if (!reason.ok) return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: reason.error } });
  try {
    const result = await setLibrarySkillEnabled(requestConnectable(req), orgId, key, parsed.data.enabled, { reason: reason.reason, actor });
    return res.json({ key, ...result, audited: result.changed });
  } catch (err) {
    return failed(res, err, 'The skill was not changed.');
  }
});

// ─── The organization's own skills ──────────────────────────────────────────

router.get('/organization', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  try {
    const skills = await listOrgSkills(requestPgClient(req), orgId, { includeArchived: req.query.archived === '1' });
    return res.json({ skills: skills.map(orgSkillDto) });
  } catch (err) {
    return failed(res, err, 'The organization\u2019s skills could not be read.');
  }
});

router.post('/organization', writeGuard, async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const actor = actorOf(req, res);
  if (!actor) return;
  const parsed = orgSkillBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: { code: 'INVALID_SKILL', message: firstIssue(parsed.error) } });
  const reason = requireGovernedReason(parsed.data.reason);
  if (!reason.ok) return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: reason.error } });
  try {
    // The organization's own: a project's skill is written from the project.
    const fields = { ...fieldsOf(parsed.data), projectId: null };
    const created = await createOrgSkill(requestConnectable(req), orgId, fields, { reason: reason.reason, actor });
    return res.status(201).json({ skill: orgSkillDto(created), audited: true });
  } catch (err) {
    return failed(res, err, 'The skill was not created.');
  }
});

router.put('/organization/:id', writeGuard, async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const actor = actorOf(req, res);
  if (!actor) return;
  const id = positiveInt(req.params.id);
  if (id === null) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That skill does not exist in this organization.' } });
  const parsed = orgSkillBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: { code: 'INVALID_SKILL', message: firstIssue(parsed.error) } });
  const reason = requireGovernedReason(parsed.data.reason);
  if (!reason.ok) return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: reason.error } });
  try {
    const updated = await updateOrgSkill(requestConnectable(req), orgId, id, fieldsOf(parsed.data), { reason: reason.reason, actor });
    return res.json({ skill: orgSkillDto(updated), audited: true });
  } catch (err) {
    return failed(res, err, 'The skill was not changed.');
  }
});

router.get('/organization/:id/history', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const id = positiveInt(req.params.id);
  if (id === null) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That skill does not exist in this organization.' } });
  try {
    const history = await readOrgSkillHistory(requestPgClient(req), orgId, id);
    if (!history) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That skill does not exist in this organization.' } });
    return res.json({ history });
  } catch (err) {
    return failed(res, err, 'The skill\u2019s history could not be read.');
  }
});

// ─── Use ─────────────────────────────────────────────────────────────────────

router.get('/usage', writeGuard, async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const days = positiveInt(req.query.days ?? '30');
  if (days === null) return res.status(400).json({ error: { code: 'INVALID', message: 'Say how many days to count, as a whole number.' } });
  try {
    return res.json(await readSkillUsage(requestPgClient(req), orgId, days));
  } catch (err) {
    return failed(res, err, 'Skill use could not be read.');
  }
});

// ─── Choosing skills: the conversation and the project ──────────────────────

/**
 * The project a request names, as its numeric id, once the request is admitted
 * to it; or null, with the refusal already answered. The reference may be the
 * program's id (what the v2 shell holds) or the project's number: it is
 * resolved and read-admitted exactly as AnA's turn admits its project
 * (admitAnaProjectScope), so the skills a project shows are the ones its turns
 * load. A change also needs the project's write admission.
 */
async function projectOf(req: Request, res: Response, ref: unknown, forWrite: boolean): Promise<number | null> {
  try {
    const admitted = await admitAnaProjectScope(requestPgClient(req), {
      projectRef: ref,
      organizationId: (req as any).user?.organizationId,
      userId: (req as any).user?.id,
    });
    if (admitted.projectId === null) {
      res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' } });
      return null;
    }
    if (forWrite) await requireProjectAdmission(req, String(admitted.projectId), true);
    return admitted.projectId;
  } catch (err) {
    if (err instanceof AnaProjectScopeError || err instanceof ProjectAdmissionRefusal) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return null;
    }
    throw err;
  }
}

/** Whether the request may change the project's skills; never throws. */
async function mayChangeProject(req: Request, projectId: number): Promise<boolean> {
  try {
    await requireProjectAdmission(req, String(projectId), true);
    return true;
  } catch {
    return false;
  }
}

router.get('/available', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const ref = typeof req.query.project === 'string' && req.query.project.trim() ? req.query.project.trim() : null;
  try {
    const projectId = ref === null ? null : await projectOf(req, res, ref, false);
    if (ref !== null && projectId === null) return;
    const client = requestPgClient(req);
    const [settings, orgSkills, projectSettings] = await Promise.all([
      readSkillSettings(client, orgId),
      listOrgSkills(client, orgId),
      projectId !== null ? readProjectSkillSettings(client, orgId, projectId) : Promise.resolve(null),
    ]);
    const skills = availableSkills(
      getSkillLibrary().skills,
      orgSkillsForProject(orgSkills, projectId),
      settings,
      projectId !== null && projectSettings ? { id: projectId, settings: projectSettings } : null,
    );
    return res.json({ skills });
  } catch (err) {
    return failed(res, err, 'The skills could not be read.');
  }
});

router.get('/projects/:project', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  try {
    const projectId = await projectOf(req, res, req.params.project, false);
    if (projectId === null) return;
    const client = requestPgClient(req);
    const [orgSkills, projectSettings, canChange] = await Promise.all([
      listOrgSkills(client, orgId, { includeArchived: true }),
      readProjectSkillSettings(client, orgId, projectId),
      mayChangeProject(req, projectId),
    ]);
    const library = getSkillLibrary().skills;
    const names = new Map<string, string>([
      ...library.map(l => [l.key, l.name] as [string, string]),
      ...orgSkills.map(r => [orgSkillKey(r.bundleId), r.name] as [string, string]),
    ]);
    // A library skill the organization replaced is named as the organization named it.
    for (const r of orgSkills) if (r.extensionMode === 'replace' && r.extendsSkillKey && r.status !== 'archived') names.set(r.extendsSkillKey, r.name);
    return res.json({
      projectId,
      settings: projectSettingsDto(projectSettings, names),
      skills: orgSkills.filter(r => r.projectId === projectId).map(orgSkillDto),
      alwaysMax: PROJECT_ALWAYS_MAX,
      canChange,
    });
  } catch (err) {
    return failed(res, err, 'The project’s skills could not be read.');
  }
});

const projectSettingBody = z.object({ state: z.enum(['always', 'off']).nullable(), reason: z.unknown() });

router.put('/projects/:project/settings/:key', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const actor = actorOf(req, res);
  if (!actor) return;
  const key = String(req.params.key);
  const parsed = projectSettingBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID', message: 'Say whether the skill is always loaded in this project, off in it, or cleared.' } });
  }
  const reason = requireGovernedReason(parsed.data.reason);
  if (!reason.ok) return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: reason.error } });
  try {
    const projectId = await projectOf(req, res, req.params.project, true);
    if (projectId === null) return;
    const client = requestPgClient(req);
    const [settings, orgSkills] = await Promise.all([readSkillSettings(client, orgId), listOrgSkills(client, orgId)]);
    // Only a skill the organization has on (and that applies in this project)
    // can be deployed; any skill it holds can be turned off or cleared.
    const known = getLibrarySkill(key) || orgSkills.some(r => orgSkillKey(r.bundleId) === key && (r.projectId === null || r.projectId === projectId));
    if (!known) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That skill does not exist in this organization.' } });
    if (parsed.data.state === 'always') {
      const available = availableSkills(getSkillLibrary().skills, orgSkillsForProject(orgSkills, projectId), settings, null);
      if (!available.some(s => s.key === key)) {
        return res.status(409).json({
          error: { code: 'SKILL_NOT_ON', message: 'That skill is off or not active for this organization, so it cannot be deployed. Nothing was changed.' },
        });
      }
    }
    const result = await setProjectSkillState(requestConnectable(req), { organizationId: orgId, projectId }, key, parsed.data.state, {
      reason: reason.reason,
      actor,
    });
    return res.json({ key, projectId, ...result, audited: result.changed });
  } catch (err) {
    return failed(res, err, 'The project’s skill was not changed.');
  }
});

router.post('/projects/:project/skills', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const actor = actorOf(req, res);
  if (!actor) return;
  // The project is fixed below, once admitted; 1 stands in only to validate the shape.
  const parsed = orgSkillBody.safeParse({ ...(req.body ?? {}), projectId: 1 });
  if (!parsed.success) return res.status(422).json({ error: { code: 'INVALID_SKILL', message: firstIssue(parsed.error) } });
  const reason = requireGovernedReason(parsed.data.reason);
  if (!reason.ok) return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: reason.error } });
  try {
    const projectId = await projectOf(req, res, req.params.project, true);
    if (projectId === null) return;
    const fields = { ...fieldsOf(parsed.data), projectId };
    const created = await createOrgSkill(requestConnectable(req), orgId, fields, { reason: reason.reason, actor });
    return res.status(201).json({ skill: orgSkillDto(created), audited: true });
  } catch (err) {
    return failed(res, err, 'The skill was not created.');
  }
});

router.put('/projects/:project/skills/:id', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const actor = actorOf(req, res);
  if (!actor) return;
  const id = positiveInt(req.params.id);
  if (id === null) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That skill does not exist in this project.' } });
  const parsed = orgSkillBody.safeParse({ ...(req.body ?? {}), projectId: 1 });
  if (!parsed.success) return res.status(422).json({ error: { code: 'INVALID_SKILL', message: firstIssue(parsed.error) } });
  const reason = requireGovernedReason(parsed.data.reason);
  if (!reason.ok) return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: reason.error } });
  try {
    const projectId = await projectOf(req, res, req.params.project, true);
    if (projectId === null) return;
    const stored = await requestPgClient(req).query(
      `SELECT project_id FROM account_skill_bundles WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    // Only this project's own skills are changed from the project.
    if (Number(stored.rows[0]?.project_id) !== projectId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That skill does not exist in this project.' } });
    }
    const updated = await updateOrgSkill(requestConnectable(req), orgId, id, fieldsOf(parsed.data), { reason: reason.reason, actor });
    return res.json({ skill: orgSkillDto(updated), audited: true });
  } catch (err) {
    return failed(res, err, 'The skill was not changed.');
  }
});

// ─── Test a question ────────────────────────────────────────────────────────

const testBody = z.object({
  message: z.string().trim().min(1).max(4000),
  surfaceId: z.string().max(64).nullable().optional(),
  documentType: z.string().max(64).nullable().optional(),
  submissionType: z.string().max(64).nullable().optional(),
  therapeuticArea: z.string().max(64).nullable().optional(),
  invokedKeys: z.array(z.string().max(160)).max(10).optional(),
  // Test as in this project (its program id or number): its deployed skills,
  // its own skills, what it turned off.
  project: z.union([z.string().max(64), z.number().int().positive()]).nullable().optional(),
  // A skill being written or tuned, tested as if it were active. When it is a
  // change to a stored skill, `draftOf` names that skill, and the draft stands
  // in for it. Nothing is stored.
  draft: z.unknown().optional(),
  draftOf: z.number().int().positive().nullable().optional(),
});

const DRAFT_BUNDLE_ID = 'draft';

/** The draft as the organization skill it would become, or the reason it cannot be tested. */
function draftRecord(raw: unknown, projectId: number | null): { record: OrgSkillRecord } | { error: string } {
  const body = { ...(raw && typeof raw === 'object' ? raw : {}), status: 'active', projectId, reason: null };
  const parsed = orgSkillBody.safeParse(body);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  return {
    record: { ...fieldsOf(parsed.data), id: 0, bundleId: DRAFT_BUNDLE_ID, status: 'active', version: 0, updatedAt: null },
  };
}

type TestBody = z.infer<typeof testBody>;

/** The turn a test stands for: the question and context it was given, in the organization. */
function testTurnOf(organizationId: number, body: TestBody) {
  return {
    organizationId,
    message: body.message,
    surfaceId: body.surfaceId ?? null,
    documentType: body.documentType ?? null,
    submissionType: body.submissionType ?? null,
    invokedKeys: body.invokedKeys ?? [],
  };
}

function testOverridesOf(body: TestBody, draft: { record: OrgSkillRecord } | null) {
  return {
    draft: draft?.record ?? null,
    draftOf: body.draftOf ?? null,
    therapeuticArea: therapeuticAreaOf(body.therapeuticArea ?? null),
  };
}

router.post('/test', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const parsed = testBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID', message: 'Type a question to test.' } });
  const ref = parsed.data.project ?? null;
  try {
    const projectId = ref === null ? null : await projectOf(req, res, ref, false);
    if (ref !== null && projectId === null) return;
    const tried = parsed.data.draft === undefined ? null : draftRecord(parsed.data.draft, projectId);
    if (tried && 'error' in tried) {
      return res.status(422).json({ error: { code: 'INVALID_SKILL', message: tried.error } });
    }
    const draft = tried as { record: OrgSkillRecord } | null;
    const turn = { ...testTurnOf(orgId, parsed.data), projectId };
    const selection = await selectTurnSkills(requestPgClient(req), turn, testOverridesOf(parsed.data, draft));
    return res.json({ selection: selectionDto(selection), draftKey: draft ? orgSkillKey(DRAFT_BUNDLE_ID) : null });
  } catch (err) {
    return failed(res, err, 'The question could not be tested.');
  }
});

export default router;
