/**
 * Pins scripts/db/readiness-contract.mjs — the copy of the /readyz schema
 * contract that deploy-migrate and `node scripts/db/provision.mjs` verify
 * against — to the TypeScript lists the running server actually enforces.
 *
 * The .mjs cannot import TypeScript: it runs as plain node inside the
 * production image, where nothing compiles. So the lists are duplicated, and a
 * duplicate drifts. The drift this catches is the expensive direction: a table
 * added to CRITICAL_TABLES / SECURITY_CRITICAL_TABLES here and not there means a
 * deploy job that prints "safe to roll services" on a database whose boot then
 * records `security-critical tables missing: …` — green deploy, red probe.
 */

import { describe, it, expect } from 'vitest';
import {
  CRITICAL_TABLES as MJS_CRITICAL_TABLES,
  REQUIRED_SCHEMAS as MJS_REQUIRED_SCHEMAS,
  SECURITY_CRITICAL_TABLES as MJS_SECURITY_CRITICAL_TABLES,
  REQUIRED_EXTENSIONS,
  REQUIRED_NON_PUBLIC_TABLES,
  BASE_SCHEMA_SENTINELS,
  verifyReadinessContract,
} from '../../../scripts/db/readiness-contract.mjs';
import { CRITICAL_TABLES, REQUIRED_SCHEMAS } from '../ensureCoreTables';
import { SECURITY_CRITICAL_TABLES } from '../../startup/services';

describe('readiness-contract.mjs mirrors the server-side readiness lists', () => {
  it('CRITICAL_TABLES agree with ensureCoreTables.ts', () => {
    expect([...MJS_CRITICAL_TABLES]).toEqual([...CRITICAL_TABLES]);
  });

  it('REQUIRED_SCHEMAS agree with ensureCoreTables.ts', () => {
    expect([...MJS_REQUIRED_SCHEMAS]).toEqual([...REQUIRED_SCHEMAS]);
  });

  it('SECURITY_CRITICAL_TABLES agree with startup/services.ts', () => {
    expect([...MJS_SECURITY_CRITICAL_TABLES]).toEqual([...SECURITY_CRITICAL_TABLES]);
  });

  it('demands the vector extension and the Part 11 audit store', () => {
    // ensureCoreTables gates readiness on `vector`; the audit store is what
    // AUDIT_TRAIL_ENABLED=true needs and install-fresh alone never creates.
    expect([...REQUIRED_EXTENSIONS]).toEqual(['vector']);
    expect([...REQUIRED_NON_PUBLIC_TABLES]).toEqual([{ schema: 'audit', name: 'tamper_proof_log' }]);
  });

  it('base sentinels are a superset of the critical tables', () => {
    for (const t of CRITICAL_TABLES) expect(BASE_SCHEMA_SENTINELS).toContain(t);
  });
});

/**
 * Behavioural pin on the verifier itself, against a scripted client: every
 * tier failure must be NAMED (so a transcript says which tier is broken), and
 * a runtime-role check must refuse a superuser and an unreadable table.
 */
