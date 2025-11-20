import repo from './repo.js';

// Store under repo key 'responses' (array of {id, findingId, section, text, evidenceIds[], updatedAt})
function list() { 
  return repo.get('responses') || []; 
}

function saveAll(all) { 
  repo.set('responses', all); 
}

function upsert(resp) {
  const all = list();
  const i = all.findIndex(r => r.id === resp.id);
  if (i >= 0) all[i] = resp; else all.push(resp);
  saveAll(all);
  return resp;
}

function byId(id) { 
  return list().find(r => r.id === id) || null; 
}

export { list, upsert, byId };