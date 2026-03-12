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
};
