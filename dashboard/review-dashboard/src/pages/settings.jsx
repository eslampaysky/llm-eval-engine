import { useState } from 'react';

export default function SettingsPage({ usage, loading, error, currentApiKey, onSaveApiKey }) {
  const [key, setKey] = useState(currentApiKey || '');

  return (
    <section className="page">
      <h1 className="page-title">API Usage & Settings</h1>
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="settings-grid">
        <div className="panel">
          <h3 className="panel-title">Authentication</h3>
          <label>
            <span>Client API Key</span>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="client_key" />
          </label>
          <button
            type="button"
            className="primary-btn"
            onClick={() => onSaveApiKey(key)}
          >
            Save Key
          </button>
        </div>

        <div className="panel">
          <h3 className="panel-title">Usage Summary</h3>
          {loading ? <p>Loading usage...</p> : null}
          {!loading && usage ? (
            <div className="usage-grid">
              <div><span>Requests Today</span><strong>{usage.today?.req_count || 0}</strong></div>
              <div><span>Requests This Month</span><strong>{usage.month?.req_count || 0}</strong></div>
              <div><span>Samples Today</span><strong>{usage.today?.sample_count || 0}</strong></div>
              <div><span>Total Samples</span><strong>{usage.overall?.sample_count || 0}</strong></div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
