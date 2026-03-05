import { useMemo, useState } from 'react';

function sortRows(rows, sort) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const av = a[sort.key] ?? 0;
    const bv = b[sort.key] ?? 0;
    if (typeof av === 'string') {
      return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sort.dir === 'asc' ? av - bv : bv - av;
  });
  return sorted;
}

export default function ResultsTable({ rows = [] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'correctness', dir: 'desc' });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((row) =>
          String(row.question || '').toLowerCase().includes(q) ||
          String(row.model_answer || '').toLowerCase().includes(q)
        )
      : rows;
    return sortRows(base, sort);
  }, [rows, query, sort]);

  const onSort = (key) => {
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    const header = ['question', 'correctness', 'relevance', 'hallucination', 'reason'];
    const lines = [header.join(',')];
    for (const row of filtered) {
      lines.push(header.map((k) => `"${String(row[k] ?? '').replaceAll('"', '""')}"`).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'evaluation_results.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="panel">
      <div className="table-head">
        <h3 className="panel-title">Evaluation Results</h3>
        <div className="table-actions">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by question/answer" />
          <button type="button" className="ghost-btn" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th onClick={() => onSort('question')}>Question</th>
              <th onClick={() => onSort('correctness')}>Correctness</th>
              <th onClick={() => onSort('relevance')}>Relevance</th>
              <th onClick={() => onSort('hallucination')}>Hallucination</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, idx) => (
              <tr key={`${idx}-${row.question}`}>
                <td>{row.question}</td>
                <td>{row.correctness}</td>
                <td>{row.relevance}</td>
                <td>{String(row.hallucination)}</td>
                <td>{String(row.reason || '').slice(0, 120)}</td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan={5} className="empty">No evaluation results yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
