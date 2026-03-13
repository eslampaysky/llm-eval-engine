/**
 * Billing settings.
 * - Uses existing GET /usage/summary endpoint for usage meters
 * - Three plan cards (Free/Pro/Enterprise) with upgrade placeholder CTAs
 */
import { useEffect, useMemo, useState } from 'react';
import { api, API_BASE, getApiKey } from '../../../App.jsx';

const S = {
  card: {
    background: '#0c1220',
    border: '1px solid rgba(33,57,90,0.7)',
    borderRadius: 12,
    padding: '22px 24px',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 800,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'rgba(232,244,255,0.9)',
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: 'rgba(142,168,199,0.65)',
    marginBottom: 18,
    lineHeight: 1.5,
  },
};

function UsageMeter({ label, used, limit, unit = '' }) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
  const unlimited = !limit;

  const barBg = useMemo(() => {
    if (unlimited) return 'none';
    if (pct > 85) return 'linear-gradient(90deg, rgba(255,77,109,0.7), #ff4d6d)';
    if (pct > 60) return 'linear-gradient(90deg, var(--accent), var(--accent2))';
    return 'linear-gradient(90deg, rgba(38,240,185,0.55), var(--accent2))';
  }, [pct, unlimited]);

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 12, color: 'rgba(232,244,255,0.8)', fontFamily: "'Space Grotesk', sans-serif" }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(142,168,199,0.7)', fontFamily: "'JetBrains Mono', monospace" }}>
          {unlimited ? `${used}${unit} / inf` : `${used}${unit} / ${limit}${unit}`}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(33,57,90,0.8)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            borderRadius: 3,
            width: unlimited ? '0%' : `${pct}%`,
            background: barBg,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: '/month',
    color: 'rgba(142,168,199,0.65)',
    current: true,
    features: ['50 break runs/month', '20 tests per run', 'Community support', 'Multi-provider support'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$29',
    period: '/month',
    color: 'var(--accent)',
    cta: 'Upgrade to Pro',
    features: [
      '500 break runs / month',
      '100 tests per run',
      'PDF + HTML reports',
      'Saved targets',
      'Team sharing',
      'Priority support',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    color: 'var(--accent2)',
    cta: 'Contact sales',
    features: ['Team workspaces', 'SAML/SSO', 'Custom policies', 'Dedicated support'],
  },
];

function PlanCard({ plan }) {
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': getApiKey(),
        },
        body: JSON.stringify({ plan: 'pro' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || `Request failed (${res.status})`);
      if (!body?.url) throw new Error('Missing checkout URL');
      window.location.href = body.url;
    } catch (e) {
      alert(e?.message || 'Failed to start checkout');
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 220,
        borderRadius: 12,
        padding: '18px 16px',
        border: plan.current ? `1px solid ${plan.color}55` : '1px solid rgba(33,57,90,0.7)',
        background: plan.current ? `${plan.color}10` : 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 900, color: 'rgba(232,244,255,0.93)' }}>{plan.name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 900,
              fontFamily: "'Space Grotesk', sans-serif",
              color: 'rgba(232,244,255,0.97)',
            }}
          >
            {plan.price}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(142,168,199,0.6)' }}>{plan.period}</span>
        </div>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: plan.color, fontSize: 12, flexShrink: 0 }}>+</span>
            <span style={{ fontSize: 12, color: 'rgba(232,244,255,0.75)' }}>{f}</span>
          </li>
        ))}
      </ul>

      {!plan.current && plan.cta && (
        <button
          type="button"
          onClick={() => (plan.key === 'pro' ? startCheckout() : alert(`${plan.cta} - Stripe integration coming soon.`))}
          disabled={loading}
          style={{
            marginTop: 'auto',
            padding: '9px',
            borderRadius: 8,
            background: `${plan.color}14`,
            border: `1px solid ${plan.color}55`,
            color: plan.color,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.12s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${plan.color}24`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `${plan.color}14`;
          }}
        >
          {plan.key === 'pro' && loading ? 'Creating checkout...' : plan.cta}
        </button>
      )}
    </div>
  );
}

export default function BillingPage() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);

  useEffect(() => {
    api
      .getUsageSummary()
      .then(setUsage)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const monthRuns = usage?.month?.req_count || 0;
  const monthSamples = usage?.month?.sample_count || 0;
  const totalRuns = usage?.overall?.req_count || 0;

  async function startTopupCheckout() {
    if (topupLoading) return;
    setTopupLoading(true);
    try {
      const res = await fetch(`${API_BASE}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': getApiKey(),
        },
        body: JSON.stringify({ plan: 'run_pack_100' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || `Request failed (${res.status})`);
      if (!body?.url) throw new Error('Missing checkout URL');
      window.location.href = body.url;
    } catch (e) {
      alert(e?.message || 'Failed to start checkout');
      setTopupLoading(false);
    }
  }

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={S.sectionTitle}>Current Plan</div>
            <div style={S.sectionDesc}>You are on the Free plan.</div>
          </div>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              background: 'var(--accent-dim)',
              border: '1px solid rgba(59,180,255,0.22)',
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--accent)',
            }}
          >
            Free
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'rgba(142,168,199,0.5)', fontSize: 12 }}>Loading usage...</div>
        ) : (
          <>
            <UsageMeter label="Break Runs This Month" used={monthRuns} limit={50} />
            <UsageMeter label="Tests Run This Month" used={monthSamples} limit={1000} />
            <UsageMeter label="Total Runs (All Time)" used={totalRuns} limit={null} />
          </>
        )}

        <div
          style={{
            marginTop: 4,
            fontSize: 11.5,
            color: 'rgba(142,168,199,0.5)',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Usage resets on the 1st of each month.
        </div>
      </div>

      <div style={S.card}>
        <div style={S.sectionTitle}>Plans</div>
        <div style={{ ...S.sectionDesc, marginBottom: 16 }}>
          Upgrade for more runs, longer test suites, and team features.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {PLANS.map((plan) => (
            <PlanCard key={plan.key} plan={plan} />
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.sectionTitle}>Top-up Runs</div>
        <div style={S.sectionDesc}>
          Top-up runs never expire and stack with your monthly plan limit.
        </div>

        <button
          type="button"
          onClick={startTopupCheckout}
          disabled={topupLoading}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--accent-dim)',
            border: '1px solid rgba(59,180,255,0.22)',
            color: 'var(--accent)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 900,
            cursor: topupLoading ? 'not-allowed' : 'pointer',
            opacity: topupLoading ? 0.7 : 1,
            transition: 'all 0.12s',
          }}
        >
          {topupLoading ? 'Creating checkout...' : 'Buy 100 extra runs — $10'}
        </button>
      </div>

      <div style={S.card}>
        <div style={S.sectionTitle}>Billing History</div>
        <div style={S.sectionDesc}>Invoices and payment history will appear here.</div>
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            border: '1px dashed rgba(33,57,90,0.7)',
            borderRadius: 9,
            color: 'rgba(142,168,199,0.4)',
            fontSize: 13,
          }}
        >
          No billing history yet - you're on the Free plan.
        </div>
      </div>
    </div>
  );
}
