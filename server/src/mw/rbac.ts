import { getPool } from '../../db';

const pool = getPool();

const q = async (sql: string, params: any[] = []) => {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
};

export type Role = 'Viewer' | 'Analyst' | 'ProcessEng' | 'QA' | 'RegCMC' | 'Admin';
const ALLOWED_ROLES: Role[] = ['Viewer', 'Analyst', 'ProcessEng', 'QA', 'RegCMC', 'Admin'];

export async function resolveRole(req: any): Promise<Role> {
  if (!req?.user) {
    throw new Error('AUTH_REQUIRED');
  }
  // SECURITY: Ignore client-supplied role headers. Only trust verified auth context.
  const jwtRoles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const jwtRole = req.user?.role;
  const normalizedJwtRoles = [...jwtRoles, jwtRole]
    .filter(Boolean)
    .map((r: string) => String(r));

  const match = ALLOWED_ROLES.find(role =>
    normalizedJwtRoles.some(r => r.toLowerCase() === role.toLowerCase())
  );
  if (match) return match;

  const email = (req.user?.email || '') as string;
  if (email) {
    const { rows } = await q(
      `select role from cmc_rbac_members where lower(email)=lower($1) limit 1`,
      [email]
    );
    if (rows[0]?.role && ALLOWED_ROLES.includes(rows[0].role)) return rows[0].role;
  }
  return 'Viewer';
}

export function requireRole(roles: Role[]) {
  return async (req: any, res: any, next: any) => {
    let r: Role;
    try {
      r = await resolveRole(req);
    } catch (error: any) {
      if (error?.message === 'AUTH_REQUIRED') {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.status(500).json({ error: 'Role resolution failed' });
    }
    if (roles.includes(r)) return next();
    return res.status(403).json({ error: `Forbidden: requires ${roles.join(' or ')}`, role: r });
  };
}
