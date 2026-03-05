const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'evaluate', label: 'Run Evaluation' },
  { key: 'review', label: 'Review' },
  { key: 'reports', label: 'Reports' },
  { key: 'history', label: 'History' },
  { key: 'settings', label: 'API Usage' },
];

export default function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">LE</div>
        <div>
          <div className="brand-title">AI Breaker Lab</div>
          <div className="brand-sub">AI Stress-Test and Forensics</div>
        </div>
      </div>

      <nav className="nav-list">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${page === item.key ? 'active' : ''}`}
            onClick={() => setPage(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
