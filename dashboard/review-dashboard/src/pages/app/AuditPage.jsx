import { useEffect, useState } from 'react';
import { api, apiFetch, fmtDate } from '../../App.jsx';

const STANDARD_OPTIONS = [
  { value: 'eu_ai_act', label: 'EU AI Act' },
  { value: 'iso_42001', label: 'ISO/IEC 42001' },
];

const RISK_OPTIONS = [
  { value: 'high', label: 'High-risk' },
  { value: 'limited', label: 'Limited risk' },
  { value: 'minimal', label: 'Minimal risk' },
];

export default function AuditPage() {
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [error, setError] = useState('');

  const [standard, setStandard] = useState('eu_ai_act');
  const [riskLevel, setRiskLevel] = useState('high');
  const [selectedReportId, setSelectedReportId] = useState('');
  const [outputFormat, setOutputFormat] = useState('html');

  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    setLoadingReports(true);
    setError('');
    api.getReports()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setReports(list);
        if (list.length > 0) {
          setSelectedReportId(list[0].report_id);
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load reports');
      })
      .finally(() => setLoadingReports(false));
  }, []);

  const handleGenerate = async () => {
    if (!selectedReportId) return;
    setGenerating(true);
    setError('');
    setPreviewHtml('');
    try {
      await apiFetch(`/report/${selectedReportId}/compliance`, {
        method: 'POST',
        body: JSON.stringify({
          standard,
          risk_level: riskLevel,
          output_format: outputFormat,
        }),
      });
      const html = await apiFetch(`/report/${selectedReportId}/compliance-html`);
      if (typeof html === 'string') {
        setPreviewHtml(html);
      } else if (html && typeof html.content === 'string') {
        setPreviewHtml(html.content);
      }
    } catch (err) {
      setError(err.message || 'Failed to generate compliance report');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadHtml = () => {
    if (!previewHtml) return;
    const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_${selectedReportId || 'report'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// workspace · audit</div>
        <div className="page-title">Audit & Compliance Report</div>
        <div className="page-desc">
          Generate EU AI Act and ISO/IEC 42001-style compliance certificates from completed evaluation runs.
        </div>
      </div>

      {error && <div className="err-box">⚠ {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1.1fr)', gap: 16 }}>
        <div className="card">
          <div className="card-label">Compliance configuration</div>
          {loadingReports ? (
            <div style={{ padding: '12px 0', color: 'var(--mid)', fontSize: 13 }}>
              Loading reports…
            </div>
          ) : reports.length === 0 ? (
            <div style={{ padding: '12px 0', color: 'var(--mid)', fontSize: 13 }}>
              No completed runs yet. Generate a report from the playground before creating a compliance certificate.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
              <div>
                <div className="field-label">Standard</div>
                <select
                  className="input"
                  value={standard}
                  onChange={(e) => setStandard(e.target.value)}
                >
                  {STANDARD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="field-label">Risk classification</div>
                <select
                  className="input"
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(e.target.value)}
                >
                  {RISK_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="field-label">Source run</div>
                <select
                  className="input"
                  value={selectedReportId}
                  onChange={(e) => setSelectedReportId(e.target.value)}
                >
                  {reports.map((r) => (
                    <option key={r.report_id} value={r.report_id}>
                      {r.report_id.slice(0, 8)} · {r.model_version || 'unknown'} · {fmtDate(r.created_at)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="field-label">Output format</div>
                <select
                  className="input"
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                >
                  <option value="html">HTML (print-ready)</option>
                  <option value="pdf" disabled>PDF — coming soon</option>
                </select>
              </div>

              <div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGenerate}
                  disabled={generating || !selectedReportId}
                >
                  {generating ? 'Generating…' : 'Generate compliance report'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-label">Preview</div>
          {!previewHtml ? (
            <div style={{ fontSize: 13, color: 'var(--mid)', paddingTop: 6 }}>
              Configure a run and click &ldquo;Generate compliance report&rdquo; to see a live preview here.
            </div>
          ) : (
            <>
              <iframe
                title="Compliance preview"
                srcDoc={previewHtml}
                style={{
                  width: '100%',
                  height: 500,
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  background: 'white',
                }}
              />
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleDownloadHtml}
                >
                  Download HTML
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

