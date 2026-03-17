/**
 * src/pages/app/settings/BillingPage.jsx
 * ========================================
 * Plan overview, usage meters, and upgrade CTA.
 * Reads real usage from GET /usage/summary (existing endpoint).
 * No new backend endpoints needed.
 */

import { useEffect, useState } from 'react';
import { useAuth, getAuthHeader } from '../../../context/AuthContext';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  'https://ai-breaker-labs.vercel.app';

function getApiKey() {
  try { return JSON.parse(localStorage.getItem('abl_api_key')) || 'client_key'; }
  catch { return 'client_key'; }
}

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': getApiKey(),
      ...getAuthHeader(),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail || `Error ${res.status}`);
  return body;
}

// ─── Shared style tokens ──────────────────────────────────────────────────────

const S = {
  card: {
    background: '#0c1220',
    border: '1px solid rgba(33,57,90,0.7)',
    borderRadius: 12, padding: '22px 24px', marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'rgba(232,244,255,0.9)', marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12, color: 'rgba(142,168,199,0.65)', marginBottom: 18, lineHeight: 1.5,
  },
};

// ─── Usage meter ──────────────────────────────────────────────────────────────

function UsageMeter({ label, used, limit, unit = '' }) {
  const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct > 85 ? '#ff4d6d' : pct > 60 ? '#f0a500' : '#3bb4ff';
  const unlimited = !limit;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{
          fontSize: 12, color: 'rgba(232,244,255,0.8)',
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {label}
        </span>
        <span style={{
          fontSize: 11, color: 'rgba(142,168,199,0.7)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {unlimited
            ? `${used}${unit} / ∞`
            : `${used}${unit} / ${limit}${unit}`}
        </span>
      </div>
      <div style={{
        height: 5, borderRadius: 3,
        background: 'rgba(33,57,90,0.8)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 3,
          width: unlimited ? '0%' : `${pct}%`,
          background: unlimited ? 'none' : `linear-gradient(90deg, ${color}99, ${color})`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: '/month',
    color: 'rgba(142,168,199,0.6)',
    features: [
      '50 break runs/month',
      '20 tests per run',
      'Community support',
      'HTML reports',
    ],
    current: true,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$29',
    period: '/month',
    color: 'var(--neon-blue, #3bb4ff)',
    features: [
      '500 break runs / month',
      '100 tests per run',
      'PDF + HTML reports',
      'Saved targets',
      'Team sharing',
      'Priority support',
    ],
    current: false,
    cta: 'Upgrade to Pro',
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    color: 'var(--neon-green, #26f0b9)',
    features: [
      'Unlimited runs',
      'Custom test suites',
      'Dedicated support',
      'SSO / SAML',
      'Audit logs',
      'SLA guarantee',
    ],
    current: false,
    cta: 'Contact Sales',
  },
];

function PlanCard({ plan }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: plan.current ? 'rgba(59,180,255,0.05)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${plan.current ? 'rgba(59,180,255,0.25)' : 'rgba(33,57,90,0.6)'}`,
      borderRadius: 10, padding: '18px 16px',
      display: 'flex', flexDirection: 'column', gap: 14,
      position: 'relative',
    }}>
      {plan.current && (
        <div style={{
          position: 'absolute', top: -1, right: 12,
          background: 'rgba(59,180,255,0.15)',
          border: '1px solid rgba(59,180,255,0.3)',
          borderTop: 'none',
          fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--neon-blue, #3bb4ff)',
          padding: '3px 10px', borderRadius: '0 0 6px 6px',
          letterSpacing: '0.08em',
        }}>
          CURRENT
        </div>
      )}

      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: plan.color, marginBottom: 6 }}>
          {plan.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <span style={{
            fontSize: 26, fontWeight: 800,
            fontFamily: "'Space Grotesk', sans-serif",
            color: 'rgba(232,244,255,0.97)',
          }}>
            {plan.price}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(142,168,199,0.6)' }}>
            {plan.period}
          </span>
        </div>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {plan.features.map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: plan.color, fontSize: 12, flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: 12, color: 'rgba(232,244,255,0.75)' }}>{f}</span>
          </li>
        ))}
      </ul>

      {!plan.current && plan.cta && (
        <button
          onClick={() => alert(`${plan.cta} — Stripe integration coming soon.`)}
          style={{
            marginTop: 'auto', padding: '9px', borderRadius: 8,
            background: `${plan.color}14`,
            border: `1px solid ${plan.color}50`,
            color: plan.color,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = `${plan.color}24`}
          onMouseLeave={e => e.currentTarget.style.background = `${plan.color}14`}
        >
          {plan.cta}
        </button>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [usage,   setUsage]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/usage/summary')
      .then(setUsage)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const monthRuns    = usage?.month?.req_count    || 0;
  const monthSamples = usage?.month?.sample_count || 0;
  const totalRuns    = usage?.overall?.req_count  || 0;

  return (
    <div>
      {/* Current plan summary */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={S.sectionTitle}>Current Plan</div>
            <div style={S.sectionDesc}>You are on the Free plan.</div>
          </div>
          <div style={{
            padding: '6px 14px', borderRadius: 20,
            background: 'rgba(59,180,255,0.08)',
            border: '1px solid rgba(59,180,255,0.2)',
            fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--neon-blue, #3bb4ff)',
          }}>
            Free
          </div>
        </div>

        {/* Usage meters */}
        {loading ? (
          <div style={{ color: 'rgba(142,168,199,0.5)', fontSize: 12 }}>Loading usage…</div>
        ) : (
          <>
            <UsageMeter label="Break Runs This Month" used={monthRuns}    limit={50} />
            <UsageMeter label="Tests Run This Month"  used={monthSamples} limit={1000} />
            <UsageMeter label="Total Runs (All Time)" used={totalRuns}    limit={null} />
          </>
        )}

        {/* Renewal note */}
        <div style={{
          marginTop: 4, fontSize: 11.5,
          color: 'rgba(142,168,199,0.5)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Usage resets on the 1st of each month.
        </div>
      </div>

      {/* Plan comparison */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Plans</div>
        <div style={{
          ...S.sectionDesc,
          marginBottom: 16,
        }}>
          Upgrade for more runs, longer test suites, and team features.
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {PLANS.map(plan => <PlanCard key={plan.key} plan={plan} />)}
        </div>
      </div>

      {/* Billing history placeholder */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Billing History</div>
        <div style={S.sectionDesc}>Invoices and payment history will appear here.</div>
        <div style={{
          padding: '24px', textAlign: 'center',
          border: '1px dashed rgba(33,57,90,0.7)',
          borderRadius: 9, color: 'rgba(142,168,199,0.4)',
          fontSize: 13,
        }}>
          No billing history yet — you're on the Free plan.
        </div>
      </div>
    </div>
  );
}
