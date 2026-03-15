import { useState } from 'react';
import { Link } from 'react-router-dom';

import { apiFetch } from '../../App.jsx';

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: '/month',
    desc: 'For solo builders shipping AI-built web apps.',
    current: true,
    features: [
      '3 web audits / month',
      '20 tests per run',
      'Video replays',
      'AI fix prompts',
      'Community support',
    ],
    cta: 'Get Started',
    ctaTo: '/auth/signup',
    highlight: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '$99',
    period: '/month',
    desc: 'For teams shipping AI-powered web apps.',
    current: false,
    features: [
      '200 web audits / month',
      '75 tests per run',
      'PR comment bot',
      'Team sharing + share links',
      'Audit exports',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    ctaTo: '/auth/signup',
    highlight: true,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For orgs with compliance, security, and scale.',
    current: false,
    features: [
      'Unlimited audits',
      'Custom test suites',
      'SSO / SAML',
      'Audit logs + exports',
      'Dedicated support',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    ctaTo: '',
    highlight: false,
  },
];

export default function PricingPage() {
  const [planLoading, setPlanLoading] = useState({});
  const [planError, setPlanError] = useState({});
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState('');
  const [contactForm, setContactForm] = useState({ name: '', email: '', company: '', use_case: '' });

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

  async function submitContactSales(e) {
    e.preventDefault();
    if (contactSubmitting) return;
    setContactSubmitting(true);
    setContactError('');
    try {
      const res = await fetch(`${API_BASE}/contact-sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || `Request failed (${res.status})`);
      setContactSuccess(true);
    } catch (err) {
      setContactError(err?.message || 'Failed to submit.');
    } finally {
      setContactSubmitting(false);
    }
  }

  return (
    <section className="page fade-in" style={{ maxWidth: 980, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-eyebrow">// public · pricing</div>
        <div className="page-title">Simple, transparent pricing</div>
        <div className="page-desc">Start free. Upgrade when you need more runs, longer test suites, or team features.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        {PLANS.map((plan) => (
          <div
            key={plan.key}
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              border: plan.highlight ? '1px solid var(--accent, #3bb4ff)' : undefined,
              position: 'relative',
            }}
          >
            {plan.highlight && (
              <div style={{
                position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                background: 'var(--accent, #3bb4ff)', color: '#000',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                padding: '3px 12px', borderRadius: '0 0 6px 6px',
              }}>
                MOST POPULAR
              </div>
            )}

            <div>
              <div className="card-label">{plan.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '8px 0 4px' }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--hi)' }}>{plan.price}</span>
                <span style={{ fontSize: 13, color: 'var(--mid)' }}>{plan.period}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--mid)' }}>{plan.desc}</div>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {plan.features.map((f) => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--mid)' }}>
                  <span style={{ color: 'var(--accent, #3bb4ff)', flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {plan.key === 'pro' ? (
              <button
                type="button"
                className={`btn ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => startPlanCheckout(plan.key)}
                disabled={!!planLoading[plan.key]}
                style={{ marginTop: 'auto', textAlign: 'center' }}
              >
                {planLoading[plan.key] ? 'Redirecting to checkout...' : plan.cta}
              </button>
            ) : plan.key === 'enterprise' ? (
              <button
                type="button"
                className={`btn ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  setContactOpen(true);
                  setContactSuccess(false);
                  setContactError('');
                }}
                style={{ marginTop: 'auto', textAlign: 'center' }}
              >
                {plan.cta}
              </button>
            ) : (
              <Link
                className={`btn ${plan.highlight ? 'btn-primary' : 'btn-ghost'}`}
                to={plan.ctaTo}
                style={{ marginTop: 'auto', textAlign: 'center' }}
              >
                {plan.cta}
              </Link>
            )}
            {plan.key === 'pro' && planError[plan.key] && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#ff7b91' }}>
                {planError[plan.key]}
              </div>
            )}
          </div>
        ))}
      </div>

      {contactOpen && (
        <div
          className="card"
          style={{
            marginTop: 16,
            minHeight: 400,
            padding: 18,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--line)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div>
              <div className="card-label">Contact Sales</div>
              <div style={{ fontSize: 13, color: 'var(--mid)' }}>Tell us what you’re building and we’ll follow up.</div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setContactOpen(false)} style={{ whiteSpace: 'nowrap' }}>
              Close
            </button>
          </div>

          {contactSuccess ? (
            <div style={{ padding: '14px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--bg2)' }}>
              <div style={{ fontWeight: 800, color: 'var(--hi)', marginBottom: 6 }}>Received</div>
              <div style={{ fontSize: 13, color: 'var(--mid)' }}>We'll reach out within 1 business day.</div>
            </div>
          ) : (
            <form onSubmit={submitContactSales} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--mid)' }}>Name</span>
                <input
                  value={contactForm.name}
                  onChange={(e) => setContactForm((s) => ({ ...s, name: e.target.value }))}
                  required
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg2)', color: 'var(--hi)' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--mid)' }}>Work email</span>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm((s) => ({ ...s, email: e.target.value }))}
                  required
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg2)', color: 'var(--hi)' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--mid)' }}>Company</span>
                <input
                  value={contactForm.company}
                  onChange={(e) => setContactForm((s) => ({ ...s, company: e.target.value }))}
                  required
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg2)', color: 'var(--hi)' }}
                />
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--mid)' }}>Plan</span>
                <div style={{ fontSize: 13, color: 'var(--hi)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg2)' }}>
                  Enterprise
                </div>
              </div>

              <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--mid)' }}>Tell us about your use case</span>
                <textarea
                  value={contactForm.use_case}
                  onChange={(e) => setContactForm((s) => ({ ...s, use_case: e.target.value }))}
                  required
                  rows={6}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg2)', color: 'var(--hi)', resize: 'vertical' }}
                />
              </label>

              {contactError && (
                <div style={{ gridColumn: '1 / -1', fontSize: 13, color: '#ff7b91' }}>
                  {contactError}
                </div>
              )}

              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setContactOpen(false)} disabled={contactSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={contactSubmitting}>
                  {contactSubmitting ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <div style={{ marginTop: 32, padding: '20px 24px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--hi)', marginBottom: 4 }}>Not sure which plan fits?</div>
          <div style={{ fontSize: 13, color: 'var(--mid)' }}>Try the live demo — no account needed.</div>
        </div>
        <Link className="btn btn-ghost" to="/demo">Try Live Demo →</Link>
      </div>
    </section>
  );
}
