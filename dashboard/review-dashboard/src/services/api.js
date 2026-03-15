import { getAuthHeader } from '../context/AuthContext.jsx';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
let pendingRequests = 0;

function emitNetworkState() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('abl:network', { detail: { pending: pendingRequests } }));
  }
}

function beginRequest() {
  pendingRequests += 1;
  emitNetworkState();
}

function endRequest() {
  pendingRequests = Math.max(0, pendingRequests - 1);
  emitNetworkState();
}

function getApiKey() {
  return localStorage.getItem('llm_eval_api_key') || 'client_key';
}

async function request(path, options = {}) {
  beginRequest();
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-API-KEY': getApiKey(),
      ...getAuthHeader(),
      ...(options.headers || {}),
    };

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const detail = typeof payload === 'string' ? payload : payload?.detail || 'Request failed';
      throw new Error(detail);
    }

    return payload;
  } finally {
    endRequest();
  }
}

export const api = {
  baseUrl: API_BASE_URL,
  setApiKey(key) {
    localStorage.setItem('llm_eval_api_key', key);
  },
  getApiKey,
  evaluate(body) {
    return request('/evaluate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  submitHumanReview(reportId, body) {
    return request(`/report/${encodeURIComponent(reportId)}/human-review`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  getReviewRules() {
    return request('/review/rules');
  },
  getProviders() {
    return request('/providers');
  },
  getReports() {
    return request('/reports');
  },
  getHistory(limit = 200) {
    return request(`/history?limit=${encodeURIComponent(limit)}`);
  },
  getUsageSummary() {
    return request('/usage/summary');
  },
  createWebAudit(body) {
    return request('/web-audit', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  getWebAudit(id) {
    return request(`/web-audit/${encodeURIComponent(id)}`);
  },
  getWebAuditVideo(id) {
    return `${API_BASE_URL}/web-audit/${encodeURIComponent(id)}/video`;
  },
  shareWebAudit(id) {
    return request(`/web-audit/${encodeURIComponent(id)}/share`, {
      method: 'POST',
    });
  },
  getPublicWebAudit(token) {
    return fetch(`${API_BASE_URL}/web-audit/share/${encodeURIComponent(token)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Report not found');
        return res.json();
      });
  },
  createAgentAudit(body) {
    return request('/agent-audit', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  getReport(id) {
    return request(`/report/${encodeURIComponent(id)}`);
  },
  createMonitor(body) {
    return request('/monitors', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  getMonitors() {
    return request('/monitors');
  },
  runMonitorCheck(id) {
    return request(`/monitors/${encodeURIComponent(id)}/check`, {
      method: 'POST',
    });
  },
  getAuditHistory() {
    return request('/audit-history');
  },
};
