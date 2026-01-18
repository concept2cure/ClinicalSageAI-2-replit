export type CitationSummary = {
  totalTokens: number;
  resolvedTokens: number;
  unresolvedTokens: number;
  updatedAt: string;
};

const store = new Map<string, CitationSummary>();

const getKey = (organizationId: number, programId: string) =>
  `org-${organizationId}-program-${programId}`;

export const setCitationSummary = (
  organizationId: number,
  programId: string,
  summary: Omit<CitationSummary, 'updatedAt'>
) => {
  const key = getKey(organizationId, programId);
  const payload: CitationSummary = {
    ...summary,
    updatedAt: new Date().toISOString(),
  };
  store.set(key, payload);
  return payload;
};

export const getCitationSummary = (organizationId: number, programId: string) => {
  const key = getKey(organizationId, programId);
  return store.get(key) || null;
};
