import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MOCK_INVOICES = [
  { id: '1', date: 'Mar 1, 2026', amount: '$0.00', statusKey: 'invoiceStatusPaid' },
];

export default function BillingPage() {
  const { t } = useTranslation();
  const usedAudits = 3;
  const maxAudits = 5;
  const pct = (usedAudits / maxAudits) * 100;
  const plans = ['vibe', 'deep', 'fix'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">{t('settings.billing.currentPlan')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
            <Zap size={20} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              {t('settings.billing.freePlan')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('settings.billing.auditsPerMonth')}</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('settings.billing.usage', { used: usedAudits, max: maxAudits })}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{pct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 'var(--radius-full)', background: pct > 80 ? 'var(--coral)' : 'var(--accent)', transition: 'width 0.5s ease' }} />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">{t('settings.billing.changePlan')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {plans.map((planId) => {
            const current = planId === 'vibe';
            return (
              <div key={planId} style={{ padding: 24, border: `1px solid ${current ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--radius-md)', background: current ? 'var(--accent-dim)' : 'var(--bg-surface)', position: 'relative' }}>
                {current && (
                  <div style={{ position: 'absolute', top: -10, insetInlineEnd: 16, background: 'var(--accent)', color: '#000', fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
                    {t('settings.billing.currentBadge')}
                  </div>
                )}
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{t(`settings.billing.plans.${planId}.name`)}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--hi)', marginBottom: 16, fontFamily: 'var(--font-display)' }}>{t(`settings.billing.plans.${planId}.price`)}</div>
                {current ? (
                  <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} disabled>{t('settings.billing.active')}</button>
                ) : (
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      if (import.meta.env.VITE_STRIPE_URL) {
                        window.location.href = import.meta.env.VITE_STRIPE_URL;
                      } else {
                        alert(t('settings.billing.checkoutSoon'));
                        window.location.href = `mailto:eslamsamy650@gmail.com?subject=Upgrade to ${t(`settings.billing.plans.${planId}.name`)}`;
                      }
                    }}
                  >
                    {t('settings.billing.upgrade')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">{t('settings.billing.invoiceHistory')}</div>
        <div style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('common.date')}</th>
                <th>{t('settings.billing.amount')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_INVOICES.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.date}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{invoice.amount}</td>
                  <td><span className="badge badge-green">{t(`settings.billing.${invoice.statusKey}`)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        <a href="#" style={{ color: 'var(--text-muted)' }}>{t('settings.billing.cancelPlan')}</a>
      </div>
    </div>
  );
}
