import type { CompanyLegalDocument } from '../../../shared/company-documents';

/** Copy ancestry can name an inaccessible source program. Public records keep
 * their own admitted version, while canonical registry/gates retain ancestry. */
export function publicCompanyLegalDocument(document: CompanyLegalDocument): CompanyLegalDocument {
  const result = { ...document };
  delete result.sourceOriginal;
  return result;
}
