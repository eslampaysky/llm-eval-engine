import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../../App.jsx';
import { buildTargets } from './TargetsPage.jsx';

export default function TargetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [target, setTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getReports()
      .then((rows) => {
        const match = buildTargets(rows).find((item) => item.id === id) || null;
        setTarget(match);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// app · target detail</div>
        <div className="page-title">{target?.name || 'Target detail'}</div>
        <div className="page-desc">{target?.description || 'Runs associated with this target.'}</div>
      </div>

      {error && <div className="err-box">⚠ {error}</div>}
      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div> : !target ? (
        <div className="card">
          <div className="card-label">Not found</div>
          <div style={{ color: 'var(--mid)', marginBottom: 12 }}>This target does not exist in the current run history.</div>
          <Link className="btn btn-ghost" to="/app/targets">Back to targets</Link>
        </div>
      ) : (
        <div className="card">
          <div className="card-label">{target.modelType}</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Run</th><th>Date</th><th>Tests</th><th>Status</th></tr>
              </thead>
              <tbody>
                {target.runs.map((run) => (
                  <tr key={run.report_id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/runs/${run.report_id}`)}>
                    <td>{run.report_id}</td>
                    <td>{fmtDate(run.created_at)}</td>
                    <td>{run.sample_count ?? '—'}</td>
                    <td>{run.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
