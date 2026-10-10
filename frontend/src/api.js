export const resolveApiBase = (configured = '') => {
  const base = configured.trim().replace(/\/+$/, '');
  if (!base) return '/api';
  return base.endsWith('/api') ? base : `${base}/api`;
};

const API_BASE_URL = resolveApiBase(import.meta.env?.VITE_API_BASE_URL);

export async function requestApi(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch {
    throw new Error('Backend se connection nahi hua. Report save confirm nahi hua; bhara hua form safe hai.');
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Backend API available nahi hai. Website ki API URL/deployment configuration check karein.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
