/** Retained native fixtures; actual current authority remains in production readers. */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Pool, type QueryConfig, type QueryResultRow } from 'pg';
import request from 'supertest';
import { expect } from 'vitest';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import { authenticateToken } from '../../server/middleware/auth';
import { requireTenantContext } from '../../server/middleware/tenantContext';
import { LazyRequestDbClient, type RequestDbClient } from '../../server/middleware/lazyRequestDbClient';
import { activeJwtSecret } from '../../server/utils/jwtVerify';
import { createRevision } from '../../server/services/authoring/authoring-evidence';
import { nativeCatalogRunId, seedNativeCatalogProject, withNativeCatalogClient } from './catalog-native-fixture';

export interface ReadActor { id: number; organizationId: number; organizationUuid: string; role: string; email: string; token: string }
export interface ReadProgram { id: string; projectId: number; organizationId: number; owner: ReadActor }
export interface ReadSection { id: string; code: string; title: string; content: string; order: number }
export interface ReadDocument { id: string; title: string; program: ReadProgram | null; organizationId: number; sections: ReadSection[]; provenance: Record<string, unknown> | null }
export interface ReadFacts { posture: Record<string, unknown>; sql: string[]; pids: number[]; lazy: boolean }
export type AfterReadQuery = (sql: string) => Promise<void>;
const STORES = ['users', 'organization_users', 'regulatory_programs', 'projects', 'project_visibility_settings',
  'project_members', 'authoring_documents', 'authoring_sections', 'doc_permissions', 'authoring_comments', 'doc_revisions', 'authoring_citations'];
const POSTURE = `SELECT current_database() AS database,current_user AS role,pg_backend_pid() AS pid,
  r.rolsuper,r.rolbypassrls,current_setting('app.rls_enforce',true) AS enforcement,
  current_setting('app.current_tenant_id',true) AS tenant,current_setting('app.current_user_role',true) AS user_role,
  current_setting('app.bypass_rls',true) AS bypass,current_setting('app.is_admin',true) AS admin
  FROM pg_roles r WHERE r.rolname=current_user`;
export const readsProseOrMetadata = (sql: string) => sql.includes('d.title') || sql.includes('s.content') || /^SELECT provenance FROM/.test(sql);

export class NativeAuthoringReadFixture {
  readonly tag = `acr_${nativeCatalogRunId()}`;
  readonly owner = new Pool({ connectionString: databaseUrl, max: 3 });
  readonly app = express();
  readonly actors: Record<string, ReadActor> = {};
  readonly programs: Record<string, ReadProgram> = {};
  readonly documents: Record<string, ReadDocument> = {};
  readonly facts = new Map<string, ReadFacts>();
  readonly barriers = new Map<string, AfterReadQuery>();
  readonly observations: Record<string, unknown> = { namespace: this.tag, cases: {} };
  database = '';
  organizationId = 0;
  organizationUuid = '';
  foreignOrganizationId = 0;
  foreignOrganizationUuid = '';
  conversation = '';
  crossDocumentCommentId = '';

