import { formatDate } from '../types/formatters';

export default function ReportsPage({ reports = [], loading, error, apiBaseUrl }) {
  return (
    <section className="page">
      <h1 className="page-title">HTML Reports</h1>
      {loading ? <div className="panel">Loading reports...</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Date</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.file_name}>
                  <td>{report.id}</td>
                  <td>{formatDate(report.created_at)}</td>
                  <td>{report.reviewed ? 'Reviewed' : 'Evaluation'}</td>
                  <td>
                    <a className="inline-link" href={`${apiBaseUrl}${report.url}`} target="_blank" rel="noreferrer">View HTML</a>
                    {' | '}
                    <a className="inline-link" href={`${apiBaseUrl}${report.url}`} download>Download</a>
                  </td>
                </tr>
              ))}
              {!reports.length ? (
                <tr><td colSpan={4} className="empty">No reports found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
