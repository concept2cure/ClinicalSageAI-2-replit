export type SectionLink = {
  sectionId: string;
  entityType: 'evidence' | 'claim' | 'standard' | 'outcome';
  entityId: string;
  createdAt: string;
};

const store = new Map<string, SectionLink[]>();

const getKey = (organizationId: number, programId: string) =>
  `org-${organizationId}-program-${programId}`;

export const listSectionLinks = (organizationId: number, programId: string, sectionId: string) => {
  const key = getKey(organizationId, programId);
  const links = store.get(key) || [];
  return links.filter(link => link.sectionId === sectionId);
};

export const addSectionLink = (
  organizationId: number,
  programId: string,
  sectionId: string,
  entityType: SectionLink['entityType'],
  entityId: string
) => {
  const key = getKey(organizationId, programId);
  const links = store.get(key) || [];
  const exists = links.some(
    link => link.sectionId === sectionId && link.entityType === entityType && link.entityId === entityId
  );
  if (!exists) {
    links.unshift({
      sectionId,
      entityType,
      entityId,
      createdAt: new Date().toISOString(),
    });
  }
  store.set(key, links);
  return links.filter(link => link.sectionId === sectionId);
};