  async setup() {
    this.validateTargets();
    await this.verifyBeforeWrites();
    const home = await this.organization('home'); const foreign = await this.organization('foreign');
    this.organizationId = home.id; this.organizationUuid = home.uuid;
    this.foreignOrganizationId = foreign.id; this.foreignOrganizationUuid = foreign.uuid;
    for (const name of ['owner', 'reader', 'section', 'bystander', 'inactive', 'late-ou', 'late-role', 'late-sharing', 'late-section', 'late-email', 'late-status']) {
      await this.actor(name, name === 'owner' ? 'member' : 'viewer');
    }
    await this.actor('missing-ou', 'viewer', false); await this.actor('foreign', 'member', true, true);
    this.programs.public = await this.program('public');
    this.programs.private = await this.program('private', true);
    this.programs.foreign = await this.program('foreign', false, true);
    this.conversation = `${this.tag}-conversation`;
    for (const name of ['full', 'partial', 'object-private']) this.documents[name] = await this.document(name, this.programs.public, name === 'object-private' ? 1 : 2);
    this.documents['parent-private'] = await this.document('parent-private', this.programs.private, 1);
    this.documents.empty = await this.document('empty', this.programs.public, 0, { module: 'M3', status: 'FROZEN' });
    this.documents.historical = await this.document('historical', null, 0);
    this.documents['historical-private'] = await this.document('historical-private', null, 0);
    this.documents.foreign = await this.document('foreign', this.programs.foreign, 1, { foreign: true });
    for (const name of ['full', 'partial', 'parent-private', 'empty', 'historical']) await this.grant(this.documents[name], this.actors.reader);
    await this.grant(this.documents.full, this.actors.section);
    await this.grant(this.documents.partial, this.actors.section, this.documents.partial.sections[0]);
    for (const name of ['expired', 'revoked']) {
      this.documents[name] = await this.document(name, this.programs.public, 1);
      await this.grant(this.documents[name], this.actors.reader, undefined, name);
    }
    for (const suffix of ['ou', 'role', 'sharing', 'section', 'email', 'status']) {
      const name = `late-${suffix}`; const program = await this.program(name); this.programs[name] = program;
      const doc = await this.document(name, program, suffix === 'section' ? 2 : 1); this.documents[name] = doc;
      await this.grant(doc, this.actors[name], suffix === 'section' ? doc.sections[0] : undefined);
    }
    for (const name of ['full', 'partial', 'foreign']) await this.counters(this.documents[name]);
    // Legal same-tenant parent/section disagreement; the reader must not count
    // another private document's comment merely because this doc_id was recorded.
    this.crossDocumentCommentId = randomUUID();
    await this.owner.query(`INSERT INTO authoring_comments(id,doc_id,section_id,body,tenant_id,created_by)
      VALUES($1,$2,$3,$4,$5,$6)`, [this.crossDocumentCommentId, this.documents.partial.id,
      this.documents['object-private'].sections[0].id, `${this.tag} PRIVATE_OTHER_DOCUMENT_COMMENT`, this.organizationId, String(this.actors.owner.id)]);
    await new Promise(resolve => setTimeout(resolve, 1100));
    for (const actor of Object.values(this.actors)) this.mint(actor, actor.role === 'viewer' ? 'admin' : actor.role);
    await this.owner.query("UPDATE users SET status='inactive' WHERE id=$1", [this.actors.inactive.id]);
    await this.installRoutes();
    Object.assign(this.observations, { organizationId: this.organizationId, foreignOrganizationId: this.foreignOrganizationId,
      actors: Object.fromEntries(Object.entries(this.actors).map(([name, actor]) => [name, { id: actor.id, organizationId: actor.organizationId, persistedRole: actor.role }])),
      programs: Object.fromEntries(Object.entries(this.programs).map(([name, program]) => [name, { id: program.id, projectId: program.projectId, organizationId: program.organizationId }])),
      documents: Object.fromEntries(Object.entries(this.documents).map(([name, doc]) => [name, { id: doc.id, programId: doc.program?.id ?? null,
        organizationId: doc.organizationId, sectionIds: doc.sections.map(section => section.id), codes: doc.sections.map(section => section.code) }])),
      counterQualification: 'Retained legitimate native rows and canonical revision genesis; counts are not whole-platform audit qualification.' });
  }

