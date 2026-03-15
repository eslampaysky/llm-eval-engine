import { useEffect, useState } from 'react';
import { apiFetch } from '../../App.jsx';

const DEFAULT_WINDOW_DAYS = 30;

export default function DriftPage() {
  const [modelVersionInput, setModelVersionInput] = useState('');
  const [activeModelVersion, setActiveModelVersion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drift, setDrift] = useState(null);

  const [alertModelVersion, setAlertModelVersion] = useState('');
  const [alertThresholdPct, setAlertThresholdPct] = useState(5);
  const [alertChannel, setAlertChannel] = useState('none');

  // Load alert config from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('abl_drift_alert_cfg');
      if (raw) {
        const cfg = JSON.parse(raw);
        if (cfg.modelVersion) setAlertModelVersion(cfg.modelVersion);
        if (typeof cfg.thresholdPct === 'number') setAlertThresholdPct(cfg.thresholdPct);
        if (cfg.channel) setAlertChannel(cfg.channel);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchDrift = async (mv) => {
    const emptyDrift = {
      baseline_score: 0,
      current_score: 0,
      drift_pct: 0,
      drift_detected: false,
      run_count: 0,
      series: [],
    };
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (mv) params.set('model_version', mv);
      params.set('window_days', String(DEFAULT_WINDOW_DAYS));
      const data = await apiFetch(`/drift?${params.toString()}`);
      setDrift(data);
      setActiveModelVersion(mv || '');
    } catch (err) {
      // Treat 404 / empty responses as "no data yet" instead of a hard error.
      if (err && (err.status === 404)) {
        setDrift(emptyDrift);
        setActiveModelVersion(mv || '');
        setError('');
      } else {
        setError(err.message || 'Failed to load drift data');
        setDrift(emptyDrift);
        setActiveModelVersion(mv || '');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrift('');
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchDrift(modelVersionInput.trim());
  };

  const handleSaveAlertConfig = () => {
    const cfg = {
      modelVersion: alertModelVersion.trim(),
      thresholdPct: Number(alertThresholdPct) || 0,
      channel: alertChannel,
    };
    try {
      localStorage.setItem('abl_drift_alert_cfg', JSON.stringify(cfg));
    } catch {
      // ignore
    }
  };

  const series = drift?.series || [];
  const baseline = drift?.baseline_score ?? 0;
  const current = drift?.current_score ?? 0;
  const driftPct = drift?.drift_pct ?? 0;
  const runsTracked = drift?.run_count ?? 0;
  const driftPctDisplay = (driftPct * 100).toFixed(2);
  const driftIsHigh = driftPct > 0.05;

  // SVG bar chart dimensions
  const chartWidth = 100;
  const chartHeight = 40;
  const barGap = 1.5;
  const barCount = series.length || 1;
  const barWidth = (chartWidth / barCount) - barGap;

  const bars = series.map((row, idx) => {
    const score = Number(row.score || 0);
    const normalized = Math.max(0, Math.min(10, score)) / 10;
    const height = normalized * chartHeight;
    const x = idx * (chartWidth / barCount) + barGap / 2;
    const y = chartHeight - height;
    let color = 'var(--accent2)';
    if (score < 5) color = '#FF5C72';
    else if (score < 7) color = '#F0A500';
    return { x, y, width: barWidth, height, color, date: row.date, score };
  });

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// observability · drift</div>
        <div className="page-title">Drift Monitor</div>
        <div className="page-desc">
          Track score drift over time for a given model version and catch regressions early.
        </div>
      </div>

      {error && <div className="err-box">⚠ {error}</div>}

      <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div className="card-label">Model version</div>
          <input
            type="text"
            className="input"
            placeholder="e.g. gpt-4o-mini"
            value={modelVersionInput}
            onChange={(e) => setModelVersionInput(e.target.value)}
          />
          <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 4 }}>
            Leave empty to aggregate across all models in the last {DEFAULT_WINDOW_DAYS} days.
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </form>

      {drift && (
        <>
          <div className="kpi-row">
            <div className="kpi">
              <div className="kpi-label">Current score</div>
              <div className="kpi-value">{current ? current.toFixed(2) : '—'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Baseline score</div>
              <div className="kpi-value">{baseline ? baseline.toFixed(2) : '—'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Drift %</div>
              <div className="kpi-value" style={{ color: driftIsHigh ? '#FF5C72' : 'var(--accent2)' }}>
                {baseline ? `${driftPctDisplay}%` : '—'}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Runs tracked</div>
              <div className="kpi-value">{runsTracked}</div>
            </div>
          </div>

          {drift.drift_detected && (
            <div className="card" style={{ borderColor: '#FF5C72', background: 'rgba(255,92,114,0.06)', marginBottom: 14 }}>
              <div style={{ fontSize: 14, color: '#FF5C72', fontWeight: 600 }}>
                ⚠ Drift detected — score dropped {driftPctDisplay}% from baseline.
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-label">Score trend {activeModelVersion ? `· ${activeModelVersion}` : ''}</div>
            {series.length === 0 ? (
              <div style={{ color: 'var(--mid)', fontSize: 13 }}>No runs in this window yet.</div>
            ) : (
              <div style={{ marginTop: 8 }}>
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight + 8}`}
                  preserveAspectRatio="none"
                  style={{ width: '100%', height: 140, background: 'var(--bg2)', borderRadius: 8 }}
                >
                  {/* baseline grid line at score 7 */}
                  <line
                    x1="0"
                    x2={chartWidth}
                    y1={chartHeight - (7 / 10) * chartHeight}
                    y2={chartHeight - (7 / 10) * chartHeight}
                    stroke="rgba(122,150,192,0.4)"
                    strokeWidth="0.4"
                    strokeDasharray="1.5 2"
                  />
                  {bars.map((bar, idx) => (
                    <g key={idx}>
                      <rect
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        fill={bar.color}
                        rx="0.6"
                      />
                    </g>
                  ))}
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--mid)' }}>
                  <div>{series[0]?.date}</div>
                  <div>{series[series.length - 1]?.date}</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="card">
        <div className="card-label">Alert configuration</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr auto', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <div className="field-label">Model version</div>
            <input
              type="text"
              className="input"
              placeholder="e.g. gpt-4o-mini"
              value={alertModelVersion}
              onChange={(e) => setAlertModelVersion(e.target.value)}
            />
          </div>
          <div>
            <div className="field-label">Drop threshold (%)</div>
            <input
              type="number"
              className="input"
              min="0"
              step="0.1"
              value={alertThresholdPct}
              onChange={(e) => setAlertThresholdPct(e.target.value)}
            />
          </div>
          <div>
            <div className="field-label">Alert channel</div>
            <select
              className="input"
              value={alertChannel}
              onChange={(e) => setAlertChannel(e.target.value)}
            >
              <option value="none">None</option>
              <option value="email">Email</option>
              <option value="slack">Slack webhook</option>
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveAlertConfig}
          >
            Save alert config
          </button>
        </div>
      </div>
    </div>
  );
}

