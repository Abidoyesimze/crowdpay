const BASE = '/api';

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  register: (body) => request('POST', '/users/register', body),
  login: (body) => request('POST', '/users/login', body),

  // Campaigns
  getCampaigns: () => request('GET', '/campaigns'),
  getCampaign: (id) => request('GET', `/campaigns/${id}`),
  getCampaignBalance: (id) => request('GET', `/campaigns/${id}/balance`),
  createCampaign: (body, token) => request('POST', '/campaigns', body, token),

  // Contributions
  getContributions: (campaignId) => request('GET', `/contributions/campaign/${campaignId}`),
  contribute: (body, token) => request('POST', '/contributions', body, token),
};
