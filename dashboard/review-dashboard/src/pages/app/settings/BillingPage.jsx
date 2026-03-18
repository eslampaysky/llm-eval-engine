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

      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">Change Plan</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { id: 'vibe', name: 'Vibe Check', price: 'Free', current: true },
            { id: 'deep', name: 'Deep Dive', price: '$29/mo', current: false },
            { id: 'fix', name: 'Fix & Verify', price: '$79/mo', current: false },
          ].map((plan) => (
            <div key={plan.id} style={{
              padding: 24, border: `1px solid ${plan.current ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--radius-md)',
              background: plan.current ? 'var(--accent-dim)' : 'var(--bg-surface)',
              position: 'relative'
            }}>
              {plan.current && (
                <div style={{ position: 'absolute', top: -10, right: 16, background: 'var(--accent)', color: '#000', fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>CURRENT</div>
              )}
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--hi)', marginBottom: 16, fontFamily: 'var(--font-display)' }}>{plan.price}</div>
              {plan.current ? (
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} disabled>Active</button>
              ) : (
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
                  if (import.meta.env.VITE_STRIPE_URL) {
                    window.location.href = import.meta.env.VITE_STRIPE_URL;
                  } else {
                    alert('Checkout coming soon! We will email you access.');
                    window.location.href = "mailto:eslamsamy650@gmail.com?subject=Upgrade to " + plan.name;
                  }
                }}>Upgrade</button>
              )}
            </div>
          ))}
        </div>
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
