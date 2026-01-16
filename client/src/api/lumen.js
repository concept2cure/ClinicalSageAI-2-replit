import axios from 'axios';

export const lumen = {
  // The Universal "Ask"
  ask: async (tenantId, module, query, context) => {
    return axios.post('/api/lumen/query', { tenantId, module, query, context }).then(r => r.data);
  },
  // Shadow Review (public signals only)
  runShadowReview: async (tenantId, productCode, dossierContext, opts) => {
    const payload = {
      tenantId,
      productCode,
      dossierContext: dossierContext || {},
      topic: opts?.topic,
      useCache: opts?.useCache !== false,
    };
    return axios.post('/api/lumen/shadow-review', payload).then(r => r.data);
  },
  // Deficiency Bank (Give-to-Get)
  uploadDeficiency: async (tenantId, text) => {
    return axios.post('/api/lumen/deficiency/upload', { tenantId, text }).then(r => r.data);
  },
  queryDeficiencyBank: async (tenantId, topic, opts) => {
    return axios
      .post('/api/lumen/deficiency/query', {
        tenantId,
        topic,
        includeUnverified: opts?.includeUnverified === true,
      })
      .then(r => r.data);
  },
  // The Broker Tool
  scanAssets: async (tenantId, query) => {
    return axios.post('/api/lumen/query', { tenantId, module: 'broker', query }).then(r => r.data);
  },
  // Private RAG (Chat with My Docs)
  askMyDocs: async (tenantId, query, context) => {
    return axios.post('/api/lumen/query', { tenantId, module: 'private', query, context }).then(r => r.data);
  },
  // The Learning Loop
  teach: async (tenantId, original, edited) => {
    return axios.post('/api/lumen/feedback', { tenantId, original, edited }).then(r => r.data);
  },
  // Audit Vault Export
  downloadAudit: async (tenantId, limit) => {
    const q = typeof limit === 'number' ? `?limit=${encodeURIComponent(limit)}` : '';
    return axios.get(`/api/lumen/audit/${encodeURIComponent(tenantId)}${q}`).then(r => r.data);
  },
};
