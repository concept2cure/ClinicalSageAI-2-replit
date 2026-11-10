/**
 * One rule for "which sections does this device filing require" (P-107 item 3,
 * docs/LAUNCH_DEFINITION_OF_DONE.md).
 *
 * A 510(k) or De Novo is filed as an eSTAR, and which eSTAR sections a device
 * owes turns on the device. The platform gave two answers:
 *
 *   - the rule pack's `mandatory` flag, a constant per outline section, which
 *     the Vault's Library showed as Required or Optional (project-vault.ts,
 *     `leafDoc`), with a blocker on a mandatory section holding nothing;
 *   - the eSTAR mapper's per-device slots (pathway-engines/estar/estar-mapper),
 *     decided from the device answers the project gave at intake, which filing
 *     readiness is read from.
 *
 * So a sterile device's Sterilization section read Optional in the Library
 * while readiness reported it missing, and the Library put a blocker on bench
 * testing that readiness, holding animal testing, did not.
 *
 * The one rule: the mapper decides every outline section one of its slots
 * takes. A section no slot takes keeps its pack's flag (the mapper says
 * nothing of it, and dropping a mark the pack states would under-ask).
 *
 * Here the two are asked of the same project, on real PostgreSQL, as
 * app_service under RLS:
 *   - the Library, through the real Vault read;
 *   - the mapper, through the functions readiness itself calls (`mapToEstar`
 *     over `sectionsToLeaves(governedSectionsToDeviceSections(...))`), with the
 *     device answers read from the project by `deviceFlagsFromMetadata`.
 *
 * Every section where they differ is named in the failure.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';

const RUN = randomUUID().slice(0, 12);
const PROBE = `dbtest-vestar-${RUN} `;
const BODY = 'Finished section text for the eSTAR, reviewed and approved. '.repeat(6);

type Tenant = { orgId: number; orgUuid: string; programId: string };
type PackNode = { key: string; parent_key: string | null; label: string; mandatory: boolean; path_order: number };
type Leaf = { num: string; title: string; type: string; blocker?: boolean; flag?: string; preview: string };
type EstarType = '510k' | 'de_novo';
type Says = 'required' | 'undetermined' | 'when-applicable' | 'not-applicable' | 'not-required';

let owner: Pool;
let userId: number;
let org: { id: number; uuid: string };

async function appFor(t: Tenant): Promise<express.Express> {
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId, tenantId: t.orgId, userRole: 'admin',
      user: { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role: 'admin' },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

/** A device project. `metadata` is where intake stores the device answers (`deviceFlags`). */
async function program(code: string, programType: string, productType: string, metadata: Record<string, unknown>): Promise<Tenant> {
  const p = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name, metadata)
     VALUES ($1, $2, $3, $4, $5, 'FDA', 'NeuroPanel', $6::json) RETURNING id`,
    [`${PROBE}${code}`, `${code}-${RUN}`, org.id, programType, productType, JSON.stringify(metadata)]);
  const t = { orgId: org.id, orgUuid: org.uuid, programId: String(p.rows[0].id) };
  await seedVaultFixtureParent(owner, t, { userId, namespace: `${PROBE}${code}` });
  return t;
}

/** The project's governed filing document, bound to a live rule pack, with finished text in `written`. */
async function filing(t: Tenant, docType: string, agency: string, version: string, written: string[] = []): Promise<{ id: string; pack: PackNode[] }> {
  const pack = (await owner.query(
    `SELECT required_sections FROM c2c_rule_packs WHERE doc_type = $1 AND agency = $2 AND version = $3`,
    [docType, agency, version])).rows[0]?.required_sections as PackNode[] | undefined;
  if (!pack?.length) throw new Error(`The fixture database has no ${docType}:${agency} ${version} pack.`);
  const id = `dbtest-vestar-${docType}-${randomUUID()}`;
  await owner.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, t.orgId, t.programId, docType, agency, version, `${PROBE}${docType}`, userId]);
  for (const key of written) {
    const node = pack.find((n) => n.key === key);
    if (!node) throw new Error(`${version} has no section ${key}.`);
    await owner.query(
      `INSERT INTO c2c_document_sections (document_id, section_key, parent_key, label, path_order, mandatory, status, content)
       VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7::jsonb)`,
      [id, node.key, node.parent_key, node.label, node.path_order, node.mandatory, JSON.stringify({ text: BODY })]);
  }
  return { id, pack };
}

/** The Library's leaves under one filing document, by section key. */
async function libraryLeaves(t: Tenant, documentId: string): Promise<Map<string, Leaf>> {
  const res = await request(await appFor(t)).get(`/api/c2c/project-vault/${t.programId}`);
  expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(200);
  const folder = (res.body.data.tree as Array<{ filingDocumentId?: string; children: unknown[] }>).find((f) => f.filingDocumentId === documentId);
  expect(folder, 'the filing document is in the Library').toBeTruthy();
  const out = new Map<string, Leaf>();
  const walk = (nodes: unknown[]) => {
    for (const n of nodes as Array<Leaf & { children?: unknown[] }>) {
      if (Array.isArray(n.children)) walk(n.children);
      else out.set(n.num, n);
    }
  };
  walk(folder!.children);
  return out;
}

const STRONGEST: Says[] = ['required', 'undetermined', 'when-applicable', 'not-applicable', 'not-required'];
type Answer = { says: Says; blocks: boolean; by: 'mapper' | 'pack' };

/**
 * The one rule's answer for each outline section of this device, through the
 * functions filing readiness calls.
 *
 * `says`: the section is authored alone and finished, and the slots it
 * supplies are read with their applicability for this device. A slot the
 * device answered "no" to is "not applicable" when finished content there
 * would contradict that answer (the mapper's `contradictions`), and "not
 * required" otherwise. A section that supplies no slot keeps the pack's flag.
 * `blocks`: a slot the section supplies is required, or its question was never
 * answered, and nothing the project has finished supplies it. For a section
 * the pack decides: it is mandatory and holds nothing.
 */
async function oneRule(type: EstarType, variant: 'device' | 'ivd', metadata: unknown, pack: PackNode[], written: string[]): Promise<Map<string, Answer>> {
  const { mapToEstar } = await import('../../server/services/pathway-engines/estar/estar-mapper');
  const { governedSectionsToDeviceSections, sectionsToLeaves } = await import('../../server/services/pathway-engines/estar/estar-content-leaves');
  const { deviceFlagsFromMetadata } = await import('../../server/services/pathway-engines/estar/program-device-flags');
  const flags = deviceFlagsFromMetadata(metadata);
  const leavesOf = (nodes: PackNode[]) => sectionsToLeaves(governedSectionsToDeviceSections(
    nodes.map((n) => ({ section_key: n.key, label: n.label, status: 'approved', content: { text: BODY } }))));
  const project = mapToEstar({ type, variant, flags, leaves: leavesOf(pack.filter((n) => written.includes(n.key))) });
  const supplied = new Set(project.sections.filter((s) => s.present).map((s) => s.id));
  const out = new Map<string, Answer>();
  for (const node of pack) {
    const alone = mapToEstar({ type, variant, flags, leaves: leavesOf([node]) });
    const lit = alone.sections.filter((s) => s.present);
    if (lit.length === 0) {
      out.set(node.key, { by: 'pack', says: node.mandatory ? 'required' : 'not-required', blocks: node.mandatory && !written.includes(node.key) });
      continue;
    }
    const contradicted = new Set(alone.summary.contradictions.map((c) => c.section));
    const each: Says[] = lit.map((s) => (s.applicability === 'not-applicable'
      ? (contradicted.has(s.id) ? 'not-applicable' : 'not-required')
      : s.applicability));
    out.set(node.key, {
      by: 'mapper',
      says: STRONGEST.find((r) => each.includes(r)) ?? 'not-required',
      blocks: lit.some((s) => (s.applicability === 'required' || s.applicability === 'undetermined') && !supplied.has(s.id)),
    });
  }
  return out;
}

/** The Library's word for each answer. */
const MARK: Record<Says, RegExp> = {
  required: /^Required(: one of .+)?$/,
  undetermined: /^Not decided$/,
  'when-applicable': /^When applicable$/,
  'not-applicable': /^Not applicable$/,
  'not-required': /^Optional$/,
};

/** Every Library leaf whose mark or blocker is not the mapper's answer, one line each. */
function differences(leaves: Map<string, Leaf>, mapper: Map<string, Answer>): string[] {
  const out: string[] = [];
  for (const [key, leaf] of leaves) {
    const m = mapper.get(key);
    if (!m) { out.push(`${key} ${leaf.title}: in the Library, not in the pack`); continue; }
    if (!MARK[m.says].test(leaf.type)) out.push(`${key} ${leaf.title}: the Library says "${leaf.type}", the mapper says ${m.says}`);
    if (Boolean(leaf.blocker) !== m.blocks) out.push(`${key} ${leaf.title}: the Library ${leaf.blocker ? 'blocks' : 'does not block'}, the mapper ${m.blocks ? 'blocks' : 'does not block'}`);
  }
  return out;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  userId = Number((await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Dana Device', 'x', 'active') RETURNING id`,
    [`dbtest-vestar-${RUN}@example.test`])).rows[0].id);
  const o = await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}org`, `dbtest-vestar-${RUN}`]);
  org = { id: Number(o.rows[0].id), uuid: String(o.rows[0].uuid) };
}, 60_000);

afterAll(async () => {
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe('a 510(k): the Library and the eSTAR mapper give one answer', () => {
  /* The device: sterile, containing software; not a cyber device, not
     implantable, not a combination product, not CLIA-waived, no clinical data.
     Finished so far: the cover letter (A1) and animal testing (E6). */
  const STERILE_SOFTWARE = { deviceFlags: ['sterile', 'softwareAiMl'] };
  const WRITTEN = ['A1', 'E6'];
  let t: Tenant;
  let doc: { id: string; pack: PackNode[] };

  beforeAll(async () => {
    t = await program('DBTEST-VESTAR-K', '510k', 'device', STERILE_SOFTWARE);
    doc = await filing(t, 'k510', 'fda', 'fda-estar-510k-v1.1', WRITTEN);
    await assertVaultFixtureRuntime(t);
  }, 60_000);

  it('every section: the Library\'s mark and blocker are the mapper\'s answer for this device', async () => {
    const leaves = await libraryLeaves(t, doc.id);
    const mapper = await oneRule('510k', 'device', STERILE_SOFTWARE, doc.pack, WRITTEN);
    expect(leaves.size).toBe(doc.pack.filter((n) => !doc.pack.some((c) => c.parent_key === n.key)).length);
    expect(differences(leaves, mapper)).toEqual([]);
  });

  it('D4 Sterilization is required of a sterile device, and blocks while D4 and D5 are empty', async () => {
    const d4 = (await libraryLeaves(t, doc.id)).get('D4')!;
    expect(d4.type).toBe('Required: one of D4, D5');
    expect(d4.blocker).toBe(true);
    expect(d4.flag).toBe('Mandatory section — no content yet in D4 or D5');
    expect(d4.preview).toContain('required: the project answered yes to “Sterile”');
  });

  it('D6 risk management is required, as the mapper requires it of every 510(k)', async () => {
    const d6 = (await libraryLeaves(t, doc.id)).get('D6')!;
    expect(d6.type).toBe('Required');
    expect(d6.blocker).toBe(true);
    expect(d6.flag).toBe('Mandatory section — no content yet');
  });

  it('performance testing is one requirement: animal testing on file, so bench testing does not block', async () => {
    const leaves = await libraryLeaves(t, doc.id);
    for (const key of ['E5', 'E6', 'E7']) {
      expect(leaves.get(key)!.type, key).toBe('Required: one of E5, E6, E7');
      expect(leaves.get(key)!.blocker, key).toBeUndefined();
    }
  });

  it('a section no mapper slot takes keeps its pack\'s flag: A2 and B3 stay required', async () => {
    const leaves = await libraryLeaves(t, doc.id);
    const rule = await oneRule('510k', 'device', STERILE_SOFTWARE, doc.pack, WRITTEN);
    const heldByPack = doc.pack.filter((n) => rule.get(n.key)!.by === 'pack' && leaves.has(n.key));
    expect(heldByPack.map((n) => n.key)).toEqual(['A2', 'A3', 'B3', 'D1', 'F1', 'G1', 'G2']);
    expect(heldByPack.filter((n) => n.mandatory).map((n) => n.key)).toEqual(['A2', 'B3']);
    for (const key of ['A2', 'B3']) {
      expect(leaves.get(key)!.type, key).toBe('Required');
      expect(leaves.get(key)!.flag, key).toBe('Mandatory section — no content yet');
    }
  });

  it('follows the device: once the project answers that it is not sterile, D4 is not applicable', async () => {
    const answered = { deviceFlags: ['softwareAiMl'] };
    await owner.query(`UPDATE regulatory_programs SET metadata = $2::json WHERE id = $1`, [t.programId, JSON.stringify(answered)]);
    try {
      const leaves = await libraryLeaves(t, doc.id);
      expect(leaves.get('D4')!.type).toBe('Not applicable');
      expect(leaves.get('D4')!.blocker).toBeUndefined();
      // Shelf life is owed by a non-sterile device too: content there contradicts nothing.
      expect(leaves.get('D5')!.type).toBe('Optional');
      expect(differences(leaves, await oneRule('510k', 'device', answered, doc.pack, WRITTEN))).toEqual([]);
    } finally {
      await owner.query(`UPDATE regulatory_programs SET metadata = $2::json WHERE id = $1`, [t.programId, JSON.stringify(STERILE_SOFTWARE)]);
    }
  });
});

describe('a De Novo whose device questions were never answered', () => {
  let t: Tenant;
  let doc: { id: string; pack: PackNode[] };

  beforeAll(async () => {
    t = await program('DBTEST-VESTAR-D', 'de_novo', 'device', {});
    doc = await filing(t, 'denovo', 'fda', 'fda-estar-denovo-v1.1');
  }, 60_000);

  it('every section: the Library\'s mark and blocker are the mapper\'s answer', async () => {
    const leaves = await libraryLeaves(t, doc.id);
    expect(differences(leaves, await oneRule('de_novo', 'device', {}, doc.pack, []))).toEqual([]);
  });

  it('a section no mapper slot takes keeps its pack\'s flag: B2, C2 and C4 stay required', async () => {
    const leaves = await libraryLeaves(t, doc.id);
    const rule = await oneRule('de_novo', 'device', {}, doc.pack, []);
    const heldByPack = doc.pack.filter((n) => rule.get(n.key)!.by === 'pack' && leaves.has(n.key));
    expect(heldByPack.map((n) => n.key)).toEqual(['A3', 'B2', 'B3', 'C2', 'C4', 'D7', 'D8', 'G1']);
    expect(heldByPack.filter((n) => n.mandatory).map((n) => n.key)).toEqual(['B2', 'C2', 'C4']);
    for (const key of ['B2', 'C2', 'C4']) expect(leaves.get(key)!.type, key).toBe('Required');
  });

  it('a section that turns on an unanswered question is not decided, never optional, and names the question', async () => {
    const d3 = (await libraryLeaves(t, doc.id)).get('D3')!;
    expect(d3.type).toBe('Not decided');
    expect(d3.blocker).toBe(true);
    expect(d3.flag).toBe('Not decided — the project has not answered “Sterile”');
  });
});

describe('where no eSTAR applies, the pack\'s flag is still the rule', () => {
  it.each([
    ['pma', 'fda', 'fda-pma-21cfr814-20-v1.1', 'pma'],
    ['mdr', 'ema', 'eu-mdr-2017-745-annex-ii-v1.0', 'mdr_td'],
    ['ivdr', 'ema', 'eu-ivdr-2017-746-annex-ii-v1.0', 'ivdr_td'],
  ])('%s:%s %s', async (docType, agency, version, programType) => {
    const t = await program(`DBTEST-VESTAR-${docType.toUpperCase()}`, programType, 'device', { deviceFlags: ['sterile'] });
    const doc = await filing(t, docType, agency, version);
    const leaves = await libraryLeaves(t, doc.id);
    expect(leaves.size).toBeGreaterThan(10);
    for (const [key, leaf] of leaves) {
      const node = doc.pack.find((n) => n.key === key)!;
      expect(leaf.type, key).toBe(node.mandatory ? 'Required' : 'Optional');
      expect(Boolean(leaf.blocker), key).toBe(Boolean(node.mandatory));
      if (node.mandatory) expect(leaf.flag, key).toBe('Mandatory section — no content yet');
    }
  });
});
