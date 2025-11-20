import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const q = async (sql: string, params: any[] = []) => {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
};

export type Role = 'Viewer' | 'Analyst' | 'ProcessEng' | 'QA' | 'RegCMC' | 'Admin';

export async function resolveRole(req: any): Promise<Role> {
  const hdr = (req.headers['x-user-role'] || '') as string;
  if (['Viewer', 'Analyst', 'ProcessEng', 'QA', 'RegCMC', 'Admin'].includes(hdr))
    return hdr as Role;
  const email = (req.headers['x-user-email'] || '') as string;
  if (email) {
    const { rows } = await q(
      `select role from cmc_rbac_members where lower(email)=lower($1) limit 1`,
      [email]
    );
    if (rows[0]?.role) return rows[0].role;
  }
  return 'Viewer';
}

export function requireRole(roles: Role[]) {
  return async (req: any, res: any, next: any) => {
    const r = await resolveRole(req);
    if (roles.includes(r)) return next();
    return res.status(403).json({ error: `Forbidden: requires ${roles.join(' or ')}`, role: r });
  };
}
