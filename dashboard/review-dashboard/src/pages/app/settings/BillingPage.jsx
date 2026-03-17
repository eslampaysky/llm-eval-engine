import { Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

const MOCK_INVOICES = [
  { id: '1', date: 'Mar 1, 2026', amount: '$0.00', status: 'Paid' },
];

export default function BillingPage() {
  const usedAudits = 3;
  const maxAudits = 5;
  const pct = (usedAudits / maxAudits) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">Current Plan</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)',
            background: 'var(--accent-dim)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--accent)',
          }}>
            <Zap size={20} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Vibe Check — Free
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>5 audits per month</div>
          </div>
        </div>

        {/* Usage bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {usedAudits} of {maxAudits} audits used
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {pct.toFixed(0)}%
            </span>
          </div>
          <div style={{
            height: 6, background: 'var(--bg-surface)', borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-full)',
              background: pct > 80 ? 'var(--coral)' : 'var(--accent)',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>

        <Link to="/pricing" className="btn btn-primary">Upgrade Plan</Link>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">Invoice History</div>
        <div style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_INVOICES.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.date}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{inv.amount}</td>
                  <td><span className="badge badge-green">{inv.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        <a href="#" style={{ color: 'var(--text-muted)' }}>Cancel plan</a>
      </div>
    </div>
  );
}
