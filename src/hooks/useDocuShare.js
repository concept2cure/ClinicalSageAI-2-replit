/**
 * DocuShare integration hook
 * Provides functions for document operations with DocuShare
 */
export async function listDocs(folder = '') {
  const res = await fetch(`/api/docs/list${folder ? `?folder=${encodeURIComponent(folder)}` : ''}`);
  return res.json();
}

export async function uploadDoc(file, folder = '') {
  const formData = new FormData();
  formData.append('file', file);
  if (folder) formData.append('folder', folder);

  const res = await fetch('/api/docs/upload', {
    method: 'POST',
    body: formData,
  });

  return res.json();
}

export async function downloadDoc(objectId) {
  const res = await fetch(`/api/docs/download?objectId=${encodeURIComponent(objectId)}`);
  return res.blob();
}

export async function getDocViewUrl(objectId) {
  const res = await fetch(`/api/docs/view?objectId=${encodeURIComponent(objectId)}`);
  const data = await res.json();
  return data.url;
}
