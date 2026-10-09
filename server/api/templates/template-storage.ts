/**
 * Where an organization's uploaded template files live, and the multer storage
 * that puts them there (INJ-PATH-002).
 *
 * Templates used to land in one flat `uploads/templates/` shared by every
 * tenant, and the stored path could be replaced from a request body. They now
 * live inside the tenant's own uploads prefix, `uploads/org-<id>/templates/`,
 * the only place AnA's document tools will read a template from; only the
 * upload route sets the stored path.
 */
import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { usableOrgId } from '../../utils/authedOrgId';

/** The request's organization, from the verified context — never the body. */
function uploadOrganization(req: Request): number | null {
  return usableOrgId((req as any).tenantId || (req as any).tenantContext?.organizationId);
}

/** The organization's template directory, relative to the working directory. */
export function tenantTemplateDir(organizationId: number): string {
  return path.join('uploads', `org-${organizationId}`, 'templates');
}

export const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const organizationId = uploadOrganization(req as Request);
    if (organizationId === null) {
      cb(new Error('Organization context required'), '');
      return;
    }
    const dir = tenantTemplateDir(organizationId);
    fs.mkdir(dir, { recursive: true }, err => cb(err ?? null, dir));
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

/**
 * The organization, checked before multer touches the request: the storage
 * destination is the tenant's own directory, so without an organization there
 * is nowhere to put the file — answer 401, not a multer 500.
 */
export function requireUploadOrganization(req: Request, res: Response, next: () => void): void {
  if (uploadOrganization(req) === null) {
    res.status(401).json({ error: 'Organization context required' });
    return;
  }
  next();
}
