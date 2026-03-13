import { Link } from 'react-router-dom';

export default function BillingSuccessPage() {
  return (
    <section className="page fade-in" style={{ maxWidth: 880, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-eyebrow">// billing · success</div>
        <div className="page-title">Payment confirmed</div>
        <div className="page-desc">
          Thanks for upgrading. Your access will update shortly. If it does not show up in a minute, refresh the
          billing page.
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 14, color: 'var(--hi)' }}>
          What happens next
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, color: 'var(--mid)' }}>
          <li>We verify your Paddle transaction.</li>
          <li>Your plan and usage limits update automatically.</li>
          <li>You can start higher-volume runs right away.</li>
        </ul>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          <Link className="btn btn-primary" to="/app/settings/billing">Go to Billing</Link>
          <Link className="btn btn-ghost" to="/app/dashboard">Back to Dashboard</Link>
        </div>
      </div>
    </section>
  );
}