// Scripted client and full-contract fixtures shared by the verifier pins below.
type Row = Record<string, unknown>;
function scriptedClient(opts: {
  role?: Row;
  schemasPresent?: string[];
  extensionsPresent?: string[];
  tablesPresent?: string[]; // "schema.name"
  selectable?: string[]; // "schema.name"
  /** Roles pg_roles knows about, for a `runtimeRole` that is not the connection. */
  knownRoles?: Record<string, { rolsuper: boolean; rolbypassrls: boolean }>;
  /** Extra relations the grant audit sees beyond the contract tables. */
  extraRelations?: { relation: string; held: string[]; owned?: boolean }[];
}) {
  const present = new Set(opts.tablesPresent ?? []);
  const selectable = new Set(opts.selectable ?? opts.tablesPresent ?? []);
  const connRole = opts.role ?? { role: 'owner', db: 'db', rolsuper: false, rolbypassrls: false };
  return {
    async query(text: string, values?: unknown[]) {
      if (text.includes('current_user AS role')) {
        return { rows: [connRole], rowCount: 1 };
      }
      // Grant audit (provision-app-role.mjs auditRuntimeRoleGrants): the role
      // row, then one row per application relation with its privileges.
      if (text.includes('FROM pg_roles WHERE rolname')) {
        const name = values![0] as string;
        const attrs =
          name === connRole.role
            ? { rolsuper: connRole.rolsuper, rolbypassrls: connRole.rolbypassrls }
            : (opts.knownRoles ?? {})[name];
        return attrs
          ? { rows: [{ rolname: name, rolsuper: attrs.rolsuper, rolbypassrls: attrs.rolbypassrls, rolcanlogin: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (text.includes('has_schema_privilege')) {
        const rows = [...present].map((key) => {
          const [schema, name] = key.split('.');
          const canSelect = selectable.has(key);
          return { schema, name, relkind: 'r', owned: false, schema_usage: true, can_select: canSelect, can_insert: true, can_update: schema !== 'audit', can_delete: schema !== 'audit' };
        });
        for (const r of opts.extraRelations ?? []) {
          const [schema, name] = r.relation.split('.');
          const held = new Set(r.held);
          rows.push({ schema, name, relkind: 'r', owned: Boolean(r.owned), schema_usage: true, can_select: held.has('SELECT'), can_insert: held.has('INSERT'), can_update: held.has('UPDATE'), can_delete: held.has('DELETE') });
        }
        return { rows, rowCount: rows.length };
      }
      if (text.includes('FROM pg_namespace WHERE nspname = s')) {
        const names = values![0] as string[];
        return { rows: names.map((name) => ({ name, present: (opts.schemasPresent ?? []).includes(name) })), rowCount: names.length };
      }
      if (text.includes('FROM pg_extension WHERE extname = e')) {
        const names = values![0] as string[];
        return { rows: names.map((name) => ({ name, present: (opts.extensionsPresent ?? []).includes(name) })), rowCount: names.length };
      }
      if (text.includes('AS p(schema, name)')) {
        const schemas = values![0] as string[];
        const names = values![1] as string[];
        return {
          rows: schemas.map((schema, i) => ({ schema, name: names[i], present: present.has(`${schema}.${names[i]}`) })),
          rowCount: schemas.length,
        };
      }
      throw new Error(`unexpected query: ${text.slice(0, 80)}`);
    },
  };
}

const FULL_TABLES = [
  ...CRITICAL_TABLES.map((t) => `public.${t}`),
  ...SECURITY_CRITICAL_TABLES.map((t) => `public.${t}`),
  'audit.tamper_proof_log',
];
const FULL = { schemasPresent: [...REQUIRED_SCHEMAS], extensionsPresent: ['vector'], tablesPresent: FULL_TABLES };

describe('verifyReadinessContract', () => {

  it('passes on a complete contract', async () => {
    const r = await verifyReadinessContract(scriptedClient(FULL));
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('names the missing security-critical table (the licenses case)', async () => {
    const r = await verifyReadinessContract(
      scriptedClient({ ...FULL, tablesPresent: FULL_TABLES.filter((t) => t !== 'public.licenses') }),
    );
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/security-critical tables missing: public\.licenses/);
  });

  it('names the missing Part 11 audit store', async () => {
    const r = await verifyReadinessContract(
      scriptedClient({ ...FULL, tablesPresent: FULL_TABLES.filter((t) => t !== 'audit.tamper_proof_log') }),
    );
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/Part 11 audit store missing: audit\.tamper_proof_log/);
  });

  it('names a missing schema and a missing extension', async () => {
    const r = await verifyReadinessContract(
      scriptedClient({ ...FULL, schemasPresent: ['public', 'vault'], extensionsPresent: [] }),
    );
    expect(r.failures).toEqual(
      expect.arrayContaining(['schemas missing: extensions', 'extensions missing: vector']),
    );
  });

  it('as the runtime role: refuses a superuser and an unreadable table', async () => {
    const superuser = await verifyReadinessContract(
      scriptedClient({ ...FULL, role: { role: 'postgres', db: 'db', rolsuper: true, rolbypassrls: false } }),
      { asRuntimeRole: true },
    );
    expect(superuser.ok).toBe(false);
    expect(superuser.failures.join('\n')).toMatch(/runtime role postgres is a superuser/);

    const unreadable = await verifyReadinessContract(
      scriptedClient({ ...FULL, selectable: FULL_TABLES.filter((t) => t !== 'public.audit_logs') }),
      { asRuntimeRole: true },
    );
    expect(unreadable.ok).toBe(false);
    expect(unreadable.failures.join('\n')).toMatch(/cannot SELECT: public\.audit_logs/);
  });

  it('as the owner: does not check SELECT reach', async () => {
    const r = await verifyReadinessContract(scriptedClient({ ...FULL, selectable: [] }));
    expect(r.ok).toBe(true);
    expect(r.runtimeRole).toBeNull();
    expect(r.grantAudit).toBeNull();
  });
});

/**
 * 2026-09-21 — IQ-DEV-001. The owner connection can now name the runtime
 * role (`runtimeRole`) and the verdict covers the whole estate through the
 * grant audit, not only the contract tables: a denied application table, a
 * widened audit store, or a role that does not exist all fail the contract.
 */
describe('verifyReadinessContract — named runtime role (owner connection) and the grant audit', () => {
  it('passes when the named role reaches everything with the recipe privileges', async () => {
    const r = await verifyReadinessContract(
      scriptedClient({
        ...FULL,
        knownRoles: { c2c: { rolsuper: false, rolbypassrls: false } },
        extraRelations: [{ relation: 'public.platform_settings', held: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] }],
      }),
      { runtimeRole: 'c2c' },
    );
    expect(r.ok).toBe(true);
    expect(r.runtimeRole).toBe('c2c');
    expect(r.grantAudit?.relations).toBe(FULL_TABLES.length + 1);
  });

  it('fails on an application table outside the contract that the role cannot reach (the 183-table case)', async () => {
    const r = await verifyReadinessContract(
      scriptedClient({
        ...FULL,
        knownRoles: { c2c: { rolsuper: false, rolbypassrls: false } },
        extraRelations: [{ relation: 'public.platform_settings', held: [] }],
      }),
      { runtimeRole: 'c2c' },
    );
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/runtime role c2c lacks privileges on 1 relation\(s\): public\.platform_settings \(SELECT\/INSERT\/UPDATE\/DELETE\)/);
    // Not a contract table, so the named SELECT-reach line stays clean.
    expect(r.failures.join('\n')).not.toMatch(/cannot SELECT/);
  });

  it('fails when the audit store is widened beyond append-only (UPDATE via a PUBLIC or hand grant)', async () => {
    const r = await verifyReadinessContract(
      scriptedClient({
        ...FULL,
        knownRoles: { app_service: { rolsuper: false, rolbypassrls: false } },
        extraRelations: [{ relation: 'audit.tamper_proof_log', held: ['SELECT', 'INSERT', 'UPDATE'] }],
        tablesPresent: FULL_TABLES.filter((t) => t !== 'audit.tamper_proof_log'),
        extensionsPresent: ['vector'],
      }),
      { runtimeRole: 'app_service' },
    );
    // The store is present through extraRelations for the audit, but absent
    // from the contract tier above — so isolate the ceiling failure.
    expect(r.failures.join('\n')).toMatch(/holds privileges beyond the append-only ceiling on: audit\.tamper_proof_log \(UPDATE\)/);
  });

  it('fails when the runtime role owns the audit store', async () => {
    const r = await verifyReadinessContract(
      scriptedClient({
        ...FULL,
        knownRoles: { app_service: { rolsuper: false, rolbypassrls: false } },
        extraRelations: [{ relation: 'audit.tamper_proof_log', held: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], owned: true }],
        tablesPresent: FULL_TABLES.filter((t) => t !== 'audit.tamper_proof_log'),
      }),
      { runtimeRole: 'app_service' },
    );
    expect(r.failures.join('\n')).toMatch(/OWNS the append-only store: audit\.tamper_proof_log/);
  });

  it('fails when the named role does not exist', async () => {
    const r = await verifyReadinessContract(scriptedClient(FULL), { runtimeRole: 'ghost' });
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/runtime role ghost does not exist/);
  });

  it('refuses a named superuser', async () => {
    const r = await verifyReadinessContract(
      scriptedClient({ ...FULL, knownRoles: { admin: { rolsuper: true, rolbypassrls: false } } }),
      { runtimeRole: 'admin' },
    );
    expect(r.failures.join('\n')).toMatch(/runtime role admin is a superuser/);
  });
});
