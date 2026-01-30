import { Request, Response, NextFunction } from 'express';

export function tenantAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const allowed = process.env.ALLOWED_TEST_ASSEMBLY_TENANTS;
  if (!allowed) return next();

  const allowedList = allowed.split(',').map(s => s.trim()).filter(Boolean);
  const tenant = (req.header('x-tenant-id') || req.header('x-tenant') || '').toString();

  if (!tenant) return res.status(403).json({ error: 'tenant header required' });
  if (!allowedList.includes(tenant)) return res.status(403).json({ error: 'tenant not allowed' });

  return next();
}
