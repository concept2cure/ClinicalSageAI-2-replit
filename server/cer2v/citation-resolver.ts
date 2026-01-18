import { cerv2Evidence, cerv2Outcomes, cerv2Standards, regulatoryClaims } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

export type CitationToken = {
  type: 'evidence' | 'claim' | 'standard' | 'outcome';
  id: string;
  raw: string;
};

export type CitationResolution = {
  tokens: CitationToken[];
  resolved: CitationToken[];
  unresolved: CitationToken[];
};

const tokenRegex = /\[cite:(evidence|claim|standard|outcome):([^\]]+)\]/g;

export const extractCitationTokens = (content: string): CitationToken[] => {
  if (!content) return [];
  const matches = Array.from(content.matchAll(tokenRegex));
  return matches.map(match => ({
    type: match[1] as CitationToken['type'],
    id: match[2],
    raw: match[0],
  }));
};

export const resolveCitations = (key: string, content: string): CitationResolution => {
  return { tokens: extractCitationTokens(content), resolved: [], unresolved: [] };
};

export const resolveCitationsFromDb = async (
  db: any,
  organizationId: number,
  programId: string,
  content: string
): Promise<CitationResolution> => {
  const tokens = extractCitationTokens(content);
  if (!tokens.length) {
    return { tokens, resolved: [], unresolved: [] };
  }

  const [evidenceRows, claimsRows, standardsRows, outcomesRows] = await Promise.all([
    db
      .select({ evidenceId: cerv2Evidence.evidenceId })
      .from(cerv2Evidence)
      .where(and(eq(cerv2Evidence.organizationId, organizationId), eq(cerv2Evidence.programId, programId))),
    db
      .select({ claimId: regulatoryClaims.claimId })
      .from(regulatoryClaims)
      .where(eq(regulatoryClaims.submissionId, programId)),
    db
      .select({ standardId: cerv2Standards.standardId })
      .from(cerv2Standards)
      .where(and(eq(cerv2Standards.organizationId, organizationId), eq(cerv2Standards.programId, programId))),
    db
      .select({ outcomeId: cerv2Outcomes.outcomeId })
      .from(cerv2Outcomes)
      .where(and(eq(cerv2Outcomes.organizationId, organizationId), eq(cerv2Outcomes.programId, programId))),
  ]);

  const evidenceSet = new Set(evidenceRows.map((row: any) => String(row.evidenceId)));
  const claimsSet = new Set(claimsRows.map((row: any) => `claim-${row.claimId}`));
  const standardsSet = new Set(standardsRows.map((row: any) => String(row.standardId)));
  const outcomesSet = new Set(outcomesRows.map((row: any) => String(row.outcomeId)));

  const resolved: CitationToken[] = [];
  const unresolved: CitationToken[] = [];

  tokens.forEach(token => {
    const exists =
      (token.type === 'evidence' && evidenceSet.has(token.id)) ||
      (token.type === 'claim' && claimsSet.has(token.id)) ||
      (token.type === 'standard' && standardsSet.has(token.id)) ||
      (token.type === 'outcome' && outcomesSet.has(token.id));

    if (exists) {
      resolved.push(token);
    } else {
      unresolved.push(token);
    }
  });

  return { tokens, resolved, unresolved };
};
