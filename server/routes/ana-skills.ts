/**
 * AnA skills — mounted at /api/ana-skills (Admin and access → Skills).
 *
 *   GET  /library                     The platform library as this organization has it set.
 *   GET  /library/:key                One library skill, whole.
 *   PUT  /library/:key/enabled        Turn a library skill on or off. Body { enabled, reason }.
 *   GET  /organization                The organization's own skills (?archived=1 for history).
 *   POST /organization                Create one. Body: the skill and a reason.
 *   PUT  /organization/:id            Change one (the whole skill). Body: the skill and a reason.
 *   POST /test                        Which skills AnA would load for a question, and why.
 *
 * Reads are for any member of the organization: the skills are the methods AnA
 * follows for them. A change is an administrator's (admin or owner), takes a
 * stated reason (the shared 8-character floor) and commits with its chained
 * audit row on the request's tenant-scoped connection
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
  type SkillActor,
} from '../services/account-skill-bundles';
import { getSkillLibrary, getLibrarySkill } from '../services/ana/skills/library/index';
import { buildSelectableSkills, segmentsAndRegionOf, therapeuticAreaOf } from '../services/ana/skills/turn-skills';
import { selectSkills } from '../services/ana/skills/selector';
import { libraryDetail, librarySummary, orgSkillDto, selectionDto } from '../services/ana/skills/admin-view';
import { fieldsOf, firstIssue, orgSkillBody } from '../services/ana/skills/org-skill-input';

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
    const created = await createOrgSkill(requestConnectable(req), orgId, fieldsOf(parsed.data), { reason: reason.reason, actor });
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

// ─── Test a question ────────────────────────────────────────────────────────

const testBody = z.object({
  message: z.string().trim().min(1).max(4000),
  surfaceId: z.string().max(64).nullable().optional(),
  documentType: z.string().max(64).nullable().optional(),
  submissionType: z.string().max(64).nullable().optional(),
  therapeuticArea: z.string().max(64).nullable().optional(),
  invokedKeys: z.array(z.string().max(160)).max(10).optional(),
});

router.post('/test', async (req: Request, res: Response) => {
  const orgId = orgOf(req, res);
  if (orgId === null) return;
  const parsed = testBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'INVALID', message: 'Type a question to test.' } });
  try {
    const client = requestPgClient(req);
    const [settings, orgSkills] = await Promise.all([readSkillSettings(client, orgId), listOrgSkills(client, orgId)]);
    const { skills } = buildSelectableSkills(getSkillLibrary().skills, orgSkills, settings);
    const { segments, region } = segmentsAndRegionOf(parsed.data.submissionType ?? null);
    const selection = selectSkills(skills, {
      message: parsed.data.message,
      surfaceId: parsed.data.surfaceId ?? null,
      documentType: parsed.data.documentType ?? null,
      segments,
      therapeuticArea: therapeuticAreaOf(parsed.data.therapeuticArea ?? null),
      submissionType: parsed.data.submissionType ?? null,
      region,
      invokedKeys: parsed.data.invokedKeys ?? [],
    });
    return res.json({ selection: selectionDto(selection) });
  } catch (err) {
    return failed(res, err, 'The question could not be tested.');
  }
});

export default router;
