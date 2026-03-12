import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../../App.jsx';

export default function TargetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [target, setTarget] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [targetRow, reportRows] = await Promise.all([
          api.getTarget(id),
          api.getReports(),
        ]);
        if (!active) return;
        const reportIds = new Set((targetRow.report_ids || []).map(String));
        const filtered = (reportRows || []).filter((row) => {
          if (reportIds.size > 0) {
            return reportIds.has(String(row.report_id));
          }
          return row.target_id && String(row.target_id) === String(id);
        });
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setTarget(targetRow);
        setRuns(filtered);
      } catch (err) {
        if (!active) return;
        setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [id]);

  const meta = useMemo(() => {
    if (!target) return [];
    return [
      { label: 'Type', value: target.target_type || '--' },
      { label: 'Base URL', value: target.base_url || '--' },
      { label: 'Model', value: target.model_name || '--' },
      { label: 'Created', value: fmtDate(target.created_at) },
    ];
  }, [target]);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// app - target detail</div>
        <div className="page-title">{target?.name || 'Target detail'}</div>
        <div className="page-desc">{target?.description || 'Runs associated with this target.'}</div>
      </div>

      {error && <div className="err-box">Error: {error}</div>}
      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : !target ? (
        <div className="card">
          <div className="card-label">Not found</div>
          <div style={{ color: 'var(--mid)', marginBottom: 12 }}>
            This target does not exist in the current workspace.
          </div>
          <Link className="btn btn-ghost" to="/app/targets">Back to targets</Link>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-label">Target metadata</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {meta.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 16,
                    borderBottom: '1px solid var(--line)',
                    paddingBottom: 8,
                  }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--mute)' }}>
                    {row.label}
                  </span>
                  <span style={{ color: 'var(--text)', fontSize: 12.5, textAlign: 'right', wordBreak: 'break-all' }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-label">Break runs</div>
            {runs.length === 0 ? (
              <div style={{ color: 'var(--mid)' }}>
                No runs are associated with this target yet.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Date</th>
                      <th>Tests</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.report_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/runs/${run.report_id}`)}>
                        <td>{run.report_id}</td>
                        <td>{fmtDate(run.created_at)}</td>
                        <td>{run.sample_count ?? '--'}</td>
                        <td>{run.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
