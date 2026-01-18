const getOrgHeader = () => {
  const orgId = localStorage.getItem('currentOrganizationId');
  return orgId ? { 'x-organization-id': orgId } : {};
};

const coauthorWorkspaceService = {
  getDocuments: async (limit = 6) => {
    const response = await fetch(`/api/coauthor/documents?limit=${limit}`, {
      headers: getOrgHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch documents');
    }

    return response.json();
  },
  getModuleTree: async () => {
    const response = await fetch('/api/coauthor/ectd-modules/tree-with-counts', {
      headers: getOrgHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch module tree');
    }

    return response.json();
  },
  getLatestValidation: async documentId => {
    const response = await fetch(`/api/coauthor/validate/latest/${documentId}`, {
      headers: getOrgHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch validation');
    }

    return response.json();
  },
};

export default coauthorWorkspaceService;
