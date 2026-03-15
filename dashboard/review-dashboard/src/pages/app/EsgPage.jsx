import { useEffect, useMemo, useState } from 'react';
import { api } from '../../App.jsx';

export default function EsgPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.getReports()
      .then((rows) => {
        setReports(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load reports');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const {
    totalCo2,
    totalKwh,
    totalTokens,
    evalsTracked,
    avgCostPerEval,
    byProvider,
  } = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let totalCo2 = 0;
    let totalKwh = 0;
    let totalTokens = 0;
    let evalsTracked = 0;
    let totalCost = 0;
    let costCount = 0;
    const byProvider = {};

    for (const r of reports || []) {
      const createdAt = r.created_at ? new Date(r.created_at) : null;
      if (!createdAt || createdAt < cutoff) continue;

      const rawEsg = r.esg_metrics;
      if (!rawEsg) continue;

      let esg;
      if (typeof rawEsg === 'string') {
        try {
          esg = JSON.parse(rawEsg);
        } catch {
          // skip malformed
          // eslint-disable-next-line no-continue
          continue;
        }
      } else {
        esg = rawEsg;
      }
      if (!esg) continue;

      const co2 = Number(esg.co2_grams || 0);
      const kwh = Number(esg.kwh || 0);
      const tokens = Number(esg.tokens_used || 0);
      const provider = (esg.provider || 'unknown').toString();

      totalCo2 += co2;
      totalKwh += kwh;
      totalTokens += tokens;
      evalsTracked += 1;

      if (typeof r.total_cost_usd === 'number') {
        totalCost += r.total_cost_usd || 0;
        costCount += 1;
      }

      if (!byProvider[provider]) {
        byProvider[provider] = {
          provider,
          co2_grams: 0,
          kwh: 0,
          tokens: 0,
          evals: 0,
        };
      }
      byProvider[provider].co2_grams += co2;
      byProvider[provider].kwh += kwh;
      byProvider[provider].tokens += tokens;
      byProvider[provider].evals += 1;
    }

    const avgCostPerEval = costCount > 0 ? totalCost / costCount : 0;

    return {
      totalCo2,
      totalKwh,
      totalTokens,
      evalsTracked,
      avgCostPerEval,
      byProvider,
    };
  }, [reports]);

  const providerEntries = Object.values(byProvider);
  const maxCo2 = providerEntries.reduce((max, p) => (p.co2_grams > max ? p.co2_grams : max), 0) || 1;

  const handleDownloadCsv = () => {
    const rows = [
      ['provider', 'co2_grams', 'kwh', 'tokens', 'evals'],
      ...providerEntries.map((p) => [
        p.provider,
        String(p.co2_grams),
        String(p.kwh),
        String(p.tokens),
        String(p.evals),
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'esg_metrics.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGeneratePdf = () => {
    setToast('ESG PDF export is coming soon.');
    setTimeout(() => setToast(''), 2500);
  };

  const showTip = totalCo2 > 100;

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// observability · esg</div>
        <div className="page-title">ESG / Energy</div>
        <div className="page-desc">
          Carbon footprint and energy metrics for your evaluation runs, aggregated by provider.
        </div>
      </div>

      {error && <div className="err-box">⚠ {error}</div>}
      {loading && !error && (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="kpi-row">
            <div className="kpi">
              <div className="kpi-label">Total CO₂ (30d)</div>
              <div className="kpi-value">{totalCo2 ? totalCo2.toFixed(1) : '0.0'} g</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Total kWh (30d)</div>
              <div className="kpi-value">{totalKwh ? totalKwh.toFixed(3) : '0.000'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Avg cost per eval</div>
              <div className="kpi-value">
                {evalsTracked ? `$${avgCostPerEval.toFixed(4)}` : '—'}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Evals tracked</div>
              <div className="kpi-value">{evalsTracked}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-label">CO₂ by provider (30d)</div>
            {providerEntries.length === 0 ? (
              <div style={{ color: 'var(--mid)', fontSize: 13 }}>No ESG data yet. Run some evaluations to populate this chart.</div>
            ) : (
              <svg
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                style={{ width: '100%', height: 140, marginTop: 8, background: 'var(--bg2)', borderRadius: 8 }}
              >
                {providerEntries.map((p, idx) => {
                  const yStep = 10 / providerEntries.length;
                  const y = idx * yStep + 1;
                  const barHeight = yStep - 1.2;
                  const width = (p.co2_grams / maxCo2) * 90;
                  const color = '#3DDC97';
                  return (
                    <g key={p.provider}>
                      <rect
                        x="8"
                        y={y}
                        width={width}
                        height={barHeight}
                        fill={color}
                        rx="0.6"
                      />
                      <text
                        x="2"
                        y={y + barHeight / 2}
                        dominantBaseline="middle"
                        fontSize="1.6"
                        fill="var(--mid)"
                      >
                        {p.provider}
                      </text>
                      <text
                        x={8 + width + 1}
                        y={y + barHeight / 2}
                        dominantBaseline="middle"
                        fontSize="1.6"
                        fill="var(--mid)"
                      >
                        {p.co2_grams.toFixed(1)} g
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-label">Sustainability tip</div>
            {showTip ? (
              <div style={{ fontSize: 13, color: 'var(--hi)' }}>
                Your evaluations emitted more than 100 g CO₂ in the last 30 days.
                Consider switching to providers like Groq or Ollama for lower-carbon evaluations,
                or reducing test frequency for non-critical models.
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--mid)' }}>
                Your evaluation footprint is relatively low for the last 30 days.
                Keep consolidating runs on efficient providers and re-using reports where possible.
              </div>
            )}
          </div>

          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="card-label">Exports</div>
              <div style={{ fontSize: 12, color: 'var(--mid)' }}>
                Pull ESG metrics into your own dashboards or compliance reports.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleDownloadCsv}
                disabled={providerEntries.length === 0}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGeneratePdf}
              >
                Generate ESG PDF
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div
          className="card"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            maxWidth: 260,
            zIndex: 50,
            background: 'var(--bg3)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--hi)' }}>{toast}</div>
        </div>
      )}
    </div>
  );
}

