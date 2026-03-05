import { formatDate } from '../types/formatters';

export default function HistoryPage({ history = [], loading, error }) {
  return (
    <section className="page">
      <h1 className="page-title">Evaluation History</h1>
      {loading ? <div className="panel">Loading history...</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Dataset ID</th>
                <th>Model Version</th>
                <th>Evaluation Date</th>
                <th>Date</th>
                <th>Client</th>
                <th>Samples</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={`${row.report_id}-${row.timestamp}`}>
                  <td>{row.report_id}</td>
                  <td>{row.dataset_id || '-'}</td>
                  <td>{row.model_version || '-'}</td>
                  <td>{row.evaluation_date || '-'}</td>
                  <td>{formatDate(row.timestamp)}</td>
                  <td>{row.client_name || '-'}</td>
                  <td>{row.sample_count}</td>
                  <td>Done</td>
                </tr>
              ))}
              {!history.length ? (
                <tr><td colSpan={8} className="empty">No history found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
