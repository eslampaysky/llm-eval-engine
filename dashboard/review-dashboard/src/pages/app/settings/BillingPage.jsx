/**
 * Billing settings.
 * - Uses existing GET /usage/summary endpoint for usage meters
 * - Three plan cards (Free/Pro/Enterprise) with upgrade placeholder CTAs
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../App.jsx';

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

function RunsUsageBar({ used, limit }) {
  const unlimited = limit == null;
  const pct = unlimited || limit === 0 ? 0 : Math.min((used / limit) * 100, 100);
  const color = pct >= 90 ? '#ff4d6d' : pct >= 60 ? '#f0a500' : '#26f0b9';
  const bg = pct >= 90
    ? 'linear-gradient(90deg, rgba(255,77,109,0.7), #ff4d6d)'
    : pct >= 60
      ? 'linear-gradient(90deg, rgba(240,165,0,0.7), #f0a500)'
      : 'linear-gradient(90deg, rgba(38,240,185,0.55), var(--accent2))';

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 12, color: 'rgba(232,244,255,0.8)', fontFamily: "'Space Grotesk', sans-serif" }}>
          Monthly Runs
        </span>
        <span style={{ fontSize: 11, color, fontFamily: "'JetBrains Mono', monospace" }}>
          {unlimited ? `${used} / inf` : `${used} / ${limit} runs used this month`}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(33,57,90,0.8)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            borderRadius: 999,
            width: unlimited ? '0%' : `${pct}%`,
            background: bg,
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

function PlanCard({ plan, loading, error, onCheckout }) {
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
          onClick={() => onCheckout(plan.key)}
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
          {loading ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <div className="spinner" style={{ width: 12, height: 12 }} />
              Redirecting...
            </span>
          ) : (
            plan.cta
          )}
        </button>
      )}
      {!!error && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#ff7b91' }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState({});
  const [planError, setPlanError] = useState({});

  useEffect(() => {
    apiFetch('/auth/me')
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const monthRuns = profile?.runs_this_month || 0;
  const totalRuns = profile?.total_runs_all_time || 0;
  const planKey = (profile?.plan || 'free').toLowerCase();
  const planLabel = planKey ? `${planKey[0].toUpperCase()}${planKey.slice(1)}` : 'Free';
  const planRunLimit = Number.isFinite(profile?.run_limit)
    ? profile.run_limit
    : null;
  const plansWithCurrent = PLANS.map((plan) => ({ ...plan, current: plan.key === planKey }));
  const expiresAt = profile?.plan_expires_at ? new Date(profile.plan_expires_at) : null;
  const expiresText = expiresAt && !Number.isNaN(expiresAt.getTime())
    ? expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
    : null;
  const badgeStyles = {
    free: { background: 'rgba(142,168,199,0.12)', border: '1px solid rgba(142,168,199,0.3)', color: '#8ea8c7' },
    pro: { background: 'rgba(59,180,255,0.12)', border: '1px solid rgba(59,180,255,0.35)', color: '#3bb4ff' },
    enterprise: { background: 'rgba(168,85,247,0.16)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' },
  };
  const badgeStyle = badgeStyles[planKey] || badgeStyles.free;

  async function startPlanCheckout(planKey) {
    if (planLoading[planKey]) return;
    setPlanLoading((prev) => ({ ...prev, [planKey]: true }));
    setPlanError((prev) => ({ ...prev, [planKey]: '' }));
    try {
      const data = await apiFetch('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: planKey }),
      });
      if (!data?.checkout_url) throw new Error('Missing checkout URL');
      window.location.href = data.checkout_url;
    } catch (e) {
      setPlanError((prev) => ({ ...prev, [planKey]: e?.message || 'Failed to start checkout' }));
    } finally {
      setPlanLoading((prev) => ({ ...prev, [planKey]: false }));
    }
  }

  const runPackLoading = !!planLoading.run_pack_100;
  const runPackError = planError.run_pack_100;

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={S.sectionTitle}>Current Plan</div>
            <div style={S.sectionDesc}>
              {loading ? 'Loading plan...' : `You are on the ${planLabel} plan.`}
            </div>
          </div>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              ...badgeStyle,
            }}
          >
            {planLabel}
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'rgba(142,168,199,0.5)', fontSize: 12 }}>Loading usage...</div>
        ) : (
          <>
            <RunsUsageBar used={monthRuns} limit={planRunLimit} />
            <div style={{ fontSize: 11, color: 'rgba(142,168,199,0.6)', fontFamily: "'JetBrains Mono', monospace" }}>
              Total runs (all time): {totalRuns}
            </div>
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

      {!loading && planKey === 'free' && (
        <div style={{ ...S.card, border: '1px solid rgba(59,180,255,0.35)', background: 'rgba(59,180,255,0.06)' }}>
          <div style={{ ...S.sectionTitle, marginBottom: 6 }}>Upgrade to Pro</div>
          <div style={{ ...S.sectionDesc, marginBottom: 14 }}>
            Unlock 500 monthly runs, longer test suites, and priority support.
          </div>
          <button
            type="button"
            onClick={() => startPlanCheckout('pro')}
            disabled={!!planLoading.pro}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'var(--accent-dim)',
              border: '1px solid rgba(59,180,255,0.35)',
              color: 'var(--accent)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 900,
              cursor: planLoading.pro ? 'not-allowed' : 'pointer',
              opacity: planLoading.pro ? 0.7 : 1,
              transition: 'all 0.12s',
            }}
          >
            {planLoading.pro ? 'Redirecting...' : 'Upgrade to Pro'}
          </button>
          {!!planError.pro && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#ff7b91' }}>
              {planError.pro}
            </div>
          )}
        </div>
      )}

      {!loading && planKey !== 'free' && (
        <div style={S.card}>
          <div style={S.sectionTitle}>{planLabel} Plan — active</div>
          <div style={S.sectionDesc}>
            {expiresText ? `Active until ${expiresText}.` : 'Active subscription on file.'}
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.sectionTitle}>Plans</div>
        <div style={{ ...S.sectionDesc, marginBottom: 16 }}>
          Upgrade for more runs, longer test suites, and team features.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {plansWithCurrent.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              loading={!!planLoading[plan.key]}
              error={planError[plan.key]}
              onCheckout={startPlanCheckout}
            />
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
          onClick={() => startPlanCheckout('run_pack_100')}
          disabled={runPackLoading}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--accent-dim)',
            border: '1px solid rgba(59,180,255,0.22)',
            color: 'var(--accent)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 900,
            cursor: runPackLoading ? 'not-allowed' : 'pointer',
            opacity: runPackLoading ? 0.7 : 1,
            transition: 'all 0.12s',
          }}
        >
          {runPackLoading ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <div className="spinner" style={{ width: 12, height: 12 }} />
              Redirecting...
            </span>
          ) : (
            'Buy 100 extra runs — $10'
          )}
        </button>
        {!!runPackError && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#ff7b91' }}>
            {runPackError}
          </div>
        )}
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
