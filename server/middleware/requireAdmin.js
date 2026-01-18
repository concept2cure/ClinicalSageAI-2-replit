import jwt from 'jsonwebtoken';

export function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const role = decoded.role;
    const allowedRoles = ['admin', 'super_admin', 'ADMIN', 'SUPER_ADMIN'];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'ADMIN_REQUIRED' });
    }

    req.user = decoded;
    req.organizationId = decoded.organizationId;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}
