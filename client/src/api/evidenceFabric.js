import axios from 'axios';

export const evidenceFabric = {
  upsertSource: async (tenantId, key, value, provenance) => {
    // tenantId is accepted for consistency, but server enforces via auth/tenant middleware.
    return axios
      .post('/api/evidence-fabric/sources/upsert', { tenantId, key, value, provenance: provenance || undefined })
      .then((r) => r.data);
  },

  getSource: async (tenantId, key) => {
    return axios
      .get(`/api/evidence-fabric/sources/${encodeURIComponent(key)}`, { params: { tenantId } })
      .then((r) => r.data);
  },

  listSources: async (tenantId) => {
    return axios.get('/api/evidence-fabric/sources', { params: { tenantId } }).then((r) => r.data);
  },

  preview: async (tenantId, content, previousManifest) => {
    return axios
      .post('/api/evidence-fabric/preview', { tenantId, content, previousManifest: previousManifest || undefined })
      .then((r) => r.data);
  },

  status: async (tenantId, content, previousManifest) => {
    return axios
      .post('/api/evidence-fabric/status', { tenantId, content, previousManifest })
      .then((r) => r.data);
  },
};