  private validateTargets() {
    const configured = process.env.APP_DATABASE_URL;
    if (!configured) throw new Error('Actual restricted application target is required.');
    const owner = new URL(databaseUrl); const runtime = new URL(configured);
    if (runtime.username !== 'app_service' || owner.hostname !== runtime.hostname || owner.pathname !== runtime.pathname ||
        (owner.port || '5432') !== (runtime.port || '5432')) throw new Error('Owner/runtime native target mismatch.');
    this.database = decodeURIComponent(owner.pathname.slice(1));
    const approved = 'platform_ci_review_binding_blank_20261014_51cb8284';
    const local = this.database === approved && process.env.AUTHORING_CURRENT_READ_NATIVE_DATABASE === approved &&
      owner.hostname === '127.0.0.1' && owner.port === '55432';
    const ci = this.database === 'concept2cure-ri_dbtest' && process.env.CI === 'true' && process.env.NODE_ENV === 'test';
    if (!local && !ci) throw new Error('Explicit reviewed local QA target or canonical disposable CI target required.');
  }

  private async verifyBeforeWrites() {
    await withNativeCatalogClient({ organizationId: 1, organizationUuid: '', userId: 1, role: 'member', caller: 'authoring-native-posture-only' }, async q => {
      const row = (await q.query(POSTURE)).rows[0];
      expect(row).toMatchObject({ database: this.database, role: 'app_service', rolsuper: false, rolbypassrls: false, enforcement: 'on', bypass: '', admin: '' });
      this.observations.preflightRuntime = row;
    });
    expect((await this.owner.query('SELECT current_database() AS database')).rows[0].database).toBe(this.database);
    const stores = (await this.owner.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[]) ORDER BY relname`, [STORES])).rows;
    expect(stores).toHaveLength(STORES.length); expect(stores.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const columns = (await this.owner.query(`SELECT table_name,column_name,is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name=ANY($1::text[])`, [STORES])).rows;
    for (const [table, names] of Object.entries({ authoring_documents: ['client_program_id', 'provenance'],
      doc_permissions: ['principal_id', 'section_id', 'valid_from', 'valid_until', 'revoked_at'],
      doc_revisions: ['content_sha256', 'chain_sha256', 'prev_chain_sha256', 'origin', 'inputs'],
      authoring_comments: ['doc_id', 'section_id'], authoring_citations: ['section_id', 'payload_sha256'] })) {
      for (const name of names) expect(columns.some(row => row.table_name === table && row.column_name === name)).toBe(true);
    }
    const constraints = (await this.owner.query(`SELECT conname FROM pg_constraint WHERE conrelid=ANY($1::regclass[])`,
      [['public.authoring_sections', 'public.doc_permissions', 'public.authoring_comments', 'public.doc_revisions', 'public.authoring_citations']])).rows.map(row => row.conname);
    for (const name of ['authoring_sections_doc_tenant_fkey', 'doc_permissions_section_doc_tenant_fkey',
      'authoring_comments_section_tenant_fkey', 'doc_revisions_section_tenant_fkey', 'authoring_citations_section_tenant_fkey']) expect(constraints).toContain(name);
    const unique = (await this.owner.query(`SELECT i.indisunique,pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i
      WHERE i.indexrelid=to_regclass('public.authoring_sections_doc_code_tenant_uq')`)).rows;
    expect(unique).toHaveLength(1); expect(unique[0].indisunique).toBe(true); expect(unique[0].definition).toContain('(doc_id, code, tenant_id)');
    Object.assign(this.observations, { stores, verifiedConstraintNames: constraints, uniqueSectionCodeIndex: unique,
      commentSectionNullable: columns.find(row => row.table_name === 'authoring_comments' && row.column_name === 'section_id')?.is_nullable });
  }

  private async organization(name: string) {
    return (await this.owner.query<{ id: number; uuid: string }>("INSERT INTO organizations(name,slug,status,tier) VALUES($1,$1,'active','standard') RETURNING id,uuid", [`${this.tag}-${name}`])).rows[0];
  }

  private async actor(name: string, role: string, membership = true, foreign = false) {
    const organizationId = foreign ? this.foreignOrganizationId : this.organizationId;
    const organizationUuid = foreign ? this.foreignOrganizationUuid : this.organizationUuid;
    const email = `${this.tag}-${name}@example.invalid`;
    const id = Number((await this.owner.query<{ id: number }>(`INSERT INTO users(email,name,password_hash,status,default_organization_id)
      VALUES($1,$2,'fixture-not-a-password','active',$3) RETURNING id`, [email, `${this.tag} ${name}`, organizationId])).rows[0].id);
    if (membership) await this.owner.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [organizationId, id, role]);
    this.actors[name] = { id, organizationId, organizationUuid, role, email, token: '' };
  }

  private mint(actor: ReadActor, claimedRole: string) {
    actor.token = jwt.sign({ type: 'access', userId: actor.id, organizationId: String(actor.organizationId), organizationUuid: actor.organizationUuid,
      email: actor.email, role: claimedRole, roles: [claimedRole] }, activeJwtSecret(), { expiresIn: '30m' });
  }

  private async program(name: string, privateScope = false, foreign = false): Promise<ReadProgram> {
    const owner = this.actors[foreign ? 'foreign' : 'owner']; const id = randomUUID();
    await this.owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
      VALUES($1,$2,$3,$4,'IND','drug','FDA','Invented QA product',$5,'active')`, [id, owner.organizationId, `${this.tag} ${name} programme`, `ACR-${id.slice(0, 8)}`, owner.id]);
    const { projectId } = await seedNativeCatalogProject(this.owner, { organizationId: owner.organizationId, userId: owner.id, programId: id, namespace: `${this.tag}-${name}-${id.slice(0, 8)}` });
    await this.owner.query('INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)', [owner.organizationId, projectId, privateScope ? 'private' : 'org_public']);
    return { id, projectId, organizationId: owner.organizationId, owner };
  }

  private async document(name: string, program: ReadProgram | null, sectionCount: number,
    options: { foreign?: boolean; module?: string; status?: string } = {}): Promise<ReadDocument> {
    const actor = options.foreign ? this.actors.foreign : this.actors.owner;
    const id = randomUUID(); const title = `${this.tag} ${name} document`;
    const provenance = ['full', 'partial'].includes(name) ? { source: 'ana', conversationId: this.conversation,
      template: `${this.tag} HIDDEN_TEMPLATE`, import: `${this.tag} HIDDEN_IMPORT`, model: `${this.tag} HIDDEN_MODEL`,
      projectSourceReferences: [{ sectionCode: '2.5.2', excerpt: `${this.tag} HIDDEN_SOURCE_REFERENCE` }],
      figures: [{ caption: `${this.tag} HIDDEN_FIGURE` }], claims: [`${this.tag} HIDDEN_CLAIM`] } : null;
    await this.owner.query(`INSERT INTO authoring_documents(id,title,module,product_code,status,tenant_id,created_by,client_program_id,provenance)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [id, title, options.module ?? 'M2', `${this.tag}-product`, options.status ?? 'draft',
      actor.organizationId, String(actor.id), program?.id ?? null, provenance === null ? null : JSON.stringify(provenance)]);
    const sections: ReadSection[] = [];
    for (let index = 0; index < sectionCount; index++) {
      const section: ReadSection = { id: randomUUID(), code: `2.5.${index + 1}`, title: `${this.tag} ${name} ${index ? 'HIDDEN_SIBLING_TITLE' : 'visible section'}`,
        content: `<p>${this.tag} ${name} ${index ? 'HIDDEN_SIBLING_PROSE' : 'visible invented QA prose'}</p>`, order: index + 1 };
      await this.owner.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,order_index,tenant_id)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [section.id, id, section.code, section.title, section.content, section.order, actor.organizationId]);
      sections.push(section);
    }
    return { id, title, program, organizationId: actor.organizationId, sections, provenance };
  }

  private async grant(doc: ReadDocument, actor: ReadActor, section?: ReadSection, standing?: string) {
    await this.owner.query(`INSERT INTO doc_permissions(doc_id,section_id,tenant_id,principal_id,email,role,granted_by,grant_reason,valid_from,valid_until,revoked_at,revoked_by,revoke_reason)
      VALUES($1,$2,$3,$4,$5,'VIEWER',$6,$7,now()-interval '2 days',CASE WHEN $8='expired' THEN now()-interval '1 day' ELSE NULL END,
        CASE WHEN $8='revoked' THEN now() ELSE NULL END,CASE WHEN $8='revoked' THEN $6 ELSE NULL END,CASE WHEN $8='revoked' THEN $7 ELSE NULL END)`,
    [doc.id, section?.id ?? null, doc.organizationId, String(actor.id), actor.email, String(this.actors.owner.id), `${this.tag} explicit native Viewer grant`, standing ?? 'active']);
  }

  private async counters(doc: ReadDocument) {
    for (const section of doc.sections) {
      const creator = doc.organizationId === this.foreignOrganizationId ? this.actors.foreign : this.actors.owner;
      await this.owner.query(`INSERT INTO authoring_comments(id,doc_id,section_id,body,tenant_id,created_by)
        VALUES($1,$2,$3,$4,$5,$6)`, [randomUUID(), doc.id, section.id, `${this.tag} ${section.code} retained comment`, doc.organizationId, String(creator.id)]);
      await this.owner.query(`INSERT INTO authoring_citations(id,section_id,citation_text,source,tenant_id,created_by)
        VALUES($1,$2,$3,'native-retained-synthetic',$4,$5)`, [randomUUID(), section.id, `${this.tag} ${section.code} retained citation`, doc.organizationId, String(creator.id)]);
      await createRevision(this.owner, { sectionId: section.id, content: section.content, updatedBy: String(creator.id), tenantId: doc.organizationId, origin: 'genesis' });
    }
  }

  private async installRoutes() {
    process.env.AUTH_BOUNDARY_MODE = 'enforce'; this.app.use(express.json()); this.app.use('/api', createAuthBoundary());
    this.app.use('/api/authoring', requireTenantContext, authenticateToken, async (req, _res, next) => {
      try {
        if (!(req.dbClient instanceof LazyRequestDbClient)) throw new Error('Canonical Lazy executor absent.');
        const key = req.get('X-Authoring-Native-Request'); if (!key) throw new Error('Native request ID absent.');
        const actual = req.dbClient; const posture = (await actual.query(POSTURE)).rows[0];
        const facts: ReadFacts = { posture, sql: [], pids: [], lazy: true }; this.facts.set(key, facts);
        this.verifyPosture(facts, Number(req.user?.organizationId));
        if (req.get('X-Authoring-Native-Missing-Q') === '1') delete req.dbClient;
        else Object.assign(req, { dbClient: this.observe(actual, key, facts) });
        next();
      } catch (error) { next(error); }
    }, (await import('../../server/routes/authoring.router')).default);
    this.app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
      res.status(500).json({ error: { code: 'NATIVE_HARNESS_FAILED', message: error.message } }));
  }

  private observe(actual: RequestDbClient, key: string, facts: ReadFacts): RequestDbClient {
    return { query: (async <R extends QueryResultRow>(input: string | QueryConfig<unknown[]>, params?: unknown[]) => {
      const sql = typeof input === 'string' ? input : input.text;
      const result = await actual.query<R, unknown[]>(input, params);
      const pin = (await actual.query<{ pid: number; tenant: string }>("SELECT pg_backend_pid() AS pid,current_setting('app.current_tenant_id',true) AS tenant")).rows[0];
      if (pin.pid !== facts.posture.pid || pin.tenant !== facts.posture.tenant) throw new Error('Native request connection or tenant changed.');
      facts.sql.push(sql); facts.pids.push(pin.pid);
      await this.barriers.get(key)?.(sql);
      return result;
    }) as RequestDbClient['query'] };
  }

  verifyPosture(facts: ReadFacts, organizationId: number) {
    expect(facts.lazy).toBe(true); expect(facts.posture).toMatchObject({ database: this.database, role: 'app_service', rolsuper: false,
      rolbypassrls: false, enforcement: 'on', tenant: String(organizationId), bypass: '', admin: '' });
    expect(Number(facts.posture.pid)).toBeGreaterThan(0);
  }

  probe(actor: ReadActor, path: string, afterQuery?: AfterReadQuery, missingQ = false, headers: Record<string, string> = {}) {
    const key = randomUUID(); if (afterQuery) this.barriers.set(key, afterQuery);
    let http = request(this.app).get(`/api/authoring${path}`).set('Authorization', `Bearer ${actor.token}`).set('X-Authoring-Native-Request', key);
    if (missingQ) http = http.set('X-Authoring-Native-Missing-Q', '1');
    for (const [name, value] of Object.entries(headers)) http = http.set(name, value);
    return { key, response: http.then(res => { (this.observations.cases as Record<string, unknown>)[key] = {
      path, actorId: actor.id, status: res.status, code: res.body.code ?? res.body.error?.code, facts: this.facts.get(key) }; return res; }) };
  }

  async withdraw(name: string) {
    const actor = this.actors[name]; const doc = this.documents[name]; let result;
    if (name === 'late-ou') result = await this.owner.query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [actor.organizationId, actor.id]);
    else if (name === 'late-role') result = await this.owner.query("UPDATE organization_users SET role='member' WHERE organization_id=$1 AND user_id=$2 AND role='viewer'", [actor.organizationId, actor.id]);
    else if (name === 'late-sharing') result = await this.owner.query("UPDATE project_visibility_settings SET visibility='private' WHERE organization_id=$1 AND project_id=$2 AND visibility='org_public'", [actor.organizationId, doc.program!.projectId]);
    else if (name === 'late-section') result = await this.owner.query(`UPDATE doc_permissions SET revoked_at=now(),revoked_by=$1,revoke_reason=$2
      WHERE tenant_id=$3 AND doc_id=$4 AND section_id=$5 AND principal_id=$6 AND revoked_at IS NULL`,
    [String(this.actors.owner.id), `${this.tag} actual late withdrawal`, actor.organizationId, doc.id, doc.sections[0].id, String(actor.id)]);
    else if (name === 'late-email') result = await this.owner.query('UPDATE users SET email=$1 WHERE id=$2 AND email=$3', [`${this.tag}-changed@example.invalid`, actor.id, actor.email]);
    else if (name === 'late-status') result = await this.owner.query("UPDATE authoring_documents SET status='FROZEN' WHERE id=$1 AND tenant_id=$2 AND status='draft'", [doc.id, actor.organizationId]);
    else throw new Error('Unknown bounded native witness.');
    expect(result.rowCount).toBe(1);
    (this.observations.witnesses ??= {} as Record<string, unknown>);
    (this.observations.witnesses as Record<string, unknown>)[name] = { actorId: actor.id, documentId: doc.id, mutationRows: result.rowCount };
  }

  async rejectCrossTenantChild() {
    const client = await this.owner.connect();
    try {
      await client.query('BEGIN');
      await expect(client.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,tenant_id)
        VALUES($1,$2,'9.9','Attempted invalid foreign child','Never committed', $3)`,
      [randomUUID(), this.documents.full.id, this.foreignOrganizationId])).rejects.toMatchObject({ code: '23503' });
    } finally { await client.query('ROLLBACK'); client.release(); }
    this.observations.physicalIntegrity = { sqlstate: '23503', qualification: 'Separate physical tenant-parentage refusal; no malformed record admitted and no reader-leak RED claim.' };
  }

  async close() {
    if (process.env.AUTHORING_CURRENT_READ_NATIVE_OBSERVATIONS) writeFileSync(process.env.AUTHORING_CURRENT_READ_NATIVE_OBSERVATIONS,
      JSON.stringify(this.observations, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await getPool().end(); await this.owner.end();
    // Every new fixture document, counter, permission and audit remains retained.
  }
}
