import type { CompanyDocumentCapabilities } from '../../../shared/company-documents';
import type { RequestSqlClient } from '../../db/requestDb';

export type CompanyCapability = 'brand' | 'legal' | 'permissions';
export async function companyCapabilities(q: RequestSqlClient, organizationId: number,
  userId: number, role: string, forShare = false): Promise<CompanyDocumentCapabilities> {
  if (['owner', 'admin'].includes(role)) return { manageBrand: true, manageLegal: true, managePermissions: true };
  const { rows } = await q.query(`SELECT manage_brand,manage_legal FROM company_document_grants
    WHERE organization_id=$1 AND user_id=$2${forShare ? ' FOR SHARE' : ''}`, [organizationId, userId]);
  return { manageBrand: rows[0]?.manage_brand === true, manageLegal: rows[0]?.manage_legal === true, managePermissions: false };
}
export function hasCompanyCapability(capabilities: CompanyDocumentCapabilities, capability: CompanyCapability) {
  return capability === 'brand' ? capabilities.manageBrand : capability === 'legal' ? capabilities.manageLegal : capabilities.managePermissions;
}
